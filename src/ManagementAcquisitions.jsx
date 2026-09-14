import { Fragment, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  ACQUISITION_TYPES,
  managementAcquisitionToRow,
  acquisitionRateToRow,
  computeSplitAmounts,
} from './lib/acquisitions'
import { saleToRow } from './lib/sales'
import { currentMonthStr, formatMonthLabel } from './lib/rentPayments'
import { logEdit } from './lib/editLog'

function yen(n) {
  return '¥' + Math.round(n || 0).toLocaleString()
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function emptyRegisterForm(defaultRate) {
  return {
    propertyId: '',
    roomIds: [],
    acquisitionType: 'グループ会社',
    referralStoreId: '',
    referralPerson: '',
    startDate: todayStr(),
    threeLRatePercent: defaultRate,
    totalFee: 0,
    note: '',
  }
}

export default function ManagementAcquisitions({
  allRecords,
  managementAcquisitions,
  managementAcquisitionRates,
  appSettings,
  sales,
  onChanged,
  canEdit,
  isAdmin,
  user,
}) {
  const properties = allRecords.properties || []
  const rooms = allRecords.rooms || []
  const referralStores = allRecords.referralStores || []

  const defaultRate = Number(appSettings?.acquisition_default_3l_rate ?? 2)

  const [view, setView] = useState('registered') // 'registered' | 'unregistered'
  const [statusFilter, setStatusFilter] = useState('active') // 'active' | 'all'
  const [search, setSearch] = useState('')

  const [regForm, setRegForm] = useState(null)
  const [rateForm, setRateForm] = useState(null) // { acquisitionId, effectiveFrom, monthlyBaseAmount, threeLRatePercent }
  const [endingId, setEndingId] = useState(null)
  const [endDateInput, setEndDateInput] = useState(todayStr())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const propertyName = (id) => properties.find((p) => p.id === id)?.name || ''
  const roomLabel = (id) => rooms.find((r) => r.id === id)?.roomNumber || ''
  const roomById = (id) => rooms.find((r) => r.id === id)
  const storeLabel = (id) => {
    const s = referralStores.find((s) => s.id === id)
    if (!s) return ''
    return s.groupName ? `${s.groupName} ${s.storeName}` : s.storeName
  }

  const latestRate = (acquisitionId) => {
    const rs = (managementAcquisitionRates || []).filter((r) => r.acquisitionId === acquisitionId)
    if (rs.length === 0) return null
    return rs.reduce((best, r) => (r.effectiveFrom > best.effectiveFrom ? r : best))
  }

  // この獲得の報酬が、すでに売上として計上済みかどうか(source_refで紐付け)
  const postedSaleFor = (acquisitionId) =>
    (sales || []).find((s) => s.source === 'management_acquisition' && s.sourceRef === acquisitionId)

  const postFeeToSales = async (acq) => {
    if (!confirm(`決定報酬額 ${yen(acq.acquisitionFee)} を売上(新規管理獲得)として計上しますか?`)) return
    setSaving(true)
    setError('')
    try {
      const row = saleToRow({
        date: todayStr(),
        category: '新規管理獲得',
        propertyId: acq.propertyId,
        roomId: acq.roomId,
        content: `${propertyName(acq.propertyId)} ${roomLabel(acq.roomId)} 新規管理獲得報酬(自動)`,
        amount: acq.acquisitionFee,
        source: 'management_acquisition',
        sourceRef: acq.id,
      })
      const { error: err } = await supabase.from('sales').upsert(row, { onConflict: 'source,source_ref' })
      if (err) throw err
      await onChanged()
      await logEdit({
        user,
        tableLabel: '新規管理獲得',
        action: '報酬を売上計上',
        summary: `${propertyName(acq.propertyId)} ${roomLabel(acq.roomId)} ${yen(acq.acquisitionFee)}`,
      })
    } catch (e) {
      setError('売上計上に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // 現在アクティブ(end_dateがnull)な管理獲得がある部屋のマップ(登録画面での二重登録防止用)
  const activeAcquisitionByRoom = new Map()
  ;(managementAcquisitions || []).forEach((a) => {
    if (!a.endDate) activeAcquisitionByRoom.set(a.roomId, a)
  })

  const registeredRoomIds = new Set((managementAcquisitions || []).map((a) => a.roomId))
  const unregisteredRooms = rooms.filter((r) => !registeredRoomIds.has(r.id))

  const stats = {
    activeCount: (managementAcquisitions || []).filter((a) => !a.endDate).length,
    thisMonthNew: (managementAcquisitions || []).filter((a) => a.startDate.slice(0, 7) === currentMonthStr()).length,
    unregistered: unregisteredRooms.length,
  }

  const filteredList = (managementAcquisitions || [])
    .filter((a) => (statusFilter === 'active' ? !a.endDate : true))
    .filter((a) => {
      if (!search) return true
      const text = `${propertyName(a.propertyId)} ${roomLabel(a.roomId)} ${storeLabel(a.referralStoreId)} ${a.referralPerson}`.toLowerCase()
      return text.includes(search.toLowerCase())
    })
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))

  // ---- 登録(単一・一括) ----

  const startRegisterFromRoom = (room) => {
    setError('')
    setRegForm({ ...emptyRegisterForm(defaultRate), propertyId: room.propertyId, roomIds: [room.id] })
    setView('registered')
  }

  const startRegisterNew = () => {
    setError('')
    setRegForm(emptyRegisterForm(defaultRate))
  }

  const toggleRoom = (roomId) => {
    setRegForm((f) => ({
      ...f,
      roomIds: f.roomIds.includes(roomId) ? f.roomIds.filter((id) => id !== roomId) : [...f.roomIds, roomId],
    }))
  }

  const submitRegister = async () => {
    if (!regForm.propertyId) { setError('物件を選択してください'); return }
    if (regForm.roomIds.length === 0) { setError('部屋を1件以上選択してください'); return }
    if (!regForm.startDate) { setError('管理開始日を入力してください'); return }
    if (regForm.acquisitionType === 'グループ会社' && !regForm.referralStoreId) {
      setError('紹介元区分が「グループ会社」の場合は紹介元店舗を選択してください')
      return
    }
    setSaving(true)
    setError('')
    try {
      const n = regForm.roomIds.length
      const totalFee = Math.round(Number(regForm.totalFee) || 0)
      const baseShare = Math.floor(totalFee / n)
      const remainder = totalFee - baseShare * n

      let i = 0
      for (const roomId of regForm.roomIds) {
        const room = roomById(roomId)
        const fee = baseShare + (i === 0 ? remainder : 0)
        const { data: inserted, error: err } = await supabase
          .from('management_acquisitions')
          .insert({
            ...managementAcquisitionToRow({
              roomId,
              propertyId: regForm.propertyId,
              acquisitionType: regForm.acquisitionType,
              referralStoreId: regForm.referralStoreId,
              referralPerson: regForm.referralPerson,
              startDate: regForm.startDate,
              acquisitionFee: fee,
              note: regForm.note,
            }),
            created_by: user?.id || null,
          })
          .select()
          .single()
        if (err) throw err

        const baseAmount = Number(room?.managementFee || 0)
        const { threeLMonthlyAmount, groupMonthlyAmount } = computeSplitAmounts(baseAmount, regForm.threeLRatePercent)
        const { error: rateErr } = await supabase.from('management_acquisition_rates').insert({
          ...acquisitionRateToRow({
            acquisitionId: inserted.id,
            effectiveFrom: regForm.startDate.slice(0, 7),
            monthlyBaseAmount: baseAmount,
            threeLMonthlyAmount,
            groupMonthlyAmount,
            threeLRatePercent: regForm.threeLRatePercent,
          }),
          created_by: user?.id || null,
        })
        if (rateErr) throw rateErr
        i++
      }

      await onChanged()
      await logEdit({
        user,
        tableLabel: '新規管理獲得',
        action: '登録',
        summary: `${propertyName(regForm.propertyId)} ${n}戸を登録`,
      })
      setRegForm(null)
    } catch (e) {
      setError('登録に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // ---- 月額変更 ----

  const startRateChange = (acq) => {
    const lr = latestRate(acq.id)
    const nextMonth = (() => {
      const base = lr?.effectiveFrom || currentMonthStr()
      const [y, m] = base.split('-').map(Number)
      const d = new Date(y, m, 1) // m は0始まりでの「翌月」
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()
    const room = roomById(acq.roomId)
    setError('')
    setRateForm({
      acquisitionId: acq.id,
      minEffectiveFrom: nextMonth,
      effectiveFrom: nextMonth,
      monthlyBaseAmount: lr?.monthlyBaseAmount ?? room?.managementFee ?? 0,
      threeLRatePercent: lr?.threeLRatePercent ?? defaultRate,
    })
  }

  const submitRateChange = async () => {
    if (!rateForm.effectiveFrom) { setError('適用開始月を入力してください'); return }
    if (rateForm.effectiveFrom < rateForm.minEffectiveFrom) {
      setError(`適用開始月は${formatMonthLabel(rateForm.minEffectiveFrom)}以降にしてください(過去の月には適用できません)`)
      return
    }
    setSaving(true)
    setError('')
    try {
      const { threeLMonthlyAmount, groupMonthlyAmount } = computeSplitAmounts(rateForm.monthlyBaseAmount, rateForm.threeLRatePercent)
      const { error: err } = await supabase.from('management_acquisition_rates').insert({
        ...acquisitionRateToRow({
          acquisitionId: rateForm.acquisitionId,
          effectiveFrom: rateForm.effectiveFrom,
          monthlyBaseAmount: rateForm.monthlyBaseAmount,
          threeLMonthlyAmount,
          groupMonthlyAmount,
          threeLRatePercent: rateForm.threeLRatePercent,
        }),
        created_by: user?.id || null,
      })
      if (err) throw err
      await onChanged()
      await logEdit({
        user,
        tableLabel: '新規管理獲得',
        action: '月額変更',
        summary: `${formatMonthLabel(rateForm.effectiveFrom)}分から月額${yen(rateForm.monthlyBaseAmount)}に変更`,
      })
      setRateForm(null)
    } catch (e) {
      setError('変更に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // ---- 管理終了 ----

  const startEnd = (acq) => {
    setError('')
    setEndingId(acq.id)
    setEndDateInput(todayStr())
  }

  const submitEnd = async (acq) => {
    if (!endDateInput) { setError('終了日を入力してください'); return }
    if (endDateInput < acq.startDate) { setError('終了日が管理開始日より前になっています'); return }
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('management_acquisitions')
        .update({ end_date: endDateInput })
        .eq('id', acq.id)
      if (err) throw err
      await onChanged()
      await logEdit({
        user,
        tableLabel: '新規管理獲得',
        action: '管理終了',
        summary: `${propertyName(acq.propertyId)} ${roomLabel(acq.roomId)} を${endDateInput}付で終了`,
      })
      setEndingId(null)
    } catch (e) {
      setError('終了処理に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const roomsForSelectedProperty = regForm ? rooms.filter((r) => r.propertyId === regForm.propertyId) : []

  return (
    <div>
      <div className="cards">
        <div className="card"><div className="label">現在管理中の戸数</div><div className="num">{stats.activeCount}戸</div></div>
        <div className="card"><div className="label">今月の新規獲得</div><div className="num">{stats.thisMonthNew}戸</div></div>
        <div className="card"><div className="label">紹介元 未登録・不明</div><div className="num">{stats.unregistered}戸</div></div>
      </div>

      <p className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
        グループ会社の店舗などから紹介を受けて新規に管理を獲得した部屋を、部屋単位で登録します。登録時に月額の基準金額(3L取り分・グループ会社支払額)を確定し、以降は対象月にその部屋が管理中であればこの金額をそのまま自動計上します(毎月再計算はしません)。金額を変更したい場合は、変更後の対象月を指定して登録してください(過去月には影響しません)。
      </p>

      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="master-toolbar">
        <select value={view} onChange={(e) => setView(e.target.value)}>
          <option value="registered">登録済み一覧</option>
          <option value="unregistered">紹介元が未登録の部屋のみ表示</option>
        </select>
        {view === 'registered' && (
          <>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="active">現在管理中のみ</option>
              <option value="all">すべて(終了済みも含む)</option>
            </select>
            <input className="search-input" placeholder="物件・部屋・紹介元で検索" value={search} onChange={(e) => setSearch(e.target.value)} />
          </>
        )}
        {canEdit && !regForm && <button className="btn-primary" onClick={startRegisterNew}>+ 新規管理獲得を登録</button>}
      </div>

      {!canEdit && (
        <div className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
          閲覧のみできます(編集権限がありません)
        </div>
      )}

      {regForm && (
        <div className="master-form">
          <h3>新規管理獲得の登録(複数部屋の一括登録も可能です)</h3>
          <div className="form-row">
            <label>物件<span className="required">*</span></label>
            <select value={regForm.propertyId} onChange={(e) => setRegForm({ ...regForm, propertyId: e.target.value, roomIds: [] })}>
              <option value="">選択してください</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {regForm.propertyId && (
            <div className="form-row">
              <label>部屋(複数選択可)<span className="required">*</span></label>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 6, padding: 8 }}>
                {roomsForSelectedProperty.length === 0 && (
                  <div className="mini" style={{ color: '#6b6167' }}>この物件には部屋が登録されていません</div>
                )}
                {roomsForSelectedProperty.map((r) => {
                  const activeAcq = activeAcquisitionByRoom.get(r.id)
                  return (
                    <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', opacity: activeAcq ? 0.5 : 1 }}>
                      <input
                        type="checkbox"
                        checked={regForm.roomIds.includes(r.id)}
                        disabled={!!activeAcq}
                        onChange={() => toggleRoom(r.id)}
                      />
                      {r.roomNumber}
                      {activeAcq && <span className="mini" style={{ color: '#6b6167' }}>(登録済み: {storeLabel(activeAcq.referralStoreId) || activeAcq.acquisitionType})</span>}
                    </label>
                  )
                })}
              </div>
              <div className="mini" style={{ color: '#6b6167', marginTop: 4 }}>{regForm.roomIds.length}戸を選択中</div>
            </div>
          )}
          <div className="form-row">
            <label>紹介元区分</label>
            <select value={regForm.acquisitionType} onChange={(e) => setRegForm({ ...regForm, acquisitionType: e.target.value })}>
              {ACQUISITION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {regForm.acquisitionType === 'グループ会社' && (
            <div className="form-row">
              <label>紹介元店舗<span className="required">*</span></label>
              <select value={regForm.referralStoreId} onChange={(e) => setRegForm({ ...regForm, referralStoreId: e.target.value })}>
                <option value="">選択してください</option>
                {referralStores.map((s) => <option key={s.id} value={s.id}>{s.groupName ? `${s.groupName} ${s.storeName}` : s.storeName}</option>)}
              </select>
              {referralStores.length === 0 && (
                <div className="mini" style={{ color: '#6b6167' }}>「マスタ管理」→「紹介元店舗」から先に店舗を登録してください</div>
              )}
            </div>
          )}
          <div className="form-row"><label>紹介者(任意)</label><input value={regForm.referralPerson} onChange={(e) => setRegForm({ ...regForm, referralPerson: e.target.value })} /></div>
          <div className="form-row"><label>管理開始日<span className="required">*</span></label><input type="date" value={regForm.startDate} onChange={(e) => setRegForm({ ...regForm, startDate: e.target.value })} /></div>
          <div className="form-row">
            <label>3L取り分率(%)</label>
            <input type="number" value={regForm.threeLRatePercent} onChange={(e) => setRegForm({ ...regForm, threeLRatePercent: Number(e.target.value) })} style={{ width: 100 }} />
            <div className="mini" style={{ color: '#6b6167' }}>選択した各部屋の現在の管理料をもとに、3L取り分・グループ会社支払額(月額)を自動計算して確定します</div>
          </div>
          <div className="form-row">
            <label>獲得報酬額(合計・任意)</label>
            <input type="number" value={regForm.totalFee} onChange={(e) => setRegForm({ ...regForm, totalFee: e.target.value })} />
            <div className="mini" style={{ color: '#6b6167' }}>複数部屋を選択した場合、選択部屋数で均等に按分して登録します(端数は1件目に寄せます)</div>
          </div>
          <div className="form-row"><label>備考</label><input value={regForm.note} onChange={(e) => setRegForm({ ...regForm, note: e.target.value })} /></div>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button className="btn-primary" onClick={submitRegister} disabled={saving}>{saving ? '登録中...' : '登録'}</button>
            <button className="btn-secondary" onClick={() => setRegForm(null)}>キャンセル</button>
          </div>
        </div>
      )}

      {view === 'unregistered' ? (
        <div className="tablewrap">
        <table className="master-table">
          <thead>
            <tr><th>物件</th><th>部屋</th><th className="amount">現在の管理料</th><th></th></tr>
          </thead>
          <tbody>
            {unregisteredRooms.map((r) => (
              <tr key={r.id}>
                <td>{propertyName(r.propertyId)}</td>
                <td>{r.roomNumber}</td>
                <td className="amount">{yen(r.managementFee)}</td>
                <td>{canEdit && <button className="btn-secondary" onClick={() => startRegisterFromRoom(r)}>この部屋を登録</button>}</td>
              </tr>
            ))}
            {unregisteredRooms.length === 0 && (
              <tr><td colSpan={4} className="empty-row">未登録の部屋はありません</td></tr>
            )}
          </tbody>
        </table>
        </div>
      ) : (
        <div className="tablewrap">
        <table className="master-table">
          <thead>
            <tr>
              <th>物件</th><th>部屋</th><th>紹介元区分</th><th>紹介元店舗</th>
              <th>開始日</th><th>終了日</th>
              <th className="amount">月額基準額</th><th className="amount">3L取り分(月額)</th><th className="amount">グループ会社支払額(月額)</th>
              <th className="amount">決定報酬額</th><th>報酬計上</th><th>状態</th><th style={{ width: 150 }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredList.map((a) => {
              const lr = latestRate(a.id)
              const posted = postedSaleFor(a.id)
              return (
                <Fragment key={a.id}>
                  <tr>
                    <td>{propertyName(a.propertyId)}</td>
                    <td>{roomLabel(a.roomId)}</td>
                    <td>{a.acquisitionType}</td>
                    <td>{storeLabel(a.referralStoreId)}{a.referralPerson ? `(${a.referralPerson})` : ''}</td>
                    <td>{a.startDate}</td>
                    <td>{a.endDate}</td>
                    <td className="amount">{lr ? yen(lr.monthlyBaseAmount) : ''}</td>
                    <td className="amount">{lr ? yen(lr.threeLMonthlyAmount) : ''}</td>
                    <td className="amount">{lr ? yen(lr.groupMonthlyAmount) : ''}</td>
                    <td className="amount">{yen(a.acquisitionFee)}</td>
                    <td>
                      {posted ? (
                        <span className="status ok">計上済み({yen(posted.amount)})</span>
                      ) : a.acquisitionFee > 0 ? (
                        canEdit && <button className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => postFeeToSales(a)} disabled={saving}>報酬を売上計上</button>
                      ) : (
                        <span className="mini" style={{ color: '#6b6167' }}>未計上</span>
                      )}
                    </td>
                    <td>{a.endDate ? <span className="status bad">終了済み</span> : <span className="status ok">管理中</span>}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        {canEdit && isAdmin && !a.endDate && (
                          <button className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => startRateChange(a)}>月額を変更</button>
                        )}
                        {canEdit && !a.endDate && (
                          <button className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => startEnd(a)}>管理を終了する</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {rateForm && rateForm.acquisitionId === a.id && (
                    <tr>
                      <td colSpan={13} style={{ background: '#f8f6f3' }}>
                        <div className="master-form" style={{ margin: '8px 0' }}>
                          <h3>月額支払額の変更(この対象月以降に適用。過去月の金額は変わりません)</h3>
                          <div className="form-row">
                            <label>適用開始月</label>
                            <input type="month" min={rateForm.minEffectiveFrom} value={rateForm.effectiveFrom} onChange={(e) => setRateForm({ ...rateForm, effectiveFrom: e.target.value })} />
                          </div>
                          <div className="form-row"><label>新しい月額基準額</label><input type="number" value={rateForm.monthlyBaseAmount} onChange={(e) => setRateForm({ ...rateForm, monthlyBaseAmount: Number(e.target.value) })} /></div>
                          <div className="form-row"><label>3L取り分率(%)</label><input type="number" value={rateForm.threeLRatePercent} onChange={(e) => setRateForm({ ...rateForm, threeLRatePercent: Number(e.target.value) })} style={{ width: 100 }} /></div>
                          {error && <div className="form-error">{error}</div>}
                          <div className="form-actions">
                            <button className="btn-primary" onClick={submitRateChange} disabled={saving}>{saving ? '保存中...' : '変更を保存'}</button>
                            <button className="btn-secondary" onClick={() => setRateForm(null)}>キャンセル</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {endingId === a.id && (
                    <tr>
                      <td colSpan={13} style={{ background: '#f8f6f3' }}>
                        <div className="master-form" style={{ margin: '8px 0' }}>
                          <h3>この部屋の管理を終了しますか?</h3>
                          <div className="form-row"><label>終了日</label><input type="date" value={endDateInput} onChange={(e) => setEndDateInput(e.target.value)} /></div>
                          {error && <div className="form-error">{error}</div>}
                          <div className="form-actions">
                            <button className="btn-primary" onClick={() => submitEnd(a)} disabled={saving}>{saving ? '処理中...' : '終了する'}</button>
                            <button className="btn-secondary" onClick={() => setEndingId(null)}>キャンセル</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {filteredList.length === 0 && (
              <tr><td colSpan={13} className="empty-row">対象の管理獲得がありません</td></tr>
            )}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}
