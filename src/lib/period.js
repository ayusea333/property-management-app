// 会計期(9月始まり)に関するヘルパー関数

const FISCAL_START_MONTH = 9 // 9月始まり

// 'YYYY-MM' または 'YYYY-MM-DD' → その日付が属する期の開始年(西暦)
export function fiscalStartYear(dateStr) {
  const [y, m] = dateStr.split('-').map(Number)
  return m >= FISCAL_START_MONTH ? y : y - 1
}

export function fiscalYearLabel(startYear) {
  return `${startYear}/9 〜 ${startYear + 1}/8`
}

// 指定した期の12か月分('YYYY-MM')を返す
export function fiscalMonths(startYear) {
  const arr = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(startYear, 8 + i, 1) // 8 = 9月(0始まり)
    arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return arr
}

// 指定した期の上期・下期(それぞれ6か月分)
export function fiscalHalves(startYear) {
  const months = fiscalMonths(startYear)
  return { h1: months.slice(0, 6), h2: months.slice(6, 12) }
}

export function currentFiscalStartYear() {
  const d = new Date()
  return fiscalStartYear(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
}
