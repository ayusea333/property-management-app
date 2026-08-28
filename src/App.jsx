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
      { key: 'rent', label: '基準賃料', type: 'number' },
      { key: 'commonFee', label: '基準共益費', type: 'number' },
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
      { key: 'parkingFee', label: '駐車場代', type: 'number' },
      { key: 'otherFee', label: 'その他費用', type: 'number' },
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

function MasterSection({ masterKey, allRecords, onChanged }) {
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
      if (editingId === 'new') {
        const { error: err } = await supabase.from(config.table).insert(row)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from(config.table).update(row).eq('id', editingId)
        if (err) throw err
      }
      await onChanged()
      cancelEdit()
    } catch (e) {
      setError('保存に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('削除しますか?この操作は取り消せません。')) return
    const { error: err } = await supabase.from(config.table).delete().eq('id', id)
    if (err) {
      alert('削除に失敗しました: ' + err.message)
      return
    }
    await onChanged()
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
        <button className="btn-primary" onClick={startNew}>+ 新規登録</button>
      </div>

      {editingId && (
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
            <th className="col-actions"></th>
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
              <td className="col-actions">
                <button className="icon-btn" title="編集" onClick={() => startEdit(record)}>✎</button>
                <button className="icon-btn" title="削除" onClick={() => handleDelete(record.id)}>🗑</button>
              </td>
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
      const parkingFee = t.parkingFee || 0
      const otherFee = t.otherFee || 0
      return {
        tenant: t,
        room, property, owner,
        rent, commonFee, parkingFee, otherFee,
        total: rent + commonFee + parkingFee + otherFee,
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

function RentPaymentsSection({ allRecords, rentPayments, onChanged }) {
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
      await onChanged()
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
      }
      await onChanged()
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
        <button className="btn-primary" onClick={markSelectedPaid} disabled={saving}>選択を入金済みにする</button>
      </div>

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
              <td><input type="checkbox" checked={selected.includes(row.tenant.id)} onChange={() => toggleSelect(row.tenant.id)} /></td>
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
              <td className="amount">{yen(row.otherFee)}</td>
              <td className="amount">{yen(row.total)}</td>
              <td>{row.tenant.guarantor}</td>
              <td className="center">{row.tenant.debit ? '○' : ''}</td>
              <td>
                {row.payment
                  ? <span>{row.payment.paymentDate} <button className="icon-btn" onClick={() => openPayForm(row)}>✎</button></span>
                  : <button className="btn-secondary" onClick={() => openPayForm(row)}>入金日を入力</button>}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={14} className="empty-row">対象の契約がありません</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const TOP_TABS = [
  { key: 'master', label: 'マスタ管理' },
  { key: 'rentPayments', label: '家賃入金' },
]

export default function App() {
  const [topTab, setTopTab] = useState('master')
  const [activeTab, setActiveTab] = useState('owners')
  const [allRecords, setAllRecords] = useState({})
  const [rentPayments, setRentPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

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
    } catch (e) {
      setLoadError('データの読み込みに失敗しました: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>建物管理台帳</h1>
        <p className="app-sub">{TOP_TABS.find((t) => t.key === topTab)?.label}</p>
      </header>

      <nav className="tab-nav top-tab-nav">
        {TOP_TABS.map((t) => (
          <button
            key={t.key}
            className={topTab === t.key ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setTopTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {topTab === 'master' && (
        <nav className="tab-nav">
          {TABS.map((key) => (
            <button
              key={key}
              className={activeTab === key ? 'tab-btn active' : 'tab-btn'}
              onClick={() => setActiveTab(key)}
            >
              {MASTER_CONFIGS[key].label}
            </button>
          ))}
        </nav>
      )}

      <main className="app-main">
        {loading && <p>読み込み中...</p>}
        {loadError && <p className="form-error">{loadError}</p>}
        {!loading && !loadError && topTab === 'master' && (
          <MasterSection masterKey={activeTab} allRecords={allRecords} onChanged={loadAll} />
        )}
        {!loading && !loadError && topTab === 'rentPayments' && (
          <RentPaymentsSection allRecords={allRecords} rentPayments={rentPayments} onChanged={loadAll} />
        )}
      </main>
    </div>
  )
}
