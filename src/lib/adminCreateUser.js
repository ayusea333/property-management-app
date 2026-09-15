import { supabase } from './supabase'

// SupabaseのEdge Function「admin-create-user」のURL
const FUNCTION_URL = 'https://lrxnwogkkfwjozsncfod.supabase.co/functions/v1/admin-create-user'

// 管理者が新しいログインアカウントを発行する。成功すると仮パスワードが返る。
export async function adminCreateUser(email, displayName) {
  if (!email) throw new Error('メールアドレスを入力してください')

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('ログインが必要です')

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email, displayName }),
  })

  let json = null
  try {
    json = await res.json()
  } catch {
    throw new Error('登録結果を解析できませんでした')
  }

  if (!res.ok || json.error) {
    throw new Error(json.error || 'ユーザー登録に失敗しました')
  }

  return json.tempPassword
}
