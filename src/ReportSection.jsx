import { useState } from 'react'
import { supabase } from './lib/supabase'
import { currentFiscalStartYear, fiscalPeriodFullLabel, fiscalMonths } from './lib/period'
import { computeFiscalReport, computeFiscalExtras, computeYoy, exportFiscalReportXlsx } from './lib/report'
import { SALES_CATEGORIES } from './lib/sales'
import { formatMonthLabel } from './lib/rentPayments'
import { DetailsToggle } from './components/SimpleUI'

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

export default function ReportSection({ sales, expenses, budgets, rentPayments, ownerSettlements, repairs, allRecords, arrearsMonthsCount, activeTenantsFor, onChanged, isAdmin, simpleUI }) {
  const [periodYear, setPeriodYear] = useState(currentFiscalStartYear())
  const [periodMonth, setPeriodMonth] = useState('') // '' = 期全体(年間)。値がある場合はその月だけに絞り込む
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  // 予算編集(管理者のみ)。「編集」を押すと、この期・全項目分の入力欄を表示し、
  // 「保存」でまとめて登録する(値を確認せず自動保存はしない)。
  const [editingBudget, setEditingBudget] = useState(false)
  const [draftAmounts, setDraftAmounts] = useState({})
  const [savingBudget, setSavingBudget] = useState(false)
  const [budgetError, setBudgetError] = useState('')

  // 予算入力中は編集内容が見えるよう、簡略表示は使わずすべての列を表示する
  const showSimpleColumns = simpleUI && !editingBudget

  // 月を絞り込んでいる場合は、前期比較も「同じ月」の前年同月と比べる(前年度の期全体とは比べない)
  const prevPeriodMonth = periodMonth
    ? `${Number(periodMonth.slice(0, 4)) - 1}-${periodMonth.slice(5, 7)}`
    : ''

  const report = computeFiscalReport(periodYear, sales, expenses, periodMonth ? [periodMonth] : undefined)
  const prevReport = computeFiscalReport(periodYear - 1, sales, expenses, periodMonth ? [prevPeriodMonth] : undefined)
  const yoy = computeYoy(report, prevReport)
  const extras = computeFiscalExtras(report.months, { rentPayments, ownerSettlements, allRecords, arrearsMonthsCount, activeTenantsFor, repairs })

  // Excelの期末業績レポートは、画面の月絞り込みに関わらず常に期全体(年間)で出力する
  const fullYearReport = periodMonth ? computeFiscalReport(periodYear, sales, expenses) : report
  const fullYearYoy = periodMonth ? computeYoy(fullYearReport, computeFiscalReport(periodYear - 1, sales, expenses)) : yoy

  const budgetFor = (kind, category) =>
    (budgets || []).find((b) => b.fiscalYearStart === periodYear && b.kind === kind && b.category === category)

  const handleExport = async () => {
    setExporting(true)
    setExportError('')
    try {
      await exportFiscalReportXlsx(fullYearReport, fullYearYoy)
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
        <select value={periodYear} onChange={(e) => { setPeriodYear(Number(e.target.value)); setPeriodMonth(''); setEditingBudget(false) }}>
          {periodYearOptions().map((y) => (
            <option key={y} value={y}>{fiscalPeriodFullLabel(y)}</option>
          ))}
        </select>
        <select value={periodMonth} onChange={(e) => { setPeriodMonth(e.target.value); setEditingBudget(false) }}>
          <option value="">期全体(年間)</option>
          {fiscalMonths(periodYear).map((m) => (
            <option key={m} value={m}>{formatMonthLabel(m)}のみ</option>
          ))}
        </select>
        <button className="btn-primary" onClick={handleExport} disabled={exporting}>
          {exporting ? '作成中...' : 'Excelでダウンロード'}
        </button>
        {exportError && <span className="form-error" style={{ marginBottom: 0 }}>{exportError}</span>}
      </div>

      {!report.hasData && (
        <div className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
          {periodMonth ? 'この月にはまだ売上・経費のデータがありません。' : 'この期にはまだ売上・経費のデータがありません。'}
        </div>
      )}
      {periodMonth && (
        <div className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
          {formatMonthLabel(periodMonth)}のみに絞り込んで表示しています。「Excelでダウンロード」は絞り込みに関わらず期全体(年間)の業績レポートを出力します。
        </div>
      )}

      <div className="cards">
        <div className="card"><div className="label">総売上</div><div className="num">{yen(report.totalSales)}</div></div>
        <div className="card"><div className="label">{periodMonth ? '経費' : '年間経費'}</div><div className="num">{yen(report.totalExpenses)}</div></div>
        <div className="card"><div className="label">粗利</div><div className="num">{yen(report.grossProfit)}</div></div>
        <div className="card"><div className="label">粗利率</div><div className="num">{percent(report.grossProfitRate)}</div></div>
        <div className="card">
          <div className="label">前期比(売上の伸び率)</div>
          <div className="num">
            {yoy ? percent(yoy.rate) : '前期データなし'}
            {yoy && (
              <DetailsToggle label="経費・粗利の前期比も見る">
                経費: {percent(yoy.expenseRate)}(前期 {yen(yoy.prevTotalExpenses)} → 今期 {yen(report.totalExpenses)})<br />
                粗利: {percent(yoy.profitRate)}(前期 {yen(yoy.prevGrossProfit)} → 今期 {yen(report.grossProfit)})
              </DetailsToggle>
            )}
          </div>
        </div>
      </div>

      <div className="cards">
        <div className="card"><div className="label">入金合計(家賃)</div><div className="num">{yen(extras.rentCollectedTotal)}</div></div>
        <div className="card"><div className="label">オーナー送金合計</div><div className="num">{yen(extras.ownerRemittedTotal)}</div></div>
        <div className="card">
          <div className="label">
            未納{extras.arrearsAvailable ? `(${formatMonthLabel(extras.arrearsBaseMonth)}時点)` : ''}
          </div>
          <div className="num">
            {extras.arrearsAvailable ? `${extras.arrearsCount}件 / ${yen(extras.arrearsAmount)}` : '算出不可(期が未到来)'}
          </div>
        </div>
        <div className="card">
          <div className="label">修繕関連(期間内支払分)</div>
          <div className="num">
            {yen(extras.repairCostTotal)}
            <DetailsToggle label="負担区分の内訳">
              {extras.repairCount === 0 ? (
                <>この期間に支払済みになった修繕はありません</>
              ) : (
                Object.entries(extras.repairCostByBearer)
                  .filter(([, amount]) => amount !== 0)
                  .map(([bearer, amount]) => <span key={bearer}>{bearer}: {yen(amount)}<br /></span>)
              )}
            </DetailsToggle>
          </div>
        </div>
      </div>
      <p className="mini" style={{ color: '#6b6167', marginTop: -8 }}>
        「入金合計」「オーナー送金合計」は、{periodMonth ? 'この月の' : 'この期の12か月分を合計した'}実績です。「未納」は積み上げの数値ではなく、家賃入金画面と同じ判定方法で、直近の月時点でどれだけ滞っているかを表しています。「修繕関連」は、この{periodMonth ? '月' : '期間'}内に「完了(支払済み)」になった修繕費用(支払日基準)の合計で、負担区分(会社負担・オーナー負担・入居者負担・折半)ごとの内訳も確認できます。この金額は、下の項目別売上構成(経費)の「請負工事」等にも既に含まれています(二重計上ではありません)。管理戸数・空室率などは、現在のデータだけでは正確に算出できないため表示していません。
      </p>

      <div className="master-toolbar" style={{ marginTop: 24, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{periodMonth ? '項目別売上構成(月別実績)' : '項目別売上構成・予算比較'}</h3>
        {isAdmin && !editingBudget && !periodMonth && (
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
        {periodMonth
          ? '予算は年間(期全体)単位でのみ登録するため、月を絞り込んでいる間は実績のみを表示します。予算と比べる場合は「期全体(年間)」に戻してください。'
          : showSimpleColumns
          ? '予算・差異は各行の「詳細」から確認できます。予算は管理者のみが登録・変更できます。'
          : '予算は経営判断に関わるため、管理者のみが登録・変更できます。予算を登録していない項目は0として扱われ、差異欄には実績との差額を表示します(実績が予算を上回ればプラス)。'}
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="master-table">
          <thead>
            {periodMonth || showSimpleColumns ? (
              <tr>
                <th>項目</th>
                <th className="amount">売上実績</th>
                <th className="amount">経費実績</th>
                <th className="amount">粗利</th>
                <th className="amount">構成比</th>
              </tr>
            ) : (
              <>
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
              </>
            )}
          </thead>
          <tbody>
            {report.byCategory.map((r) => {
              const salesBudget = editingBudget
                ? Number(draftAmounts[`売上|${r.category}`] || 0)
                : (budgetFor('売上', r.category)?.amount ?? 0)
              const expenseBudget = editingBudget
                ? Number(draftAmounts[`経費|${r.category}`] || 0)
                : (budgetFor('経費', r.category)?.amount ?? 0)
              if (periodMonth) {
                return (
                  <tr key={r.category}>
                    <td>{r.category}</td>
                    <td className="amount">{yen(r.salesTotal)}</td>
                    <td className="amount">{yen(r.expenseTotal)}</td>
                    <td className="amount">{yen(r.profit)}</td>
                    <td className="amount">{percent(r.ratio)}</td>
                  </tr>
                )
              }
              if (showSimpleColumns) {
                return (
                  <tr key={r.category}>
                    <td>{r.category}</td>
                    <td className="amount">
                      {yen(r.salesTotal)}
                      <DetailsToggle label="予算・差異">
                        予算: {yen(salesBudget)}<br />差異: {yen(r.salesTotal - salesBudget)}
                      </DetailsToggle>
                    </td>
                    <td className="amount">
                      {yen(r.expenseTotal)}
                      <DetailsToggle label="予算・差異">
                        予算: {yen(expenseBudget)}<br />差異: {yen(r.expenseTotal - expenseBudget)}
                      </DetailsToggle>
                    </td>
                    <td className="amount">{yen(r.profit)}</td>
                    <td className="amount">{percent(r.ratio)}</td>
                  </tr>
                )
              }
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
              periodMonth || showSimpleColumns ? (
                <tr>
                  <td>(分類なし)</td>
                  <td className="amount">{yen(report.uncategorizedSalesTotal)}</td>
                  <td className="amount">{yen(report.uncategorizedExpenseTotal)}</td>
                  <td className="amount">{yen(report.uncategorizedSalesTotal - report.uncategorizedExpenseTotal)}</td>
                  <td className="amount"></td>
                </tr>
              ) : (
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
              )
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
