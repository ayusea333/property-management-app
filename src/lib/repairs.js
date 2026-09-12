// 修繕管理のワークフロー(見積→承認→発注・施工→完了→支払、という流れと、費用を誰が負担するかを記録する)
// Supabaseの行データ(snake_case) <-> アプリ内で使うオブジェクト(camelCase)の変換

export const REPAIR_STATUSES = ['見積中', '承認待ち', '発注・施工中', '施工完了・支払待ち', '完了(支払済み)', '中止']

// 負担区分(この修繕費用を最終的に誰が負担するか)
export const COST_BEARERS = ['会社負担', 'オーナー負担', '入居者負担', '折半', '未定']

export const repairFromRow = (r) => ({
  id: r.id,
  propertyId: r.property_id || '',
  roomId: r.room_id || '',
  content: r.content || '',
  vendorId: r.vendor_id || '',
  status: r.status || '見積中',
  costBearer: r.cost_bearer || '未定',
  expenseCategory: r.expense_category || '請負工事',
  estimateAmount: r.estimate_amount ?? '',
  approvedAmount: r.approved_amount ?? '',
  requestDate: r.request_date || '',
  completionDate: r.completion_date || '',
  paymentDate: r.payment_date || '',
  note: r.note || '',
})

export const repairToRow = (r) => ({
  property_id: r.propertyId || null,
  room_id: r.roomId || null,
  content: r.content || null,
  vendor_id: r.vendorId || null,
  status: r.status || '見積中',
  cost_bearer: r.costBearer || '未定',
  expense_category: r.expenseCategory || '請負工事',
  estimate_amount: r.estimateAmount === '' ? null : r.estimateAmount,
  approved_amount: r.approvedAmount === '' ? null : r.approvedAmount,
  request_date: r.requestDate || null,
  completion_date: r.completionDate || null,
  payment_date: r.paymentDate || null,
  note: r.note || null,
})
