// PDFから抽出した文字列(pdfExtract.jsの結果)から、経費入力に必要な項目を
// 正規表現・キーワード近傍探索(ルールベース)で拾い出す。AI APIは使わない。
//
// ここで拾えなかった項目は空のまま返すので、呼び出し側(ExpensePdfImport.jsx)で
// 「要確認」として扱い、必ず人が確認・入力してから登録する。

// 全角の数字・記号を半角に統一する(全角で書かれた請求書PDF対策)
function toHalfWidth(s) {
  return (s || '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，]/g, ',')
    .replace(/[円¥￥]/g, '¥')
    .replace(/[〜～]/g, '~')
}

const ERA_BASE = { 令和: 2018, 平成: 1988, 昭和: 1925 }

function pad2(n) {
  return String(n).padStart(2, '0')
}

// 「2026年9月14日」「令和8年9月14日」「2026/09/14」「2026-09-14」などを YYYY-MM-DD に変換
export function extractDate(text) {
  const t = toHalfWidth(text)

  const eraMatch = t.match(/(令和|平成|昭和)\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (eraMatch) {
    const [, era, yStr, m, d] = eraMatch
    const y = yStr === '元' ? 1 : Number(yStr)
    const year = ERA_BASE[era] + y
    return `${year}-${pad2(m)}-${pad2(d)}`
  }

  const wareki = t.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (wareki) {
    const [, y, m, d] = wareki
    return `${y}-${pad2(m)}-${pad2(d)}`
  }

  const slashed = t.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (slashed) {
    const [, y, m, d] = slashed
    return `${y}-${pad2(m)}-${pad2(d)}`
  }

  return ''
}

// keywordsのいずれかの近く(直後 windowSize 文字以内)にある金額らしい数字を拾う
function findAmountNear(text, keywords, windowSize = 24) {
  for (const kw of keywords) {
    let searchFrom = 0
    while (true) {
      const idx = text.indexOf(kw, searchFrom)
      if (idx === -1) break
      const around = text.slice(idx, idx + kw.length + windowSize)
      const m = around.match(/¥?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\s*円)?/g)
      if (m) {
        // キーワード自体の中の数字(例: 「10%対象」)を除き、金額らしい(3桁カンマ区切り、または4桁以上)ものを優先
        const candidates = m
          .map((s) => s.replace(/[¥円\s]/g, ''))
          .filter((s) => /^\d{1,3}(,\d{3})+$|^\d{4,}$/.test(s))
        if (candidates.length) {
          return Number(candidates[0].replace(/,/g, ''))
        }
      }
      searchFrom = idx + kw.length
    }
  }
  return null
}

export function extractAmount(text) {
  const t = toHalfWidth(text)
  const amount = findAmountNear(t, ['ご請求金額', '請求金額', 'お支払い金額', '合計金額', 'ご請求額', '請求額', '合計'])
  return amount === null ? '' : amount
}

export function extractTaxAmount(text) {
  const t = toHalfWidth(text)
  const amount = findAmountNear(t, ['内消費税等', '内消費税', '消費税額', '消費税等', '消費税'])
  return amount === null ? '' : amount
}

// 税区分: このアプリの選択肢(課税10%・非課税・対象外)のいずれかに対応するものだけを推定する。
// 軽減税率(8%)の表記があった場合は、このアプリにその選択肢が無いため、あえて何も返さず
// 「要確認」として人に選んでもらう(誤って課税10%等にしてしまわないため)。
export function extractTaxType(text) {
  const t = toHalfWidth(text)
  if (/軽減税率|軽減\s*8\s*%/.test(t)) return ''
  if (/非課税/.test(t)) return '非課税'
  if (/10\s*%/.test(t)) return '課税10%'
  return ''
}

// インボイス登録番号(T+13桁)、または「請求書番号」「伝票番号」「No.」の近くの英数字
export function extractInvoiceNumber(text) {
  const t = toHalfWidth(text)

  const registration = t.match(/T\d{13}/)
  if (registration) return registration[0]

  const keywords = ['請求書番号', '伝票番号', '領収書番号', '発行番号', 'No.', 'No']
  for (const kw of keywords) {
    const idx = t.indexOf(kw)
    if (idx === -1) continue
    const around = t.slice(idx + kw.length, idx + kw.length + 20)
    const m = around.match(/[A-Za-z0-9-]{4,}/)
    if (m) return m[0]
  }
  return ''
}

// 書類の上部(発行元が書かれやすい位置)にある行を、支払先の手がかりとして返す
export function extractHeaderCandidateLines(text, count = 5) {
  return (text || '')
    .split(/\n|(?<=[。)】])/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && l.length <= 40)
    .slice(0, count)
}

// text全体をまとめて解析し、経費入力フォームの候補一式を返す
export function parseExpenseText(text) {
  return {
    date: extractDate(text),
    amount: extractAmount(text),
    taxAmount: extractTaxAmount(text),
    taxType: extractTaxType(text),
    invoiceNumber: extractInvoiceNumber(text),
    headerCandidates: extractHeaderCandidateLines(text),
  }
}
