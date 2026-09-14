// マスタデータ(物件・部屋・取引先・業者など)との表記ゆれ対応照合。
// 「株式会社○○設備」「(株)○○設備」「○○設備株式会社」のような違いを吸収して比較する。
// 追加のライブラリなしで、素のJavaScriptだけで実装している。

const CORP_AFFIXES = ['株式会社', '有限会社', '合同会社', '合資会社', '一般社団法人', '公益社団法人', '(株)', '（株）', '(有)', '（有）']

function toHalfWidth(s) {
  return (s || '')
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[　]/g, ' ')
}

// 正規化: 全角/半角統一 → 前後の空白除去 → 法人格の表記を前後どちらからでも除去
export function normalizeName(s) {
  let t = toHalfWidth(s || '').trim().replace(/\s+/g, '')
  for (const affix of CORP_AFFIXES) {
    if (t.startsWith(affix)) t = t.slice(affix.length)
    if (t.endsWith(affix)) t = t.slice(0, t.length - affix.length)
  }
  return t
}

// text(PDFから抽出した文字列全体)の中に、候補名(候補: [{id, label}, ...])が
// 含まれていないかを探す。正規化した上で完全一致すれば「一致」、
// 見つからなければ null を返す(=呼び出し側で「要確認」として空欄のまま提示する)。
export function findMasterMatchInText(text, candidates) {
  const normalizedText = normalizeName(text)
  if (!normalizedText) return null

  let best = null
  for (const c of candidates) {
    const norm = normalizeName(c.label)
    if (!norm) continue
    if (normalizedText.includes(norm)) {
      // より長く一致した候補を優先(「○○ビル」より「○○ビル本館」のような、より具体的な一致を優先するため)
      if (!best || norm.length > normalizeName(best.label).length) {
        best = c
      }
    }
  }
  return best
}

// 候補リストから、textと完全一致する項目を探す(支払先の自由入力欄などで、確実な一致だけを拾いたい場合用)
export function findExactMatch(text, candidates) {
  const norm = normalizeName(text)
  if (!norm) return null
  return candidates.find((c) => normalizeName(c.label) === norm) || null
}
