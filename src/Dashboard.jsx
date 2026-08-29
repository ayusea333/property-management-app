import { useMemo, useState } from 'react'
import { SALES_CATEGORIES } from './lib/sales'
import { fiscalYearLabel, fiscalMonths, fiscalHalves, currentFiscalStartYear } from './lib/period'
import { currentMonthStr } from './lib/rentPayments'

// dataviz skillの検証済みパレット(8色・固定順)
const CATEGORY_COLORS = [
  '#2a78d6', // 管理料
  '#eb6834', // ビルメンテナンス
  '#1baf7a', // 請負工事
  '#eda100', // 借上げ
  '#e87ba4', // 所有物件
  '#008300', // AD・付帯・契約手数料
  '#4a3aa7', // 安サポ
  '#e34948', // その他手数料等
]
const BAR_COLOR = '#2a78d6'

function yen(n) {
  return '¥' + Math.round(n || 0).toLocaleString()
}

function monthOf(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : ''
}

function StatCard({ label, value }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="num">{value}</div>
    </div>
  )
}

function DonutChart({ data }) {
  // data: [{label, value, color}]
  const total = data.reduce((z, d) => z + d.value, 0)
  const [hover, setHover] = useState(null)
  const size = 200
  const r = 70
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  let offsetAcc = 0

  if (total <= 0) {
    return <div className="empty-row">この期間のデータがありません</div>
  }

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ position: 'relative' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {data.map((d, i) => {
              const frac = d.value / total
              const len = frac * circumference
              const gap = 2 // 2px surface gap between segments
              const dasharray = `${Math.max(len - gap, 0)} ${circumference - Math.max(len - gap, 0)}`
              const dashoffset = -offsetAcc
              offsetAcc += len
              return (
                <circle
                  key={d.label}
                  cx={cx} cy={cy} r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={hover === i ? 34 : 30}
                  strokeDasharray={dasharray}
                  strokeDashoffset={dashoffset}
                  style={{ transition: 'stroke-width 0.1s' }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              )
            })}
          </g>
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize="12" fill="#52514e">合計</text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="14" fontWeight="750" fill="#0b0b0b">
            {yen(total)}
          </text>
        </svg>
        {hover !== null && (
          <div style={{
            position: 'absolute', top: 0, left: size + 8, background: '#0b0b0b', color: '#fff',
            padding: '6px 10px', borderRadius: 6, fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            {data[hover].label}: {yen(data[hover].value)}({((data[hover].value / total) * 100).toFixed(1)}%)
          </div>
        )}
      </div>
      <div>
        {data.map((d, i) => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: d.color, display: 'inline-block' }} />
            <span style={{ color: '#52514e' }}>{d.label}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{yen(d.value)}</span>
            <span style={{ color: '#898781', fontSize: 11, width: 44, textAlign: 'right' }}>
              {((d.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarChart({ data }) {
  // data: [{label, value}]
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const width = Math.max(320, data.length * 64)
  const height = 200
  const barW = Math.min(40, (width / data.length) * 0.5)
  const chartH = height - 30

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1="0" y1={chartH} x2={width} y2={chartH} stroke="#c3c2b7" strokeWidth="1" />
        {data.map((d, i) => {
          const barH = (d.value / max) * (chartH - 10)
          const slot = width / data.length
          const x = slot * i + (slot - barW) / 2
          const y = chartH - barH
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect
                x={x} y={y} width={barW} height={Math.max(barH, 1)}
                rx="4" ry="4" fill={BAR_COLOR}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
              <text x={x + barW / 2} y={chartH + 16} textAnchor="middle" fontSize="11" fill="#898781">
                {d.label}
              </text>
              {hover === i && (
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0b0b0b">
                  {yen(d.value)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function activeContractsFor(allRecords, month) {
  const tenants = allRecords.tenants || []
  const rooms = allRecords.rooms || []
  const properties = allRecords.properties || []
  const owners = allRecords.owners || []
  const monthEnd = `${month}-31`
  return tenants
    .filter((t) => !t.moveOutDate || t.moveOutDate >= `${month}-01`)
    .filter((t) => !t.moveInDate || t.moveInDate <= monthEnd)
    .map((t) => {
      const room = rooms.find((r) => r.id === t.roomId)
      const property = room ? properties.find((p) => p.id === room.propertyId) : null
      const owner = property ? owners.find((o) => o.id === property.ownerId) : null
      const total = (room?.rent || 0) + (room?.commonFee || 0) + (room?.parkingFee || 0)
        + (room?.bicycleFee || 0) + (room?.supportFee || 0) + (room?.otherFee || 0)
      return { tenant: t, room, property, owner, total }
    })
}

function RentStatusPanel({ allRecords, rentPayments }) {
  const [month, setMonth] = useState(currentMonthStr())
  const contracts = activeContractsFor(allRecords, month)
  const paidIds = new Set(
    rentPayments.filter((p) => p.targetMonth === month).map((p) => p.tenantId)
  )
  const expected = contracts.reduce((z, c) => z + c.total, 0)
  const confirmed = contracts.filter((c) => paidIds.has(c.tenant.id)).reduce((z, c) => z + c.total, 0)
  const unpaidCount = contracts.filter((c) => !paidIds.has(c.tenant.id)).length

  const byProperty = {}
  contracts.forEach((c) => {
    const key = c.property?.name || '(物件未設定)'
    if (!byProperty[key]) byProperty[key] = { owner: c.owner?.name || '', expected: 0, confirmed: 0 }
    byProperty[key].expected += c.total
    if (paidIds.has(c.tenant.id)) byProperty[key].confirmed += c.total
  })

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <h2 style={{ marginRight: 'auto' }}>家賃入金状況</h2>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <div className="cards">
        <StatCard label="入金予定額" value={yen(expected)} />
        <StatCard label="入金確認済" value={yen(confirmed)} />
        <StatCard label="未入金" value={`${unpaidCount}件 (${yen(expected - confirmed)})`} />
      </div>
      <div className="tablewrap" style={{ marginTop: 12 }}>
        <table className="master-table">
          <thead>
            <tr><th>物件</th><th>オーナー</th><th className="amount">入金予定</th><th className="amount">入金確認</th><th className="amount">未入金</th></tr>
          </thead>
          <tbody>
            {Object.entries(byProperty).map(([name, v]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{v.owner}</td>
                <td className="amount">{yen(v.expected)}</td>
                <td className="amount">{yen(v.confirmed)}</td>
                <td className="amount">{yen(v.expected - v.confirmed)}</td>
              </tr>
            ))}
            {Object.keys(byProperty).length === 0 && (
              <tr><td colSpan={5} className="empty-row">対象の契約がありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Dashboard({ allRecords, sales, expenses, rentPayments }) {
  const [fiscalYear, setFiscalYear] = useState(currentFiscalStartYear())
  const [granularity, setGranularity] = useState('month')

  const yearOptions = []
  const cur = currentFiscalStartYear()
  for (let y = cur; y >= cur - 4; y--) yearOptions.push(y)

  const months = fiscalMonths(fiscalYear)
  const monthSet = new Set(months)

  const salesInYear = useMemo(
    () => sales.filter((s) => monthSet.has(monthOf(s.date))),
    [sales, fiscalYear]
  )
  const expensesInYear = useMemo(
    () => expenses.filter((e) => monthSet.has(monthOf(e.date))),
    [expenses, fiscalYear]
  )

  const totalSales = salesInYear.reduce((z, s) => z + s.amount, 0)
  const totalExpenses = expensesInYear.reduce((z, e) => z + e.amount, 0)
  const profit = totalSales - totalExpenses

  const donutData = SALES_CATEGORIES
    .map((cat, i) => ({
      label: cat,
      value: salesInYear.filter((s) => s.category === cat).reduce((z, s) => z + s.amount, 0),
      color: CATEGORY_COLORS[i],
    }))
    .filter((d) => d.value > 0)

  let barData = []
  if (granularity === 'month') {
    barData = months.map((m) => ({
      label: `${Number(m.slice(5))}月`,
      value: sales.filter((s) => monthOf(s.date) === m).reduce((z, s) => z + s.amount, 0),
    }))
  } else if (granularity === 'half') {
    const { h1, h2 } = fiscalHalves(fiscalYear)
    const sum = (ms) => sales.filter((s) => ms.includes(monthOf(s.date))).reduce((z, s) => z + s.amount, 0)
    barData = [
      { label: '上期', value: sum(h1) },
      { label: '下期', value: sum(h2) },
    ]
  } else {
    barData = yearOptions.slice().reverse().map((y) => {
      const ms = new Set(fiscalMonths(y))
      const value = sales.filter((s) => ms.has(monthOf(s.date))).reduce((z, s) => z + s.amount, 0)
      return { label: `${y}期`, value }
    })
  }

  return (
    <div>
      <div className="master-toolbar">
        <select value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))}>
          {yearOptions.map((y) => <option key={y} value={y}>{fiscalYearLabel(y)}</option>)}
        </select>
      </div>

      <div className="cards">
        <StatCard label="売上" value={yen(totalSales)} />
        <StatCard label="支出" value={yen(totalExpenses)} />
        <StatCard label="利益" value={yen(profit)} />
      </div>

      <RentStatusPanel allRecords={allRecords} rentPayments={rentPayments} />

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2>カテゴリ別売上構成({fiscalYearLabel(fiscalYear)})</h2>
        <DonutChart data={donutData} />
      </div>

      <div className="panel">
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <h2 style={{ marginRight: 'auto' }}>売上の推移</h2>
          <div className="tabs">
            <button className={granularity === 'month' ? 'tab-btn active' : 'tab-btn'} onClick={() => setGranularity('month')}>月次</button>
            <button className={granularity === 'half' ? 'tab-btn active' : 'tab-btn'} onClick={() => setGranularity('half')}>半期</button>
            <button className={granularity === 'year' ? 'tab-btn active' : 'tab-btn'} onClick={() => setGranularity('year')}>年次</button>
          </div>
        </div>
        <BarChart data={barData} />
      </div>
    </div>
  )
}
