export const rentPaymentFromRow = (r) => ({
  id: r.id,
  tenantId: r.tenant_id,
  targetMonth: r.target_month,
  paymentDate: r.payment_date,
  amount: r.amount,
  note: r.note || '',
  source: r.source || 'manual',
  confirmedBy: r.confirmed_by || '',
})

export const rentPaymentToRow = (p) => ({
  tenant_id: p.tenantId,
  target_month: p.targetMonth,
  payment_date: p.paymentDate,
  amount: p.amount ?? null,
  note: p.note || null,
  source: p.source || 'manual',
  confirmed_by: p.confirmedBy || null,
})

// 現在の月('2026-09'の形式)
export function currentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 指定した月の1つ前の月を返す
export function prevMonthStr(monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonthLabel(monthStr) {
  const [y, m] = monthStr.split('-')
  return `${y}年${Number(m)}月`
}
