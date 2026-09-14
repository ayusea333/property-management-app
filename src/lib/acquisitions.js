// 新規管理獲得(グループ会社からの管理獲得・店舗別実績管理)関連のヘルパー

export const ACQUISITION_TYPES = ['グループ会社', '自社直接', 'その他']

export const managementAcquisitionFromRow = (r) => ({
  id: r.id,
  roomId: r.room_id || '',
  propertyId: r.property_id || '',
  acquisitionType: r.acquisition_type || 'グループ会社',
  referralStoreId: r.referral_store_id || '',
  referralPerson: r.referral_person || '',
  startDate: r.start_date || '',
  endDate: r.end_date || '',
  acquisitionFee: r.acquisition_fee ?? 0,
  note: r.note || '',
  createdBy: r.created_by || '',
  updatedBy: r.updated_by || '',
  createdAt: r.created_at || '',
  updatedAt: r.updated_at || '',
})

export const managementAcquisitionToRow = (a) => ({
  room_id: a.roomId || null,
  property_id: a.propertyId || null,
  acquisition_type: a.acquisitionType || 'グループ会社',
  referral_store_id: a.referralStoreId || null,
  referral_person: a.referralPerson || null,
  start_date: a.startDate || null,
  end_date: a.endDate || null,
  acquisition_fee: a.acquisitionFee || 0,
  note: a.note || null,
})

export const acquisitionRateFromRow = (r) => ({
  id: r.id,
  acquisitionId: r.acquisition_id || '',
  effectiveFrom: r.effective_from || '',
  monthlyBaseAmount: r.monthly_base_amount ?? 0,
  threeLMonthlyAmount: r.three_l_monthly_amount ?? 0,
  groupMonthlyAmount: r.group_monthly_amount ?? 0,
  threeLRatePercent: r.three_l_rate_percent ?? 2,
  note: r.note || '',
  createdBy: r.created_by || '',
  createdAt: r.created_at || '',
})

export const acquisitionRateToRow = (r) => ({
  acquisition_id: r.acquisitionId,
  effective_from: r.effectiveFrom,
  monthly_base_amount: r.monthlyBaseAmount || 0,
  three_l_monthly_amount: r.threeLMonthlyAmount || 0,
  group_monthly_amount: r.groupMonthlyAmount || 0,
  three_l_rate_percent: r.threeLRatePercent ?? 2,
  note: r.note || null,
})

// 指定した対象月(targetMonth, 'YYYY-MM')の時点で、その管理獲得が「管理中」だったかどうかを判定する。
// 「今日時点でアクティブか」ではなく、対象月がstart_date〜end_dateの範囲に入っているかで判定することで、
// 過去分の家賃入金を後から記録した場合や、月の途中で管理終了した場合でも正しい月だけに計上される。
export function acquisitionCoversMonth(acq, targetMonth) {
  if (!acq || !acq.startDate || !targetMonth) return false
  if (acq.startDate > `${targetMonth}-31`) return false
  if (acq.endDate && acq.endDate < `${targetMonth}-01`) return false
  return true
}

// 対象月に適用すべき月額支払額の履歴行を探す(「その月以前で、一番新しい適用開始月」の行を使う)。
// 過去の行は変更せず、新しい行を積み重ねる方式なので、この関数だけで正しい金額が決まる。
export function findApplicableRate(rates, acquisitionId, targetMonth) {
  const candidates = (rates || []).filter(
    (r) => r.acquisitionId === acquisitionId && r.effectiveFrom && r.effectiveFrom <= targetMonth
  )
  if (candidates.length === 0) return null
  return candidates.reduce((best, r) => (r.effectiveFrom > best.effectiveFrom ? r : best))
}

// 3L取り分・グループ会社支払額を、基準額と3L率から算出する(円未満切り捨て。グループ会社側は差額で算出し、
// 端数のずれで合計が基準額と合わなくなることがないようにする)。
export function computeSplitAmounts(baseAmount, threeLRatePercent) {
  const base = Math.round(Number(baseAmount) || 0)
  const rate = Number(threeLRatePercent) || 0
  const threeL = Math.floor((base * rate) / 100)
  const group = base - threeL
  return { threeLMonthlyAmount: threeL, groupMonthlyAmount: group }
}
