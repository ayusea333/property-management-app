import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  ownerFromRow, ownerToRow,
  propertyFromRow, propertyToRow,
  roomFromRow, roomToRow,
  tenantFromRow, tenantToRow,
  clientFromRow, clientToRow,
  vendorFromRow, vendorToRow,
} from './lib/masters'
import {
  rentPaymentFromRow, rentPaymentToRow,
  currentMonthStr, prevMonthStr, formatMonthLabel,
} from './lib/rentPayments'
import { SALES_CATEGORIES, saleFromRow, saleToRow } from './lib/sales'
import { expenseFromRow, expenseToRow } from './lib/expenses'
import {
  fiscalYearLabel, fiscalMonths, currentFiscalStartYear,
} from './lib/period'
import { logEdit } from './lib/editLog'
import Dashboard from './Dashboard'
import Login from './Login'
import UserManagement from './UserManagement'
import EditHistory from './EditHistory'
import Backups from './Backups'
import './App.css'

// ---- マスタ種別ごとの設定 ----
// fields: 一覧・フォームに表示する項目
// relation: 他のマスタに紐づく場合の設定(親を選ぶセレクトボックスを出す)
const MASTER_CONFIGS = {
  owners: {
    label: 'オーナー',
    table: 'owners',
    fromRow: ownerFromRow,
    toRow: ownerToRow,
    fields: [
      { key: 'name', label: '名前', required: true },
      { key: 'kana', label: 'フリガナ' },
      { key: 'phone', label: '電話番号' },
      { key: 'email', label: 'メールアドレス' },
      { key: 'address', label: '住所' },
      { key: 'contact', label: '連絡先(その他)' },
      { key: 'bankInfo', label: '振込先口座情報', textarea: true },
      { key: 'note', label: '備考', textarea: true },
    ],
  },
  properties: {
    label: '物件',
    table: 'properties',
    fromRow: propertyFromRow,
    toRow: propertyToRow,
    fields: [
      { key: 'name', label: '物件名', required: true },
      { key: 'ownerId', label: 'オーナー', relation: 'owners', required: true },
      { key: 'address', label: '住所' },
      { key: 'type', label: '種別' },
      { key: 'note', label: '備考', textarea: true },
    ],
  },
  rooms: {
    label: '部屋',
    table: 'rooms',
    fromRow: roomFromRow,
    toRow: roomToRow,
    fields: [
      { key: 'roomNumber', label: '部屋番号', required: true },
      { key: 'propertyId', label: '物件', relation: 'properties', required: true },
      { key: 'rent', label: '賃料', type: 'number' },
      { key: 'commonFee', label: '共益費', type: 'number' },
      { key: 'parkingFee', label: '駐車場代', type: 'number' },
      { key: 'bicycleFee', label: '駐輪場代', type: 'number' },
      { key: 'supportFee', label: '安サポ', type: 'number' },
      { key: 'otherFee', label: 'その他費用', type: 'number' },
      { key: 'managementFee', label: '管理料(月額)', type: 'number' },
      { key: 'note', label: '備考', textarea: true },
    ],
  },
  tenants: {
    label: '入居者',
    table: 'tenants',
    fromRow: tenantFromRow,
    toRow: tenantToRow,
    fields: [
      { key: 'name', label: '名前', required: true },
      { key: 'roomId', label: '部屋', relation: 'rooms', required: true },
      { key: 'contact', label: '連絡先' },
      { key: 'moveInDate', label: '入居日', type: 'date' },
      { key: 'moveOutDate', label: '退去日', type: 'date' },
      { key: 'guarantor', label: '保証会社', options: ['', 'JID', 'ジェイリース', 'いえらぶ', 'クリエイトギャランティ'] },
      { key: 'debit', label: '口座振替', type: 'checkbox' },
      { key: 'sendMethod', label: '請求書送付方法', options: ['', 'メール', '郵送'] },
      { key: 'sendDay', label: '送付日(例: 5日)' },
      { key: 'note', label: '備考', textarea: true },
    ],
    statusFilter: true,
  },
  clients: {
    label: '取引先',
    table: 'clients',
    fromRow: clientFromRow,
    toRow: clientToRow,
    fields: [
      { key: 'name', label: '名前', required: true },
      { key: 'category', label: '分類' },
      { key: 'contact', label: '連絡先' },
      { key: 'note', label: '備考', textarea: true },
    ],
  },
  vendors: {
    label: '業者',
    table: 'vendors',
    fromRow: vendorFromRow,
    toRow: vendorToRow,
    fields: [
      { key: 'name', label: '名前', required: true },
      { key: 'category', label: '分類' },
      { key: 'contact', label: '連絡先' },
      { key: 'note', label: '備考', textarea: true },
    ],
  },
}

const TABS = ['owners', 'properties', 'rooms', 'tenants', 'clients', 'vendors']

function emptyForm(fields) {
  const f = {}
  fields.forEach((field) => {
    f[field.key] = field.type === 'number' ? 0 : field.type === 'checkbox' ? false : ''
  })
  return f
}

function recordLabel(record) {
  return record?.name || record?.roomNumber || ''
}

function MasterSection({ masterKey, allRecords, onChanged, canEdit, user }) {
  const config = MASTER_CONFIGS[masterKey]
  const records = allRecords[masterKey] || []
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm(config.fields))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setForm(emptyForm(config.fields))
    setEditingId(null)
    setSearch('')
    setStatusFilter('all')
    setError('')
  }, [masterKey])

  const relationOptions = (relKey) => allRecords[relKey] || []

  const filtered = records.filter((r) => {
    const text = JSON.stringify(r).toLowerCase()
    if (search && !text.includes(search.toLowerCase())) return false
    if (config.statusFilter && statusFilter !== 'all') {
      const isOut = !!r.moveOutDate
      if (statusFilter === 'active' && isOut) return false
      if (statusFilter === 'moved-out' && !isOut) return false
    }
    return true
  })

  const startEdit = (record) => {
    setEditingId(record.id)
    setForm({ ...record })
    setError('')
  }

  const startNew = () => {
    setEditingId('new')
    setForm(emptyForm(config.fields))
    setError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(emptyForm(config.fields))
    setError('')
  }

  const handleSave = async () => {
    for (const field of config.fields) {
      if (field.required && !form[field.key]) {
        setError(`「${field.label}」は必須です`)
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      const row = config.toRow(form)
      const isNew = editingId === 'new'
      if (isNew) {
        const { error: err } = await supabase.from(config.table).insert(row)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from(config.table).update(row).eq('id', editingId)
        if (err) throw err
      }
      await onChanged()
      await logEdit({
        user,
        tableLabel: config.label,
        action: isNew ? '追加' : '編集',
        summary: recordLabel(form),
      })
      cancelEdit()
    } catch (e) {
      setError('保存に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record) => {
    if (!confirm('削除しますか?この操作は取り消せません。')) return
    const { error: err } = await supabase.from(config.table).delete().eq('id', record.id)
    if (err) {
      alert('削除に失敗しました: ' + err.message)
      return
    }
    await onChanged()
    await logEdit({ user, tableLabel: config.label, action: '削除', summary: recordLabel(record) })
  }

  const relationLabel = (relKey, id) => {
    const opts = relationOptions(relKey)
    const found = opts.find((o) => o.id === id)
    if (!found) return '(未設定)'
    return found.name || found.roomNumber || ''
  }

  return (
    <div className="master-section">
      <div className="master-toolbar">
        <input
          className="search-input"
          placeholder="検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {config.statusFilter && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">すべて</option>
            <option value="active">入居中</option>
            <option value="moved-out">退去済み</option>
          </select>
        )}
        {canEdit && <button className="btn-primary" onClick={startNew}>+ 新規登録</button>}
      </div>

      {!canEdit && (
        <div className="mini" style={{ marginBottom: 12, color: '#54614f' }}>
          閲覧のみできます(編集権限がありません)
        </div>
      )}

      {canEdit && editingId && (
        <div className="master-form">
          <h3>{editingId === 'new' ? `${config.label}を新規登録` : `${config.label}を編集`}</h3>
          {config.fields.map((field) => (
            <div className="form-row" key={field.key}>
              <label>{field.label}{field.required && <span className="required">*</span>}</label>
              {field.relation ? (
                <select
                  value={form[field.key] || ''}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                >
                  <option value="">選択してください</option>
                  {relationOptions(field.relation).map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name || opt.roomNumber}</option>
                  ))}
                </select>
              ) : field.options ? (
                <select
                  value={form[field.key] || ''}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                >
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>{opt || '(未設定)'}</option>
                  ))}
                </select>
              ) : field.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  style={{ width: 18, height: 18 }}
                  checked={!!form[field.key]}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.checked })}
                />
              ) : field.textarea ? (
                <textarea
                  value={form[field.key] || ''}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                />
              ) : (
                <input
                  type={field.type || 'text'}
                  value={form[field.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                />
              )}
            </div>
          ))}
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
            <button className="btn-secondary" onClick={cancelEdit}>キャンセル</button>
          </div>
        </div>
      )}

      <table className="master-table">
        <thead>
          <tr>
            {config.fields.filter((f) => !f.textarea).map((f) => (
              <th key={f.key}>{f.label}</th>
            ))}
            {canEdit && <th className="col-actions"></th>}
          </tr>
        </thead>
        <tbody>
          {filtered.map((record) => (
            <tr key={record.id}>
              {config.fields.filter((f) => !f.textarea).map((f) => (
                <td key={f.key}>
                  {f.relation
                    ? relationLabel(f.relation, record[f.key])
                    : f.type === 'checkbox'
                    ? (record[f.key] ? '○' : '')
                    : String(record[f.key] ?? '')}
                </td>
              ))}
              {canEdit && (
                <td className="col-actions">
                  <button className="icon-btn" title="編集" onClick={() => startEdit(record)}>✎</button>
                  <button className="icon-btn" title="削除" onClick={() => handleDelete(record)}>🗑</button>
                </td>
              )}
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={config.fields.length + 1} className="empty-row">データがありません</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ---- 家賃入金・滞納確認 ----

function activeTenantsFor(allRecords, targetMonth) {
  const tenants = allRecords.tenants || []
  const rooms = allRecords.rooms || []
  const properties = allRecords.properties || []
  const owners = allRecords.owners || []
  const monthEnd = `${targetMonth}-31`
  return tenants
    .filter((t) => !t.moveOutDate || t.moveOutDate >= `${targetMonth}-01`)
    .filter((t) => !t.moveInDate || t.moveInDate <= monthEnd)
    .map((t) => {
      const room = rooms.find((r) => r.id === t.roomId)
      const property = room ? properties.find((p) => p.id === room.propertyId) : null
      const owner = property ? owners.find((o) => o.id === property.ownerId) : null
      const rent = room?.rent || 0
      const commonFee = room?.commonFee || 0
      const parkingFee = room?.parkingFee || 0
      const bicycleFee = room?.bicycleFee || 0
      const supportFee = room?.supportFee || 0
      const otherFee = room?.otherFee || 0
      return {
        tenant: t,
        room, property, owner,
        rent, commonFee, parkingFee, bicycleFee, supportFee, otherFee,
        total: rent + commonFee + parkingFee + bicycleFee + supportFee + otherFee,
      }
    })
}

function arrearsMonthsCount(tenant, rentPayments, targetMonth) {
  let month = targetMonth
  let count = 0
  for (let i = 0; i < 24; i++) {
    const has = rentPayments.some((p) => p.tenantId === tenant.id && p.targetMonth === month)
    if (has) break
    if (tenant.moveInDate && `${month}-01` < tenant.moveInDate.slice(0, 8) + '01') break
    count++
    month = prevMonthStr(month)
  }
  return count
}

function yen(n) {
  return '¥' + Math.round(n || 0).toLocaleString()
}

function RentPaymentsSection({ allRecords, rentPayments, onChanged, canEdit, user }) {
  const [targetMonth, setTargetMonth] = useState(currentMonthStr())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState([])
  const [payForm, setPayForm] = useState(null) // { tenantId, date, amount, note }
  const [saving, setSaving] = useState(false)

  const rows = activeTenantsFor(allRecords, targetMonth).map((row) => {
    const payment = rentPayments.find((p) => p.tenantId === row.tenant.id && p.targetMonth === targetMonth)
    const arrears = arrearsMonthsCount(row.tenant, rentPayments, targetMonth)
    return { ...row, payment, paid: !!payment, arrears }
  })

  const filtered = rows.filter((row) => {
    if (statusFilter === 'paid' && !row.paid) return false
    if (statusFilter === 'unpaid' && row.paid) return false
    if (statusFilter === 'over1' && row.arrears < 1) return false
    if (statusFilter === 'over2' && row.arrears < 2) return false
    if (search) {
      const text = `${row.tenant.name} ${row.owner?.name || ''} ${row.property?.name || ''} ${row.room?.roomNumber || ''} ${row.tenant.guarantor || ''}`.toLowerCase()
      if (!text.includes(search.toLowerCase())) return false
    }
    return true
  })

  const stats = {
    count: rows.length,
    paidCount: rows.filter((r) => r.paid).length,
    unpaidCount: rows.filter((r) => !r.paid).length,
    expected: rows.reduce((z, r) => z + r.total, 0),
    confirmed: rows.filter((r) => r.paid).reduce((z, r) => z + (r.payment.amount ?? r.total), 0),
  }

  const openPayForm = (row) => {
    setPayForm({
      tenantId: row.tenant.id,
      date: row.payment?.paymentDate || new Date().toISOString().slice(0, 10),
      amount: row.payment?.amount ?? row.total,
      note: row.payment?.note || '',
    })
  }

  const postManagementFeeIfNeeded = async (row) => {
    const managementFee = row.room?.managementFee || 0
    if (!managementFee) return
    const saleRow = saleToRow({
      date: row.payment?.paymentDate || new Date().toISOString().slice(0, 10),
      category: '管理料',
      propertyId: row.property?.id || '',
      roomId: row.room?.id || '',
      ownerId: row.owner?.id || '',
      content: `${row.tenant.name}様 ${targetMonth}分 管理料(自動)`,
      amount: managementFee,
      source: 'auto_management_fee',
      sourceRef: `${row.tenant.id}:${targetMonth}`,
    })
    const { error } = await supabase.from('sales').upsert(saleRow, { onConflict: 'source,source_ref' })
    if (error) throw error
  }

  const savePayment = async () => {
    if (!payForm.date) { alert('入金日を入力してください'); return }
    setSaving(true)
    try {
      const row = rentPaymentToRow({
        tenantId: payForm.tenantId,
        targetMonth,
        paymentDate: payForm.date,
        amount: payForm.amount,
        note: payForm.note,
        source: 'manual',
      })
      const { error } = await supabase.from('rent_payments').upsert(row, { onConflict: 'tenant_id,target_month' })
      if (error) throw error
      const target = rows.find((r) => r.tenant.id === payForm.tenantId)
      if (target) await postManagementFeeIfNeeded({ ...target, payment: { paymentDate: payForm.date } })
      await onChanged()
      await logEdit({
        user,
        tableLabel: '家賃入金',
        action: '記録',
        summary: `${target?.tenant?.name || ''} ${formatMonthLabel(targetMonth)}分 入金日: ${payForm.date}`,
      })
      setPayForm(null)
    } catch (e) {
      alert('保存に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const markSelectedPaid = async () => {
    if (!selected.length) { alert('対象を選択してください'); return }
    const date = window.prompt('入金日を YYYY-MM-DD で入力してください', new Date().toISOString().slice(0, 10))
    if (!date) return
    setSaving(true)
    try {
      for (const tenantId of selected) {
        const row = rows.find((r) => r.tenant.id === tenantId)
        if (!row) continue
        const payload = rentPaymentToRow({ tenantId, targetMonth, paymentDate: date, amount: row.total, source: 'manual' })
        const { error } = await supabase.from('rent_payments').upsert(payload, { onConflict: 'tenant_id,target_month' })
        if (error) throw error
        await postManagementFeeIfNeeded({ ...row, payment: { paymentDate: date } })
      }
      await onChanged()
      await logEdit({
        user,
        tableLabel: '家賃入金',
        action: '記録',
        summary: `${formatMonthLabel(targetMonth)}分 ${selected.length}件をまとめて入金済みに(入金日: ${date})`,
      })
      setSelected([])
    } catch (e) {
      alert('保存に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleSelect = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  return (
    <div>
      <div className="cards">
        <div className="card"><div className="label">対象契約</div><div className="num">{stats.count}件</div></div>
        <div className="card"><div className="label">入金済</div><div className="num">{stats.paidCount}件</div></div>
        <div className="card"><div className="label">未入金</div><div className="num">{stats.unpaidCount}件</div></div>
        <div className="card"><div className="label">入金予定額</div><div className="num">{yen(stats.expected)}</div></div>
        <div className="card"><div className="label">確認済入金額</div><div className="num">{yen(stats.confirmed)}</div></div>
      </div>

      <div className="master-toolbar">
        <input
          type="month"
          value={targetMonth}
          onChange={(e) => setTargetMonth(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">すべて</option>
          <option value="paid">入金済</option>
          <option value="unpaid">未入金</option>
          <option value="over1">1か月以上未入金</option>
          <option value="over2">2か月以上滞納</option>
        </select>
        <input
          className="search-input"
          placeholder="オーナー・物件・号室・契約者・保証会社で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {canEdit && (
          <button className="btn-primary" onClick={markSelectedPaid} disabled={saving}>選択を入金済みにする</button>
        )}
      </div>

      {!canEdit && (
        <div className="mini" style={{ marginBottom: 12, color: '#54614f' }}>
          閲覧のみできます(編集権限がありません)
        </div>
      )}

      {payForm && (
        <div className="master-form">
          <h3>{formatMonthLabel(targetMonth)}分の入金を記録</h3>
          <div className="form-row">
            <label>入金日</label>
            <input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
          </div>
          <div className="form-row">
            <label>入金額</label>
            <input type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          </div>
          <div className="form-row">
            <label>備考</label>
            <input value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={savePayment} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
            <button className="btn-secondary" onClick={() => setPayForm(null)}>キャンセル</button>
          </div>
        </div>
      )}

      <div className="mini" style={{ marginBottom: 8, color: '#54614f' }}>
        表示中: {formatMonthLabel(targetMonth)}分
      </div>

      <table className="master-table">
        <thead>
          <tr>
            <th></th>
            <th>状態</th>
            <th>オーナー</th>
            <th>物件</th>
            <th>号室</th>
            <th>契約者</th>
            <th className="amount">家賃</th>
            <th className="amount">共益費</th>
            <th className="amount">駐車場</th>
            <th className="amount">駐輪場</th>
            <th className="amount">安サポ</th>
            <th className="amount">その他</th>
            <th className="amount">合計</th>
            <th>保証会社</th>
            <th>口振</th>
            <th>{formatMonthLabel(targetMonth)}分 入金日</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.tenant.id}>
              <td>
                {canEdit && (
                  <input type="checkbox" checked={selected.includes(row.tenant.id)} onChange={() => toggleSelect(row.tenant.id)} />
                )}
              </td>
              <td>
                {row.paid
                  ? <span className="status ok">入金済</span>
                  : row.arrears >= 2
                  ? <span className="status bad">{row.arrears}か月滞納</span>
                  : <span className="status warn">未入金</span>}
              </td>
              <td>{row.owner?.name || ''}</td>
              <td>{row.property?.name || ''}</td>
              <td>{row.room?.roomNumber || ''}</td>
              <td>{row.tenant.name}</td>
              <td className="amount">{yen(row.rent)}</td>
              <td className="amount">{yen(row.commonFee)}</td>
              <td className="amount">{yen(row.parkingFee)}</td>
              <td className="amount">{yen(row.bicycleFee)}</td>
              <td className="amount">{yen(row.supportFee)}</td>
              <td className="amount">{yen(row.otherFee)}</td>
              <td className="amount">{yen(row.total)}</td>
              <td>{row.tenant.guarantor}</td>
              <td className="center">{row.tenant.debit ? '○' : ''}</td>
              <td>
                {row.payment
                  ? <span>{row.payment.paymentDate} {canEdit && <button className="icon-btn" onClick={() => openPayForm(row)}>✎</button>}</span>
                  : canEdit
                  ? <button className="btn-secondary" onClick={() => openPayForm(row)}>入金日を入力</button>
                  : ''}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={16} className="empty-row">対象の契約がありません</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ---- 表示期間(期・月)の共通フィルタ ----

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

// ---- 売上一覧・入力 ----

function emptySaleForm() {
  return { date: new Date().toISOString().slice(0, 10), category: SALES_CATEGORIES[0], propertyId: '', roomId: '', content: '', amount: 0 }
}

function SalesSection({ allRecords, sales, onChanged, canEdit, user }) {
  const [form, setForm] = useState(emptySaleForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selected, setSelected] = useState([])
  const [periodYear, setPeriodYear] = useState(currentFiscalStartYear())
  const [periodMonth, setPeriodMonth] = useState('all')

  const properties = allRecords.properties || []
  const rooms = allRecords.rooms || []
  const owners = allRecords.owners || []
  const roomOptions = rooms.filter((r) => r.propertyId === form.propertyId)

  const propertyName = (id) => properties.find((p) => p.id === id)?.name || ''
  const roomLabel = (id) => rooms.find((r) => r.id === id)?.roomNumber || ''
  const ownerName = (id) => owners.find((o) => o.id === id)?.name || ''

  const filtered = sales
    .filter((s) => inPeriod(s.date, periodYear, periodMonth))
    .filter((s) => !categoryFilter || s.category === categoryFilter)
    .filter((s) => {
      if (!search) return true
      const text = `${propertyName(s.propertyId)} ${s.content} ${s.category}`.toLowerCase()
      return text.includes(search.toLowerCase())
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  const periodTotal = filtered.reduce((z, s) => z + s.amount, 0)

  const submit = async () => {
    if (!form.date || !form.amount) { setError('日付と金額は必須です'); return }
    setSaving(true)
    setError('')
    try {
      const property = properties.find((p) => p.id === form.propertyId)
      const row = saleToRow({ ...form, ownerId: property?.ownerId || '', source: 'manual' })
      const { error: err } = await supabase.from('sales').insert(row)
      if (err) throw err
      await onChanged()
      await logEdit({ user, tableLabel: '売上', action: '追加', summary: `${form.category} ${form.content || ''} ${yen(form.amount)}` })
      setForm(emptySaleForm())
    } catch (e) {
      setError('保存に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteSale = async (sale) => {
    if (!confirm('削除しますか?')) return
    const { error: err } = await supabase.from('sales').delete().eq('id', sale.id)
    if (err) { alert('削除に失敗しました: ' + err.message); return }
    await onChanged()
    await logEdit({ user, tableLabel: '売上', action: '削除', summary: `${sale.category} ${sale.content || ''} ${yen(sale.amount)}` })
  }

  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((s) => s.id))

  const copySelected = async () => {
    if (!selected.length) { alert('コピーする行を選択してください'); return }
    const newDate = window.prompt('複製先の日付を YYYY-MM-DD で入力してください', new Date().toISOString().slice(0, 10))
    if (!newDate) return
    setSaving(true)
    try {
      let count = 0
      for (const id of selected) {
        const s = sales.find((x) => x.id === id)
        if (!s || s.source !== 'manual') continue
        const row = saleToRow({ ...s, date: newDate, source: 'manual' })
        const { error: err } = await supabase.from('sales').insert(row)
        if (err) throw err
        count++
      }
      await onChanged()
      await logEdit({ user, tableLabel: '売上', action: '追加', summary: `${count}件を${newDate}付けで複製` })
      setSelected([])
    } catch (e) {
      alert('コピーに失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {canEdit ? (
        <div className="master-form">
          <h3>売上入力</h3>
          <div className="form-row"><label>日付</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div className="form-row">
            <label>物件</label>
            <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value, roomId: '' })}>
              <option value="">(なし)</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {form.propertyId && (
            <div className="form-row">
              <label>号室</label>
              <select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                <option value="">(なし)</option>
                {roomOptions.map((r) => <option key={r.id} value={r.id}>{r.roomNumber}</option>)}
              </select>
            </div>
          )}
          <div className="form-row">
            <label>カテゴリ</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {SALES_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-row"><label>内容</label><input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
          <div className="form-row"><label>金額</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? '登録中...' : '登録'}</button>
          </div>
        </div>
      ) : (
        <div className="mini" style={{ marginBottom: 12, color: '#54614f' }}>
          閲覧のみできます(編集権限がありません)
        </div>
      )}

      <div className="master-toolbar">
        <PeriodFilter year={periodYear} month={periodMonth} onYear={setPeriodYear} onMonth={setPeriodMonth} />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">全カテゴリ</option>
          {SALES_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="search-input" placeholder="検索..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {canEdit && (
          <>
            <button className="btn-secondary" onClick={toggleAll}>{selected.length === filtered.length && filtered.length ? '全解除' : '全選択'}</button>
            <button className="btn-primary" onClick={copySelected} disabled={saving}>選択したものをコピー</button>
          </>
        )}
      </div>
      <div className="mini" style={{ marginBottom: 8, color: '#54614f' }}>表示中の合計: {yen(periodTotal)}({filtered.length}件)</div>

      <table className="master-table">
        <thead>
          <tr><th></th><th>日付</th><th>カテゴリ</th><th>物件</th><th>号室</th><th>オーナー</th><th>内容</th><th className="amount">金額</th><th></th></tr>
        </thead>
        <tbody>
          {filtered.map((s) => (
            <tr key={s.id}>
              <td>{canEdit && <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)} />}</td>
              <td>{s.date}</td>
              <td>{s.category}{s.source !== 'manual' && <span className="mini"> (自動)</span>}</td>
              <td>{propertyName(s.propertyId)}</td>
              <td>{roomLabel(s.roomId)}</td>
              <td>{ownerName(s.ownerId)}</td>
              <td>{s.content}</td>
              <td className="amount">{s.amount.toLocaleString()}</td>
              <td>{canEdit && s.source === 'manual' && <button className="icon-btn" onClick={() => deleteSale(s)}>🗑</button>}</td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={9} className="empty-row">データがありません</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---- 経費一覧・入力 ----

function emptyExpenseForm() {
  return { date: new Date().toISOString().slice(0, 10), propertyId: '', roomId: '', category: '', content: '', payee: '', amount: 0 }
}

function ExpensesSection({ allRecords, expenses, onChanged, canEdit, user }) {
  const [form, setForm] = useState(emptyExpenseForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [periodYear, setPeriodYear] = useState(currentFiscalStartYear())
  const [periodMonth, setPeriodMonth] = useState('all')

  const properties = allRecords.properties || []
  const rooms = allRecords.rooms || []
  const roomOptions = rooms.filter((r) => r.propertyId === form.propertyId)
  const propertyName = (id) => properties.find((p) => p.id === id)?.name || ''
  const roomLabel = (id) => rooms.find((r) => r.id === id)?.roomNumber || ''

  const filtered = expenses
    .filter((e) => inPeriod(e.date, periodYear, periodMonth))
    .filter((e) => {
      if (!search) return true
      const text = `${propertyName(e.propertyId)} ${e.content} ${e.category} ${e.payee}`.toLowerCase()
      return text.includes(search.toLowerCase())
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  const periodTotal = filtered.reduce((z, e) => z + e.amount, 0)

  const submit = async () => {
    if (!form.date || !form.amount) { setError('日付と金額は必須です'); return }
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase.from('expenses').insert(expenseToRow(form))
      if (err) throw err
      await onChanged()
      await logEdit({ user, tableLabel: '経費', action: '追加', summary: `${form.category || ''} ${form.content || ''} ${yen(form.amount)}` })
      setForm(emptyExpenseForm())
    } catch (e) {
      setError('保存に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteExpense = async (expense) => {
    if (!confirm('削除しますか?')) return
    const { error: err } = await supabase.from('expenses').delete().eq('id', expense.id)
    if (err) { alert('削除に失敗しました: ' + err.message); return }
    await onChanged()
    await logEdit({ user, tableLabel: '経費', action: '削除', summary: `${expense.category || ''} ${expense.content || ''} ${yen(expense.amount)}` })
  }

  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((e) => e.id))

  const copySelected = async () => {
    if (!selected.length) { alert('コピーする行を選択してください'); return }
    const newDate = window.prompt('複製先の日付を YYYY-MM-DD で入力してください', new Date().toISOString().slice(0, 10))
    if (!newDate) return
    setSaving(true)
    try {
      let count = 0
      for (const id of selected) {
        const e = expenses.find((x) => x.id === id)
        if (!e) continue
        const { error: err } = await supabase.from('expenses').insert(expenseToRow({ ...e, date: newDate }))
        if (err) throw err
        count++
      }
      await onChanged()
      await logEdit({ user, tableLabel: '経費', action: '追加', summary: `${count}件を${newDate}付けで複製` })
      setSelected([])
    } catch (e) {
      alert('コピーに失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {canEdit ? (
        <div className="master-form">
          <h3>経費入力</h3>
          <div className="form-row"><label>日付</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div className="form-row">
            <label>物件</label>
            <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value, roomId: '' })}>
              <option value="">(なし)</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {form.propertyId && (
            <div className="form-row">
              <label>号室</label>
              <select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                <option value="">(なし)</option>
                {roomOptions.map((r) => <option key={r.id} value={r.id}>{r.roomNumber}</option>)}
              </select>
            </div>
          )}
          <div className="form-row"><label>カテゴリ</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="例: 日常清掃 外注費" /></div>
          <div className="form-row"><label>内容</label><input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
          <div className="form-row"><label>支払先</label><input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} /></div>
          <div className="form-row"><label>金額</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? '登録中...' : '登録'}</button>
          </div>
        </div>
      ) : (
        <div className="mini" style={{ marginBottom: 12, color: '#54614f' }}>
          閲覧のみできます(編集権限がありません)
        </div>
      )}

      <div className="master-toolbar">
        <PeriodFilter year={periodYear} month={periodMonth} onYear={setPeriodYear} onMonth={setPeriodMonth} />
        <input className="search-input" placeholder="検索..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {canEdit && (
          <>
            <button className="btn-secondary" onClick={toggleAll}>{selected.length === filtered.length && filtered.length ? '全解除' : '全選択'}</button>
            <button className="btn-primary" onClick={copySelected} disabled={saving}>選択したものをコピー</button>
          </>
        )}
      </div>
      <div className="mini" style={{ marginBottom: 8, color: '#54614f' }}>表示中の合計: {yen(periodTotal)}({filtered.length}件)</div>

      <table className="master-table">
        <thead>
          <tr><th></th><th>日付</th><th>物件</th><th>号室</th><th>カテゴリ</th><th>内容</th><th>支払先</th><th className="amount">金額</th><th></th></tr>
        </thead>
        <tbody>
          {filtered.map((e) => (
            <tr key={e.id}>
              <td>{canEdit && <input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggleSelect(e.id)} />}</td>
              <td>{e.date}</td>
              <td>{propertyName(e.propertyId)}</td>
              <td>{roomLabel(e.roomId)}</td>
              <td>{e.category}</td>
              <td>{e.content}</td>
              <td>{e.payee}</td>
              <td className="amount">{e.amount.toLocaleString()}</td>
              <td>{canEdit && <button className="icon-btn" onClick={() => deleteExpense(e)}>🗑</button>}</td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={9} className="empty-row">データがありません</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

const BASE_TOP_TABS = [
  { key: 'dashboard', label: 'ダッシュボード' },
  { key: 'master', label: 'マスタ管理' },
  { key: 'rentPayments', label: '家賃入金' },
  { key: 'sales', label: '売上' },
  { key: 'expenses', label: '経費' },
]

const ADMIN_TOP_TABS = [
  { key: 'users', label: 'ユーザー管理' },
  { key: 'history', label: '変更履歴' },
  { key: 'backups', label: 'バックアップ' },
]

const PERM_FIELD_MAP = {
  master: 'can_edit_master',
  rentPayments: 'can_edit_rent_payments',
  sales: 'can_edit_sales',
  expenses: 'can_edit_expenses',
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [topTab, setTopTab] = useState('dashboard')
  const [activeTab, setActiveTab] = useState('owners')
  const [allRecords, setAllRecords] = useState({})
  const [rentPayments, setRentPayments] = useState([])
  const [sales, setSales] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      return
    }
    supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => {
      setProfile(data || null)
    })
  }, [session])

  const loadAll = async () => {
    setLoadError('')
    try {
      const results = {}
      for (const key of TABS) {
        const config = MASTER_CONFIGS[key]
        const { data, error } = await supabase.from(config.table).select('*').order('created_at')
        if (error) throw error
        results[key] = (data || []).map(config.fromRow)
      }
      setAllRecords(results)

      const { data: rpData, error: rpError } = await supabase.from('rent_payments').select('*')
      if (rpError) throw rpError
      setRentPayments((rpData || []).map(rentPaymentFromRow))

      const { data: saleData, error: saleError } = await supabase.from('sales').select('*')
      if (saleError) throw saleError
      setSales((saleData || []).map(saleFromRow))

      const { data: expData, error: expError } = await supabase.from('expenses').select('*')
      if (expError) throw expError
      setExpenses((expData || []).map(expenseFromRow))
    } catch (e) {
      setLoadError('データの読み込みに失敗しました: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session?.user) {
      setLoading(true)
      loadAll()
    }
  }, [session])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (authLoading) {
    return <div className="app-shell"><p style={{ padding: 24 }}>読み込み中...</p></div>
  }

  if (!session) {
    return <Login />
  }

  const canEdit = (key) => !!profile?.is_admin || !!profile?.[PERM_FIELD_MAP[key]]
  const topTabs = profile?.is_admin ? [...BASE_TOP_TABS, ...ADMIN_TOP_TABS] : BASE_TOP_TABS

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>建物管理台帳</h1>
        </div>

        <nav className="sidebar-nav">
          {topTabs.map((t) => (
            <button
              key={t.key}
              className={topTab === t.key ? 'sidebar-btn active' : 'sidebar-btn'}
              onClick={() => setTopTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {topTab === 'master' && (
          <nav className="sidebar-subnav">
            <div className="sidebar-subnav-label">マスタ種別</div>
            {TABS.map((key) => (
              <button
                key={key}
                className={activeTab === key ? 'sidebar-btn sub active' : 'sidebar-btn sub'}
                onClick={() => setActiveTab(key)}
              >
                {MASTER_CONFIGS[key].label}
              </button>
            ))}
          </nav>
        )}

        <div className="sidebar-footer">
          <div className="sidebar-user">{profile?.display_name || session.user.email}</div>
          <button className="sidebar-btn" onClick={handleLogout}>ログアウト</button>
        </div>
      </aside>

      <div className="main-area">
        <header className="main-header">
          <h2>{topTabs.find((t) => t.key === topTab)?.label}</h2>
        </header>

        <main className="app-main">
          {loading && <p>読み込み中...</p>}
          {loadError && <p className="form-error">{loadError}</p>}
          {!loading && !loadError && topTab === 'master' && (
            <MasterSection
              masterKey={activeTab}
              allRecords={allRecords}
              onChanged={loadAll}
              canEdit={canEdit('master')}
              user={session.user}
            />
          )}
          {!loading && !loadError && topTab === 'rentPayments' && (
            <RentPaymentsSection
              allRecords={allRecords}
              rentPayments={rentPayments}
              onChanged={loadAll}
              canEdit={canEdit('rentPayments')}
              user={session.user}
            />
          )}
          {!loading && !loadError && topTab === 'sales' && (
            <SalesSection
              allRecords={allRecords}
              sales={sales}
              onChanged={loadAll}
              canEdit={canEdit('sales')}
              user={session.user}
            />
          )}
          {!loading && !loadError && topTab === 'expenses' && (
            <ExpensesSection
              allRecords={allRecords}
              expenses={expenses}
              onChanged={loadAll}
              canEdit={canEdit('expenses')}
              user={session.user}
            />
          )}
          {!loading && !loadError && topTab === 'dashboard' && (
            <Dashboard allRecords={allRecords} sales={sales} expenses={expenses} rentPayments={rentPayments} />
          )}
          {topTab === 'users' && profile?.is_admin && (
            <UserManagement myProfile={profile} />
          )}
          {topTab === 'history' && profile?.is_admin && (
            <EditHistory />
          )}
          {topTab === 'backups' && profile?.is_admin && (
            <Backups onRestored={loadAll} />
          )}
        </main>
      </div>
    </div>
  )
}
