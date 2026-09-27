// 開発・確認用: 今入っているデータを全て削除し、少量のサンプル(仮)データを入れ直す。
// 「管理者」画面の「テストデータへの一括リセット」から、確認入力つきで実行する想定。
// 実行前に必ずバックアップを作成すること(呼び出し側でrpc('create_backup')を先に呼ぶ)。
import { supabase } from './supabase'
import { ownerToRow, propertyToRow, roomToRow, vendorToRow, clientToRow, referralStoreToRow, residentToRow, contractToRow } from './masters'
import { saleToRow } from './sales'
import { expenseToRow } from './expenses'
import { rentPaymentToRow, currentMonthStr } from './rentPayments'
import { trustFundToRow } from './trustFunds'
import { ownerSettlementToRow } from './ownerSettlements'
import { repairToRow } from './repairs'
import { managementAcquisitionToRow, acquisitionRateToRow, computeSplitAmounts } from './acquisitions'
import { budgetToRow } from './budgets'
import { storeSettlementToRow } from './storeSettlements'
import { currentFiscalStartYear } from './period'

// 削除順(子→親。外部キー制約に引っかからない順序)。
// profiles(ログインアカウント)・backups(バックアップ本体)・edit_logs(変更履歴)は対象外。
const DELETE_ORDER = [
  'management_acquisition_rates',
  'rent_payments',
  'sales',
  'expenses',
  'trust_funds',
  'owner_settlements',
  'repairs',
  'management_acquisitions',
  'store_settlements',
  'budgets',
  'period_locks',
  'contracts',
  'residents',
  'rooms',
  'vendors',
  'clients',
  'fee_items',
  'referral_stores',
  'properties',
  'owners',
]

async function deleteAllRows(table) {
  // idはNOT NULLの主キーなので、not('id','is',null)で「全行」にマッチさせて削除する
  const { error } = await supabase.from(table).delete().not('id', 'is', null)
  if (error) throw new Error(`${table}: ${error.message}`)
}

async function insertOne(table, row, toRow) {
  const { data, error } = await supabase.from(table).insert(toRow ? toRow(row) : row).select().single()
  if (error) throw new Error(`${table}: ${error.message}`)
  return data
}

// 全テーブルのデータを削除する。onProgressに(table, index, total)を通知する。
export async function deleteAllData(onProgress) {
  for (let i = 0; i < DELETE_ORDER.length; i++) {
    const table = DELETE_ORDER[i]
    if (onProgress) onProgress(table, i + 1, DELETE_ORDER.length)
    await deleteAllRows(table)
  }
}

// 少量のサンプル(仮)データを投入する。「サンプル」と名前に入れて、本物のデータと見分けやすくする。
export async function seedSampleData(onProgress) {
  const today = new Date().toISOString().slice(0, 10)
  const month = currentMonthStr()
  const step = (label) => { if (onProgress) onProgress(label) }

  step('オーナー')
  const owner1 = await insertOne('owners', { name: 'サンプルオーナー太郎', remittanceDay: 25 }, ownerToRow)
  const owner2 = await insertOne('owners', { name: 'サンプル管理会社株式会社', remittanceDay: 10 }, ownerToRow)

  step('物件')
  const prop1 = await insertOne('properties', { name: 'サンプルマンションA', ownerId: owner1.id, address: '大阪府大阪市サンプル区1-1-1', type: '所有物件' }, propertyToRow)
  const prop2 = await insertOne('properties', { name: 'サンプルアパートB', ownerId: owner2.id, address: '京都府京都市サンプル区2-2-2', type: '借上げ' }, propertyToRow)

  step('部屋')
  const room1 = await insertOne('rooms', { propertyId: prop1.id, roomNumber: '101', rent: 60000, commonFee: 3000, managementFee: 5000, managementFeeType: '固定額' }, roomToRow)
  const room2 = await insertOne('rooms', { propertyId: prop1.id, roomNumber: '102', rent: 55000, commonFee: 3000, managementFee: 5000, managementFeeType: '固定額' }, roomToRow)
  const room3 = await insertOne('rooms', { propertyId: prop2.id, roomNumber: '201', rent: 70000, commonFee: 0, managementFee: 6000, managementFeeType: '固定額' }, roomToRow)

  step('業者・取引先・紹介元店舗')
  const vendor1 = await insertOne('vendors', { name: 'サンプル工務店', category: '工事' }, vendorToRow)
  await insertOne('clients', { name: 'サンプル仲介会社', category: '仲介' }, clientToRow)
  const store1 = await insertOne('referral_stores', { storeName: 'サンプル支店', groupName: 'サンプルグループ' }, referralStoreToRow)

  step('入居者・契約')
  const resident1 = await insertOne('residents', { name: 'サンプル 花子' }, residentToRow)
  const resident2 = await insertOne('residents', { name: 'サンプル 次郎' }, residentToRow)
  const contract1 = await insertOne('contracts', { residentId: resident1.id, roomId: room1.id, contractorType: '個人', moveInDate: '2025-04-01' }, contractToRow)
  // room2の入居者は、あえて家賃入金を登録せず「未入金」の状態を確認できるようにしておく
  await insertOne('contracts', { residentId: resident2.id, roomId: room2.id, contractorType: '個人', moveInDate: '2025-06-01' }, contractToRow)

  step('売上・経費')
  await insertOne('sales', { date: today, category: '管理料', propertyId: prop1.id, roomId: room1.id, ownerId: owner1.id, content: 'サンプル 花子様 管理料(サンプル)', amount: 5000, contractId: contract1.id }, saleToRow)
  await insertOne('sales', { date: today, category: '請負工事', propertyId: prop1.id, ownerId: owner1.id, content: '共用部修繕工事(サンプル)', amount: 30000 }, saleToRow)
  await insertOne('sales', { date: today, category: 'AD・付帯・契約手数料', propertyId: prop2.id, roomId: room3.id, ownerId: owner2.id, content: 'AD(サンプル)', amount: 50000 }, saleToRow)
  await insertOne('expenses', { date: today, category: 'ビルメンテナンス', propertyId: prop1.id, content: '清掃費(サンプル)', payee: 'サンプル清掃サービス', amount: 8000 }, expenseToRow)
  await insertOne('expenses', { date: today, category: '請負工事', propertyId: prop1.id, roomId: room1.id, content: '室内クリーニング(サンプル)', payee: vendor1.name, payeeId: vendor1.id, payeeType: 'vendor', amount: 15000 }, expenseToRow)

  step('家賃入金')
  await insertOne('rent_payments', { tenantId: contract1.id, targetMonth: month, paymentDate: today, amount: 68000, note: 'サンプル入金' }, rentPaymentToRow)

  step('預り金・立替金')
  await insertOne('trust_funds', { type: '敷金', direction: '預り金', ownerId: owner1.id, roomId: room1.id, amount: 60000, occurredDate: today, status: '保管中' }, trustFundToRow)

  step('オーナー精算・送金')
  await insertOne('owner_settlements', { ownerId: owner1.id, targetMonth: month, amount: 50000, status: '未精算' }, ownerSettlementToRow)

  step('修繕管理')
  await insertOne('repairs', { propertyId: prop1.id, roomId: room1.id, content: '給湯器交換(サンプル)', vendorId: vendor1.id, status: '見積中', costBearer: 'オーナー負担', expenseCategory: '請負工事', estimateAmount: 80000, requestDate: today }, repairToRow)

  step('新規管理獲得')
  const acq1 = await insertOne('management_acquisitions', { roomId: room3.id, propertyId: prop2.id, acquisitionType: 'グループ会社', referralStoreId: store1.id, referralPerson: 'サンプル担当', startDate: '2025-01-01', acquisitionFee: 0 }, managementAcquisitionToRow)
  const split = computeSplitAmounts(10000, 20)
  await insertOne('management_acquisition_rates', { acquisitionId: acq1.id, effectiveFrom: '2025-01-01', monthlyBaseAmount: 10000, threeLMonthlyAmount: split.threeLMonthlyAmount, groupMonthlyAmount: split.groupMonthlyAmount, threeLRatePercent: 20 }, acquisitionRateToRow)

  step('予算')
  const fy = currentFiscalStartYear()
  await insertOne('budgets', { fiscalYearStart: fy, kind: '売上', category: '管理料', amount: 1000000 }, budgetToRow)
  await insertOne('budgets', { fiscalYearStart: fy, kind: '経費', category: '請負工事', amount: 500000 }, budgetToRow)

  step('店舗精算')
  await insertOne('store_settlements', { referralStoreId: store1.id, targetMonth: month, amount: 8000, status: '未精算' }, storeSettlementToRow)
}

// バックアップ作成後に呼び出す想定のオーケストレーター。
export async function resetAndSeedTestData(onProgress) {
  await deleteAllData((table, i, total) => onProgress && onProgress(`削除中: ${table} (${i}/${total})`))
  await seedSampleData((label) => onProgress && onProgress(`登録中: ${label}`))
}
