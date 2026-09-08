// 期末業績レポート(Excelダウンロード)の集計・出力

import ExcelJS from 'exceljs'
import { SALES_CATEGORIES } from './sales'
import { fiscalMonths, fiscalPeriodFullLabel, fiscalPeriodNumber } from './period'
import { drawTrendChartPng } from './chart'
import logoUrl from '../assets/logo.png'

// ブランドカラー(3Lエージェンシーのロゴ配色)
const BRAND = {
  red: 'FFCC1D1C',
  purple: 'FF993887',
  gold: 'FFE8CA2D',
  goldDark: 'FFB8960A',
  black: 'FF1A1A1A',
  white: 'FFFFFFFF',
  paleRed: 'FFFBEAEA',
  palePurple: 'FFF3E9F1',
  paleGold: 'FFFCF6DC',
  border: 'FFE0D9D3',
  zebra: 'FFFAF8F5',
}

function monthLabel(m) {
  const [y, mo] = m.split('-')
  return `${y}年${Number(mo)}月`
}

// 指定したカテゴリ一覧×月一覧で、record(date, category, amount)を集計する
function categoryMonthMatrix(records, categories, months) {
  const matrix = {}
  categories.forEach((c) => {
    matrix[c] = {}
    months.forEach((m) => { matrix[c][m] = 0 })
  })
  const uncategorized = {}
  months.forEach((m) => { uncategorized[m] = 0 })

  records.forEach((r) => {
    if (!r.date) return
    const m = r.date.slice(0, 7)
    if (!months.includes(m)) return
    const amount = r.amount || 0
    if (categories.includes(r.category)) {
      matrix[r.category][m] += amount
    } else {
      uncategorized[m] += amount
    }
  })
  return { matrix, uncategorized }
}

// 指定した期(startYear=9月開始の西暦)の業績を集計する
export function computeFiscalReport(startYear, sales, expenses) {
  const months = fiscalMonths(startYear)
  const salesMat = categoryMonthMatrix(sales, SALES_CATEGORIES, months)
  const expenseMat = categoryMonthMatrix(expenses, SALES_CATEGORIES, months)

  const totalSalesByMonth = {}
  const totalExpensesByMonth = {}
  const totalProfitByMonth = {}
  months.forEach((m) => {
    const s = SALES_CATEGORIES.reduce((z, c) => z + salesMat.matrix[c][m], 0) + salesMat.uncategorized[m]
    const e = SALES_CATEGORIES.reduce((z, c) => z + expenseMat.matrix[c][m], 0) + expenseMat.uncategorized[m]
    totalSalesByMonth[m] = s
    totalExpensesByMonth[m] = e
    totalProfitByMonth[m] = s - e
  })

  const totalSales = months.reduce((z, m) => z + totalSalesByMonth[m], 0)
  const totalExpenses = months.reduce((z, m) => z + totalExpensesByMonth[m], 0)
  const grossProfit = totalSales - totalExpenses
  const grossProfitRate = totalSales ? grossProfit / totalSales : 0

  const byCategory = SALES_CATEGORIES.map((c) => {
    const salesTotal = months.reduce((z, m) => z + salesMat.matrix[c][m], 0)
    const expenseTotal = months.reduce((z, m) => z + expenseMat.matrix[c][m], 0)
    return {
      category: c,
      salesTotal,
      expenseTotal,
      profit: salesTotal - expenseTotal,
      ratio: totalSales ? salesTotal / totalSales : 0,
    }
  })

  const uncategorizedSalesTotal = months.reduce((z, m) => z + salesMat.uncategorized[m], 0)
  const uncategorizedExpenseTotal = months.reduce((z, m) => z + expenseMat.uncategorized[m], 0)

  return {
    startYear,
    months,
    salesMat,
    expenseMat,
    totalSalesByMonth,
    totalExpensesByMonth,
    totalProfitByMonth,
    totalSales,
    totalExpenses,
    grossProfit,
    grossProfitRate,
    byCategory,
    uncategorizedSalesTotal,
    uncategorizedExpenseTotal,
    hasData: totalSales !== 0 || totalExpenses !== 0,
  }
}

// 前期との比較(前期のデータがアプリ内に無ければnull)
export function computeYoy(current, previous) {
  if (!previous || !previous.hasData) return null
  const diff = current.totalSales - previous.totalSales
  const rate = previous.totalSales ? diff / previous.totalSales : null
  return { diff, rate, prevTotalSales: previous.totalSales, prevGrossProfit: previous.grossProfit }
}

// ---- ここからExcel出力(見やすいレイアウト・配色つき) ----

const YEN_FMT = '#,##0"円"'
const PCT_FMT = '0.0%'

function titleBanner(ws, colCount, text) {
  ws.mergeCells(1, 1, 1, colCount)
  const cell = ws.getCell(1, 1)
  cell.value = text
  cell.font = { size: 16, bold: true, color: { argb: BRAND.white } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.red } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 30
}

function styleHeaderRow(row, color) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
    cell.font = { bold: true, color: { argb: BRAND.white } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = {
      top: { style: 'thin', color: { argb: color } },
      bottom: { style: 'thin', color: { argb: color } },
      left: { style: 'thin', color: { argb: BRAND.white } },
      right: { style: 'thin', color: { argb: BRAND.white } },
    }
  })
  row.height = 20
}

// 黒背景を使わず、白地+赤文字+赤罫線で見出し行を強調する(ロゴ等の視認性に配慮)
function styleHeaderRowLight(row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.white } }
    cell.font = { bold: true, color: { argb: BRAND.red } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = {
      top: { style: 'medium', color: { argb: BRAND.red } },
      bottom: { style: 'medium', color: { argb: BRAND.red } },
    }
  })
  row.height = 20
}

function applyPrintSetup(ws) {
  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  }
}

function styleDataRow(row, { zebra, bold, fillColor } = {}) {
  row.eachCell((cell, colNumber) => {
    if (colNumber > 1) cell.alignment = { horizontal: 'right' }
    cell.border = {
      bottom: { style: 'thin', color: { argb: BRAND.border } },
    }
    if (fillColor) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
    } else if (zebra) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } }
    }
    if (bold) cell.font = { bold: true }
  })
}

async function embedLogo(wb, ws, anchorCol, anchorRow) {
  try {
    const resp = await fetch(logoUrl)
    const buffer = await resp.arrayBuffer()
    const imageId = wb.addImage({ buffer, extension: 'png' })
    // ロゴの縦横比(272x84)を保って幅約150pxで配置
    ws.addImage(imageId, {
      tl: { col: anchorCol, row: anchorRow },
      ext: { width: 150, height: 46 },
    })
  } catch {
    // ロゴが読み込めなくてもレポート自体は出力する
  }
}

function categoryMonthSheet(wb, name, headerColor, mat, months, label) {
  const ws = wb.addWorksheet(name)
  const colCount = months.length + 2
  titleBanner(ws, colCount, `${label} (項目 × 月)`)

  const headerRow = ws.addRow([label, ...months.map(monthLabel), '年間合計'])
  styleHeaderRow(headerRow, headerColor)

  SALES_CATEGORIES.forEach((c, idx) => {
    const values = months.map((m) => mat.matrix[c][m])
    const total = values.reduce((z, v) => z + v, 0)
    const row = ws.addRow([c, ...values, total])
    styleDataRow(row, { zebra: idx % 2 === 1 })
    for (let i = 2; i <= colCount; i++) row.getCell(i).numFmt = '#,##0'
  })

  const totalsValues = months.map((m) => SALES_CATEGORIES.reduce((z, c) => z + mat.matrix[c][m], 0) + mat.uncategorized[m])
  const totalsRow = ws.addRow(['合計', ...totalsValues, totalsValues.reduce((z, v) => z + v, 0)])
  styleDataRow(totalsRow, { bold: true, fillColor: BRAND.paleGold })
  for (let i = 2; i <= colCount; i++) totalsRow.getCell(i).numFmt = '#,##0'

  ws.getColumn(1).width = 22
  for (let i = 2; i <= colCount; i++) ws.getColumn(i).width = 13
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
  applyPrintSetup(ws)
  return ws
}

export async function exportFiscalReportXlsx(report, yoy) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'スリーエル・エージェンシー株式会社'
  wb.created = new Date()
  const title = fiscalPeriodFullLabel(report.startYear)

  // ================= サマリー =================
  const ws1 = wb.addWorksheet('サマリー')
  titleBanner(ws1, 5, `${title} 業績レポート`)
  await embedLogo(wb, ws1, 5.3, 0.1)
  applyPrintSetup(ws1)
  ws1.getColumn(1).width = 22
  ws1.getColumn(2).width = 16
  ws1.getColumn(3).width = 16
  ws1.getColumn(4).width = 16
  ws1.getColumn(5).width = 12

  ws1.addRow([])
  const kpiHeader = ws1.addRow(['総売上(税込)', '年間経費', '粗利', '粗利率', yoy ? '前期比' : ''])
  styleHeaderRowLight(kpiHeader)
  const kpiRow = ws1.addRow([
    report.totalSales,
    report.totalExpenses,
    report.grossProfit,
    report.grossProfitRate,
    yoy ? yoy.rate ?? '' : 'データなし',
  ])
  kpiRow.height = 24
  kpiRow.eachCell((cell) => {
    cell.font = { size: 13, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.paleGold } }
    cell.border = { bottom: { style: 'medium', color: { argb: BRAND.gold } } }
  })
  kpiRow.getCell(1).numFmt = YEN_FMT
  kpiRow.getCell(2).numFmt = YEN_FMT
  kpiRow.getCell(3).numFmt = YEN_FMT
  kpiRow.getCell(4).numFmt = PCT_FMT
  if (yoy && typeof yoy.rate === 'number') {
    kpiRow.getCell(5).numFmt = PCT_FMT
    kpiRow.getCell(5).font = { size: 13, bold: true, color: { argb: yoy.rate >= 0 ? BRAND.red : BRAND.black } }
  }

  ws1.addRow([])
  if (yoy) {
    const yoyInfoRow = ws1.addRow(['前期売上', yoy.prevTotalSales, '前年差', yoy.diff])
    yoyInfoRow.getCell(2).numFmt = YEN_FMT
    yoyInfoRow.getCell(4).numFmt = YEN_FMT
    yoyInfoRow.getCell(4).font = { color: { argb: yoy.diff >= 0 ? BRAND.red : BRAND.black }, bold: true }
    ws1.addRow([])
  } else {
    const noYoyRow = ws1.addRow(['前年比較: アプリ内に前期のデータが無いため計算できません'])
    noYoyRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } }
    ws1.addRow([])
  }

  const sectionRow = ws1.addRow(['項目別売上構成'])
  sectionRow.getCell(1).font = { bold: true, size: 13, color: { argb: BRAND.red } }
  const catHeader = ws1.addRow(['項目', '年間売上', '年間経費', '粗利', '構成比'])
  styleHeaderRow(catHeader, BRAND.red)
  report.byCategory.forEach((r, idx) => {
    const row = ws1.addRow([r.category, r.salesTotal, r.expenseTotal, r.profit, r.ratio])
    styleDataRow(row, { zebra: idx % 2 === 1 })
    row.getCell(2).numFmt = YEN_FMT
    row.getCell(3).numFmt = YEN_FMT
    row.getCell(4).numFmt = YEN_FMT
    row.getCell(5).numFmt = PCT_FMT
  })
  const catTotalsRow = ws1.addRow(['合計', report.totalSales, report.totalExpenses, report.grossProfit, 1])
  styleDataRow(catTotalsRow, { bold: true, fillColor: BRAND.paleRed })
  catTotalsRow.getCell(2).numFmt = YEN_FMT
  catTotalsRow.getCell(3).numFmt = YEN_FMT
  catTotalsRow.getCell(4).numFmt = YEN_FMT
  catTotalsRow.getCell(5).numFmt = PCT_FMT
  if (report.uncategorizedSalesTotal || report.uncategorizedExpenseTotal) {
    const uncatRow = ws1.addRow([
      '(分類なし・未対応カテゴリ)',
      report.uncategorizedSalesTotal,
      report.uncategorizedExpenseTotal,
      report.uncategorizedSalesTotal - report.uncategorizedExpenseTotal,
      '',
    ])
    uncatRow.eachCell((cell) => { cell.font = { italic: true, color: { argb: 'FF888888' } } })
    uncatRow.getCell(2).numFmt = YEN_FMT
    uncatRow.getCell(3).numFmt = YEN_FMT
    uncatRow.getCell(4).numFmt = YEN_FMT
  }

  // ================= 月別売上 / 月別経費 / 月別粗利 =================
  categoryMonthSheet(wb, '月別売上', BRAND.gold, report.salesMat, report.months, '項目(売上)')
  categoryMonthSheet(wb, '月別経費', BRAND.purple, report.expenseMat, report.months, '項目(経費)')

  const ws4 = wb.addWorksheet('月別粗利')
  const colCount4 = report.months.length + 2
  titleBanner(ws4, colCount4, '項目別 粗利 (項目 × 月)')
  const profitHeader = ws4.addRow(['項目(粗利)', ...report.months.map(monthLabel), '年間合計'])
  styleHeaderRow(profitHeader, BRAND.red)
  SALES_CATEGORIES.forEach((c, idx) => {
    const values = report.months.map((m) => report.salesMat.matrix[c][m] - report.expenseMat.matrix[c][m])
    const total = values.reduce((z, v) => z + v, 0)
    const row = ws4.addRow([c, ...values, total])
    styleDataRow(row, { zebra: idx % 2 === 1 })
    for (let i = 2; i <= colCount4; i++) row.getCell(i).numFmt = '#,##0'
  })
  const profitTotalsRow = ws4.addRow(['合計', ...report.months.map((m) => report.totalProfitByMonth[m]), report.grossProfit])
  styleDataRow(profitTotalsRow, { bold: true, fillColor: BRAND.paleGold })
  for (let i = 2; i <= colCount4; i++) profitTotalsRow.getCell(i).numFmt = '#,##0'
  ws4.getColumn(1).width = 22
  for (let i = 2; i <= colCount4; i++) ws4.getColumn(i).width = 13
  ws4.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
  applyPrintSetup(ws4)

  // ================= 月別損益(全体) + 折れ線グラフ =================
  const ws5 = wb.addWorksheet('月別損益')
  titleBanner(ws5, 4, '月別 売上・経費・粗利(全体)')
  const overallHeader = ws5.addRow(['月', '売上', '経費', '粗利'])
  styleHeaderRowLight(overallHeader)
  report.months.forEach((m, idx) => {
    const row = ws5.addRow([monthLabel(m), report.totalSalesByMonth[m], report.totalExpensesByMonth[m], report.totalProfitByMonth[m]])
    styleDataRow(row, { zebra: idx % 2 === 1 })
    row.getCell(2).numFmt = YEN_FMT
    row.getCell(3).numFmt = YEN_FMT
    row.getCell(4).numFmt = YEN_FMT
  })
  const overallTotalsRow = ws5.addRow(['年間合計', report.totalSales, report.totalExpenses, report.grossProfit])
  styleDataRow(overallTotalsRow, { bold: true, fillColor: BRAND.paleRed })
  overallTotalsRow.getCell(2).numFmt = YEN_FMT
  overallTotalsRow.getCell(3).numFmt = YEN_FMT
  overallTotalsRow.getCell(4).numFmt = YEN_FMT
  ws5.getColumn(1).width = 14
  ws5.getColumn(2).width = 16
  ws5.getColumn(3).width = 16
  ws5.getColumn(4).width = 16
  applyPrintSetup(ws5)

  const chartMonthLabels = report.months.map(monthLabel)
  const chartSales = report.months.map((m) => report.totalSalesByMonth[m])
  const chartExpenses = report.months.map((m) => report.totalExpensesByMonth[m])
  const chartProfit = report.months.map((m) => report.totalProfitByMonth[m])
  try {
    const chartPng = drawTrendChartPng(chartMonthLabels, chartSales, chartExpenses, chartProfit)
    const chartImageId = wb.addImage({ base64: chartPng, extension: 'png' })
    // 表の下にグラフを配置(印刷時に列側で改ページされて欠けるのを防ぐため)。2行分の余白を空ける
    ws5.addRow([])
    ws5.addRow([])
    const chartAnchorRow = ws5.lastRow.number
    ws5.addImage(chartImageId, {
      tl: { col: 0, row: chartAnchorRow },
      ext: { width: 620, height: 290 },
    })
  } catch {
    // グラフ描画に失敗しても表データは出力済みなので処理を続ける
  }

  // ================= 前年比較 =================
  if (yoy) {
    const ws6 = wb.addWorksheet('前年比較')
    titleBanner(ws6, 4, '前期との比較')
    const yoyHeader = ws6.addRow(['比較項目', '今期', '前期', '差額'])
    styleHeaderRow(yoyHeader, BRAND.red)
    const salesDiffRow = ws6.addRow(['総売上', report.totalSales, yoy.prevTotalSales, yoy.diff])
    styleDataRow(salesDiffRow)
    const profitDiffRow = ws6.addRow(['粗利', report.grossProfit, yoy.prevGrossProfit, report.grossProfit - yoy.prevGrossProfit])
    styleDataRow(profitDiffRow, { zebra: true })
    ;[salesDiffRow, profitDiffRow].forEach((row) => {
      row.getCell(2).numFmt = YEN_FMT
      row.getCell(3).numFmt = YEN_FMT
      row.getCell(4).numFmt = YEN_FMT
      const diffCell = row.getCell(4)
      const v = diffCell.value
      diffCell.font = { bold: true, color: { argb: v >= 0 ? BRAND.red : BRAND.black } }
    })
    ws6.addRow([])
    const rateRow = ws6.addRow(['伸び率', yoy.rate ?? ''])
    if (typeof yoy.rate === 'number') {
      rateRow.getCell(2).numFmt = PCT_FMT
      rateRow.getCell(2).font = { bold: true, color: { argb: yoy.rate >= 0 ? BRAND.red : BRAND.black } }
    }
    rateRow.getCell(1).font = { bold: true }
    ws6.getColumn(1).width = 16
    ws6.getColumn(2).width = 16
    ws6.getColumn(3).width = 16
    ws6.getColumn(4).width = 16
    applyPrintSetup(ws6)
  }

  // ファイル名に / を含めるとブラウザによって保存に失敗することがあるため使わない
  const filename = `第${fiscalPeriodNumber(report.startYear)}期_業績レポート.xlsx`
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
