// 店舗精算(グループ会社の各店舗への支払いを「精算(金額確定)」と「送金(実際の振込)」に分けて記録する)
// Supabaseの行データ(snake_case) <-> アプリ内で使うオブジェクト(camelCase)の変換
// オーナー精算(ownerSettlements.js)と同じ考え方・同じ状態の語彙を使う

export const STORE_SETTLEMENT_STATUSES = ['未精算', '精算済(送金待ち)', '送金済', '送金エラー', '翌月繰越']

export const storeSettlementFromRow = (r) => ({
  id: r.id,
  referralStoreId: r.referral_store_id || '',
  targetMonth: r.target_month,
  amount: r.amount ?? 0,
  status: r.status || '未精算',
  settlementDate: r.settlement_date || '',
  remittanceDate: r.remittance_date || '',
  remittanceMethod: r.remittance_method || '',
  note: r.note || '',
})

export const storeSettlementToRow = (s) => ({
  referral_store_id: s.referralStoreId || null,
  target_month: s.targetMonth,
  amount: s.amount || 0,
  status: s.status || '未精算',
  settlement_date: s.settlementDate || null,
  remittance_date: s.remittanceDate || null,
  remittance_method: s.remittanceMethod || null,
  note: s.note || null,
})
