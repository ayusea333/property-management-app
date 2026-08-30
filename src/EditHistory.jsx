import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

export default function EditHistory() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      setError('')
      const { data, error: err } = await supabase
        .from('edit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (err) setError('読み込みに失敗しました: ' + err.message)
      else setLogs(data || [])
      setLoading(false)
    })()
  }, [])

  const formatDate = (s) => {
    const d = new Date(s)
    return d.toLocaleString('ja-JP')
  }

  if (loading) return <p>読み込み中...</p>
  if (error) return <p className="form-error">{error}</p>

  return (
    <div>
      <p className="mini" style={{ marginBottom: 12, color: '#54614f' }}>
        直近500件の変更を新しい順に表示しています。
      </p>
      <div className="tablewrap">
        <table className="master-table">
          <thead>
            <tr><th>日時</th><th>操作者</th><th>対象</th><th>操作</th><th>内容</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="mini">{formatDate(l.created_at)}</td>
                <td>{l.user_email}</td>
                <td>{l.table_label}</td>
                <td>{l.action}</td>
                <td>{l.summary}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={5} className="empty-row">まだ記録がありません</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
