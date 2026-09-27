export const SALES_CATEGORIES = [
  '管理料',
  'ビルメンテナンス',
  '請負工事',
  '借上げ',
  '所有物件',
  'レントスペース',
  'AD・付帯・契約手数料',
  '安サポ',
  '新規管理獲得',
  'グループ会社支払',
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
  contractId: r.contract_id || '',
  counterparty: r.counterparty || '',
  counterpartyId: r.counterparty_id || '',
  counterpartyType: r.counterparty_type || '',
  payerName: r.payer_name || '',
  depositAccount: r.deposit_account || '',
  depositDate: r.deposit_date || '',
  trustAmount: r.trust_amount ?? '',
  trustRemitAmount: r.trust_remit_amount ?? '',
  note: r.note || '',
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
  contract_id: s.contractId || null,
  counterparty: s.counterparty || null,
  counterparty_id: s.counterpartyId || null,
  counterparty_type: s.counterpartyType || null,
  payer_name: s.payerName || null,
  deposit_account: s.depositAccount || null,
  deposit_date: s.depositDate || null,
  trust_amount: s.trustAmount === '' || s.trustAmount == null ? null : Number(s.trustAmount),
  trust_remit_amount: s.trustRemitAmount === '' || s.trustRemitAmount == null ? null : Number(s.trustRemitAmount),
  note: s.note || null,
})

// 消費税区分の選択肢。10%課税を基準に、税抜金額・消費税額をその場で計算する。
export const TAX_TYPES = ['課税10%', '非課税', '対象外']

export function taxBreakdown(amount, taxType) {
  const total = Number(amount) || 0
  if (taxType !== '課税10%') return { exTax: total, tax: 0 }
  const exTax = Math.round(total / 1.1)
  return { exTax, tax: total - exTax }
}
