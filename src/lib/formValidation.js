// サイト全体の入力フォームで共通して使う、必須項目の色表示ヘルパー。
// 保存ボタンを押した後(submitAttempted=true)、まだ空のままの必須項目にだけ
// 赤枠・薄い赤背景(App.cssの .form-row.missing)を付ける。
// ページを開いた直後や入力中は表示しない(保存を試みて初めて分かるようにするため)。
export function fieldClass(submitAttempted, isMissing, base = 'form-row') {
  return submitAttempted && isMissing ? `${base} missing` : base
}
