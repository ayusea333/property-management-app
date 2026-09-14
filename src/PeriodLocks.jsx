import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { periodLockFromRow, periodLockToRow } from './lib/periodLocks'
import { formatMonthLabel, currentMonthStr } from './lib/rentPayments'
import { logEdit } from './lib/editLog'

export default function PeriodLocks({ user, onChanged }) {
  const [locks, setLocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [targetMonth, setTargetMonth] = useState(currentMonthStr())
  const [note, setNote] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase.from('period_locks').select('*').order('target_month', { ascending: false })
    if (err) setError('読み込みに失敗しました: ' + err.message)
    else setLocks((data || []).map(periodLockFromRow))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const lockMonth = async () => {
    if (!targetMonth) return
    setWorking(true)
    setError('')
    try {
      const { error: err } = await supabase.from('period_locks').insert(
        periodLockToRow({ targetMonth, lockedBy: user?.email || '', note })
      )
      if (err) throw err
      await load()
      await logEdit({ user, tableLabel: '月次締め', action: '締め', summary: `${formatMonthLabel(targetMonth)}分を締めました` })
      setNote('')
      await onChanged?.()
    } catch (e) {
      setError('締めに失敗しました: ' + e.message)
    } finally {
      setWorking(false)
    }
  }

  const unlockMonth = async (lock) => {
    if (!confirm(`${formatMonthLabel(lock.targetMonth)}分の締めを解除しますか?解除すると、この月の家賃入金・売上・経費を再び編集できるようになります。`)) return
    setWorking(true)
    setError('')
    try {
      const { error: err } = await supabase.from('period_locks').delete().eq('id', lock.id)
      if (err) throw err
      await load()
      await logEdit({ user, tableLabel: '月次締め', action: '解除', summary: `${formatMonthLabel(lock.targetMonth)}分の締めを解除` })
      await onChanged?.()
    } catch (e) {
      setError('解除に失敗しました: ' + e.message)
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <p>読み込み中...</p>

  return (
    <div>
      <p className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
        月を締めると、その月の日付が入っている家賃入金・売上・経費を、追加・編集・削除できなくなります
        (CSVインポート・PDF取込・自動連携による登録も含みます)。決算内容が固まった月を締めることで、
        あとから誤って数字が変わってしまうことを防げます。締めても、あとからいつでも解除できます。
      </p>
      <div className="master-form">
        <h3>月を締める</h3>
        <div className="form-row">
          <label>対象月</label>
          <input type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
        </div>
        <div className="form-row">
          <label>メモ(任意)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 9月分決算確定" />
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="btn-primary" onClick={lockMonth} disabled={working || !targetMonth}>
            {working ? '処理中...' : 'この月を締める'}
          </button>
        </div>
      </div>

      <table className="master-table" style={{ marginTop: 16 }}>
        <thead>
          <tr><th>対象月</th><th>メモ</th><th>締めた人</th><th>締めた日時</th><th className="col-actions"></th></tr>
        </thead>
        <tbody>
          {locks.map((l) => (
            <tr key={l.id}>
              <td>{formatMonthLabel(l.targetMonth)}</td>
              <td>{l.note}</td>
              <td>{l.lockedBy}</td>
              <td>{l.createdAt ? new Date(l.createdAt).toLocaleString('ja-JP') : ''}</td>
              <td className="col-actions">
                <button className="btn-secondary" onClick={() => unlockMonth(l)} disabled={working}>解除</button>
              </td>
            </tr>
          ))}
          {locks.length === 0 && <tr><td colSpan={5} className="empty-row">締められている月はありません</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
