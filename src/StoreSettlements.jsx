import { Fragment, useState } from 'react'
import { supabase } from './lib/supabase'
import { STORE_SETTLEMENT_STATUSES, storeSettlementToRow } from './lib/storeSettlements'
import { currentMonthStr, formatMonthLabel } from './lib/rentPayments'
import { logEdit } from './lib/editLog'

function yen(n) {
  return '¥' + Math.round(n || 0).toLocaleString()
}

export default function StoreSettlements({ allRecords, expenses, settlements, onChanged, canEdit, user }) {
  const [targetMonth, setTargetMonth] = useState(currentMonthStr())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  const referralStores = allRecords.referralStores || []

  const rows = referralStores
    .map((store) => {
      // 「グループ会社支払」経費のうち、この店舗宛て・対象月のものを参考金額として合計する
      // (家賃入金確定時の自動計上分・手入力分どちらも含みます)
      const groupPayments = (expenses || []).filter(
        (e) => e.category === 'グループ会社支払' && e.payeeId === store.id && (e.date || '').slice(0, 7) === targetMonth
      )
      const groupPaymentTotal = groupPayments.reduce((z, e) => z + Number(e.amount || 0), 0)
      const settlement = (settlements || []).find((s) => s.referralStoreId === store.id && s.targetMonth === targetMonth)
      return { store, groupPayments, groupPaymentTotal, settlement }
    })
    .filter((row) => {
      if (statusFilter && (row.settlement?.status || '未精算') !== statusFilter) return false
      if (search) {
        const label = row.store.groupName ? `${row.store.groupName} ${row.store.storeName}` : row.store.storeName
        if (!label.toLowerCase().includes(search.toLowerCase())) return false
      }
      return true
    })
    .sort((a, b) => a.store.storeName.localeCompare(b.store.storeName, 'ja'))

  const stats = {
    storeCount: rows.length,
    unsettled: rows.filter((r) => (r.settlement?.status || '未精算') === '未精算').length,
    awaitingRemit: rows.filter((r) => r.settlement?.status === '精算済(送金待ち)').length,
    remittedTotal: rows.filter((r) => r.settlement?.status === '送金済').reduce((z, r) => z + Number(r.settlement.amount || 0), 0),
  }

  const storeLabel = (store) => (store.groupName ? `${store.groupName} ${store.storeName}` : store.storeName)

  const openForm = (row) => {
    const s = row.settlement
    setForm({
      referralStoreId: row.store.id,
      targetMonth,
      amount: s?.amount ?? row.groupPaymentTotal,
      status: s?.status || '未精算',
      settlementDate: s?.settlementDate || new Date().toISOString().slice(0, 10),
      remittanceDate: s?.remittanceDate || '',
      remittanceMethod: s?.remittanceMethod || '',
      note: s?.note || '',
    })
  }

  const saveForm = async () => {
    setSaving(true)
    try {
      const payload = storeSettlementToRow(form)
      const { error } = await supabase.from('store_settlements').upsert(payload, { onConflict: 'referral_store_id,target_month' })
      if (error) throw error
      await onChanged()
      const store = referralStores.find((s) => s.id === form.referralStoreId)
      await logEdit({
        user,
        tableLabel: '店舗精算',
        action: '記録',
        summary: `${store ? storeLabel(store) : ''} ${formatMonthLabel(targetMonth)}分 ${form.status} ${yen(form.amount)}`,
      })
      setForm(null)
    } catch (e) {
      alert('保存に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="cards">
        <div className="card"><div className="label">対象店舗</div><div className="num">{stats.storeCount}件</div></div>
        <div className="card"><div className="label">未精算</div><div className="num">{stats.unsettled}件</div></div>
        <div className="card"><div className="label">精算済・送金待ち</div><div className="num">{stats.awaitingRemit}件</div></div>
        <div className="card"><div className="label">送金済合計</div><div className="num">{yen(stats.remittedTotal)}</div></div>
      </div>

      <p className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
        「グループ会社支払額(参考)」は、経費に自動・手動で計上されている「グループ会社支払」のうち、その店舗宛て・対象月分の合計です。「精算・送金額」欄にはこの参考金額が下書きとして入りますが、内容を確認のうえ必要に応じて修正してから確定してください(自動送金は行いません)。「精算」(金額の確定)と「送金」(実際の振込)は別々に記録できます。
      </p>

      <div className="master-toolbar">
        <input type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">すべての状態</option>
          {STORE_SETTLEMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="search-input" placeholder="店舗名で検索" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {!canEdit && (
        <div className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
          閲覧のみできます(編集権限がありません)
        </div>
      )}

      {referralStores.length === 0 && (
        <div className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
          紹介元店舗がまだ登録されていません。「マスタ管理」→「紹介元店舗」から先に登録してください。
        </div>
      )}

      <div className="tablewrap">
      <table className="master-table">
        <thead>
          <tr>
            <th>店舗</th>
            <th className="amount">グループ会社支払額(参考)</th>
            <th className="amount">精算・送金額</th>
            <th>状態</th>
            <th>精算日</th>
            <th>送金日</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.store.id}>
              <tr>
                <td>{storeLabel(row.store)}</td>
                <td className="amount">
                  {row.groupPayments.length ? (
                    <span title={row.groupPayments.map((e) => e.content).join(', ')}>{yen(row.groupPaymentTotal)}</span>
                  ) : ''}
                </td>
                <td className="amount">{row.settlement ? yen(row.settlement.amount) : ''}</td>
                <td>
                  {!row.settlement || row.settlement.status === '未精算'
                    ? <span className="status warn">未精算</span>
                    : row.settlement.status === '送金済'
                    ? <span className="status ok">送金済</span>
                    : row.settlement.status === '送金エラー'
                    ? <span className="status bad">送金エラー</span>
                    : <span className="status warn">{row.settlement.status}</span>}
                </td>
                <td>{row.settlement?.settlementDate || ''}</td>
                <td>{row.settlement?.remittanceDate || ''}</td>
                <td>{canEdit && <button className="btn-secondary" onClick={() => openForm(row)}>精算・送金を記録</button>}</td>
              </tr>
              {form && form.referralStoreId === row.store.id && (
                <tr>
                  <td colSpan={7} style={{ background: '#f8f6f3' }}>
                    <div className="master-form" style={{ margin: '8px 0' }}>
                      <h3>{storeLabel(row.store)} {formatMonthLabel(targetMonth)}分の精算・送金</h3>
                      <div className="form-row">
                        <label>精算・送金額</label>
                        <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                      </div>
                      <div className="form-row">
                        <label>状態</label>
                        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                          {STORE_SETTLEMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="form-row">
                        <label>精算日(金額を確定した日)</label>
                        <input type="date" value={form.settlementDate} onChange={(e) => setForm({ ...form, settlementDate: e.target.value })} />
                      </div>
                      <div className="form-row">
                        <label>送金日(実際に振り込んだ日)</label>
                        <input type="date" value={form.remittanceDate} onChange={(e) => setForm({ ...form, remittanceDate: e.target.value })} />
                      </div>
                      <div className="form-row">
                        <label>送金方法</label>
                        <input value={form.remittanceMethod} onChange={(e) => setForm({ ...form, remittanceMethod: e.target.value })} placeholder="例: 銀行振込" />
                      </div>
                      <div className="form-row"><label>備考</label><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
                      <div className="form-actions">
                        <button className="btn-primary" onClick={saveForm} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
                        <button className="btn-secondary" onClick={() => setForm(null)}>キャンセル</button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} className="empty-row">対象の店舗がありません</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}
