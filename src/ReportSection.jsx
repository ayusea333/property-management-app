import { useState } from 'react'
import { currentFiscalStartYear, fiscalPeriodFullLabel } from './lib/period'
import { computeFiscalReport, computeYoy, exportFiscalReportXlsx } from './lib/report'

function yen(n) {
  return '¥' + Math.round(n || 0).toLocaleString()
}

function percent(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return (n * 100).toFixed(1) + '%'
}

function periodYearOptions() {
  const cur = currentFiscalStartYear()
  const arr = []
  for (let y = cur; y >= cur - 4; y--) arr.push(y)
  return arr
}

export default function ReportSection({ sales, expenses }) {
  const [periodYear, setPeriodYear] = useState(currentFiscalStartYear())
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const report = computeFiscalReport(periodYear, sales, expenses)
  const prevReport = computeFiscalReport(periodYear - 1, sales, expenses)
  const yoy = computeYoy(report, prevReport)

  const handleExport = async () => {
    setExporting(true)
    setExportError('')
    try {
      await exportFiscalReportXlsx(report, yoy)
    } catch (err) {
      setExportError('Excelの作成に失敗しました。もう一度お試しください。')
      console.error(err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="master-toolbar">
        <label style={{ marginRight: 4 }}>対象の期</label>
        <select value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value))}>
          {periodYearOptions().map((y) => (
            <option key={y} value={y}>{fiscalPeriodFullLabel(y)}</option>
          ))}
        </select>
        <button className="btn-primary" onClick={handleExport} disabled={exporting}>
          {exporting ? '作成中...' : 'Excelでダウンロード'}
        </button>
        {exportError && <span className="form-error" style={{ marginBottom: 0 }}>{exportError}</span>}
      </div>

      {!report.hasData && (
        <div className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
          この期にはまだ売上・経費のデータがありません。
        </div>
      )}

      <div className="cards">
        <div className="card"><div className="label">総売上</div><div className="num">{yen(report.totalSales)}</div></div>
        <div className="card"><div className="label">年間経費</div><div className="num">{yen(report.totalExpenses)}</div></div>
        <div className="card"><div className="label">粗利</div><div className="num">{yen(report.grossProfit)}</div></div>
        <div className="card"><div className="label">粗利率</div><div className="num">{percent(report.grossProfitRate)}</div></div>
        <div className="card">
          <div className="label">前期比(伸び率)</div>
          <div className="num">{yoy ? percent(yoy.rate) : '前期データなし'}</div>
        </div>
      </div>

      <h3 style={{ marginTop: 24 }}>項目別売上構成</h3>
      <table className="master-table">
        <thead>
          <tr><th>項目</th><th className="amount">年間売上</th><th className="amount">年間経費</th><th className="amount">粗利</th><th className="amount">構成比</th></tr>
        </thead>
        <tbody>
          {report.byCategory.map((r) => (
            <tr key={r.category}>
              <td>{r.category}</td>
              <td className="amount">{yen(r.salesTotal)}</td>
              <td className="amount">{yen(r.expenseTotal)}</td>
              <td className="amount">{yen(r.profit)}</td>
              <td className="amount">{percent(r.ratio)}</td>
            </tr>
          ))}
          {(report.uncategorizedSalesTotal !== 0 || report.uncategorizedExpenseTotal !== 0) && (
            <tr>
              <td>(分類なし)</td>
              <td className="amount">{yen(report.uncategorizedSalesTotal)}</td>
              <td className="amount">{yen(report.uncategorizedExpenseTotal)}</td>
              <td className="amount">{yen(report.uncategorizedSalesTotal - report.uncategorizedExpenseTotal)}</td>
              <td className="amount"></td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="mini" style={{ marginTop: 12, color: '#6b6167' }}>
        「Excelでダウンロード」を押すと、月別・項目別の内訳や前期比較まで含めたExcelファイル(.xlsx)がダウンロードされます。
        前期比較は、前期(前の期)のデータがこのアプリ内に入力されている場合のみ計算されます。
      </p>
    </div>
  )
}
