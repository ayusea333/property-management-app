// 一覧をCSVファイルとしてダウンロードする

function escapeCell(v) {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(escapeCell).join(',')]
  rows.forEach((row) => lines.push(row.map(escapeCell).join(',')))
  const csv = '\uFEFF' + lines.join('\r\n')
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
