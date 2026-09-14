// 店舗別実績(新規管理獲得)の集計ロジック。ここに書いた関数だけを呼び出せば数値が出るようにしてあるため、
// 将来「経営会議ダッシュボード」を作る際も、この関数群をそのまま再利用できます。
// データ不足で正しく出せない指標は無理に推測せず、呼び出し側で「データ不足」と分かる形(0件・空)のまま返します。

import { currentMonthStr } from './rentPayments'
import { findApplicableRate } from './acquisitions'

// 月('YYYY-MM')が [start, end] の範囲(両端含む)に入っているかどうか。文字列の辞書順比較で判定できる。
function inRange(month, start, end) {
  if (!month) return false
  return month >= start && month <= end
}

// 現在(今月時点)でその獲得が「管理中」かどうか(end_dateが無い、または今日以降)
function isCurrentlyActive(acq) {
  return !acq.endDate
}

// 1店舗分の実績を集計する
function computeOneStore(store, { managementAcquisitions, managementAcquisitionRates, sales, periodStart, periodEnd }) {
  const storeAcqs = (managementAcquisitions || []).filter((a) => a.referralStoreId === store.id)

  // 期間内に新規獲得した戸数(開始日が期間内)
  const newInPeriod = storeAcqs.filter((a) => inRange((a.startDate || '').slice(0, 7), periodStart, periodEnd)).length

  // 累計(全期間)で獲得した戸数(終了済みも含む、開始日が対象期間の終わりまでのもの)
  const cumulativeTotal = storeAcqs.filter((a) => (a.startDate || '').slice(0, 7) <= periodEnd).length

  // 期間内に管理終了した戸数(終了日が期間内)
  const endedInPeriod = storeAcqs.filter((a) => a.endDate && inRange(a.endDate.slice(0, 7), periodStart, periodEnd)).length

  const netGrowth = newInPeriod - endedInPeriod

  // 現在(今日時点)管理中の戸数
  const activeAcqs = storeAcqs.filter(isCurrentlyActive)
  const currentActiveCount = activeAcqs.length

  // 獲得報酬(実際に売上として計上済みのもの。決定額ではなく計上済みベース)のうち、
  // 計上日(sales.date)が対象期間内のものを合計する
  const storeAcqIds = new Set(storeAcqs.map((a) => a.id))
  const postedSales = (sales || []).filter(
    (s) => s.source === 'management_acquisition' && storeAcqIds.has(s.sourceRef) && inRange((s.date || '').slice(0, 7), periodStart, periodEnd)
  )
  const revenuePostedInPeriod = postedSales.reduce((z, s) => z + Number(s.amount || 0), 0)
  const avgRevenuePerUnit = postedSales.length ? revenuePostedInPeriod / postedSales.length : 0

  // 現在管理中の部屋について、直近(今月時点)適用されている月額支払額を合計する(現在の月間ベースの数字)
  const nowMonth = currentMonthStr()
  let currentMonthlyBaseTotal = 0
  let currentThreeLMonthlyTotal = 0
  let currentGroupMonthlyTotal = 0
  activeAcqs.forEach((a) => {
    const rate = findApplicableRate(managementAcquisitionRates, a.id, nowMonth)
    if (!rate) return
    currentMonthlyBaseTotal += Number(rate.monthlyBaseAmount || 0)
    currentThreeLMonthlyTotal += Number(rate.threeLMonthlyAmount || 0)
    currentGroupMonthlyTotal += Number(rate.groupMonthlyAmount || 0)
  })

  return {
    store,
    newInPeriod,
    cumulativeTotal,
    endedInPeriod,
    netGrowth,
    currentActiveCount,
    revenuePostedInPeriod,
    postedCount: postedSales.length,
    avgRevenuePerUnit,
    currentMonthlyBaseTotal,
    currentThreeLMonthlyTotal,
    currentGroupMonthlyTotal,
  }
}

// referralStores: 紹介元店舗マスタの配列
// managementAcquisitions / managementAcquisitionRates: 新規管理獲得・月額履歴の配列
// sales: 売上の配列(報酬の計上状況を見るため)
// rooms: 部屋マスタの配列(「紹介元 未登録・不明」の戸数を出すため)
// periodStart / periodEnd: 'YYYY-MM' 形式の対象期間(両端含む)
export function computeStoreAnalytics({ referralStores, managementAcquisitions, managementAcquisitionRates, sales, rooms, periodStart, periodEnd }) {
  const ctx = { managementAcquisitions, managementAcquisitionRates, sales, periodStart, periodEnd }
  const stores = (referralStores || []).map((store) => computeOneStore(store, ctx))

  const registeredRoomIds = new Set((managementAcquisitions || []).map((a) => a.roomId))
  const unregisteredCount = (rooms || []).filter((r) => !registeredRoomIds.has(r.id)).length

  const sum = (key) => stores.reduce((z, s) => z + s[key], 0)
  const totals = {
    newInPeriod: sum('newInPeriod'),
    cumulativeTotal: sum('cumulativeTotal'),
    endedInPeriod: sum('endedInPeriod'),
    netGrowth: sum('netGrowth'),
    currentActiveCount: sum('currentActiveCount'),
    revenuePostedInPeriod: sum('revenuePostedInPeriod'),
    postedCount: sum('postedCount'),
    currentMonthlyBaseTotal: sum('currentMonthlyBaseTotal'),
    currentThreeLMonthlyTotal: sum('currentThreeLMonthlyTotal'),
    currentGroupMonthlyTotal: sum('currentGroupMonthlyTotal'),
  }
  totals.avgRevenuePerUnit = totals.postedCount ? totals.revenuePostedInPeriod / totals.postedCount : 0

  return { stores, totals, unregisteredCount }
}
