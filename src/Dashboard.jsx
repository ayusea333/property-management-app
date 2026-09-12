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
  const
