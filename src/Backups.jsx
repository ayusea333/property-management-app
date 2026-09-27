import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { resetAndSeedTestData } from './lib/devReset'

export default function Backups({ onRestored }) {
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetProgress, setResetProgress] = useState('')
  const [resetError, setResetError] = useState('')

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

  // 今のデータを全て削除し、少量のサンプル(仮)データを入れ直す(確認画面・動作確認用)。
  // 必ず直前に手動バックアップを作成し、「リセット」と入力した場合のみ実行する。
  const resetToSampleData = async () => {
    const ok1 = confirm(
      '今入っている物件・オーナー・取引などのデータを全て削除し、サンプル(仮)のデータに置き換えます。\n\n' +
      'この操作の前に、必ず手動でバックアップを1件作成してください(このすぐ下の「今すぐバックアップを作成」ボタン)。\n' +
      '元のデータに戻したくなったら、作成したバックアップから「この状態に戻す」で復元できます。\n\n' +
      '本当によろしいですか?'
    )
    if (!ok1) return
    const typed = window.prompt('本当にリセットする場合は「リセット」と入力してください')
    if (typed !== 'リセット') { alert('入力が一致しなかったため、リセットを中止しました。'); return }
    setResetting(true)
    setResetError('')
    setResetProgress('開始しています...')
    try {
      await resetAndSeedTestData((label) => setResetProgress(label))
      setResetProgress('完了しました')
      alert('サンプルデータへのリセットが完了しました。')
      if (onRestored) await onRestored()
    } catch (e) {
      setResetError(e.message || String(e))
      alert('リセット中にエラーが発生しました: ' + (e.message || String(e)) + '\n\n途中まで削除・登録された可能性があります。バックアップから復元することをおすすめします。')
    } finally {
      setResetting(false)
    }
  }

  if (loading) return <p>読み込み中...</p>

  return (
    <div>
      <p className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
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

      <div style={{ marginTop: 32, padding: 16, border: '1px solid #e2a6a1', borderRadius: 8, background: '#fdf3f2' }}>
        <h4 style={{ marginTop: 0, color: '#a11615' }}>テストデータへの一括リセット(危険な操作)</h4>
        <p className="mini" style={{ color: '#6b6167' }}>
          物件・オーナー・部屋・取引先などのマスタ情報を含め、今入っているデータを全て削除し、
          動作確認用のサンプル(仮)データ(名前に「サンプル」と入ったもの)に置き換えます。
          必ず上の「今すぐバックアップを作成」を先に実行してから使ってください。
        </p>
        <button className="btn-secondary" onClick={resetToSampleData} disabled={resetting || working} style={{ borderColor: '#a11615', color: '#a11615' }}>
          {resetting ? '処理中...' : '全データをサンプルデータにリセットする'}
        </button>
        {resetting && <p className="mini" style={{ marginTop: 8 }}>{resetProgress}</p>}
        {resetError && <p className="form-error">{resetError}</p>}
      </div>
    </div>
  )
}
