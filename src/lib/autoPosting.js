// 家賃入金の確定(手入力・CSV一括取込どちらの経路でも)に伴って自動計上される
// 「管理料(自動)」「グループ会社支払(自動)」をまとめた共通ロジック。
// 以前はApp.jsxのRentPaymentsSection内だけにあり、CSV一括取込(MasterImport.jsx)からは
// 呼ばれていなかったため、CSV経由の入金では自動計上が発生しない不具合があった。
// 1件ずつの入金確定・CSV一括取込のどちらからも、必ずこの関数を通すこと。

import { supabase } from './supabase'
import { saleToRow } from './sales'
import { expenseToRow } from './expenses'
import { acquisitionCoversMonth, findApplicableRate } from './acquisitions'

// 案件別収支画面(CaseProfitSection)にも表示されるよう、対象の契約(tenant.id)をcontractIdとして
// 記録する。修繕費の自動計上(syncExpenseForRepair)は部屋・物件単位で特定の契約に紐づかないため対象外。
export async function postManagementFeeIfNeeded({ tenant, room, property, owner, targetMonth, paymentDate }) {
  const managementFee = room?.managementFee || 0
  if (!managementFee) return
  const saleRow = saleToRow({
    date: paymentDate || new Date().toISOString().slice(0, 10),
    category: '管理料',
    propertyId: property?.id || '',
    roomId: room?.id || '',
    ownerId: owner?.id || '',
    content: `${tenant.name}様 ${targetMonth}分 管理料(自動)`,
    amount: managementFee,
    contractId: tenant.id,
    source: 'auto_management_fee',
    sourceRef: `${tenant.id}:${targetMonth}`,
  })
  const { error } = await supabase.from('sales').upsert(saleRow, { onConflict: 'source,source_ref' })
  if (error) throw error
}

// 新規管理獲得(グループ会社紹介)の部屋であれば、対象月分のグループ会社支払額(月額)を経費に自動計上する。
// 「今アクティブか」ではなく対象月が管理期間に入っているかで判定するため、後から過去分を記録しても正しい月にだけ計上される。
export async function postGroupCommissionIfNeeded({
  tenant, room, property, targetMonth, paymentDate,
  managementAcquisitions, managementAcquisitionRates, referralStores,
}) {
  const roomId = room?.id
  if (!roomId) return
  const acq = (managementAcquisitions || []).find((a) => a.roomId === roomId && acquisitionCoversMonth(a, targetMonth))
  if (!acq) return
  const rate = findApplicableRate(managementAcquisitionRates, acq.id, targetMonth)
  if (!rate || !rate.groupMonthlyAmount) return
  const store = (referralStores || []).find((s) => s.id === acq.referralStoreId)
  const payeeLabel = store ? (store.groupName ? `${store.groupName} ${store.storeName}` : store.storeName) : ''
  const expenseRow = expenseToRow({
    date: paymentDate || new Date().toISOString().slice(0, 10),
    propertyId: property?.id || '',
    roomId,
    category: 'グループ会社支払',
    content: `${tenant.name}様 ${targetMonth}分 グループ会社支払額(自動・新規管理獲得)`,
    payee: payeeLabel,
    payeeId: acq.referralStoreId || '',
    payeeType: acq.referralStoreId ? 'referral_store' : '',
    amount: rate.groupMonthlyAmount,
    contractId: tenant.id,
    source: 'group_commission',
    sourceRef: `${acq.id}:${targetMonth}`,
  })
  const { error } = await supabase.from('expenses').upsert(expenseRow, { onConflict: 'source,source_ref' })
  if (error) throw error
}
