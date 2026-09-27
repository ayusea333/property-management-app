// オーナー送金明細(PDFダウンロード)の出力。
// 数値・項目の内容はExcel版(ownerRemittance.js)と同じもの(effectiveBreakdown)をそのまま使う。
// 日本語フォントをPDFに埋め込む必要をなくすため、画面と同じ見た目のHTMLを組み立てて画像化し、
// それをPDFのページに貼り付ける方式にしている(文字化け・文字欠けのリスクを避けるため。
// その代わり、PDF内の文字は選択・検索はできない)。

import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// Excel版(lib/report.js・lib/ownerRemittance.js)と合わせた配色
const BRAND = {
  red: '#CC1D1C',
  purple: '#993887',
  gold: '#E8CA2D',
  black: '#1A1A1A',
  white: '#FFFFFF',
  paleGold: '#FCF6DC',
  palePurple: '#F3E9F1',
  border: '#E0D9D3',
  zebra: '#FAF8F5',
  gray: '#888888',
}

const PAGE_WIDTH_PX = 794 // A4縦(210mm)を96dpi換算した幅

function monthLabel(m) {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return `${y}年${Number(mo)}月分`
}

function yen(n) {
  return Math.round(n || 0).toLocaleString() + '円'
}

// row.settlement(精算記録)があればそのbreakdown(精算時点のスナップショット)を、
// なければ今の参考計算(row.breakdown)を使う(Excel版と同じロジック)
function effectiveBreakdown(row) {
  return row.settlement?.breakdown || row.breakdown || {}
}

function el(tag, styleText, html) {
  const node = document.createElement(tag)
  if (styleText) node.style.cssText = styleText
  if (html !== undefined) node.innerHTML = html
  return node
}

function sectionTitle(text, color) {
  return el(
    'div',
    `background:${color};color:#fff;font-weight:bold;padding:6px 10px;margin-top:14px;font-size:13px;`,
    text
  )
}

function table(rows, { header, rightCols = [] } = {}) {
  const wrap = el('table', 'width:100%;border-collapse:collapse;font-size:12px;margin-top:2px;')
  const tbody = el('tbody')
  const buildRow = (cells, opts = {}) => {
    const tr = el('tr', opts.zebra ? `background:${BRAND.zebra};` : '')
    cells.forEach((text, i) => {
      const td = el(
        'td',
        `padding:4px 8px;border-bottom:1px solid ${BRAND.border};` +
          (rightCols.includes(i) ? 'text-align:right;' : 'text-align:left;') +
          (opts.bold ? 'font-weight:bold;' : '') +
          (opts.fill ? `background:${opts.fill};` : opts.zebra ? `background:${BRAND.zebra};` : '') +
          (opts.italic ? `font-style:italic;color:${BRAND.gray};` : ''),
        String(text)
      )
      tr.appendChild(td)
    })
    return tr
  }
  if (header) {
    const headTr = buildRow(header, {})
    headTr.style.background = header.__color || '#000'
    header.forEach((_, i) => {
      headTr.children[i].style.cssText += `background:${header.__color || BRAND.black};color:#fff;font-weight:bold;text-align:${rightCols.includes(i) ? 'right' : 'left'};`
    })
    tbody.appendChild(headTr)
  }
  rows.forEach((r, idx) => tbody.appendChild(buildRow(r.cells, { ...r, zebra: r.zebra ?? idx % 2 === 1 })))
  wrap.appendChild(tbody)
  return wrap
}

// 1オーナー・1ヶ月分の送金明細を、画面外に配置するDOMノードとして組み立てる(Excel版のbuildOwnerSheetに対応)
function buildOwnerBlock(row, targetMonth) {
  const bd = effectiveBreakdown(row)
  const rentDetails = bd.rentDetails || []
  const repairDetails = bd.repairDetails || []
  const openTrustDetails = bd.openTrustDetails || []
  const isSettled = !!row.settlement
  const finalAmount = isSettled ? Number(row.settlement.amount || 0) : Number(row.referenceNet || 0)

  const page = el(
    'div',
    `width:${PAGE_WIDTH_PX}px;padding:28px 32px;background:#fff;font-family:'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif;color:${BRAND.black};box-sizing:border-box;`
  )

  page.appendChild(
    el(
      'div',
      `background:${BRAND.red};color:#fff;font-size:16px;font-weight:bold;padding:10px 14px;border-radius:2px;`,
      `送金明細書 - ${row.owner.name}様 ${monthLabel(targetMonth)}`
    )
  )
  page.appendChild(
    el(
      'div',
      `margin-top:8px;font-size:12px;font-style:italic;color:${isSettled ? BRAND.black : BRAND.gray};`,
      isSettled ? '状態: 確定済み' : '状態: 未精算(参考の下書き金額です)'
    )
  )

  // ---- 入金明細 ----
  page.appendChild(sectionTitle('入金明細(家賃等)', BRAND.gold))
  const rentHeader = ['物件', '号室', '入居者', '金額']
  rentHeader.__color = BRAND.gold
  const rentRows =
    rentDetails.length > 0
      ? rentDetails.map((d) => ({ cells: [d.propertyName || '', d.roomNumber || '', d.tenantName || '', yen(d.amount)] }))
      : [{ cells: ['(入金データなし)', '', '', yen(0)], italic: true, zebra: false }]
  rentRows.push({ cells: ['入金合計', '', '', yen(bd.rentCollected)], bold: true, fill: BRAND.paleGold, zebra: false })
  page.appendChild(table(rentRows, { header: rentHeader, rightCols: [3] }))

  // ---- 差引項目 ----
  page.appendChild(sectionTitle('差引項目', BRAND.purple))
  const deductHeader = ['項目', '', '', '金額']
  deductHeader.__color = BRAND.purple
  const deductRows = [{ cells: ['管理料', '', '', yen(-(bd.managementFee || 0))], zebra: false }]
  repairDetails.forEach((d) => {
    deductRows.push({ cells: [`修繕費(${d.costBearer || ''}): ${d.content || ''}`, '', '', yen(-(d.amount || 0))], zebra: false })
  })
  deductRows.push({
    cells: ['修繕費オーナー負担 合計', '', '', yen(-(bd.repairOwnerBurden || 0))],
    bold: true,
    fill: BRAND.palePurple,
    zebra: false,
  })
  page.appendChild(table(deductRows, { header: deductHeader, rightCols: [3] }))

  // ---- 参考(送金額には自動反映されない) ----
  if (bd.guaranteedRent || openTrustDetails.length > 0) {
    page.appendChild(sectionTitle('参考(送金額には自動反映されません)', BRAND.black))
    const refRows = []
    if (bd.guaranteedRent) refRows.push({ cells: ['保証家賃', '', '', yen(bd.guaranteedRent)], zebra: false })
    if (openTrustDetails.length > 0) {
      const trustHeader = ['未解消の立替金・預り金', '区分', '', '金額']
      trustHeader.__color = BRAND.black
      const trustRows = openTrustDetails.map((d) => ({ cells: [d.content || '', d.direction || '', '', yen(d.amount)] }))
      trustRows.push({ cells: ['未解消 合計', '', '', yen(bd.openTrustTotal)], bold: true, zebra: false })
      if (refRows.length > 0) page.appendChild(table(refRows, { rightCols: [3] }))
      page.appendChild(table(trustRows, { header: trustHeader, rightCols: [3] }))
    } else if (refRows.length > 0) {
      page.appendChild(table(refRows, { rightCols: [3] }))
    }
  }

  // ---- 送金額 ----
  const finalBox = el(
    'div',
    `margin-top:14px;display:flex;justify-content:space-between;align-items:center;background:${BRAND.paleGold};` +
      `border-top:3px solid ${BRAND.gold};border-bottom:3px solid ${BRAND.gold};padding:10px 14px;font-size:15px;font-weight:bold;`,
    ''
  )
  finalBox.appendChild(el('span', '', isSettled ? '精算・送金額' : '精算・送金額(下書き)'))
  finalBox.appendChild(el('span', '', yen(finalAmount)))
  page.appendChild(finalBox)

  if (isSettled) {
    const detailLines = [['状態', row.settlement.status]]
    if (row.settlement.settlementDate) detailLines.push(['精算日', row.settlement.settlementDate])
    if (row.settlement.remittanceDate) detailLines.push(['送金日', row.settlement.remittanceDate])
    if (row.settlement.remittanceMethod) detailLines.push(['送金方法', row.settlement.remittanceMethod])
    if (row.settlement.note) detailLines.push(['備考', row.settlement.note])
    const detailWrap = el('div', 'margin-top:10px;font-size:12px;')
    detailLines.forEach(([k, v]) => {
      detailWrap.appendChild(el('div', 'padding:2px 0;', `${k}: ${v}`))
    })
    page.appendChild(detailWrap)
  }

  return page
}

// 一覧ページ(複数オーナーまとめ出力の先頭ページ。Excel版の「一覧」シートに対応)
function buildSummaryBlock(rows, targetMonth) {
  const page = el(
    'div',
    `width:${PAGE_WIDTH_PX}px;padding:28px 32px;background:#fff;font-family:'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif;color:${BRAND.black};box-sizing:border-box;`
  )
  page.appendChild(
    el(
      'div',
      `background:${BRAND.red};color:#fff;font-size:16px;font-weight:bold;padding:10px 14px;border-radius:2px;`,
      `オーナー送金明細一覧 ${monthLabel(targetMonth)}`
    )
  )
  const header = ['オーナー', '入金合計', '管理料', '修繕費オーナー負担', '精算・送金額', '状態']
  header.__color = BRAND.black
  const dataRows = rows.map((row) => {
    const bd = effectiveBreakdown(row)
    const isSettled = !!row.settlement
    const finalAmount = isSettled ? Number(row.settlement.amount || 0) : Number(row.referenceNet || 0)
    return {
      cells: [
        row.owner.name,
        yen(bd.rentCollected),
        yen(bd.managementFee),
        yen(bd.repairOwnerBurden),
        yen(finalAmount),
        isSettled ? row.settlement.status : '未精算(下書き)',
      ],
    }
  })
  const total = rows.reduce((z, row) => z + (row.settlement ? Number(row.settlement.amount || 0) : Number(row.referenceNet || 0)), 0)
  dataRows.push({ cells: ['合計', '', '', '', yen(total), ''], bold: true, fill: BRAND.paleGold, zebra: false })
  page.appendChild(table(dataRows, { header, rightCols: [1, 2, 3, 4] }))
  return page
}

// 画面外に一時的にDOMノードを配置してhtml2canvasで画像化し、後片付けする
async function renderToCanvas(node) {
  const host = el('div', 'position:fixed;left:-99999px;top:0;background:#fff;')
  host.appendChild(node)
  document.body.appendChild(host)
  try {
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    return canvas
  } finally {
    document.body.removeChild(host)
  }
}

// 1枚の画像(canvas)をA4ページに収まるよう、必要ならページを分けて貼り付ける
function addCanvasAsPages(pdf, canvas, { startNewPage } = {}) {
  const pageWidthMm = pdf.internal.pageSize.getWidth()
  const pageHeightMm = pdf.internal.pageSize.getHeight()
  const imgWidthMm = pageWidthMm
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width
  const pxPerMm = canvas.width / imgWidthMm
  const pageHeightPx = Math.floor(pageHeightMm * pxPerMm)

  if (startNewPage) pdf.addPage()

  if (imgHeightMm <= pageHeightMm) {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgWidthMm, imgHeightMm)
    return
  }

  let offsetPx = 0
  let first = true
  while (offsetPx < canvas.height) {
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - offsetPx)
    const sliceCanvas = document.createElement('canvas')
    sliceCanvas.width = canvas.width
    sliceCanvas.height = sliceHeightPx
    const ctx = sliceCanvas.getContext('2d')
    ctx.drawImage(canvas, 0, offsetPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)
    if (!first) pdf.addPage()
    pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgWidthMm, (sliceHeightPx * imgWidthMm) / canvas.width)
    offsetPx += sliceHeightPx
    first = false
  }
}

function downloadPdf(pdf, filename) {
  pdf.save(filename)
}

// 1オーナー分の送金明細をPDFでダウンロード
export async function exportOwnerRemittancePdf(row, targetMonth) {
  const node = buildOwnerBlock(row, targetMonth)
  const canvas = await renderToCanvas(node)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  addCanvasAsPages(pdf, canvas)
  downloadPdf(pdf, `送金明細_${row.owner.name}_${targetMonth}.pdf`)
}

// 対象月の複数オーナー分をまとめてPDFでダウンロード(先頭に一覧ページ、続けてオーナーごとのページ)
export async function exportOwnerRemittanceBulkPdf(rows, targetMonth) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })

  const summaryNode = buildSummaryBlock(rows, targetMonth)
  const summaryCanvas = await renderToCanvas(summaryNode)
  addCanvasAsPages(pdf, summaryCanvas)

  for (const row of rows) {
    const node = buildOwnerBlock(row, targetMonth)
    const canvas = await renderToCanvas(node)
    addCanvasAsPages(pdf, canvas, { startNewPage: true })
  }

  downloadPdf(pdf, `送金明細一覧_${targetMonth}.pdf`)
}
