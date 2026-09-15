import { supabase } from './supabase'

// SupabaseのEdge Function「admin-reset-password」のURL
const FUNCTION_URL = 'https://lrxnwogkkfwjozsncfod.supabase.co/functions/v1/admin-reset-password'

// 管理者が、既存アカウントの仮パスワードを再発行する。成功すると新しい仮パスワードが返る。
export async function adminResetPassword(userId) {
  if (!userId) throw new Error('対象のユーザーが指定されていません')

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('ログインが必要です')

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userId }),
  })

  let json = null
  try {
    json = await res.json()
  } catch {
    throw new Error('再発行結果を解析できませんでした')
  }

  if (!res.ok || json.error) {
    throw new Error(json.error || '仮パスワードの再発行に失敗しました')
  }

  return json.tempPassword
}
