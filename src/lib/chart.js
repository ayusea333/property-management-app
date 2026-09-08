// 月別の売上・経費・粗利の推移を折れ線グラフ(PNG画像)として描画する
// ブラウザのCanvasを使って描画し、Excelに画像として埋め込むために使う

const CHART_COLORS = {
  sales: '#CC1D1C', // 売上 = ブランドレッド
  expenses: '#993887', // 経費 = ブランドパープル
  profit: '#B8960A', // 粗利 = ブランドゴールド(濃いめ)
}

function niceMax(v) {
  if (v <= 0) return 100
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  let niceN
  if (n <= 1) niceN = 1
  else if (n <= 2) niceN = 2
  else if (n <= 5) niceN = 5
  else niceN = 10
  return niceN * pow
}

// months: ['2025-09', ...], monthLabels: ['2025年9月', ...]
// sales/expenses/profit: 同じ長さの数値配列
// 戻り値: PNG画像のdata URL(base64)
export function drawTrendChartPng(monthLabels, sales, expenses, profit) {
  const W = 900
  const H = 420
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  const padL = 74
  const padR = 24
  const padT = 44
  const padB = 46
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const allValues = [...sales, ...expenses, ...profit]
  const maxRaw = Math.max(0, ...allValues)
  const minRaw = Math.min(0, ...allValues)
  const maxVal = niceMax(maxRaw)
  const minVal = minRaw < 0 ? -niceMax(Math.abs(minRaw)) : 0
  const span = maxVal - minVal || 1

  const yToPx = (v) => padT + plotH - ((v - minVal) / span) * plotH
  const xToPx = (i) => padL + (monthLabels.length > 1 ? (i / (monthLabels.length - 1)) * plotW : plotW / 2)

  // タイトル
  ctx.fillStyle = '#1a1a1a'
  ctx.font = 'bold 15px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('月別 売上・経費・粗利の推移', padL, 22)

  // グリッド線 + Y軸ラベル(万円単位)
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const ySteps = 5
  for (let i = 0; i <= ySteps; i++) {
    const v = minVal + (span * i) / ySteps
    const y = yToPx(v)
    ctx.strokeStyle = '#eeeeee'
    ctx.beginPath()
    ctx.moveTo(padL, y)
    ctx.lineTo(W - padR, y)
    ctx.stroke()
    ctx.fillStyle = '#777777'
    ctx.fillText(Math.round(v / 10000).toLocaleString() + '万', padL - 8, y)
  }

  // 0ライン
  if (minVal < 0) {
    ctx.strokeStyle = '#bbbbbb'
    ctx.beginPath()
    ctx.moveTo(padL, yToPx(0))
    ctx.lineTo(W - padR, yToPx(0))
    ctx.stroke()
  }

  // X軸ラベル(月)
  ctx.fillStyle = '#666666'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = '11px sans-serif'
  monthLabels.forEach((label, i) => {
    const short = label.replace('年', '/').replace('月', '')
    ctx.fillText(short, xToPx(i), H - padB + 10)
  })

  function drawLine(data, color) {
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.beginPath()
    data.forEach((v, i) => {
      const x = xToPx(i)
      const y = yToPx(v)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.fillStyle = color
    data.forEach((v, i) => {
      ctx.beginPath()
      ctx.arc(xToPx(i), yToPx(v), 3, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  drawLine(sales, CHART_COLORS.sales)
  drawLine(expenses, CHART_COLORS.expenses)
  drawLine(profit, CHART_COLORS.profit)

  // 凡例
  const legendItems = [
    { label: '売上', color: CHART_COLORS.sales },
    { label: '経費', color: CHART_COLORS.expenses },
    { label: '粗利', color: CHART_COLORS.profit },
  ]
  let lx = W - padR - 260
  const ly = 22
  ctx.font = 'bold 12px sans-serif'
  legendItems.forEach((item) => {
    ctx.fillStyle = item.color
    ctx.fillRect(lx, ly - 6, 12, 12)
    ctx.fillStyle = '#333333'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(item.label, lx + 18, ly)
    lx += ctx.measureText(item.label).width + 34
  })

  return canvas.toDataURL('image/png')
}
