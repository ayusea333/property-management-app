// オーナー精算・送金(「いくら送るべきか計算する」精算と「実際に振り込んだ」送金を、別々の記録として管理する)
// Supabaseの行データ(snake_case) <-> アプリ内で使うオブジェクト(camelCase)の変換

export const OWNER_SETTLEMENT_STATUSES = ['未精算', '精算済(送金待ち)', '送金済', '送金エラー', '翌月繰越']

export const ownerSettlementFromRow = (r) => ({
  id: r.id,
  ownerId: r.owner_id || '',
  targetMonth: r.target_month,
  amount: r.amount ?? 0,
  status: r.status || '未精算',
  settlementDate: r.settlement_date || '',
  remittanceDate: r.remittance_date || '',
  remittanceMethod: r.remittance_method || '',
  note: r.note || '',
})

export const ownerSettlementToRow = (s) => ({
  owner_id: s.ownerId || null,
  target_month: s.targetMonth,
  amount: s.amount || 0,
  status: s.status || '未精算',
  settlement_date: s.settlementDate || null,
  remittance_date: s.remittanceDate || null,
  remittance_method: s.remittanceMethod || null,
  note: s.note || null,
})
