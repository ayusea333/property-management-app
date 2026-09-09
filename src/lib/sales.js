export const SALES_CATEGORIES = [
  '管理料',
  'ビルメンテナンス',
  '請負工事',
  '借上げ',
  '所有物件',
  'レントスペース',
  'AD・付帯・契約手数料',
  '安サポ',
  'その他手数料等',
]

export const saleFromRow = (r) => ({
  id: r.id,
  date: r.date,
  category: r.category,
  propertyId: r.property_id || '',
  roomId: r.room_id || '',
  ownerId: r.owner_id || '',
  content: r.content || '',
  amount: r.amount ?? 0,
  source: r.source || 'manual',
  sourceRef: r.source_ref || '',
  paymentMethod: r.payment_method || '',
  receivedDate: r.received_date || '',
  taxType: r.tax_type || '',
})

export const saleToRow = (s) => ({
  date: s.date,
  category: s.category,
  property_id: s.propertyId || null,
  room_id: s.roomId || null,
  owner_id: s.ownerId || null,
  content: s.content || null,
  amount: s.amount || 0,
  source: s.source || 'manual',
  source_ref: s.sourceRef || null,
  payment_method: s.paymentMethod || null,
  received_date: s.receivedDate || null,
  tax_type: s.taxType || null,
})

// 消費税区分の選択肢。10%課税を基準に、税抜金額・消費税額をその場で計算する。
export const TAX_TYPES = ['課税10%', '非課税', '対象外']

export function taxBreakdown(amount, taxType) {
  const total = Number(amount) || 0
  if (taxType !== '課税10%') return { exTax: total, tax: 0 }
  const exTax = Math.round(total / 1.1)
  return { exTax, tax: total - exTax }
}
