import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

export default function Backups({ onRestored }) {
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('backups')
      .select('id, created_at')
      .order('created_at', { ascending: false })
    if (err) setError('読み込みに失敗しました: ' + err.message)
    else setBackups(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const formatDate = (s) => new Date(s).toLocaleString('ja-JP')

  const createNow = async () => {
    setWorking(true)
    const { error: err } = await supabase.rpc('create_backup')
    if (err) alert('バックアップの作成に失敗しました: ' + err.message)
    await load()
    setWorking(false)
  }

  const restore = async (b) => {
    const ok1 = confirm(
      `${formatDate(b.created_at)} 時点のバックアップに戻します。\n\n` +
      '現在のデータは全て、この時点の内容に置き換わります。この操作は取り消せません。本当によろしいですか?'
    )
    if (!ok1) return
    const typed = window.prompt('本当に復元する場合は「復元」と入力してください')
    if (typed !== '復元') { alert('入力が一致しなかったため、復元を中止しました。'); return }
    setWorking(true)
    const { error: err } = await supabase.rpc('restore_backup', { target_id: b.id })
    setWorking(false)
    if (err) {
      alert('復元に失敗しました: ' + err.message)
      return
    }
    alert('復元が完了しました。')
    if (onRestored) await onRestored()
  }

  if (loading) return <p>読み込み中...</p>

  return (
    <div>
      <p className="mini" style={{ marginBottom: 12, color: '#54614f' }}>
        3時間ごとに自動でバックアップが作成されます(直近60件、約7〜8日分を保存します)。
        「今すぐバックアップを作成」で、いつでも手動でも作成できます。
      </p>
      <div className="master-toolbar">
        <button className="btn-primary" onClick={createNow} disabled={working}>
          {working ? '処理中...' : '今すぐバックアップを作成'}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <table className="master-table">
        <thead>
          <tr><th>作成日時</th><th className="col-actions"></th></tr>
        </thead>
        <tbody>
          {backups.map((b) => (
            <tr key={b.id}>
              <td>{formatDate(b.created_at)}</td>
              <td className="col-actions">
                <button className="btn-secondary" onClick={() => restore(b)} disabled={working}>この状態に戻す</button>
              </td>
            </tr>
          ))}
          {backups.length === 0 && <tr><td colSpan={2} className="empty-row">まだバックアップがありません</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
