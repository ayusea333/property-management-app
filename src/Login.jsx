import { useState } from 'react'
import { supabase } from './lib/supabase'
import { translateAuthError } from './lib/editLog'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(translateAuthError(err.message))
    }
    setLoading(false)
  }

  return (
    <div className="login-shell">
      <form className="login-box" onSubmit={submit}>
        <h1>建物管理台帳</h1>
        <p className="app-sub">ログインしてください</p>
        <div className="form-row">
          <label>メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="form-row">
          <label>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
        <p className="mini" style={{ marginTop: 16, color: '#54614f' }}>
          アカウントをお持ちでない場合は、責任者にお問い合わせください。
        </p>
      </form>
    </div>
  )
}
