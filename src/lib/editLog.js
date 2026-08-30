import { supabase } from './supabase'

export function translateAuthError(message) {
  const map = {
    'Invalid login credentials': 'メールアドレスまたはパスワードが違います。',
    'Email not confirmed': 'メールアドレスの確認が完了していません。責任者に確認してください。',
    'User already registered': 'このメールアドレスは既に登録されています。',
    'Password should be at least 6 characters': 'パスワードは6文字以上にしてください。',
  }
  return map[message] || message
}

export async function logEdit({ user, tableLabel, action, summary }) {
  if (!user) return
  try {
    await supabase.from('edit_logs').insert({
      user_id: user.id,
      user_email: user.email,
      table_label: tableLabel,
      action,
      summary: summary || '',
    })
  } catch (e) {
    console.error('edit log failed', e)
  }
}
