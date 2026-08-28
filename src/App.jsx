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
  fields.forEach((field) => { f[field.key] = field.type === 'number' ? 0 : '' })
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
                  {f.relation ? relationLabel(f.relation, record[f.key]) : String(record[f.key] ?? '')}
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

export default function App() {
  const [activeTab, setActiveTab] = useState('owners')
  const [allRecords, setAllRecords] = useState({})
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
        <p className="app-sub">マスタ管理</p>
      </header>

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

      <main className="app-main">
        {loading && <p>読み込み中...</p>}
        {loadError && <p className="form-error">{loadError}</p>}
        {!loading && !loadError && (
          <MasterSection masterKey={activeTab} allRecords={allRecords} onChanged={loadAll} />
        )}
      </main>
    </div>
  )
}
