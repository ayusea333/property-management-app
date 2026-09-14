// 予算(勘定科目ごとの年間予算額)
// Supabaseの行データ(snake_case) <-> アプリ内で使うオブジェクト(camelCase)の変換

export const budgetFromRow = (r) => ({
  id: r.id,
  fiscalYearStart: r.fiscal_year_start,
  kind: r.kind || '売上',
  category: r.category || '',
  amount: r.amount ?? 0,
  note: r.note || '',
})

export const budgetToRow = (b) => ({
  fiscal_year_start: b.fiscalYearStart,
  kind: b.kind || '売上',
  category: b.category || '',
  amount: b.amount || 0,
  note: b.note || null,
})
