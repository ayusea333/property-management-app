// 預り金・立替金(会社の売上・経費とは別に管理する「預かっているお金」「立て替えているお金」)
// Supabaseの行データ(snake_case) <-> アプリ内で使うオブジェクト(camelCase)の変換

export const TRUST_FUND_TYPES = ['敷金', '保証金', 'オーナー預り金', '入居者預り金', '修繕立替金', 'その他']
export const TRUST_FUND_DIRECTIONS = ['預り金', '立替金']
export const TRUST_FUND_STATUSES = ['保管中', '返金済', '相殺済', '充当済', 'その他で解消']

export const trustFundFromRow = (r) => ({
  id: r.id,
  type: r.type || 'その他',
  direction: r.direction || '預り金',
  ownerId: r.owner_id || '',
  roomId: r.room_id || '',
  amount: r.amount ?? 0,
  occurredDate: r.occurred_date || '',
  status: r.status || '保管中',
  settledDate: r.settled_date || '',
  note: r.note || '',
})

export const trustFundToRow = (t) => ({
  type: t.type || 'その他',
  direction: t.direction || '預り金',
  owner_id: t.ownerId || null,
  room_id: t.roomId || null,
  amount: t.amount || 0,
  occurred_date: t.occurredDate || null,
  status: t.status || '保管中',
  settled_date: t.settledDate || null,
  note: t.note || null,
})
