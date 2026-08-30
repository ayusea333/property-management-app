import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const PERM_FIELDS = [
  { key: 'can_edit_master', label: 'マスタ管理' },
  { key: 'can_edit_rent_payments', label: '家賃入金' },
  { key: 'can_edit_sales', label: '売上' },
  { key: 'can_edit_expenses', label: '経費' },
]

export default function UserManagement({ myProfile }) {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase.from('profiles').select('*').order('created_at')
    if (err) {
      setError('読み込みに失敗しました: ' + err.message)
    } else {
      setProfiles(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateField = async (id, field, value) => {
    setSavingId(id)
    const { error: err } = await supabase.from('profiles').update({ [field]: value }).eq('id', id)
    if (err) {
      alert('更新に失敗しました: ' + err.message)
    } else {
      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
    }
    setSavingId('')
  }

  const updateName = async (id, name) => {
    const { error: err } = await supabase.from('profiles').update({ display_name: name }).eq('id', id)
    if (err) alert('更新に失敗しました: ' + err.message)
  }

  if (loading) return <p>読み込み中...</p>
  if (error) return <p className="form-error">{error}</p>

  return (
    <div>
      <p className="mini" style={{ marginBottom: 12, color: '#54614f' }}>
        新しいアカウントの発行は、Supabaseの管理画面(Authentication → Users)から行ってください。
        ここでは発行済みのアカウントに、どのタブを編集できるかを設定します。「管理者」にチェックを入れると、そのアカウントは全タブ編集可能・このユーザー管理画面も使えるようになります。
      </p>
      <div className="tablewrap">
        <table className="master-table">
          <thead>
            <tr>
              <th>名前</th>
              <th>メールアドレス</th>
              <th className="center">管理者</th>
              {PERM_FIELDS.map((f) => <th key={f.key} className="center">{f.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    defaultValue={p.display_name || ''}
                    placeholder="(未設定)"
                    onBlur={(e) => updateName(p.id, e.target.value)}
                    style={{ width: 120, padding: '4px 6px', border: '1px solid #bfceb8', borderRadius: 4 }}
                  />
                </td>
                <td>{p.email}{p.id === myProfile?.id && <span className="mini"> (自分)</span>}</td>
                <td className="center">
                  <input
                    type="checkbox"
                    checked={!!p.is_admin}
                    disabled={savingId === p.id}
                    onChange={(e) => updateField(p.id, 'is_admin', e.target.checked)}
                  />
                </td>
                {PERM_FIELDS.map((f) => (
                  <td key={f.key} className="center">
                    <input
                      type="checkbox"
                      checked={p.is_admin ? true : !!p[f.key]}
                      disabled={savingId === p.id || p.is_admin}
                      onChange={(e) => updateField(p.id, f.key, e.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {profiles.length === 0 && (
              <tr><td colSpan={3 + PERM_FIELDS.length} className="empty-row">アカウントがありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
