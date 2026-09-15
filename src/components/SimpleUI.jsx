// 経理向けシンプル表示のための共通部品。
// ここに書いた部品は「表示の仕方」だけを変えるためのもので、データや権限のロジックは一切持ちません。
// 月次締めの判定(isMonthLocked)は、今までApp.jsx内にあったものをそのままこちらに移しただけで、判定ルールは変更していません。

import { useState } from 'react'
import { formatMonthLabel } from '../lib/rentPayments'

// 月次締め: 指定した日付(またはtarget_month, 'YYYY-MM')が、締められている月かどうかを調べる
export function isMonthLocked(periodLocks, dateOrMonth) {
  if (!dateOrMonth) return false
  const m = dateOrMonth.length === 7 ? dateOrMonth : dateOrMonth.slice(0, 7)
  return (periodLocks || []).some((l) => l.targetMonth === m)
}

// 今見ている月が「入力できる月」か「締め済みで変更できない月」かを、保存する前に分かりやすく表示するバッジ。
// dateOrMonthには 'YYYY-MM-DD' または 'YYYY-MM' のどちらを渡してもよい。
export function MonthLockBadge({ periodLocks, dateOrMonth }) {
  if (!dateOrMonth) return null
  const month = dateOrMonth.length === 7 ? dateOrMonth : dateOrMonth.slice(0, 7)
  const locked = isMonthLocked(periodLocks, month)
  return (
    <div className={locked ? 'month-lock-badge locked' : 'month-lock-badge open'}>
      <span className="month-lock-badge-month">📅 {formatMonthLabel(month)}</span>
      {locked ? (
        <span>🔒 締め済み(この月は変更できません)</span>
      ) : (
        <span>🟢 入力中</span>
      )}
    </div>
  )
}

// 詳細情報を普段は隠し、必要なときだけ開ける小さい開閉部品。
// データ自体を削除・非表示にするのではなく、最初に見える情報を整理するためのもの。
export function DetailsToggle({ label = '詳細を見る', closeLabel = '詳細を閉じる', children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="details-toggle">
      <button type="button" className="details-toggle-btn" onClick={() => setOpen((o) => !o)}>
        {open ? closeLabel : `▸ ${label}`}
      </button>
      {open && <div className="details-toggle-body">{children}</div>}
    </div>
  )
}

// 「未登録・不明」など、正式な実績と同列にせず控えめに見せるための注意表示。
export function CautionNotice({ children, actionLabel, onAction }) {
  return (
    <div className="caution-notice">
      <span>⚠ {children}</span>
