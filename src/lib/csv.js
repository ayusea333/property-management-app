// 一覧をCSVファイルとしてダウンロード/インポートする

function escapeCell(v) {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(escapeCell).join(',')]
  rows.forEach((row) => lines.push(row.map(escapeCell).join(',')))
  // 先頭にBOMを付けて、Excelで開いても文字化けしないようにする
  const csv = '﻿' + lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// CSVの文字列を2次元配列に変換する(ダブルクォート囲み・カンマ・改行を含むセルに対応)
export function parseCsv(text) {
  const t = String(text || '').replace(/^﻿/, '')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') { inQuotes = true; continue }
    if (c === ',') { row.push(field); field = ''; continue }
    if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; continue }
    if (c === '\r') { continue }
    field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}
