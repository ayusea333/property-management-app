export const expenseFromRow = (r) => ({
  id: r.id,
  date: r.date,
  propertyId: r.property_id || '',
  roomId: r.room_id || '',
  category: r.category || '',
  content: r.content || '',
  payee: r.payee || '',
  amount: r.amount ?? 0,
})

export const expenseToRow = (e) => ({
  date: e.date,
  property_id: e.propertyId || null,
  room_id: e.roomId || null,
  category: e.category || null,
  content: e.content || null,
  payee: e.payee || null,
  amount: e.amount || 0,
})
