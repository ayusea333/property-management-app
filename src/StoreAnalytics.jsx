import { useState } from 'react'
import { computeStoreAnalytics } from './lib/storeAnalytics'
import { currentMonthStr, prevMonthStr, formatMonthLabel } from './lib/rentPayments'
import { fiscalMonths, currentFiscalStartYear, fiscalYearLabel } from './lib/period'

function yen(n) {
  return '¥' + Math.round(n || 0).toLocaleString()
}

const thisFiscalStart = currentFiscalStartYear()
const thisFiscalMonths = fiscalMonths(thisFiscalStart)
const lastFiscalMonths = fiscalMonths(thisFiscalStart - 1)

const PRESETS = [
  { key: 'thisMonth', label: '今月' },
  { key: 'lastMonth', label: '先月' },
  { key: 'thisFiscalYear', label: `今年度(${fiscalYearLabel(thisFiscalStart)})` },
  { key: 'lastFiscalYear', label: `前年度(${fiscalYearLabel(thisFiscalStart - 1)})` },
  { key: 'custom', label: '任意期間' },
]

const SORT_COLUMNS = [
  { key: 'newInPeriod', label: '新規獲得(期間内)' },
  { key: 'cumulativeTotal', label: '累計獲得戸数' },
  { key: 'endedInPeriod', label: '終了(期間内)' },
  { key: 'netGrowth', label: '純増' },
  { key: 'currentActiveCount', label: '現在管理中' },
  { key: 'revenuePostedInPeriod', label: '獲得報酬合計' },
  { key: 'avgRevenuePerUnit', label: '1戸あたり平均' },
  { key: 'currentMonthlyBaseTotal', label: '月間管理料合計' },
  { key: 'currentThreeLMonthlyTotal', label: '3L月間取り分' },
  { key: 'currentGroupMonthlyTotal', label: 'グループ会社月間支払' },
]

export default function StoreAnalytics({ allRecords, managementAcquisitions, managementAcquisitionRates, sales }) {
  const referralStores = allRecords.referralStores || []
  const rooms = allRecords.rooms || []

  const [preset, setPreset] = useState('thisMonth')
  const [customStart, setCustomStart] = useState(currentMonthStr())
  const [customEnd, setCustomEnd] = useState(currentMonthStr())
  const [sortKey, setSortKey] = useState('newInPeriod')
  const [sortDir, setSortDir] = useState('desc')

  let periodStart
  let periodEnd
  if (preset === 'thisMonth') {
    periodStart = periodEnd = currentMonthStr()
  } else if (preset === 'lastMonth') {
    periodStart = periodEnd = prevMonthStr(currentMonthStr())
  } else if (preset === 'thisFiscalYear') {
    periodStart = thisFiscalMonths[0]
    periodEnd = thisFiscalMonths[11]
  } else if (preset === 'lastFiscalYear') {
    periodStart = lastFiscalMonths[0]
    periodEnd = lastFiscalMonths[11]
  } else {
    periodStart = customStart
    periodEnd = customEnd
  }

  const periodLabel =
    periodStart === periodEnd ? formatMonthLabel(periodStart) : `${formatMonthLabel(periodStart)} 〜 ${formatMonthLabel(periodEnd)}`

  const { stores, totals, unregisteredCount } = computeStoreAnalytics({
    referralStores,
    managementAcquisitions,
    managementAcquisitionRates,
    sales,
    rooms,
    periodStart,
    periodEnd,
  })

  const storeLabel = (store) => (store.groupName ? `${store.groupName} ${store.storeName}` : store.storeName)

  const sortedStores = [...stores].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return sortDir === 'desc' ? -diff : diff
  })

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sortArrow = (key) => (sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '')

  return (
    <div>
      <p className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
        グループ会社の店舗(紹介元)ごとの新規管理獲得実績を比較できます。「現在管理中」「月間管理料合計」など現在時点の数字は、選択した期間に関わらず常に本日時点のものです。「新規獲得」「終了」「獲得報酬合計」は選択した期間内のものだけを集計します。列見出しをクリックすると並び替えできます。
      </p>

      <div className="master-toolbar">
        <select value={preset} onChange={(e) => setPreset(e.target.value)}>
          {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {preset === 'custom' && (
          <>
            <input type="month" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <span>〜</span>
            <input type="month" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </>
        )}
        <span className="mini" style={{ color: '#6b6167' }}>対象期間: {periodLabel}</span>
      </div>

      <div className="cards">
        <div className="card"><div className="label">新規獲得(期間内)</div><div className="num">{totals.newInPeriod}戸</div></div>
        <div className="card"><div className="label">終了(期間内)</div><div className="num">{totals.endedInPeriod}戸</div></div>
        <div className="card"><div className="label">純増(期間内)</div><div className="num">{totals.netGrowth}戸</div></div>
        <div className="card"><div className="label">現在管理中の戸数</div><div className="num">{totals.currentActiveCount}戸</div></div>
        <div className="card"><div className="label">獲得報酬合計(計上済み)</div><div className="num">{yen(totals.revenuePostedInPeriod)}</div></div>
        <div className="card"><div className="label">1戸あたり平均獲得報酬</div><div className="num">{yen(totals.avgRevenuePerUnit)}</div></div>
        <div className="card"><div className="label">現在の月間管理料合計</div><div className="num">{yen(totals.currentMonthlyBaseTotal)}</div></div>
        <div className="card"><div className="label">3L側の月間取り分</div><div className="num">{yen(totals.currentThreeLMonthlyTotal)}</div></div>
        <div className="card"><div className="label">グループ会社への月間支払額</div><div className="num">{yen(totals.currentGroupMonthlyTotal)}</div></div>
        <div className="card"><div className="label">紹介元 未登録・不明(参考)</div><div className="num">{unregisteredCount}戸</div></div>
      </div>

      {referralStores.length === 0 && (
        <div className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
          紹介元店舗がまだ登録されていません。「マスタ管理」→「紹介元店舗」から先に登録してください。
        </div>
      )}

      <div className="tablewrap">
        <table className="master-table">
          <thead>
            <tr>
              <th>店舗</th>
              {SORT_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="amount"
                  style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                  onClick={() => toggleSort(c.key)}
                >
                  {c.label}{sortArrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedStores.map((s) => (
              <tr key={s.store.id}>
                <td>{storeLabel(s.store)}</td>
                <td className="amount">{s.newInPeriod}戸</td>
                <td className="amount">{s.cumulativeTotal}戸</td>
                <td className="amount">{s.endedInPeriod}戸</td>
                <td className="amount">{s.netGrowth}戸</td>
                <td className="amount">{s.currentActiveCount}戸</td>
                <td className="amount">{yen(s.revenuePostedInPeriod)}</td>
                <td className="amount">{yen(s.avgRevenuePerUnit)}</td>
                <td className="amount">{yen(s.currentMonthlyBaseTotal)}</td>
                <td className="amount">{yen(s.currentThreeLMonthlyTotal)}</td>
                <td className="amount">{yen(s.currentGroupMonthlyTotal)}</td>
              </tr>
            ))}
            {sortedStores.length === 0 && (
              <tr><td colSpan={11} className="empty-row">対象の店舗がありません</td></tr>
            )}
            {sortedStores.length > 0 && (
              <tr style={{ fontWeight: 'bold', background: '#f8f6f3' }}>
                <td>合計</td>
                <td className="amount">{totals.newInPeriod}戸</td>
                <td className="amount">{totals.cumulativeTotal}戸</td>
                <td className="amount">{totals.endedInPeriod}戸</td>
                <td className="amount">{totals.netGrowth}戸</td>
                <td className="amount">{totals.currentActiveCount}戸</td>
                <td className="amount">{yen(totals.revenuePostedInPeriod)}</td>
                <td className="amount">{yen(totals.avgRevenuePerUnit)}</td>
                <td className="amount">{yen(totals.currentMonthlyBaseTotal)}</td>
                <td className="amount">{yen(totals.currentThreeLMonthlyTotal)}</td>
                <td className="amount">{yen(totals.currentGroupMonthlyTotal)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
