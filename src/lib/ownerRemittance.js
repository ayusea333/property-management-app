// オーナー送金明細(Excelダウンロード)の出力
// オーナー精算・送金画面の「参考の数値」をもとに、オーナーに渡せる明細書の形式にまとめる。

import ExcelJS from 'exceljs'

// ブランドカラー(lib/report.jsと合わせた配色)
const BRAND = {
  red: 'FFCC1D1C',
  purple: 'FF993887',
  gold: 'FFE8CA2D',
  black: 'FF1A1A1A',
  white: 'FFFFFFFF',
  paleGold: 'FFFCF6DC',
  palePurple: 'FFF3E9F1',
  border: 'FFE0D9D3',
  zebra: 'FFFAF8F5',
}

const YEN_FMT = '#,##0"円"'

function monthLabel(m) {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return `${y}年${Number(mo)}月分`
}

function titleBanner(ws, colCount, text) {
  ws.mergeCells(1, 1, 1, colCount)
  const cell = ws.getCell(1, 1)
  cell.value = text
  cell.font = { size: 15, bold: true, color: { argb: BRAND.white } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.red } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 28
}

function sectionRow(ws, colCount, text, color) {
  const row = ws.addRow([text])
  ws.mergeCells(row.number, 1, row.number, colCount)
  const cell = row.getCell(1)
  cell.font = { bold: true, color: { argb: BRAND.white } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  row.height = 18
  return row
}

function styleHeaderRow(row, color) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
    cell.font = { bold: true, color: { argb: BRAND.white } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  row.height = 18
}

function styleDataRow(row, { zebra, bold, fillColor } = {}) {
  row.eachCell((cell, colNumber) => {
    if (colNumber > 1) cell.alignment = { horizontal: 'right' }
    cell.border = { bottom: { style: 'thin', color: { argb: BRAND.border } } }
    if (fillColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
    else if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } }
    if (bold) cell.font = { bold: true }
  })
}

function applyPrintSetup(ws) {
  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  }
}

// row.settlement(精算記録)があればそのbreakdown(精算時点のスナップショット)を、
// なければ今の参考計算(row.breakdown)を使う。
function effectiveBreakdown(row) {
  return row.settlement?.breakdown || row.breakdown || {}
}

// 1オーナー・1ヶ月分の送金明細シートを、渡されたワークシートに組み立てる
function buildOwnerSheet(ws, row, targetMonth) {
  const bd = effectiveBreakdown(row)
  const rentDetails = bd.rentDetails || []
  const repairDetails = bd.repairDetails || []
  const openTrustDetails = bd.openTrustDetails || []
  const isSettled = !!row.settlement

  const colCount = 4
  titleBanner(ws, colCount, `送金明細書 - ${row.owner.name}様 ${monthLabel(targetMonth)}`)
  ws.getColumn(1).width = 26
  ws.getColumn(2).width = 14
  ws.getColumn(3).width = 16
  ws.getColumn(4).width = 16

  ws.addRow([])
  const statusRow = ws.addRow([isSettled ? '状態: 確定済み' : '状態: 未精算(参考の下書き金額です)'])
  statusRow.getCell(1).font = { italic: true, color: { argb: isSettled ? BRAND.black : 'FF888888' } }
  ws.addRow([])

  // ---- 入金明細 ----
  sectionRow(ws, colCount, '入金明細(家賃等)', BRAND.gold)
  const rentHeader = ws.addRow(['物件', '号室', '入居者', '金額'])
  styleHeaderRow(rentHeader, BRAND.gold)
  rentDetails.forEach((d, idx) => {
    const r = ws.addRow([d.propertyName || '', d.roomNumber || '', d.tenantName || '', d.amount || 0])
    styleDataRow(r, { zebra: idx % 2 === 1 })
    r.getCell(4).numFmt = YEN_FMT
  })
  if (rentDetails.length === 0) {
    const r = ws.addRow(['(入金データなし)', '', '', 0])
    r.getCell(1).font = { italic: true, color: { argb: 'FF888888' } }
    r.getCell(4).numFmt = YEN_FMT
  }
  const rentTotalRow = ws.addRow(['入金合計', '', '', bd.rentCollected || 0])
  styleDataRow(rentTotalRow, { bold: true, fillColor: BRAND.paleGold })
  rentTotalRow.getCell(4).numFmt = YEN_FMT
  ws.addRow([])

  // ---- 差引項目(管理料・修繕費オーナー負担) ----
  sectionRow(ws, colCount, '差引項目', BRAND.purple)
  const deductHeader = ws.addRow(['項目', '', '', '金額'])
  styleHeaderRow(deductHeader, BRAND.purple)
  const mgmtRow = ws.addRow(['管理料', '', '', -(bd.managementFee || 0)])
  styleDataRow(mgmtRow)
  mgmtRow.getCell(4).numFmt = YEN_FMT

  if (repairDetails.length > 0) {
    repairDetails.forEach((d) => {
      const r = ws.addRow([`修繕費(${d.costBearer || ''}): ${d.content || ''}`, '', '', -(d.amount || 0)])
      styleDataRow(r)
      r.getCell(4).numFmt = YEN_FMT
    })
  }
  const repairTotalRow = ws.addRow(['修繕費オーナー負担 合計', '', '', -(bd.repairOwnerBurden || 0)])
  styleDataRow(repairTotalRow, { bold: true, fillColor: BRAND.palePurple })
  repairTotalRow.getCell(4).numFmt = YEN_FMT
  ws.addRow([])

  // ---- 参考: 保証家賃・未解消の立替金等 ----
  if (bd.guaranteedRent || openTrustDetails.length > 0) {
    sectionRow(ws, colCount, '参考(送金額には自動反映されません)', BRAND.black)
    if (bd.guaranteedRent) {
      const r = ws.addRow(['保証家賃', '', '', bd.guaranteedRent])
      styleDataRow(r)
      r.getCell(4).numFmt = YEN_FMT
    }
    if (openTrustDetails.length > 0) {
      const trustHeader = ws.addRow(['未解消の立替金・預り金', '区分', '', '金額'])
      styleHeaderRow(trustHeader, BRAND.black)
      openTrustDetails.forEach((d, idx) => {
        const r = ws.addRow([d.content || '', d.direction || '', '', d.amount || 0])
        styleDataRow(r, { zebra: idx % 2 === 1 })
        r.getCell(4).numFmt = YEN_FMT
      })
      const trustTotalRow = ws.addRow(['未解消 合計', '', '', bd.openTrustTotal || 0])
      styleDataRow(trustTotalRow, { bold: true })
      trustTotalRow.getCell(4).numFmt = YEN_FMT
    }
    ws.addRow([])
  }

  // ---- 送金額 ----
  const finalAmount = isSettled ? Number(row.settlement.amount || 0) : Number(row.referenceNet || 0)
  const finalRow = ws.addRow([isSettled ? '精算・送金額' : '精算・送金額(下書き)', '', '', finalAmount])
  finalRow.height = 22
  finalRow.eachCell((cell) => {
    cell.font = { size: 13, bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.paleGold } }
    cell.border = { top: { style: 'medium', color: { argb: BRAND.gold } }, bottom: { style: 'medium', color: { argb: BRAND.gold } } }
  })
  finalRow.getCell(4).numFmt = YEN_FMT
  finalRow.getCell(4).alignment = { horizontal: 'right' }

  if (isSettled) {
    ws.addRow([])
    ws.addRow(['状態', row.settlement.status])
    if (row.settlement.settlementDate) ws.addRow(['精算日', row.settlement.settlementDate])
    if (row.settlement.remittanceDate) ws.addRow(['送金日', row.settlement.remittanceDate])
    if (row.settlement.remittanceMethod) ws.addRow(['送金方法', row.settlement.remittanceMethod])
    if (row.settlement.note) ws.addRow(['備考', row.settlement.note])
  }

  applyPrintSetup(ws)
}

// シート名に使えない文字(: \ / ? * [ ])を取り除き、31文字までに収める
function safeSheetName(name, usedNames) {
  let base = String(name || '').replace(/[:\\/?*[\]]/g, '').slice(0, 28) || 'オーナー'
  let candidate = base
  let i = 2
  while (usedNames.has(candidate)) {
    candidate = `${base}(${i})`
    i++
  }
  usedNames.add(candidate)
  return candidate
}

async function downloadWorkbook(wb, filename) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 1オーナー分の送金明細をExcelでダウンロード
export async function exportOwnerRemittanceXlsx(row, targetMonth) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'スリーエル・エージェンシー株式会社'
  wb.created = new Date()
  const ws = wb.addWorksheet(safeSheetName(row.owner.name, new Set()))
  buildOwnerSheet(ws, row, targetMonth)
  await downloadWorkbook(wb, `送金明細_${row.owner.name}_${targetMonth}.xlsx`)
}

// 対象月の複数オーナー分をまとめてExcelでダウンロード(一覧シート+オーナーごとの明細シート)
export async function exportOwnerRemittanceBulkXlsx(rows, targetMonth) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'スリーエル・エージェンシー株式会社'
  wb.created = new Date()

  const ws1 = wb.addWorksheet('一覧')
  titleBanner(ws1, 8, `オーナー送金明細一覧 ${monthLabel(targetMonth)}`)
  ws1.addRow([])
  const listHeader = ws1.addRow(['オーナー', '入金合計', '管理料', '修繕費オーナー負担', '精算・送金額', '状態', '精算日', '送金日'])
  styleHeaderRow(listHeader, BRAND.black)
  rows.forEach((row, idx) => {
    const bd = effectiveBreakdown(row)
    const isSettled = !!row.settlement
    const finalAmount = isSettled ? Number(row.settlement.amount || 0) : Number(row.referenceNet || 0)
    const r = ws1.addRow([
      row.owner.name,
      bd.rentCollected || 0,
      bd.managementFee || 0,
      bd.repairOwnerBurden || 0,
      finalAmount,
      isSettled ? row.settlement.status : '未精算(下書き)',
      row.settlement?.settlementDate || '',
      row.settlement?.remittanceDate || '',
    ])
    styleDataRow(r, { zebra: idx % 2 === 1 })
    r.getCell(2).numFmt = YEN_FMT
    r.getCell(3).numFmt = YEN_FMT
    r.getCell(4).numFmt = YEN_FMT
    r.getCell(5).numFmt = YEN_FMT
  })
  const totalsRow = ws1.addRow([
    '合計', '', '', '',
    rows.reduce((z, row) => z + (row.settlement ? Number(row.settlement.amount || 0) : Number(row.referenceNet || 0)), 0),
    '', '', '',
  ])
  styleDataRow(totalsRow, { bold: true, fillColor: BRAND.paleGold })
  totalsRow.getCell(5).numFmt = YEN_FMT
  ws1.getColumn(1).width = 20
  for (let i = 2; i <= 5; i++) ws1.getColumn(i).width = 16
  ws1.getColumn(6).width = 16
  ws1.getColumn(7).width = 12
  ws1.getColumn(8).width = 12
  ws1.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }]
  applyPrintSetup(ws1)
  ws1.pageSetup.orientation = 'landscape'

  const usedNames = new Set(['一覧'])
  rows.forEach((row) => {
    const ws = wb.addWorksheet(safeSheetName(row.owner.name, usedNames))
    buildOwnerSheet(ws, row, targetMonth)
  })

  await downloadWorkbook(wb, `送金明細一覧_${targetMonth}.xlsx`)
}
