// Supabaseの行データ(snake_case) <-> アプリ内で使うオブジェクト(camelCase)の変換

export const ownerFromRow = (r) => ({
  id: r.id,
  name: r.name,
  kana: r.kana || '',
  phone: r.phone || '',
  email: r.email || '',
  address: r.address || '',
  contact: r.contact || '',
  bankInfo: r.bank_info || '',
  note: r.note || '',
})
export const ownerToRow = (o) => ({
  name: o.name,
  kana: o.kana || null,
  phone: o.phone || null,
  email: o.email || null,
  address: o.address || null,
  contact: o.contact || null,
  bank_info: o.bankInfo || null,
  note: o.note || null,
})

export const propertyFromRow = (r) => ({
  id: r.id,
  name: r.name,
  address: r.address || '',
  ownerId: r.owner_id || '',
  type: r.type || '',
  note: r.note || '',
})
export const propertyToRow = (p) => ({
  name: p.name,
  address: p.address || null,
  owner_id: p.ownerId || null,
  type: p.type || null,
  note: p.note || null,
})

export const roomFromRow = (r) => ({
  id: r.id,
  propertyId: r.property_id || '',
  roomNumber: r.room_number,
  rent: r.rent ?? 0,
  commonFee: r.common_fee ?? 0,
  managementFee: r.management_fee ?? 0,
  managementFeeType: r.management_fee_type || '固定額',
  managementFeeRate: r.management_fee_rate ?? '',
  managementFeeBase: r.management_fee_base || '',
  ownerGuaranteedRent: r.owner_guaranteed_rent ?? 0,
  extraFees: r.extra_fees || {},
  note: r.note || '',
})
export const roomToRow = (r) => ({
  property_id: r.propertyId || null,
  room_number: r.roomNumber,
  rent: r.rent || 0,
  common_fee: r.commonFee || 0,
  management_fee: r.managementFee || 0,
  management_fee_type: r.managementFeeType || '固定額',
  management_fee_rate: r.managementFeeRate === '' ? null : r.managementFeeRate,
  management_fee_base: r.managementFeeBase || null,
  owner_guaranteed_rent: r.ownerGuaranteedRent || 0,
  extra_fees: r.extraFees || {},
  note: r.note || null,
})

// 費用項目マスタ(部屋ごとの駐車場代・駐輪場代・安サポなどを自由に追加/削除できるようにするための項目名一覧)
export const feeItemFromRow = (r) => ({
  id: r.id,
  name: r.name,
})
export const feeItemToRow = (f) => ({
  name: f.name,
})

export const tenantFromRow = (r) => ({
  id: r.id,
  roomId: r.room_id || '',
  name: r.name,
  contact: r.contact || '',
  moveInDate: r.move_in_date || '',
  moveOutDate: r.move_out_date || '',
  note: r.note || '',
  guarantor: r.guarantor || '',
  debit: !!r.debit,
  sendMethod: r.send_method || '',
  sendDay: r.send_day || '',
  arrearsNote: r.arrears_note || '',
})
export const tenantToRow = (t) => ({
  room_id: t.roomId || null,
  name: t.name,
  contact: t.contact || null,
  move_in_date: t.moveInDate || null,
  move_out_date: t.moveOutDate || null,
  note: t.note || null,
  guarantor: t.guarantor || null,
  debit: !!t.debit,
  send_method: t.sendMethod || null,
  send_day: t.sendDay || null,
  arrears_note: t.arrearsNote || null,
})

export const clientFromRow = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category || '',
  contact: r.contact || '',
  address: r.address || '',
  contactPerson: r.contact_person || '',
  invoiceNumber: r.invoice_number || '',
  note: r.note || '',
})
export const clientToRow = (c) => ({
  name: c.name,
  category: c.category || null,
  contact: c.contact || null,
  address: c.address || null,
  contact_person: c.contactPerson || null,
  invoice_number: c.invoiceNumber || null,
  note: c.note || null,
})

export const vendorFromRow = clientFromRow
export const vendorToRow = clientToRow
