// 月次締め(指定した月の家賃入金・売上・経費を編集できないようにロックする)
// Supabaseの行データ(snake_case) <-> アプリ内で使うオブジェクト(camelCase)の変換

export const periodLockFromRow = (r) => ({
  id: r.id,
  targetMonth: r.target_month,
  lockedBy: r.locked_by || '',
  note: r.note || '',
  createdAt: r.created_at,
})

export const periodLockToRow = (p) => ({
  target_month: p.targetMonth,
  locked_by: p.lockedBy || null,
  note: p.note || null,
})
