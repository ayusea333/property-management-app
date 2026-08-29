export const SALES_CATEGORIES = [
  '管理料',
  'ビルメンテナンス',
  '請負工事',
  '借上げ',
  '所有物件',
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
})
