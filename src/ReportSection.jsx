import { useState } from 'react'
import { supabase } from './lib/supabase'
import { currentFiscalStartYear, fiscalPeriodFullLabel } from './lib/period'
import { computeFiscalReport, computeYoy, exportFiscalReportXlsx } from './lib/report'
import { SALES_CATEGORIES } from './lib/sales'

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

export default function ReportSection({ sales, expenses, budgets, onChanged, isAdmin }) {
  const [periodYear, setPeriodYear] = useState(currentFiscalStartYear())
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  // 予算編集(管理者のみ)。「編集」を押すと、この期・全項目分の入力欄を表示し、
  // 「保存」でまとめて登録する(値を確認せず自動保存はしない)。
  const [editingBudget, setEditingBudget] = useState(false)
  const [draftAmounts, setDraftAmounts] = useState({})
  const [savingBudget, setSavingBudget] = useState(false)
  const [budgetError, setBudgetError] = useState('')

  const report = computeFiscalReport(periodYear, sales, expenses)
  const prevReport = computeFiscalReport(periodYear - 1, sales, expenses)
  const yoy = computeYoy(report, prevReport)

  const budgetFor = (kind, category) =>
    (budgets || []).find((b) => b.fiscalYearStart === periodYear && b.kind === kind && b.category === category)

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

  const handleStartEditBudget = () => {
    const draft = {}
    SALES_CATEGORIES.forEach((c) => {
      draft[`売上|${c}`] = String(budgetFor('売上', c)?.amount ?? 0)
      draft[`経費|${c}`] = String(budgetFor('経費', c)?.amount ?? 0)
    })
    setDraftAmounts(draft)
    setBudgetError('')
    setEditingBudget(true)
  }

  const handleCancelEditBudget = () => {
    setEditingBudget(false)
    setBudgetError('')
  }

  const handleSaveBudget = async () => {
    setSavingBudget(true)
    setBudgetError('')
    try {
      const rows = []
      SALES_CATEGORIES.forEach((c) => {
        ;['売上', '経費'].forEach((kind) => {
          const existing = budgetFor(kind, c)
          rows.push({
            fiscal_year_start: periodYear,
            kind,
            category: c,
            amount: Number(draftAmounts[`${kind}|${c}`] || 0),
            note: existing?.note || null,
          })
        })
      })
      const { error } = await supabase.from('budgets').upsert(rows, { onConflict: 'fiscal_year_start,kind,category' })
      if (error) throw error
      setEditingBudget(false)
      await onChanged?.()
    } catch (err) {
      setBudgetError('予算の保存に失敗しました: ' + err.message)
    } finally {
      setSavingBudget(false)
    }
  }

  return (
    <div>
      <div className="master-toolbar">
        <label style={{ marginRight: 4 }}>対象の期</label>
        <select value={periodYear} onChange={(e) => { setPeriodYear(Number(e.target.value)); setEditingBudget(false) }}>
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

      <div className="master-toolbar" style={{ marginTop: 24, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>項目別売上構成・予算比較</h3>
        {isAdmin && !editingBudget && (
          <button className="btn-secondary" onClick={handleStartEditBudget}>予算を編集</button>
        )}
        {isAdmin && editingBudget && (
          <>
            <button className="btn-primary" onClick={handleSaveBudget} disabled={savingBudget}>
              {savingBudget ? '保存中...' : '保存'}
            </button>
            <button className="btn-secondary" onClick={handleCancelEditBudget} disabled={savingBudget}>キャンセル</button>
          </>
        )}
        {budgetError && <span className="form-error" style={{ marginBottom: 0 }}>{budgetError}</span>}
      </div>
      <p className="mini" style={{ color: '#6b6167', marginTop: 0 }}>
        予算は経営判断に関わるため、管理者のみが登録・変更できます。予算を登録していない項目は0として扱われ、差異欄には実績との差額を表示します(実績が予算を上回ればプラス)。
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="master-table">
          <thead>
            <tr>
              <th rowSpan={2}>項目</th>
              <th className="amount" colSpan={3}>売上</th>
              <th className="amount" colSpan={3}>経費</th>
              <th className="amount" rowSpan={2}>粗利</th>
              <th className="amount" rowSpan={2}>構成比</th>
            </tr>
            <tr>
              <th className="amount">実績</th>
              <th className="amount">予算</th>
              <th className="amount">差異</th>
              <th className="amount">実績</th>
              <th className="amount">予算</th>
              <th className="amount">差異</th>
            </tr>
          </thead>
          <tbody>
            {report.byCategory.map((r) => {
              const salesBudget = editingBudget
                ? Number(draftAmounts[`売上|${r.category}`] || 0)
                : (budgetFor('売上', r.category)?.amount ?? 0)
              const expenseBudget = editingBudget
                ? Number(draftAmounts[`経費|${r.category}`] || 0)
                : (budgetFor('経費', r.category)?.amount ?? 0)
              return (
                <tr key={r.category}>
                  <td>{r.category}</td>
                  <td className="amount">{yen(r.salesTotal)}</td>
                  <td className="amount">
                    {editingBudget ? (
                      <input
                        type="number"
                        value={draftAmounts[`売上|${r.category}`] ?? ''}
                        onChange={(e) => setDraftAmounts({ ...draftAmounts, [`売上|${r.category}`]: e.target.value })}
                        style={{ width: 100, textAlign: 'right' }}
                      />
                    ) : (
                      yen(salesBudget)
                    )}
                  </td>
                  <td className="amount">{yen(r.salesTotal - salesBudget)}</td>
                  <td className="amount">{yen(r.expenseTotal)}</td>
                  <td className="amount">
                    {editingBudget ? (
                      <input
                        type="number"
                        value={draftAmounts[`経費|${r.category}`] ?? ''}
                        onChange={(e) => setDraftAmounts({ ...draftAmounts, [`経費|${r.category}`]: e.target.value })}
                        style={{ width: 100, textAlign: 'right' }}
                      />
                    ) : (
                      yen(expenseBudget)
                    )}
                  </td>
                  <td className="amount">{yen(r.expenseTotal - expenseBudget)}</td>
                  <td className="amount">{yen(r.profit)}</td>
                  <td className="amount">{percent(r.ratio)}</td>
                </tr>
              )
            })}
            {(report.uncategorizedSalesTotal !== 0 || report.uncategorizedExpenseTotal !== 0) && (
              <tr>
                <td>(分類なし)</td>
                <td className="amount">{yen(report.uncategorizedSalesTotal)}</td>
                <td className="amount">-</td>
                <td className="amount">-</td>
                <td className="amount">{yen(report.uncategorizedExpenseTotal)}</td>
                <td className="amount">-</td>
                <td className="amount">-</td>
                <td className="amount">{yen(report.uncategorizedSalesTotal - report.uncategorizedExpenseTotal)}</td>
                <td className="amount"></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mini" style={{ marginTop: 12, color: '#6b6167' }}>
        「Excelでダウンロード」を押すと、月別・項目別の内訳や前期比較まで含めたExcelファイル(.xlsx)がダウンロードされます。
        前期比較は、前期(前の期)のデータがこのアプリ内に入力されている場合のみ計算されます。
      </p>
    </div>
  )
}
