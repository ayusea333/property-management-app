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
  note: r.note || '',
})
export const roomToRow = (r) => ({
  property_id: r.propertyId || null,
  room_number: r.roomNumber,
  rent: r.rent || 0,
  common_fee: r.commonFee || 0,
  note: r.note || null,
})

export const tenantFromRow = (r) => ({
  id: r.id,
  roomId: r.room_id || '',
  name: r.name,
  contact: r.contact || '',
  moveInDate: r.move_in_date || '',
  moveOutDate: r.move_out_date || '',
  note: r.note || '',
})
export const tenantToRow = (t) => ({
  room_id: t.roomId || null,
  name: t.name,
  contact: t.contact || null,
  move_in_date: t.moveInDate || null,
  move_out_date: t.moveOutDate || null,
  note: t.note || null,
})

export const clientFromRow = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category || '',
  contact: r.contact || '',
  note: r.note || '',
})
export const clientToRow = (c) => ({
  name: c.name,
  category: c.category || null,
  contact: c.contact || null,
  note: c.note || null,
})

export const vendorFromRow = clientFromRow
export const vendorToRow = clientToRow
