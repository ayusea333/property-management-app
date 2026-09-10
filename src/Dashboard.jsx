import { useMemo, useState } from 'react'
import { SALES_CATEGORIES } from './lib/sales'
import { fiscalYearLabel, fiscalMonths, fiscalHalves, currentFiscalStartYear } from './lib/period'
import { currentMonthStr } from './lib/rentPayments'

// dataviz skillの検証済みパレット(9色・固定順、SALES_CATEGORIESの並びと対応)
const CATEGORY_COLORS = [
  '#2a78d6', // 管理料
  '#eb6834', // ビルメンテナンス
  '#1baf7a', // 請負工事
  '#eda100', // 借上げ
  '#e87ba4', // 所有物件
  '#993887', // レントスペース(ブランドパープル)
  '#008300', // AD・付帯・契約手数料
  '#4a3aa7', // 安サポ
  '#e34948', // その他手数料等
]
const BAR_COLOR = '#CC1D1C' // ブランドレッド

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
  const bottomPad = 48 // 月ラベル+金額ラベル分の余白(数字が見切れないように下に確保)
  const chartH = height - bottomPad
  const barW = Math.min(40, (width / data.length) * 0.5)

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
              <text x={x + barW / 2} y={chartH + 32} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0b0b0b">
                {yen(d.value)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// 部屋の費用項目(extraFees)のうち、月払いのものだけ合計する。年払いのものは毎月の家賃合計には含めない。
function extraFeesMonthlyTotal(room) {
  const fees = room?.extraFees || {}
  return Object.values(fees).reduce((sum, f) => sum + (f?.billingType === '年払い' ? 0 : (Number(f?.amount) || 0)), 0)
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
      const total = (room?.rent || 0) + (room?.commonFee || 0) + extraFeesMonthlyTotal(room)
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

// 借上げ物件などで、オーナーへ毎月払う保証家賃(空室でも発生する)を可視化するパネル。
// 保証家賃を設定している部屋が1件もない場合は表示しない。
function MasterLeaseObligationPanel({ allRecords }) {
  const rooms = allRecords.rooms || []
  const properties = allRecords.properties || []
  const owners = allRecords.owners || []
  const tenants = allRecords.tenants || []
  const today = new Date().toISOString().slice(0, 10)

  const guaranteedRooms = rooms.filter((r) => Number(r.ownerGuaranteedRent) > 0)
  if (guaranteedRooms.length === 0) return null

  const isOccupied = (roomId) =>
    tenants.some((t) => t.roomId === roomId && (!t.moveOutDate || t.moveOutDate >= today))

  const totalGuaranteed = guaranteedRooms.reduce((z, r) => z + Number(r.ownerGuaranteedRent), 0)
  const vacantRooms = guaranteedRooms.filter((r) => !isOccupied(r.id))
  const vacantTotal = vacantRooms.reduce((z, r) => z + Number(r.ownerGuaranteedRent), 0)

  const propertyName = (id) => properties.find((p) => p.id === id)?.name || ''
  const ownerName = (propId) => {
    const p = properties.find((x) => x.id === propId)
    return owners.find((o) => o.id === p?.ownerId)?.name || ''
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h2>借上げ物件のオーナー保証家賃</h2>
      <p className="mini" style={{ color: '#6b6167', marginBottom: 10 }}>
        入居の有無に関わらず、毎月オーナーへ支払う義務がある金額です(部屋マスタの「オーナーへの保証家賃」で設定した部屋のみ集計)。
      </p>
      <div className="cards">
        <StatCard label="月額保証家賃 合計" value={yen(totalGuaranteed)} />
        <StatCard label="うち空室で発生中" value={`${vacantRooms.length}件 (${yen(vacantTotal)})`} />
      </div>
      {vacantRooms.length > 0 && (
        <div className="tablewrap" style={{ marginTop: 12 }}>
          <table className="master-table">
            <thead>
              <tr><th>物件</th><th>部屋</th><th>オーナー</th><th className="amount">保証家賃(月額)</th></tr>
            </thead>
            <tbody>
              {vacantRooms.map((r) => (
                <tr key={r.id}>
                  <td>{propertyName(r.propertyId)}</td>
                  <td>{r.roomNumber}</td>
                  <td>{ownerName(r.propertyId)}</td>
                  <td className="amount">{yen(r.ownerGuaranteedRent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TrustFundBalancePanel({ trustFunds }) {
  const items = trustFunds || []
  if (items.length === 0) return null
  const open = items.filter((t) => t.status === '保管中')
  const depositBalance = open.filter((t) => t.direction === '預り金').reduce((z, t) => z + Number(t.amount || 0), 0)
  const advanceBalance = open.filter((t) => t.direction === '立替金').reduce((z, t) => z + Number(t.amount || 0), 0)
  if (depositBalance === 0 && advanceBalance === 0) return null

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h2>預り金・立替金の残高</h2>
      <p className="mini" style={{ color: '#6b6167', marginBottom: 10 }}>
        敷金・保証金・オーナー預り金・入居者預り金・修繕立替金のうち、まだ解消していない(保管中の)金額です。売上・経費・利益には含まれていません。
      </p>
      <div className="cards">
        <StatCard label="預り金残高(いずれ返す義務)" value={yen(depositBalance)} />
        <StatCard label="立替金残高(いずれ返してもらう権利)" value={yen(advanceBalance)} />
        <StatCard label="未解消の件数" value={`${open.length}件`} />
      </div>
    </div>
  )
}

export default function Dashboard({ allRecords, sales, expenses, rentPayments, trustFunds }) {
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

      <MasterLeaseObligationPanel allRecords={allRecords} />

      <TrustFundBalancePanel trustFunds={trustFunds} />

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2>勘定科目別売上構成({fiscalYearLabel(fiscalYear)})</h2>
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
