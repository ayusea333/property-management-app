import { useState } from 'react'
import { supabase } from './lib/supabase'
import { extractPdfContent } from './lib/pdfExtract'
import { parseExpenseText } from './lib/expenseParser'
import { findMasterMatchInText, normalizeName } from './lib/fuzzyMatch'
import { expenseToRow } from './lib/expenses'
import { SALES_CATEGORIES, TAX_TYPES } from './lib/sales'
import { logEdit } from './lib/editLog'

// 🟢 = 自動で読み取れた(確認のみでOK) / 🟡 = 読み取れなかった・確信が持てないので要確認
function fieldIcon(value) {
  return value ? '🟢' : '🟡'
}

function escapeRegExp(s) {
  return (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default function ExpensePdfImportPanel({ allRecords, expenses, user, onImported, onClose }) {
  const [items, setItems] = useState([])
  const [parsing, setParsing] = useState(false)
  const [parsingLabel, setParsingLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const properties = allRecords.properties || []
  const rooms = allRecords.rooms || []
  const clients = allRecords.clients || []
  const vendors = allRecords.vendors || []
  const payeeOptions = [
    ...vendors.map((v) => ({ id: v.id, type: 'vendor', label: v.name })),
    ...clients.map((c) => ({ id: c.id, type: 'client', label: c.name })),
  ]

  // 支払先マスタと一致すれば、その支払先の直近の経費から勘定科目を候補として拾う(空欄なら)
  const guessCategoryFor = (payeeId, payee) => {
    const past = expenses
      .filter((e) => (payeeId ? e.payeeId === payeeId : e.payee === payee))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
    return past.length ? past[0].category || '' : ''
  }

  const buildItem = (text, method, fileName) => {
    const parsed = parseExpenseText(text)

    const payeeMatch = findMasterMatchInText(text, payeeOptions)
    let payee = '', payeeId = '', payeeType = ''
    if (payeeMatch) {
      payee = payeeMatch.label
      payeeId = payeeMatch.id
      payeeType = payeeMatch.type
    } else if (parsed.headerCandidates.length) {
      payee = parsed.headerCandidates[0]
    }

    const propertyMatch = findMasterMatchInText(text, properties.map((p) => ({ id: p.id, label: p.name })))
    let propertyId = '', roomId = ''
    if (propertyMatch) {
      propertyId = propertyMatch.id
      const propRooms = rooms.filter((r) => r.propertyId === propertyId)
      const room = propRooms.find((r) => r.roomNumber && new RegExp(escapeRegExp(r.roomNumber) + '\\s*号').test(text))
      if (room) roomId = room.id
    }

    const category = guessCategoryFor(payeeId, payee)

    return {
      key: Math.random().toString(36).slice(2),
      fileName,
      method,
      date: parsed.date,
      amount: parsed.amount === '' ? '' : parsed.amount,
      taxAmount: parsed.taxAmount,
      taxType: parsed.taxType,
      invoiceNumber: parsed.invoiceNumber,
      propertyId,
      roomId,
      category,
      content: '',
      payee,
      payeeId,
      payeeType,
    }
  }

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setParsing(true)
    setError('')
    for (const file of files) {
      setParsingLabel(`${file.name} を読み取り中...`)
      try {
        const { text, method } = await extractPdfContent(file, (p) => {
          setParsingLabel(`${file.name} をOCRで読み取り中... (${Math.round((p || 0) * 100)}%)`)
        })
        setItems((prev) => [...prev, buildItem(text, method, file.name)])
      } catch (err) {
        setError((prev) => prev + `${file.name}: 読み取りに失敗しました(${err.message})\n`)
      }
    }
    setParsing(false)
    setParsingLabel('')
  }

  const updateItem = (key, patch) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  const handlePayeeInput = (key, text) => {
    const match = payeeOptions.find((o) => o.label === text)
    const item = items.find((it) => it.key === key)
    let category = item?.category || ''
    if (!category) category = guessCategoryFor(match?.id, text)
    updateItem(key, { payee: text, payeeId: match?.id || '', payeeType: match?.type || '', category })
  }

  const removeItem = (key) => setItems((prev) => prev.filter((it) => it.key !== key))

  const roomOptionsFor = (propertyId) => rooms.filter((r) => r.propertyId === propertyId)

  const confirmImport = async () => {
    if (!items.length) { alert('取り込むデータがありません'); return }
    const missing = items.filter((it) => !it.date || !it.amount)
    if (missing.length) {
      setError(`日付・金額が未入力の項目があります(${missing.map((m) => m.fileName).join('、')})。入力するか、この項目を取込対象から外してください。`)
      return
    }
    setSaving(true)
    setError('')
    try {
      let count = 0
      for (const it of items) {
        const sourceRef = it.invoiceNumber || `${it.date}|${normalizeName(it.payee)}|${it.amount}`
        const row = expenseToRow({
          date: it.date,
          propertyId: it.propertyId,
          roomId: it.roomId,
          category: it.category,
          content: it.content,
          payee: it.payee,
          payeeId: it.payeeId,
          payeeType: it.payeeType,
          amount: it.amount,
          taxType: it.taxType,
          invoiceNumber: it.invoiceNumber,
          source: 'pdf_import',
          sourceRef,
        })
        const { error: err } = await supabase.from('expenses').upsert(row, { onConflict: 'source,source_ref' })
        if (err) throw err
        count++
      }
      await onImported()
      await logEdit({ user, tableLabel: '経費', action: '追加', summary: `PDF取込(AI不使用)で${count}件を追加` })
      setItems([])
      onClose()
    } catch (e) {
      setError('保存に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="master-form">
      <h3>PDFから経費を取り込む</h3>
      <p className="mini" style={{ color: '#6b6167' }}>
        AI(有料API)は使わず、PDFの文字情報の読み取り・無料のOCR・キーワード照合だけで候補を作ります。
        🟢は自動で読み取れた項目、🟡は読み取れなかった・確信が持てない項目です。内容を確認し、必要に応じて修正してから「登録」を押してください。
        「登録」を押すまでは経費データとして保存されません。
      </p>
      <div className="form-row">
        <label>PDFファイル</label>
        <input type="file" accept="application/pdf" multiple onChange={handleFiles} disabled={parsing || saving} />
      </div>
      {parsing && <p className="mini">{parsingLabel || '読み取り中...'}</p>}
      {error && <div className="form-error" style={{ whiteSpace: 'pre-line' }}>{error}</div>}

      {items.map((it) => {
        const overallOk = it.date && it.amount && it.payeeId && it.category && it.taxType
        return (
          <div key={it.key} className="master-form" style={{ marginTop: 16, background: '#faf7f5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>{it.fileName}</h4>
              <span className={`status ${overallOk ? 'ok' : 'warn'}`}>{overallOk ? '確認OK' : '要確認あり'}</span>
            </div>
            {it.method === 'ocr' && (
              <p className="mini" style={{ color: '#6b6167' }}>
                画像・スキャンPDFと判断し、OCR(文字認識)で読み取りました。手書き文字や画質が悪い場合、精度が落ちることがあります。
              </p>
            )}
            <div className="form-row">
              <label>{fieldIcon(it.date)} 日付</label>
              <input type="date" value={it.date} onChange={(e) => updateItem(it.key, { date: e.target.value })} />
            </div>
            <div className="form-row">
              <label>{fieldIcon(it.propertyId)} 物件</label>
              <select value={it.propertyId} onChange={(e) => updateItem(it.key, { propertyId: e.target.value, roomId: '' })}>
                <option value="">(未選択)</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {it.propertyId && (
              <div className="form-row">
                <label>{fieldIcon(it.roomId)} 号室</label>
                <select value={it.roomId} onChange={(e) => updateItem(it.key, { roomId: e.target.value })}>
                  <option value="">(未選択)</option>
                  {roomOptionsFor(it.propertyId).map((r) => <option key={r.id} value={r.id}>{r.roomNumber}</option>)}
                </select>
              </div>
            )}
            <div className="form-row">
              <label>{fieldIcon(it.category)} 勘定科目</label>
              <select value={it.category} onChange={(e) => updateItem(it.key, { category: e.target.value })}>
                <option value="">(未選択)</option>
                {SALES_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>{fieldIcon(it.content)} 内容</label>
              <input value={it.content} onChange={(e) => updateItem(it.key, { content: e.target.value })} placeholder="例: 日常清掃 外注費" />
            </div>
            <div className="form-row">
              <label>{fieldIcon(it.payeeId)} 支払先</label>
              <div>
                <input
                  value={it.payee}
                  onChange={(e) => handlePayeeInput(it.key, e.target.value)}
                  placeholder="業者・取引先マスタと一致すれば自動でリンクします"
                />
                {it.payee && !it.payeeId && (
                  <div className="mini" style={{ color: '#a11615' }}>マスタと一致しませんでした。表記を確認してください。</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label>{fieldIcon(it.amount)} 金額</label>
              <input type="number" value={it.amount} onChange={(e) => updateItem(it.key, { amount: e.target.value })} />
            </div>
            <div className="form-row">
              <label>{fieldIcon(it.taxType)} 消費税区分</label>
              <select value={it.taxType} onChange={(e) => updateItem(it.key, { taxType: e.target.value })}>
                <option value="">(未選択)</option>
                {TAX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>請求書番号</label>
              <input value={it.invoiceNumber} onChange={(e) => updateItem(it.key, { invoiceNumber: e.target.value })} />
            </div>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => removeItem(it.key)}>この項目を取込対象から外す</button>
            </div>
          </div>
        )
      })}

      <div className="form-actions" style={{ marginTop: 16 }}>
        <button className="btn-primary" onClick={confirmImport} disabled={saving || parsing || !items.length}>
          {saving ? '登録中...' : `登録(${items.length}件)`}
        </button>
        <button className="btn-secondary" onClick={onClose} disabled={saving}>閉じる</button>
      </div>
    </div>
  )
}
