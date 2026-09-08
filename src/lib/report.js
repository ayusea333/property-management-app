// 期末業績レポート(Excelダウンロード)の集計・出力

import * as XLSX from 'xlsx'
import { SALES_CATEGORIES } from './sales'
import { fiscalMonths, fiscalPeriodFullLabel, fiscalPeriodNumber } from './period'

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

function applyNumberFormat(ws, ref, fmt) {
  if (ws[ref]) ws[ref].z = fmt
}

// カテゴリ×月の一覧をシート用の行データに変換する
function categoryMonthRows(mat, months, label) {
  const header = [label, ...months.map(monthLabel), '年間合計']
  const rows = SALES_CATEGORIES.map((c) => {
    const values = months.map((m) => mat.matrix[c][m])
    const total = values.reduce((z, v) => z + v, 0)
    return [c, ...values, total]
  })
  const totalsRow = ['合計', ...months.map((m) => SALES_CATEGORIES.reduce((z, c) => z + mat.matrix[c][m], 0) + mat.uncategorized[m])]
  totalsRow.push(totalsRow.slice(1).reduce((z, v) => z + v, 0))
  return [header, ...rows, totalsRow]
}

export function exportFiscalReportXlsx(report, yoy) {
  const wb = XLSX.utils.book_new()
  const title = fiscalPeriodFullLabel(report.startYear)

  // ---- サマリー ----
  const summaryRows = [
    [`${title} 業績レポート`],
    [],
    ['総売上(税込)', report.totalSales],
    ['年間経費', report.totalExpenses],
    ['粗利', report.grossProfit],
    ['粗利率', report.grossProfitRate],
  ]
  if (yoy) {
    summaryRows.push(['前期売上', yoy.prevTotalSales])
    summaryRows.push(['前年差', yoy.diff])
    summaryRows.push(['伸び率', yoy.rate ?? ''])
  } else {
    summaryRows.push(['前年比較', 'アプリ内に前期のデータが無いため計算できません'])
  }
  summaryRows.push([])
  summaryRows.push(['項目別売上構成'])
  summaryRows.push(['項目', '年間売上', '年間経費', '粗利', '構成比'])
  report.byCategory.forEach((r) => {
    summaryRows.push([r.category, r.salesTotal, r.expenseTotal, r.profit, r.ratio])
  })
  summaryRows.push(['合計', report.totalSales, report.totalExpenses, report.grossProfit, 1])
  if (report.uncategorizedSalesTotal || report.uncategorizedExpenseTotal) {
    summaryRows.push(['(分類なし・未対応カテゴリ)', report.uncategorizedSalesTotal, report.uncategorizedExpenseTotal, report.uncategorizedSalesTotal - report.uncategorizedExpenseTotal, ''])
  }

  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
  ws1['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }]
  applyNumberFormat(ws1, 'B3', '#,##0')
  applyNumberFormat(ws1, 'B4', '#,##0')
  applyNumberFormat(ws1, 'B5', '#,##0')
  applyNumberFormat(ws1, 'B6', '0.0%')
  XLSX.utils.book_append_sheet(wb, ws1, 'サマリー')

  // ---- 月別・項目別売上 ----
  const salesRows = categoryMonthRows(report.salesMat, report.months, '項目(売上)')
  const ws2 = XLSX.utils.aoa_to_sheet(salesRows)
  ws2['!cols'] = [{ wch: 20 }, ...report.months.map(() => ({ wch: 12 })), { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws2, '月別売上')

  // ---- 月別・項目別経費 ----
  const expenseRows = categoryMonthRows(report.expenseMat, report.months, '項目(経費)')
  const ws3 = XLSX.utils.aoa_to_sheet(expenseRows)
  ws3['!cols'] = [{ wch: 20 }, ...report.months.map(() => ({ wch: 12 })), { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws3, '月別経費')

  // ---- 月別・項目別粗利 ----
  const profitHeader = ['項目(粗利)', ...report.months.map(monthLabel), '年間合計']
  const profitRows = SALES_CATEGORIES.map((c) => {
    const values = report.months.map((m) => report.salesMat.matrix[c][m] - report.expenseMat.matrix[c][m])
    const total = values.reduce((z, v) => z + v, 0)
    return [c, ...values, total]
  })
  const profitTotalsRow = ['合計', ...report.months.map((m) => report.totalProfitByMonth[m])]
  profitTotalsRow.push(report.grossProfit)
  const ws4 = XLSX.utils.aoa_to_sheet([profitHeader, ...profitRows, profitTotalsRow])
  ws4['!cols'] = [{ wch: 20 }, ...report.months.map(() => ({ wch: 12 })), { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws4, '月別粗利')

  // ---- 月別 売上・経費・粗利(全体) ----
  const overallHeader = ['月', '売上', '経費', '粗利']
  const overallRows = report.months.map((m) => [monthLabel(m), report.totalSalesByMonth[m], report.totalExpensesByMonth[m], report.totalProfitByMonth[m]])
  overallRows.push(['年間合計', report.totalSales, report.totalExpenses, report.grossProfit])
  const ws5 = XLSX.utils.aoa_to_sheet([overallHeader, ...overallRows])
  ws5['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws5, '月別損益')

  // ---- 前年比較(前期のデータがある場合のみ) ----
  if (yoy) {
    const yoyHeader = ['比較項目', '今期', '前期', '差額']
    const yoyRows = [
      ['総売上', report.totalSales, yoy.prevTotalSales, yoy.diff],
      ['粗利', report.grossProfit, yoy.prevGrossProfit, report.grossProfit - yoy.prevGrossProfit],
    ]
    const ws6 = XLSX.utils.aoa_to_sheet([yoyHeader, ...yoyRows, [], ['伸び率', yoy.rate ?? '']])
    ws6['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws6, '前年比較')
  }

  // ファイル名に / を含めるとブラウザによって保存に失敗することがあるため使わない
  const filename = `第${fiscalPeriodNumber(report.startYear)}期_業績レポート.xlsx`
  XLSX.writeFile(wb, filename)
}
