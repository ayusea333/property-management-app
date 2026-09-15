import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { adminCreateUser } from './lib/adminCreateUser'
import { adminResetPassword } from './lib/adminResetPassword'

const PERM_FIELDS = [
  { key: 'can_edit_master', label: 'マスタ管理' },
  { key: 'can_edit_rent_payments', label: '家賃入金' },
  { key: 'can_edit_sales', label: '売上' },
  { key: 'can_edit_expenses', label: '経費' },
  { key: 'can_edit_trust_funds', label: '預り金・立替金' },
  { key: 'can_edit_owner_settlements', label: 'オーナー精算・送金' },
  { key: 'can_edit_repairs', label: '修繕管理' },
]

export default function UserManagement({ myProfile }) {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState('')
  const [registeredResult, setRegisteredResult] = useState(null) // { email, tempPassword }
  const [copied, setCopied] = useState(false)

  const [resettingId, setResettingId] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetResults, setResetResults] = useState({}) // { [userId]: tempPassword }
  const [copiedResetId, setCopiedResetId] = useState('')

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

  const toggleDisabled = async (p, value) => {
    if (value && p.id === myProfile?.id) {
      alert('自分自身は無効化できません。')
      return
    }
    await updateField(p.id, 'is_disabled', value)
  }

  const toggleSimpleUI = async (p, value) => {
    await updateField(p.id, 'is_simple_ui', value)
  }

  const toggleAdmin = async (p, value) => {
    if (!value && p.id === myProfile?.id) {
      alert('自分自身の「管理者」は外せません(外すと誰もこの画面を開けなくなり、元に戻せなくなるためです)。')
      return
    }
    await updateField(p.id, 'is_admin', value)
  }

  const submitRegister = async (e) => {
    e.preventDefault()
    setRegisterError('')
    setRegisteredResult(null)
    setCopied(false)
    setRegistering(true)
    try {
      const tempPassword = await adminCreateUser(newEmail.trim(), newName.trim())
      setRegisteredResult({ email: newEmail.trim(), tempPassword })
      setNewEmail('')
      setNewName('')
      await load()
    } catch (e) {
      setRegisterError(e.message)
    } finally {
      setRegistering(false)
    }
  }

  const copyTempPassword = async () => {
    if (!registeredResult) return
    try {
      await navigator.clipboard.writeText(registeredResult.tempPassword)
      setCopied(true)
    } catch {
      // クリップボードが使えない環境では、手動でコピーしてもらう
    }
  }

  const handleResetPassword = async (p) => {
    if (!confirm(`${p.display_name || p.email} の仮パスワードを再発行しますか?(今までのパスワードは使えなくなります)`)) return
    setResetError('')
    setResettingId(p.id)
    try {
      const tempPassword = await adminResetPassword(p.id)
      setResetResults((prev) => ({ ...prev, [p.id]: tempPassword }))
      setCopiedResetId('')
    } catch (e) {
      setResetError(e.message)
    } finally {
      setResettingId('')
    }
  }

  const copyResetPassword = async (userId) => {
    const tempPassword = resetResults[userId]
    if (!tempPassword) return
    try {
      await navigator.clipboard.writeText(tempPassword)
      setCopiedResetId(userId)
    } catch {
      // クリップボードが使えない環境では、手動でコピーしてもらう
    }
  }

  if (loading) return <p>読み込み中...</p>
  if (error) return <p className="form-error">{error}</p>

  return (
    <div>
      <div className="master-form">
        <h3>新規ユーザー登録</h3>
        <form onSubmit={submitRegister}>
          <div className="form-row">
            <label>メールアドレス</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <label>名前(任意)</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          {registerError && <div className="form-error">{registerError}</div>}
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={registering}>
              {registering ? '登録中...' : '登録する'}
            </button>
          </div>
        </form>
        {registeredResult && (
          <div className="caution-notice" style={{ marginTop: 12 }}>
            <span>
              登録しました。仮パスワードをこの方に伝えてください(この画面を閉じると二度と表示されません):
              <br />
              メールアドレス: {registeredResult.email}
              <br />
              仮パスワード: <strong>{registeredResult.tempPassword}</strong>
            </span>
            <button type="button" className="btn-secondary" onClick={copyTempPassword}>
              {copied ? 'コピーしました' : '仮パスワードをコピー'}
            </button>
          </div>
        )}
        <p className="mini" style={{ marginTop: 12, color: '#6b6167' }}>
          登録すると、すぐにこのメールアドレスとその場で表示される仮パスワードでログインできるようになります。ログイン後、ご本人がサイドバー下部の「パスワードを変更」から好きなパスワードに変更できます。
        </p>
      </div>

      <p className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
        ここでは発行済みのアカウントに、どのタブを編集できるかを設定します。「管理者」にチェックを入れると、そのアカウントは全タブ編集可能・この管理者メニューも使えるようになります。
        「無効化」にチェックを入れると、そのアカウントはすぐにログインできなくなります(データやアカウント自体は消えません。チェックを外せば元に戻せます)。
        なお、自分自身の「管理者」チェックは外せません(外すと誰もこの画面を開けなくなるためです)。
      </p>
      <p className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
        「経理向けシンプル表示」にチェックを入れると、そのアカウントの画面が経理の日常業務向けに見やすく簡略化されます(使える機能・権限は変わりません。一覧の情報量や表示だけが変わります)。
      </p>
      <p className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
        アカウントを完全に削除したい場合(二度と使えないようにする場合)は、
        <a href="https://supabase.com/dashboard/project/lrxnwogkkfwjozsncfod/auth/users" target="_blank" rel="noreferrer"> Supabaseの管理画面(Authentication → Users)</a>
        から削除してください。
      </p>
      {resetError && <div className="form-error">{resetError}</div>}
      <div className="tablewrap">
        <table className="master-table">
          <thead>
            <tr>
              <th>名前</th>
              <th>メールアドレス</th>
              <th className="center">管理者</th>
              <th className="center">経理向けシンプル表示</th>
              {PERM_FIELDS.map((f) => <th key={f.key} className="center">{f.label}</th>)}
              <th className="center">無効化</th>
              <th>操作</th>
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
                    style={{ width: 120, padding: '4px 6px', border: '1px solid #cdbfc6', borderRadius: 4 }}
                  />
                </td>
                <td>{p.email}{p.id === myProfile?.id && <span className="mini"> (自分)</span>}</td>
                <td className="center">
                  <input
                    type="checkbox"
                    checked={!!p.is_admin}
                    disabled={savingId === p.id}
                    onChange={(e) => toggleAdmin(p, e.target.checked)}
                  />
                </td>
                <td className="center">
                  <input
                    type="checkbox"
                    checked={!!p.is_simple_ui}
                    disabled={savingId === p.id}
                    onChange={(e) => toggleSimpleUI(p, e.target.checked)}
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
                <td className="center">
                  <input
                    type="checkbox"
                    checked={!!p.is_disabled}
                    disabled={savingId === p.id}
                    onChange={(e) => toggleDisabled(p, e.target.checked)}
                  />
                </td>
                <td>
                  <button
                    className="btn-secondary"
                    onClick={() => handleResetPassword(p)}
                    disabled={resettingId === p.id}
                  >
                    {resettingId === p.id ? '再発行中...' : '仮パスワード再発行'}
                  </button>
                  {resetResults[p.id] && (
                    <div className="mini" style={{ marginTop: 6, color: '#6b6167' }}>
                      新しい仮パスワード: <strong>{resetResults[p.id]}</strong>
                      <br />
                      <button type="button" className="btn-secondary" style={{ marginTop: 4 }} onClick={() => copyResetPassword(p.id)}>
                        {copiedResetId === p.id ? 'コピーしました' : 'コピー'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {profiles.length === 0 && (
              <tr><td colSpan={6 + PERM_FIELDS.length} className="empty-row">アカウントがありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
