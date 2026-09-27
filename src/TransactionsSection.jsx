import { Fragment, useId, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { currentFiscalStartYear, fiscalYearLabel, fiscalMonths } from './lib/period'
import { SALES_CATEGORIES, TAX_TYPES, saleToRow, taxBreakdown } from './lib/sales'
import { expenseToRow } from './lib/expenses'
import { trustFundToRow } from './lib/trustFunds'
import { downloadCsv, parseCsv } from './lib/csv'
import { logEdit } from './lib/editLog'
import { isMonthLocked, MonthLockBadge, DetailsToggle } from './components/SimpleUI'
import { fieldClass } from './lib/formValidation'
import ExpensePdfImportPanel from './ExpensePdfImport'

// 売上・経費を1つの画面で入力・一覧・削除できる統合タブ。
// sales・expenses のテーブルはそれぞれ従来通り分離したまま(二重管理をしない)。
// 「種別」で売上/経費を切り替えると、書き込み先のテーブルと入力項目が変わる。
// 権限(can_edit_sales / can_edit_expenses)はDB側のRLSと同じ基準を種別ごとにそのまま使う。

const PAYMENT_METHODS = ['振込', '現金', 'クレジットカード', '口座振替', 'その他']

function yen(n) {
  return '¥' + Math.round(n || 0).toLocaleString()
}

function periodYearOptions() {
  const cur = currentFiscalStartYear()
  const arr = []
  for (let y = cur; y >= cur - 4; y--) arr.push(y)
  return arr
}

function PeriodFilter({ year, month, onYear, onMonth }) {
  const months = fiscalMonths(year)
  return (
    <>
      <select value={year} onChange={(e) => onYear(Number(e.target.value))}>
        {periodYearOptions().map((y) => <option key={y} value={y}>{fiscalYearLabel(y)}</option>)}
      </select>
      <select value={month} onChange={(e) => onMonth(e.target.value)}>
        <option value="all">期全体</option>
        {months.map((m) => <option key={m} value={m}>{Number(m.slice(5))}月</option>)}
      </select>
    </>
  )
}

function inPeriod(dateStr, year, month) {
  if (!dateStr) return false
  const m = dateStr.slice(0, 7)
  if (month === 'all') return fiscalMonths(year).includes(m)
  return m === month
}

function normalizeDate(s) {
  const m = String(s || '').trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (!m) return ''
  const [, y, mo, d] = m
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseAmountCell(s) {
  const cleaned = String(s || '').trim().replace(/[¥,円\s]/g, '')
  return cleaned === '' ? NaN : Number(cleaned)
}

function emptyTransactionForm(kind) {
  return {
    date: new Date().toISOString().slice(0, 10),
    propertyId: '', roomId: '', contractId: '',
    category: kind === 'sales' ? SALES_CATEGORIES[0] : '',
    content: '', amount: 0,
    depositAmount: '', receivedDate: '',
    payee: '', payeeId: '', payeeType: '', hasReceipt: false, paidDate: '', isCapitalExpenditure: false,
    paymentMethod: '', taxType: TAX_TYPES[0],
    counterparty: '', counterpartyId: '', counterpartyType: '',
    payerName: '', depositAccount: '',
    trustAmount: '', trustRemitAmount: '',
    note: '',
  }
}

// 案件(契約)の検索用ラベル。物件・号室・入居者名・入居日で絞り込みやすくする。
function contractLabel(contract, properties, rooms) {
  const room = rooms.find((r) => r.id === contract.roomId)
  const property = properties.find((p) => p.id === room?.propertyId)
  const name = contract.name || contract.contractorName || '(契約者不明)'
  return `${property?.name || ''} ${room?.roomNumber || ''} ${name}(${contract.moveInDate || '入居日不明'})`
}

// プルダウンと検索(入力しながら絞り込み)の両方が使えるセレクト。売上・経費の入力フォームと同じ部品。
function SearchableSelect({ value, onChange, options, placeholder }) {
  const listId = useId()
  return (
    <>
      <input
        list={listId}
        defaultValue={options.find((o) => o.id === value)?.label || ''}
        onChange={(e) => {
          const t = e.target.value
          if (t === '') { onChange(''); return }
          const match = options.find((o) => o.label === t)
          if (match) onChange(match.id)
        }}
        placeholder={placeholder || '入力して検索、またはプルダウンから選択'}
        autoComplete="off"
        key={value}
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o.id} value={o.label} />)}
      </datalist>
    </>
  )
}

export default function TransactionsSection({ sales, expenses, allRecords, periodLocks, onChanged, canEditSales, canEditExpenses, user, simpleUI }) {
  const canEditAny = canEditSales || canEditExpenses
  const [formKind, setFormKind] = useState(canEditSales ? 'sales' : 'expenses')
  const [form, setForm] = useState(emptyTransactionForm(formKind))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [periodYear, setPeriodYear] = useState(currentFiscalStartYear())
  const [periodMonth, setPeriodMonth] = useState('all')
  const [viewKind, setViewKind] = useState('all') // all | sales | expenses
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [groupMode, setGroupMode] = useState('chronological') // chronological=時系列順 / grouped=勘定科目でまとめる
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [showPdfImport, setShowPdfImport] = useState(false)
  const fileInputRef = useRef(null)
  const payeeListId = useId()
  const counterpartyListId = useId()
  const depositAccountListId = useId()

  const properties = allRecords.properties || []
  const rooms = allRecords.rooms || []
  const clients = allRecords.clients || []
  const vendors = allRecords.vendors || []
  const tenants = allRecords.tenants || [] // 契約+入居者名をまとめた一覧(案件選択用)
  const payeeOptions = [
    ...vendors.map((v) => ({ id: v.id, type: 'vendor', label: v.name })),
    ...clients.map((c) => ({ id: c.id, type: 'client', label: c.name })),
  ]
  const contractOptions = tenants.map((t) => ({ id: t.id, label: contractLabel(t, properties, rooms) }))
  const roomOptions = rooms.filter((r) => r.propertyId === form.propertyId)
  const propertyName = (id) => properties.find((p) => p.id === id)?.name || ''
  const roomLabel = (id) => rooms.find((r) => r.id === id)?.roomNumber || ''
  // 「入金口座」は新しいマスタを作らず、過去に入力された値から選べるようにする(おすすめされた方式)
  const depositAccountOptions = [...new Set([
    ...(sales || []).map((s) => s.depositAccount).filter(Boolean),
    ...(expenses || []).map((e) => e.depositAccount).filter(Boolean),
  ])]

  const switchFormKind = (kind) => {
    setFormKind(kind)
    setForm({ ...emptyTransactionForm(kind), date: form.date, propertyId: form.propertyId, roomId: form.roomId, contractId: form.contractId })
    setError('')
    setSubmitAttempted(false)
  }

  // ---- 一覧(売上+経費をまとめて表示・検索・削除) ----

  const merged = [
    ...(sales || []).map((s) => ({
      id: `sale-${s.id}`, rawId: s.id, kind: 'sales', source: s.source,
      date: s.date, category: s.category, propertyId: s.propertyId, roomId: s.roomId,
      content: s.content, amount: s.amount, payee: '', taxType: s.taxType, paymentMethod: s.paymentMethod,
      counterparty: s.counterparty, payerName: s.payerName, depositAccount: s.depositAccount,
      otherDate: s.receivedDate, trustAmount: s.trustAmount, trustRemitAmount: '', note: s.note,
    })),
    ...(expenses || []).map((e) => ({
      id: `expense-${e.id}`, rawId: e.id, kind: 'expenses', source: e.source,
      date: e.date, category: e.category, propertyId: e.propertyId, roomId: e.roomId,
      content: e.content, amount: e.amount, payee: e.payee, taxType: e.taxType, paymentMethod: e.paymentMethod,
      counterparty: '', payerName: '', depositAccount: e.depositAccount,
      otherDate: e.paidDate, trustAmount: '', trustRemitAmount: e.trustRemitAmount, note: e.note,
    })),
  ]

  const filtered = merged
    .filter((m) => inPeriod(m.date, periodYear, periodMonth))
    .filter((m) => viewKind === 'all' || m.kind === viewKind)
    .filter((m) => !categoryFilter || m.category === categoryFilter)
    .filter((m) => {
      if (!search) return true
      const counterpartyOrPayee = m.kind === 'sales' ? m.counterparty : m.payee
      const text = `${propertyName(m.propertyId)} ${m.content} ${m.category} ${counterpartyOrPayee} ${m.payerName} ${m.note}`.toLowerCase()
      return text.includes(search.toLowerCase())
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  // 差引小計(累計): 現在の絞り込み条件の中で、日付の古い順に売上を+・経費を-で積み上げた残高。
  const balanceMap = {}
  ;[...filtered].sort((a, b) => (a.date < b.date ? -1 : 1)).reduce((acc, m) => {
    const next = acc + (m.kind === 'sales' ? Number(m.amount || 0) : -Number(m.amount || 0))
    balanceMap[m.id] = next
    return next
  }, 0)

  // 「勘定科目でまとめる」表示用に、勘定科目ごとにグループ化して各グループの差引小計(その科目内の売上-経費)を計算する
  const groupedRows = () => {
    const groups = {}
    for (const m of filtered) {
      const key = m.category || '(勘定科目未設定)'
      if (!groups[key]) groups[key] = []
      groups[key].push(m)
    }
    const orderedKeys = [
      ...SALES_CATEGORIES.filter((c) => groups[c]),
      ...Object.keys(groups).filter((k) => !SALES_CATEGORIES.includes(k)),
    ]
    return orderedKeys.map((key) => ({
      key,
      items: groups[key],
      subtotal: groups[key].reduce((z, m) => z + (m.kind === 'sales' ? Number(m.amount || 0) : -Number(m.amount || 0)), 0),
    }))
  }

  const totalSales = filtered.filter((m) => m.kind === 'sales').reduce((z, m) => z + m.amount, 0)
  const totalExpenses = filtered.filter((m) => m.kind === 'expenses').reduce((z, m) => z + m.amount, 0)

  const exportCsv = () => {
    const headers = ['日付', '種別', '勘定科目', '物件', '号室', '取引先/支払先', '内容', '入金者名等', '入金口座', '入金日・支払日', '預り金', '金額', '預り金送金金額', '差引小計(累計)', '備考', '消費税区分', '支払方法']
    const rows = filtered.map((m) => [
      m.date, m.kind === 'sales' ? '売上' : '経費', m.category, propertyName(m.propertyId), roomLabel(m.roomId),
      m.kind === 'sales' ? m.counterparty : m.payee, m.content, m.payerName, m.depositAccount, m.otherDate,
      m.trustAmount || '', m.amount, m.trustRemitAmount || '', balanceMap[m.id] ?? 0, m.note,
      m.taxType, m.paymentMethod,
    ])
    downloadCsv(`取引_${fiscalYearLabel(periodYear)}.csv`, headers, rows)
  }

  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((m) => m.id))

  const deleteItem = async (m) => {
    if (!confirm('削除しますか?')) return
    const table = m.kind === 'sales' ? 'sales' : 'expenses'
    const { error: err } = await supabase.from(table).delete().eq('id', m.rawId)
    if (err) { alert('削除に失敗しました: ' + err.message); return }
    if (m.kind === 'sales') {
      // この取引の「預り金」から自動作成された預り金・立替金の記録があれば、二重管理にならないよう一緒に削除する
      await supabase.from('trust_funds').delete().eq('source', 'transaction').eq('source_ref', `sale:${m.rawId}`)
    }
    await onChanged()
    await logEdit({ user, tableLabel: m.kind === 'sales' ? '売上' : '経費', action: '削除', summary: `${m.category || ''} ${m.content || ''} ${yen(m.amount)}` })
  }

  const copySelected = async () => {
    if (!selected.length) { alert('コピーする行を選択してください'); return }
    const newDate = window.prompt('複製先の日付を YYYY-MM-DD で入力してください', new Date().toISOString().slice(0, 10))
    if (!newDate) return
    if (isMonthLocked(periodLocks, newDate)) {
      alert(`${newDate.slice(0, 7)}分は月次締め済みのため複製できません。管理者に月次締めの解除を依頼してください。`)
      return
    }
    setSaving(true)
    try {
      let count = 0
      for (const compId of selected) {
        const item = merged.find((x) => x.id === compId)
        if (!item) continue
        if (item.kind === 'sales') {
          const s = sales.find((x) => x.id === item.rawId)
          if (!s || s.source !== 'manual') continue
          const row = saleToRow({ ...s, date: newDate, source: 'manual' })
          const { error: err } = await supabase.from('sales').insert(row)
          if (err) throw err
        } else {
          const e = expenses.find((x) => x.id === item.rawId)
          if (!e) continue
          const { error: err } = await supabase.from('expenses').insert(expenseToRow({ ...e, date: newDate }))
          if (err) throw err
        }
        count++
      }
      await onChanged()
      await logEdit({ user, tableLabel: '取引', action: '追加', summary: `${count}件を${newDate}付けで複製` })
      setSelected([])
    } catch (e) {
      alert('コピーに失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // ---- 入力フォーム ----

  const handlePayeeChange = (text) => {
    const match = payeeOptions.find((o) => o.label === text)
    const payeeId = match?.id || ''
    const payeeType = match?.type || ''
    let category = form.category
    if (!category) {
      const past = expenses
        .filter((e) => (payeeId ? e.payeeId === payeeId : e.payee === text))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
      if (past.length) category = past[0].category || ''
    }
    setForm({ ...form, payee: text, payeeId, payeeType, category })
  }

  const handleCounterpartyChange = (text) => {
    const match = payeeOptions.find((o) => o.label === text)
    setForm({ ...form, counterparty: text, counterpartyId: match?.id || '', counterpartyType: match?.type || '' })
  }

  const submit = async () => {
    setSubmitAttempted(true)
    if (!form.date || !form.amount) { setError('日付と金額は必須です'); return }
    if (Number(form.amount) < 0) { setError('金額にマイナスの金額は入力できません'); return }
    if (isMonthLocked(periodLocks, form.date)) { setError(`${form.date.slice(0, 7)}分は月次締め済みのため登録できません。管理者に月次締めの解除を依頼してください。`); return }
    setSaving(true)
    setError('')
    try {
      if (formKind === 'sales') {
        const property = properties.find((p) => p.id === form.propertyId)
        const row = saleToRow({ ...form, ownerId: property?.ownerId || '', source: 'manual' })
        const { data: inserted, error: err } = await supabase.from('sales').insert(row).select('id').single()
        if (err) throw err

        // レントスペース: 予約売上と実際の入金額の差額を、サイト・決済手数料として経費に自動計上する
        if (form.category === 'レントスペース' && form.depositAmount !== '') {
          const fee = Number(form.amount) - Number(form.depositAmount)
          if (fee > 0) {
            const { error: feeErr } = await supabase.from('expenses').insert({
              date: form.date,
              property_id: form.propertyId || null,
              room_id: form.roomId || null,
              category: 'レントスペース',
              content: 'サイト・決済手数料(自動計算)',
              payee: '(サイト手数料)',
              amount: fee,
            })
            if (feeErr) throw feeErr
          }
        }

        // 預り金: 「預り金」欄に金額を入れて保存すると、預り金・立替金にも同じ内容を自動で作る(二重入力なし)
        if (Number(form.trustAmount) > 0 && inserted?.id) {
          const { error: tfErr } = await supabase.from('trust_funds').insert(trustFundToRow({
            type: 'オーナー預り金',
            direction: '預り金',
            ownerId: property?.ownerId || '',
            roomId: form.roomId,
            amount: Number(form.trustAmount),
            occurredDate: form.date,
            status: '保管中',
            note: `取引管理(${form.category || '売上'})から自動作成`,
            source: 'transaction',
            sourceRef: `sale:${inserted.id}`,
          }))
          if (tfErr) throw tfErr
        }

        await onChanged()
        await logEdit({ user, tableLabel: '売上', action: '追加', summary: `${form.category} ${form.content || ''} ${yen(form.amount)}` })
      } else {
        const { error: err } = await supabase.from('expenses').insert(expenseToRow(form))
        if (err) throw err
        await onChanged()
        await logEdit({ user, tableLabel: '経費', action: '追加', summary: `${form.category || ''} ${form.content || ''} ${yen(form.amount)}` })
      }
      setForm(emptyTransactionForm(formKind))
      setSubmitAttempted(false)
    } catch (e) {
      setError('保存に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // ---- CSVインポート(種別ごとに従来の売上/経費インポートと同じ形式) ----

  const openImport = () => fileInputRef.current?.click()

  const handleImportSalesCsv = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const csvRows = parseCsv(text)
      if (csvRows.length < 2) {
        setImportResult({ ok: 0, errors: ['データ行が見つかりません。1行目に見出し、2行目以降にデータを入れてください。'] })
        return
      }
      const header = csvRows[0].map((h) => h.trim())
      const col = (name) => header.indexOf(name)
      const dateIdx = col('日付'), catIdx = col('勘定科目') > -1 ? col('勘定科目') : col('カテゴリ'), propIdx = col('物件'), roomIdx = col('号室'), contentIdx = col('内容'), amountIdx = col('金額')
      const taxTypeIdx = col('消費税区分'), paymentMethodIdx = col('支払方法'), receivedDateIdx = col('実際の入金日')
      if (dateIdx === -1 || catIdx === -1 || amountIdx === -1) {
        setImportResult({ ok: 0, errors: ['見出し行に「日付」「勘定科目」「金額」の列が見つかりません。「CSVダウンロード」した形式のまま編集してください。'] })
        return
      }

      const toInsert = []
      const errors = []
      csvRows.slice(1).forEach((r, i) => {
        const lineNo = i + 2
        const rawDate = r[dateIdx] || ''
        const date = normalizeDate(rawDate)
        const category = (r[catIdx] || '').trim()
        const propName = propIdx > -1 ? (r[propIdx] || '').trim() : ''
        const roomNumber = roomIdx > -1 ? (r[roomIdx] || '').trim() : ''
        const content = contentIdx > -1 ? (r[contentIdx] || '').trim() : ''
        const amount = parseAmountCell(amountIdx > -1 ? r[amountIdx] : '')
        const taxType = taxTypeIdx > -1 ? (r[taxTypeIdx] || '').trim() : ''
        const paymentMethod = paymentMethodIdx > -1 ? (r[paymentMethodIdx] || '').trim() : ''
        const receivedDate = receivedDateIdx > -1 ? normalizeDate(r[receivedDateIdx] || '') : ''

        if (!date) { errors.push(`${lineNo}行目: 日付が読み取れません(${rawDate})`); return }
        if (!SALES_CATEGORIES.includes(category)) { errors.push(`${lineNo}行目: 勘定科目「${category}」が見つかりません`); return }
        if (Number.isNaN(amount) || amount < 0) { errors.push(`${lineNo}行目: 金額が正しくありません(${r[amountIdx] || ''})`); return }

        let propertyId = ''
        if (propName) {
          const p = properties.find((x) => x.name === propName)
          if (!p) { errors.push(`${lineNo}行目: 物件「${propName}」が見つかりません`); return }
          propertyId = p.id
        }
        let roomId = ''
        if (roomNumber) {
          const rm = rooms.find((x) => x.propertyId === propertyId && x.roomNumber === roomNumber)
          if (!rm) { errors.push(`${lineNo}行目: 号室「${roomNumber}」が見つかりません`); return }
          roomId = rm.id
        }
        const property = properties.find((p) => p.id === propertyId)
        toInsert.push(saleToRow({
          date, category, propertyId, roomId, ownerId: property?.ownerId || '', content, amount, source: 'manual',
          taxType: TAX_TYPES.includes(taxType) ? taxType : '', paymentMethod, receivedDate,
        }))
      })

      if (toInsert.length) {
        const chunkSize = 200
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const { error: err } = await supabase.from('sales').insert(toInsert.slice(i, i + chunkSize))
          if (err) throw err
        }
        await onChanged()
        await logEdit({ user, tableLabel: '売上', action: '追加', summary: `CSVインポートで${toInsert.length}件を追加` })
      }
      setImportResult({ ok: toInsert.length, errors })
    } catch (e) {
      setImportResult({ ok: 0, errors: ['インポートに失敗しました: ' + e.message] })
    } finally {
      setImporting(false)
    }
  }

  const handleImportExpensesCsv = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const csvRows = parseCsv(text)
      if (csvRows.length < 2) {
        setImportResult({ ok: 0, errors: ['データ行が見つかりません。1行目に見出し、2行目以降にデータを入れてください。'] })
        return
      }
      const header = csvRows[0].map((h) => h.trim())
      const col = (name) => header.indexOf(name)
      const dateIdx = col('日付'), propIdx = col('物件'), roomIdx = col('号室'), catIdx = col('勘定科目') > -1 ? col('勘定科目') : col('カテゴリ'), contentIdx = col('内容'), payeeIdx = col('支払先'), amountIdx = col('金額')
      const taxTypeIdx = col('消費税区分'), paymentMethodIdx = col('支払方法'), paidDateIdx = col('実際の支払日'), hasReceiptIdx = col('領収書等の保管')
      const isCapitalExpenditureIdx = col('資本的支出')
      if (dateIdx === -1 || amountIdx === -1) {
        setImportResult({ ok: 0, errors: ['見出し行に「日付」「金額」の列が見つかりません。「CSVダウンロード」した形式のまま編集してください。'] })
        return
      }

      const toInsert = []
      const errors = []
      csvRows.slice(1).forEach((r, i) => {
        const lineNo = i + 2
        const rawDate = r[dateIdx] || ''
        const date = normalizeDate(rawDate)
        const category = catIdx > -1 ? (r[catIdx] || '').trim() : ''
        const propName = propIdx > -1 ? (r[propIdx] || '').trim() : ''
        const roomNumber = roomIdx > -1 ? (r[roomIdx] || '').trim() : ''
        const content = contentIdx > -1 ? (r[contentIdx] || '').trim() : ''
        const payee = payeeIdx > -1 ? (r[payeeIdx] || '').trim() : ''
        const amount = parseAmountCell(amountIdx > -1 ? r[amountIdx] : '')
        const taxType = taxTypeIdx > -1 ? (r[taxTypeIdx] || '').trim() : ''
        const paymentMethod = paymentMethodIdx > -1 ? (r[paymentMethodIdx] || '').trim() : ''
        const paidDate = paidDateIdx > -1 ? normalizeDate(r[paidDateIdx] || '') : ''
        const hasReceipt = hasReceiptIdx > -1 ? ['有', 'あり', 'true', '1'].includes((r[hasReceiptIdx] || '').trim()) : false
        const isCapitalExpenditure = isCapitalExpenditureIdx > -1 ? ['該当', '有', 'あり', 'true', '1'].includes((r[isCapitalExpenditureIdx] || '').trim()) : false

        if (!date) { errors.push(`${lineNo}行目: 日付が読み取れません(${rawDate})`); return }
        if (category && !SALES_CATEGORIES.includes(category)) { errors.push(`${lineNo}行目: 勘定科目「${category}」が見つかりません`); return }
        if (Number.isNaN(amount) || amount < 0) { errors.push(`${lineNo}行目: 金額が正しくありません(${r[amountIdx] || ''})`); return }

        let propertyId = ''
        if (propName) {
          const p = properties.find((x) => x.name === propName)
          if (!p) { errors.push(`${lineNo}行目: 物件「${propName}」が見つかりません`); return }
          propertyId = p.id
        }
        let roomId = ''
        if (roomNumber) {
          const rm = rooms.find((x) => x.propertyId === propertyId && x.roomNumber === roomNumber)
          if (!rm) { errors.push(`${lineNo}行目: 号室「${roomNumber}」が見つかりません`); return }
          roomId = rm.id
        }
        const payeeMatch = payee ? payeeOptions.find((o) => o.label === payee) : null
        toInsert.push(expenseToRow({
          date, propertyId, roomId, category, content, payee, amount,
          payeeId: payeeMatch?.id || '', payeeType: payeeMatch?.type || '',
          taxType: TAX_TYPES.includes(taxType) ? taxType : '', paymentMethod, paidDate, hasReceipt, isCapitalExpenditure,
        }))
      })

      if (toInsert.length) {
        const chunkSize = 200
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const { error: err } = await supabase.from('expenses').insert(toInsert.slice(i, i + chunkSize))
          if (err) throw err
        }
        await onChanged()
        await logEdit({ user, tableLabel: '経費', action: '追加', summary: `CSVインポートで${toInsert.length}件を追加` })
      }
      setImportResult({ ok: toInsert.length, errors })
    } catch (e) {
      setImportResult({ ok: 0, errors: ['インポートに失敗しました: ' + e.message] })
    } finally {
      setImporting(false)
    }
  }

  // ---- 一覧表の行(「時系列順」「勘定科目でまとめる」の両方で共通して使う) ----
  const colCount = simpleUI ? 10 : 19

  function renderTransactionRow(m) {
    const { exTax, tax } = taxBreakdown(m.amount, m.taxType)
    const canEditThis = m.kind === 'sales' ? canEditSales : canEditExpenses
    const canDeleteThis = canEditThis && (m.kind === 'expenses' || m.source === 'manual')
    const counterpartyOrPayee = m.kind === 'sales' ? m.counterparty : m.payee
    return (
      <tr key={m.id}>
        <td>{canEditThis && <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggleSelect(m.id)} />}</td>
        <td>{m.date}</td>
        <td><span className={m.kind === 'sales' ? 'status ok' : 'status bad'}>{m.kind === 'sales' ? '売上' : '経費'}</span></td>
        <td>{m.category}{m.kind === 'sales' && m.source !== 'manual' && <span className="mini"> (自動)</span>}</td>
        <td>{propertyName(m.propertyId)}</td>
        <td>{roomLabel(m.roomId)}</td>
        {!simpleUI && <td>{counterpartyOrPayee}</td>}
        <td>{m.content}{simpleUI && m.kind === 'expenses' && m.payee ? ` / ${m.payee}` : ''}</td>
        {!simpleUI && <td>{m.payerName}</td>}
        {!simpleUI && <td>{m.depositAccount}</td>}
        {!simpleUI && <td>{m.otherDate}</td>}
        {!simpleUI && <td className="amount">{m.trustAmount ? Number(m.trustAmount).toLocaleString() : ''}</td>}
        <td className="amount">
          {m.amount.toLocaleString()}
          {simpleUI && (
            <DetailsToggle label="内訳">
              {counterpartyOrPayee && <>取引先/支払先: {counterpartyOrPayee}<br /></>}
              {m.payerName && <>入金者名等: {m.payerName}<br /></>}
              {m.depositAccount && <>入金口座: {m.depositAccount}<br /></>}
              {m.otherDate && <>入金日・支払日: {m.otherDate}<br /></>}
              {m.trustAmount ? <>預り金: {Number(m.trustAmount).toLocaleString()}<br /></> : null}
              {m.trustRemitAmount ? <>預り金送金金額: {Number(m.trustRemitAmount).toLocaleString()}<br /></> : null}
              {m.note && <>備考: {m.note}<br /></>}
              差引小計(累計): {(balanceMap[m.id] ?? 0).toLocaleString()}<br />
              税抜金額: {exTax.toLocaleString()}<br />消費税額: {tax.toLocaleString()}
            </DetailsToggle>
          )}
        </td>
        {!simpleUI && <td className="amount">{m.trustRemitAmount ? Number(m.trustRemitAmount).toLocaleString() : ''}</td>}
        <td className="amount">{(balanceMap[m.id] ?? 0).toLocaleString()}</td>
        {!simpleUI && <td>{m.note}</td>}
        {!simpleUI && (<><td className="amount">{exTax.toLocaleString()}</td><td className="amount">{tax.toLocaleString()}</td></>)}
        <td>{canDeleteThis && <button className="icon-btn" onClick={() => deleteItem(m)}>🗑</button>}</td>
      </tr>
    )
  }

  return (
    <div>
      {canEditAny ? (
        <div className="master-form">
          <h3>取引入力</h3>
          {(canEditSales && canEditExpenses) && (
            <div className="form-row">
              <label>種別</label>
              <div className="tabs">
                <button type="button" className={formKind === 'sales' ? 'tab-btn active' : 'tab-btn'} onClick={() => switchFormKind('sales')}>売上</button>
                <button type="button" className={formKind === 'expenses' ? 'tab-btn active' : 'tab-btn'} onClick={() => switchFormKind('expenses')}>経費</button>
              </div>
            </div>
          )}
          {simpleUI && <MonthLockBadge periodLocks={periodLocks} dateOrMonth={form.date} />}
          <div className={fieldClass(submitAttempted, !form.date)}><label>日付<span className="required">*</span></label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div className="form-row">
            <label>物件</label>
            <SearchableSelect
              value={form.propertyId}
              onChange={(id) => setForm({ ...form, propertyId: id, roomId: '' })}
              options={properties.map((p) => ({ id: p.id, label: p.name }))}
            />
          </div>
          {form.propertyId && (
            <div className="form-row">
              <label>号室</label>
              <SearchableSelect
                value={form.roomId}
                onChange={(id) => setForm({ ...form, roomId: id })}
                options={roomOptions.map((r) => ({ id: r.id, label: r.roomNumber }))}
              />
            </div>
          )}
          <div className="form-row">
            <label>案件(契約)</label>
            <div>
              <SearchableSelect
                value={form.contractId}
                onChange={(id) => setForm({ ...form, contractId: id })}
                options={contractOptions}
                placeholder="物件・号室・入居者名で検索、または空欄のまま"
              />
              <div className="mini" style={{ color: '#6b6167' }}>
                AD・付帯・契約手数料など、1つの案件に紐づく取引の場合に選択してください。管理料のように毎月発生する取引は空欄のままでOKです。
              </div>
            </div>
          </div>
          <div className="form-row">
            <label>勘定科目</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {formKind === 'expenses' && <option value="">(未選択)</option>}
              {SALES_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-row"><label>内容</label><input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder={formKind === 'expenses' ? '例: 日常清掃 外注費' : ''} /></div>
          {formKind === 'sales' && (
            <div className="form-row">
              <label>取引先名</label>
              <div>
                <input
                  list={counterpartyListId}
                  value={form.counterparty}
                  onChange={(e) => handleCounterpartyChange(e.target.value)}
                  autoComplete="off"
                  placeholder="取引先マスタから入力して検索、または自由入力"
                />
                <datalist id={counterpartyListId}>
                  {payeeOptions.map((o) => <option key={`${o.type}-${o.id}`} value={o.label} />)}
                </datalist>
                {form.counterpartyId && <div className="mini" style={{ color: '#6b6167' }}>{form.counterpartyType === 'vendor' ? '業者' : '取引先'}マスタとリンクしています</div>}
              </div>
            </div>
          )}
          {formKind === 'sales' && (
            <div className="form-row">
              <label>入金者名or相殺</label>
              <input value={form.payerName} onChange={(e) => setForm({ ...form, payerName: e.target.value })} placeholder="実際の振込名義や「相殺」など" />
            </div>
          )}
          {formKind === 'sales' && (
            <div className="form-row">
              <label>入金口座</label>
              <input
                list={depositAccountListId}
                value={form.depositAccount}
                onChange={(e) => setForm({ ...form, depositAccount: e.target.value })}
                autoComplete="off"
                placeholder="過去の入力履歴から選択、または自由入力"
              />
              <datalist id={depositAccountListId}>
                {depositAccountOptions.map((a) => <option key={a} value={a} />)}
              </datalist>
            </div>
          )}
          {formKind === 'expenses' && (
            <div className="form-row">
              <label>支払先</label>
              <div>
                <input
                  list={payeeListId}
                  value={form.payee}
                  onChange={(e) => handlePayeeChange(e.target.value)}
                  autoComplete="off"
                  placeholder="業者・取引先マスタから入力して検索、または自由入力"
                />
                <datalist id={payeeListId}>
                  {payeeOptions.map((o) => <option key={`${o.type}-${o.id}`} value={o.label} />)}
                </datalist>
                {form.payeeId && <div className="mini" style={{ color: '#6b6167' }}>{form.payeeType === 'vendor' ? '業者' : '取引先'}マスタとリンクしています</div>}
              </div>
            </div>
          )}
          <div className={fieldClass(submitAttempted, !form.amount)}><label>金額{formKind === 'sales' ? '(予約売上)' : ''}<span className="required">*</span></label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          {formKind === 'sales' && form.category === 'レントスペース' && (
            <div className="form-row">
              <label>実際の入金額</label>
              <div>
                <input type="number" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} style={{ width: 120 }} />
                <div className="mini" style={{ color: '#6b6167' }}>予約サイトからの実際の振込額。金額(予約売上)より少ない場合、差額を「サイト・決済手数料」として経費に自動登録します。分からない場合は空欄でOK。</div>
              </div>
            </div>
          )}
          {formKind === 'sales' && (
            <div className="form-row">
              <label>預り金</label>
              <div>
                <input type="number" value={form.trustAmount} onChange={(e) => setForm({ ...form, trustAmount: e.target.value })} placeholder="0" style={{ width: 120 }} />
                <div className="mini" style={{ color: '#6b6167' }}>敷金・保証金・オーナー預り金など、預かっているお金がある場合に入力してください。保存すると「預り金・立替金」にも自動で記録されます(二重入力は不要です)。</div>
              </div>
            </div>
          )}
          {formKind === 'expenses' && (
            <div className="form-row">
              <label>預り金送金金額</label>
              <div>
                <input type="number" value={form.trustRemitAmount} onChange={(e) => setForm({ ...form, trustRemitAmount: e.target.value })} placeholder="0" style={{ width: 120 }} />
                <div className="mini" style={{ color: '#6b6167' }}>預かっていたお金を送金・精算した場合の金額(参考記録用)。対応する「預り金・立替金」の記録は、そちらの画面で状態を更新してください。</div>
              </div>
            </div>
          )}
          <div className="form-row">
            <label>消費税区分</label>
            <select value={form.taxType} onChange={(e) => setForm({ ...form, taxType: e.target.value })}>
              {TAX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>支払方法</label>
            <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              <option value="">(未選択)</option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {formKind === 'sales' ? (
            <div className="form-row">
              <label>実際の入金日</label>
              <div>
                <input type="date" value={form.receivedDate} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })} />
                <div className="mini" style={{ color: '#6b6167' }}>計上日と実際の入金日がずれる場合のみ入力(空欄なら計上日と同じ扱い)。</div>
              </div>
            </div>
          ) : (
            <div className="form-row">
              <label>実際の支払日</label>
              <input type="date" value={form.paidDate} onChange={(e) => setForm({ ...form, paidDate: e.target.value })} />
            </div>
          )}
          {formKind === 'expenses' && (
            <>
              <div className="form-row">
                <label>領収書等の保管</label>
                <input
                  type="checkbox"
                  style={{ width: 18, height: 18 }}
                  checked={form.hasReceipt}
                  onChange={(e) => setForm({ ...form, hasReceipt: e.target.checked })}
                />
              </div>
              <div className="form-row">
                <label>資本的支出に該当</label>
                <div>
                  <input
                    type="checkbox"
                    style={{ width: 18, height: 18 }}
                    checked={form.isCapitalExpenditure}
                    onChange={(e) => setForm({ ...form, isCapitalExpenditure: e.target.checked })}
                  />
                  <div className="mini" style={{ color: '#6b6167' }}>
                    修繕費ではなく、資産計上して数年に分けて経費化すべき支出(大規模修繕・改良工事など)の場合にチェックしてください
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="form-row"><label>備考</label><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? '登録中...' : '登録'}</button>
          </div>
        </div>
      ) : (
        <div className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
          閲覧のみできます(編集権限がありません)
        </div>
      )}

      {canEditExpenses && formKind === 'expenses' && showPdfImport && (
        <ExpensePdfImportPanel
          allRecords={allRecords}
          expenses={expenses}
          user={user}
          onImported={onChanged}
          onClose={() => setShowPdfImport(false)}
        />
      )}

      <div className="cards">
        <div className="card">
          <div className="label">売上合計</div>
          <div className="num">{yen(totalSales)}</div>
        </div>
        <div className="card">
          <div className="label">経費合計</div>
          <div className="num">{yen(totalExpenses)}</div>
        </div>
        <div className="card">
          <div className="label">差引(売上−経費)</div>
          <div className="num">{yen(totalSales - totalExpenses)}</div>
        </div>
        <div className="card">
          <div className="label">件数</div>
          <div className="num">{filtered.length}件</div>
        </div>
      </div>

      <div className="master-toolbar">
        <PeriodFilter year={periodYear} month={periodMonth} onYear={setPeriodYear} onMonth={setPeriodMonth} />
        <select value={viewKind} onChange={(e) => setViewKind(e.target.value)}>
          <option value="all">すべて</option>
          <option value="sales">売上のみ</option>
          <option value="expenses">経費のみ</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">全勘定科目</option>
          {SALES_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="search-input" placeholder="検索..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="tabs">
          <button type="button" className={groupMode === 'chronological' ? 'tab-btn active' : 'tab-btn'} onClick={() => setGroupMode('chronological')}>時系列順</button>
          <button type="button" className={groupMode === 'grouped' ? 'tab-btn active' : 'tab-btn'} onClick={() => setGroupMode('grouped')}>勘定科目でまとめる</button>
        </div>
        <button className="btn-secondary" onClick={exportCsv}>CSVダウンロード</button>
        {canEditAny && (
          <>
            <button className="btn-secondary" onClick={openImport} disabled={importing}>
              {importing ? 'インポート中...' : `${formKind === 'sales' ? '売上' : '経費'}CSVインポート`}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={formKind === 'sales' ? handleImportSalesCsv : handleImportExpensesCsv}
            />
            {canEditExpenses && formKind === 'expenses' && !showPdfImport && (
              <button className="btn-secondary" onClick={() => setShowPdfImport(true)}>PDFから経費を取り込む</button>
            )}
            <button className="btn-secondary" onClick={toggleAll}>{selected.length === filtered.length && filtered.length ? '全解除' : '全選択'}</button>
            <button className="btn-primary" onClick={copySelected} disabled={saving}>選択したものをコピー</button>
          </>
        )}
      </div>
      {importResult && (
        <div className="mini" style={{ marginBottom: 8, color: importResult.errors.length ? '#a11615' : '#6b6167' }}>
          {importResult.ok > 0 && <div>{importResult.ok}件を追加しました。</div>}
          {importResult.errors.length > 0 && (
            <div>
              {importResult.errors.length}件のエラー:
              <ul style={{ margin: '4px 0 0 18px' }}>
                {importResult.errors.slice(0, 20).map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="mini" style={{ marginBottom: 8, color: '#6b6167' }}>
        CSVインポートは、フォーム上部の「種別」で選んでいる方(売上/経費)の形式で読み込みます。「CSVダウンロード」した形式のまま、行を追加・編集して読み込んでください。
      </div>

      <table className="master-table">
        <thead>
          <tr>
            <th></th><th>日付</th><th>種別</th><th>勘定科目</th><th>物件</th><th>号室</th>
            {!simpleUI && <th>取引先/支払先</th>}
            <th>内容</th>
            {!simpleUI && <th>入金者名等</th>}
            {!simpleUI && <th>入金口座</th>}
            {!simpleUI && <th>入金日・支払日</th>}
            {!simpleUI && <th className="amount">預り金</th>}
            <th className="amount">金額</th>
            {!simpleUI && <th className="amount">預り金送金金額</th>}
            <th className="amount">差引小計(累計)</th>
            {!simpleUI && <th>備考</th>}
            {!simpleUI && (<><th className="amount">税抜金額</th><th className="amount">消費税額</th></>)}
            <th></th>
          </tr>
        </thead>
        {groupMode === 'chronological' ? (
          <tbody>
            {filtered.map((m) => renderTransactionRow(m))}
            {filtered.length === 0 && <tr><td colSpan={colCount} className="empty-row">データがありません</td></tr>}
          </tbody>
        ) : (
          <tbody>
            {groupedRows().map((group) => (
              <Fragment key={group.key}>
                <tr>
                  <td colSpan={colCount} style={{ background: '#f6f2ef', fontWeight: 'bold' }}>■ {group.key}</td>
                </tr>
                {group.items.map((m) => renderTransactionRow(m))}
                <tr>
                  <td colSpan={colCount} style={{ textAlign: 'right', fontWeight: 'bold', background: '#faf7f2' }}>
                    差引小計: {yen(group.subtotal)}
                  </td>
                </tr>
              </Fragment>
            ))}
            {groupedRows().length === 0 && <tr><td colSpan={colCount} className="empty-row">データがありません</td></tr>}
          </tbody>
        )}
      </table>
      <div className="mini" style={{ marginTop: 8, color: '#6b6167' }}>
        ※「時系列順」は日付順に全ての取引を1本の表で表示します(管理料も含め、除外される取引はありません)。「勘定科目でまとめる」は同じ表を科目ごとに区切って小計を表示します。
      </div>
    </div>
  )
}
