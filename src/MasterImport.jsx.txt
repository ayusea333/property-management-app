import { useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { downloadCsv, parseCsv } from './lib/csv'
import {
  ownerToRow, propertyToRow, roomToRow, residentToRow, contractToRow, CONTRACTOR_TYPES,
} from './lib/masters'
import { trustFundToRow } from './lib/trustFunds'
import { rentPaymentToRow } from './lib/rentPayments'
import { logEdit } from './lib/editLog'

// CSVインポート用: "2026/9/1" 「2026-09-01」などをYYYY-MM-DDに正規化する。読めない場合は空文字。
function normalizeDate(s) {
  const m = String(s || '').trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (!m) return ''
  const [, y, mo, d] = m
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// CSVインポート用: "2026/9" "2026-09" などをYYYY-MMに正規化する。読めない場合は空文字。
function normalizeMonth(s) {
  const m = String(s || '').trim().match(/^(\d{4})[/-](\d{1,2})/)
  if (!m) return ''
  const [, y, mo] = m
  return `${y}-${String(mo).padStart(2, '0')}`
}

function parseAmountCell(s) {
  const cleaned = String(s || '').trim().replace(/[¥,円\s]/g, '')
  return cleaned === '' ? NaN : Number(cleaned)
}

function parseBoolCell(s) {
  return /^(あり|有|○|1|true|yes)$/i.test(String(s || '').trim())
}

const MASTER_HEADERS = ['オーナー名', '物件名', '物件住所', '号室', '契約者名', '契約者区分', '家賃', '共益費', '駐車場代', '保証会社', '口座振替', '契約開始日', '敷金', '備考']
const PAYMENT_HEADERS = ['物件名', '号室', '契約者名', '対象月', '入金日', '金額', '備考']

// ---- 物件・部屋・オーナー・契約者 一括CSV取込 ----

function MasterCsvImportPanel({ allRecords, onChanged, canEdit, user }) {
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const fileInputRef = useRef(null)

  const owners = allRecords.owners || []
  const properties = allRecords.properties || []
  const rooms = allRecords.rooms || []
  const residents = allRecords.residents || []
  const contracts = allRecords.contracts || []
  const feeItems = allRecords.feeItems || []

  const ownerName = (id) => owners.find((o) => o.id === id)?.name || ''
  const residentName = (id) => residents.find((r) => r.id === id)?.name || ''

  const downloadTemplate = () => {
    const rows = rooms.map((room) => {
      const property = properties.find((p) => p.id === room.propertyId)
      const contract = contracts.find((c) => c.roomId === room.id && !c.moveOutDate)
      const parkingItem = feeItems.find((f) => f.name === '駐車場代')
      const parkingAmount = parkingItem ? room.extraFees?.[parkingItem.id]?.amount || '' : ''
      return [
        property ? ownerName(property.ownerId) : '',
        property?.name || '',
        property?.address || '',
        room.roomNumber,
        contract ? residentName(contract.residentId) : '',
        contract?.contractorType || '',
        room.rent || '',
        room.commonFee || '',
        parkingAmount,
        contract?.guarantor || '',
        contract?.debit ? 'あり' : '',
        contract?.moveInDate || '',
        '',
        room.note || '',
      ]
    })
    downloadCsv('物件・部屋・オーナー・契約者.csv', MASTER_HEADERS, rows)
  }

  const openImport = () => fileInputRef.current?.click()

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    setResult(null)
    try {
      const text = await file.text()
      const csvRows = parseCsv(text)
      if (csvRows.length < 2) {
        setResult({ ok: 0, errors: ['データ行が見つかりません。1行目に見出し、2行目以降にデータを入れてください。'] })
        return
      }
      const header = csvRows[0].map((h) => h.trim())
      const col = (name) => header.indexOf(name)
      const idx = {
        owner: col('オーナー名'), property: col('物件名'), address: col('物件住所'),
        room: col('号室'), resident: col('契約者名'), contractorType: col('契約者区分'),
        rent: col('家賃'), commonFee: col('共益費'), parking: col('駐車場代'),
        guarantor: col('保証会社'), debit: col('口座振替'), moveIn: col('契約開始日'),
        deposit: col('敷金'), note: col('備考'),
      }
      if (idx.owner === -1 || idx.property === -1 || idx.room === -1) {
        setResult({ ok: 0, errors: ['見出し行に「オーナー名」「物件名」「号室」の列が見つかりません。「CSVダウンロード」した形式のまま編集してください。'] })
        return
      }

      const errors = []
      const parsedRows = []
      csvRows.slice(1).forEach((r, i) => {
        const lineNo = i + 2
        const propertyNameVal = (r[idx.property] || '').trim()
        const roomNumber = (r[idx.room] || '').trim()
        if (!propertyNameVal && !roomNumber) return // 空行はスキップ
        const ownerNameVal = (r[idx.owner] || '').trim()
        if (!propertyNameVal) { errors.push(`${lineNo}行目: 物件名が空です`); return }
        if (!roomNumber) { errors.push(`${lineNo}行目: 号室が空です`); return }
        if (!ownerNameVal) { errors.push(`${lineNo}行目: オーナー名が空です`); return }
        parsedRows.push({
          lineNo,
          ownerName: ownerNameVal,
          propertyName: propertyNameVal,
          roomNumber,
          address: idx.address > -1 ? (r[idx.address] || '').trim() : '',
          residentName: idx.resident > -1 ? (r[idx.resident] || '').trim() : '',
          contractorType: idx.contractorType > -1 ? (r[idx.contractorType] || '').trim() : '',
          rent: idx.rent > -1 ? parseAmountCell(r[idx.rent]) : NaN,
          commonFee: idx.commonFee > -1 ? parseAmountCell(r[idx.commonFee]) : NaN,
          parking: idx.parking > -1 ? parseAmountCell(r[idx.parking]) : NaN,
          guarantor: idx.guarantor > -1 ? (r[idx.guarantor] || '').trim() : '',
          debit: idx.debit > -1 ? parseBoolCell(r[idx.debit]) : false,
          moveIn: idx.moveIn > -1 ? normalizeDate(r[idx.moveIn] || '') : '',
          deposit: idx.deposit > -1 ? parseAmountCell(r[idx.deposit]) : NaN,
          note: idx.note > -1 ? (r[idx.note] || '').trim() : '',
        })
      })

      if (!parsedRows.length) {
        setResult({ ok: 0, errors: errors.length ? errors : ['取り込めるデータ行がありませんでした。'] })
        return
      }

      // ---- 1) オーナー: 名前が一致するものが無ければ新規作成 ----
      const ownersByName = new Map(owners.map((o) => [o.name, o.id]))
      const ownerNamesNeeded = [...new Set(parsedRows.map((r) => r.ownerName))].filter((n) => !ownersByName.has(n))
      if (ownerNamesNeeded.length) {
        const { data, error } = await supabase.from('owners').insert(ownerNamesNeeded.map((name) => ownerToRow({ name }))).select('id,name')
        if (error) throw error
        data.forEach((o) => ownersByName.set(o.name, o.id))
      }

      // ---- 2) 物件: 名前が一致するものが無ければ新規作成 ----
      const propertiesByName = new Map(properties.map((p) => [p.name, p.id]))
      const propNamesNeeded = [...new Set(parsedRows.map((r) => r.propertyName))].filter((n) => !propertiesByName.has(n))
      if (propNamesNeeded.length) {
        const rowsToInsert = propNamesNeeded.map((name) => {
          const src = parsedRows.find((r) => r.propertyName === name)
          return propertyToRow({ name, address: src.address, ownerId: ownersByName.get(src.ownerName) })
        })
        const { data, error } = await supabase.from('properties').insert(rowsToInsert).select('id,name')
        if (error) throw error
        data.forEach((p) => propertiesByName.set(p.name, p.id))
      }

      // ---- 3) 部屋: 物件+号室が一致するものが無ければ新規作成、あれば内容を更新 ----
      // (同じ部屋がCSV内に複数行出てくる場合(年内の入居者入れ替わりなど)は、
      //  部屋としては1件にまとめ、家賃などは最後に出てきた行の内容を使う)
      const parkingItem = feeItems.find((f) => f.name === '駐車場代')
      const roomsByKey = new Map(rooms.map((r) => [`${r.propertyId}|${r.roomNumber}`, r]))
      const roomPlanByKey = new Map()
      parsedRows.forEach((row) => {
        const propertyId = propertiesByName.get(row.propertyName)
        const key = `${propertyId}|${row.roomNumber}`
        const existing = roomsByKey.get(key)
        const rent = Number.isNaN(row.rent) ? (roomPlanByKey.get(key)?.rent ?? existing?.rent ?? 0) : row.rent
        const commonFee = Number.isNaN(row.commonFee) ? (roomPlanByKey.get(key)?.commonFee ?? existing?.commonFee ?? 0) : row.commonFee
        const extraFees = { ...(roomPlanByKey.get(key)?.extraFees || existing?.extraFees || {}) }
        if (parkingItem && !Number.isNaN(row.parking) && row.parking > 0) {
          extraFees[parkingItem.id] = { amount: row.parking, billingType: '月払い' }
        }
        roomPlanByKey.set(key, { propertyId, roomNumber: row.roomNumber, rent, commonFee, extraFees, existingId: existing?.id })
      })
      const roomsToInsert = [...roomPlanByKey.values()].filter((x) => !x.existingId)
      const roomUpdateOps = [...roomPlanByKey.values()].filter((x) => x.existingId).map((x) => ({ id: x.existingId, rent: x.rent, commonFee: x.commonFee, extraFees: x.extraFees }))
      if (roomsToInsert.length) {
        const { data, error } = await supabase.from('rooms').insert(
          roomsToInsert.map((x) => roomToRow({ propertyId: x.propertyId, roomNumber: x.roomNumber, rent: x.rent, commonFee: x.commonFee, extraFees: x.extraFees }))
        ).select('id,property_id,room_number')
        if (error) throw error
        data.forEach((r) => roomsByKey.set(`${r.property_id}|${r.room_number}`, { id: r.id, propertyId: r.property_id, roomNumber: r.room_number }))
      }
      if (roomUpdateOps.length) {
        await Promise.all(roomUpdateOps.map((x) =>
          supabase.from('rooms').update({ rent: x.rent, common_fee: x.commonFee, extra_fees: x.extraFees }).eq('id', x.id)
        ))
      }

      // ---- 4) 入居者: 契約者名がある行だけ対象。名前が一致するものが無ければ新規作成 ----
      const residentRows = parsedRows.filter((r) => r.residentName && r.residentName !== '空室')
      const residentsByName = new Map(residents.map((r) => [r.name, r.id]))
      const residentNamesNeeded = [...new Set(residentRows.map((r) => r.residentName))].filter((n) => !residentsByName.has(n))
      if (residentNamesNeeded.length) {
        const { data, error } = await supabase.from('residents').insert(residentNamesNeeded.map((name) => residentToRow({ name }))).select('id,name')
        if (error) throw error
        data.forEach((x) => residentsByName.set(x.name, x.id))
      }

      // ---- 5) 契約: 部屋+入居者が一致するものが無ければ新規作成、あれば内容を更新 ----
      const contractsByRoomResident = new Map(contracts.map((c) => [`${c.roomId}|${c.residentId}`, c]))
      const contractsToInsert = []
      const contractUpdateOps = []
      residentRows.forEach((row) => {
        const propertyId = propertiesByName.get(row.propertyName)
        const roomRef = roomsByKey.get(`${propertyId}|${row.roomNumber}`)
        const residentId = residentsByName.get(row.residentName)
        if (!roomRef?.id || !residentId) { errors.push(`${row.lineNo}行目: 部屋または契約者の紐付けに失敗しました`); return }
        const key = `${roomRef.id}|${residentId}`
        const existing = contractsByRoomResident.get(key)
        const patch = contractToRow({
          residentId,
          roomId: roomRef.id,
          contractorType: CONTRACTOR_TYPES.includes(row.contractorType) ? row.contractorType : '個人',
          guarantor: row.guarantor,
          debit: row.debit,
          moveInDate: row.moveIn,
          note: row.note,
        })
        if (existing) contractUpdateOps.push({ id: existing.id, patch })
        else contractsToInsert.push({ patch, row, roomId: roomRef.id, residentId })
      })
      if (contractsToInsert.length) {
        const { data, error } = await supabase.from('contracts').insert(contractsToInsert.map((x) => x.patch)).select('id,room_id,resident_id')
        if (error) throw error
        data.forEach((c) => contractsByRoomResident.set(`${c.room_id}|${c.resident_id}`, { id: c.id, roomId: c.room_id, residentId: c.resident_id }))
      }
      if (contractUpdateOps.length) {
        await Promise.all(contractUpdateOps.map((op) => supabase.from('contracts').update(op.patch).eq('id', op.id)))
      }

      // ---- 6) 敷金: 金額が入っている行だけ、預り金・立替金として記録 ----
      const depositRows = parsedRows.filter((r) => !Number.isNaN(r.deposit) && r.deposit > 0)
      if (depositRows.length) {
        const rowsToInsert = depositRows.map((row) => {
          const propertyId = propertiesByName.get(row.propertyName)
          const roomRef = roomsByKey.get(`${propertyId}|${row.roomNumber}`)
          return trustFundToRow({
            type: '敷金',
            direction: '預り金',
            ownerId: ownersByName.get(row.ownerName),
            roomId: roomRef?.id,
            amount: row.deposit,
            occurredDate: row.moveIn || new Date().toISOString().slice(0, 10),
            status: '保管中',
            note: `${row.residentName || ''}様 敷金(CSV取込)`,
          })
        })
        const { error } = await supabase.from('trust_funds').insert(rowsToInsert)
        if (error) throw error
      }

      await onChanged()
      await logEdit({
        user,
        tableLabel: '物件・部屋・オーナー・契約者',
        action: '追加',
        summary: `CSVインポートで${parsedRows.length}行を取り込み`,
      })
      setResult({ ok: parsedRows.length, errors })
    } catch (e) {
      setResult({ ok: 0, errors: ['インポートに失敗しました: ' + e.message] })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="master-form">
      <h3>物件・部屋・オーナー・契約者を一括取込</h3>
      <p className="mini" style={{ color: '#6b6167', marginBottom: 10 }}>
        1行が「1部屋(契約者がいなければ空室)」に対応するCSVです。オーナー名・物件名・号室は、既に登録済みの表記と同じ名前であれば同じものとして扱われ、無ければ自動的に新しく登録されます(契約者名も同様です)。「敷金」に金額を入れると「預り金・立替金」にも自動で記録されます。
      </p>
      <div className="form-actions" style={{ marginBottom: 10 }}>
        <button className="btn-secondary" onClick={downloadTemplate}>CSVダウンロード(現在の登録内容)</button>
        {canEdit && (
          <>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportFile} />
            <button className="btn-secondary" onClick={openImport} disabled={importing}>{importing ? 'インポート中...' : 'CSVインポート'}</button>
          </>
        )}
      </div>
      {result && (
        <div className={result.errors.length ? 'form-error' : 'mini'} style={{ whiteSpace: 'pre-line', color: result.errors.length ? undefined : '#6b6167' }}>
          {result.ok > 0 && `${result.ok}行を取り込みました。\n`}
          {result.errors.length > 0 && `以下は取り込めませんでした:\n${result.errors.join('\n')}`}
        </div>
      )}
    </div>
  )
}

// ---- 家賃入金実績 CSV取込 ----

function RentPaymentCsvImportPanel({ allRecords, onChanged, canEdit, user }) {
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const fileInputRef = useRef(null)

  const properties = allRecords.properties || []
  const rooms = allRecords.rooms || []
  const residents = allRecords.residents || []
  const contracts = allRecords.contracts || []

  const downloadTemplate = () => {
    downloadCsv('家賃入金実績.csv', PAYMENT_HEADERS, [
      ['(例)〇〇マンション', '101', '山田太郎', '2026-09', '2026-08-30', '85000', ''],
    ])
  }

  const openImport = () => fileInputRef.current?.click()

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    setResult(null)
    try {
      const text = await file.text()
      const csvRows = parseCsv(text)
      if (csvRows.length < 2) {
        setResult({ ok: 0, skipped: 0, errors: ['データ行が見つかりません。1行目に見出し、2行目以降にデータを入れてください。'] })
        return
      }
      const header = csvRows[0].map((h) => h.trim())
      const col = (name) => header.indexOf(name)
      const idx = {
        property: col('物件名'), room: col('号室'), resident: col('契約者名'),
        targetMonth: col('対象月'), paymentDate: col('入金日'), amount: col('金額'), note: col('備考'),
      }
      if (idx.property === -1 || idx.room === -1 || idx.targetMonth === -1) {
        setResult({ ok: 0, skipped: 0, errors: ['見出し行に「物件名」「号室」「対象月」の列が見つかりません。「CSVダウンロード」した形式のまま編集してください。'] })
        return
      }

      // 部屋+契約者名 から 契約(contracts)のIDを引くための対応表を作る
      const roomByKey = new Map(rooms.map((r) => {
        const p = properties.find((x) => x.id === r.propertyId)
        return [`${p?.name || ''}|${r.roomNumber}`, r]
      }))
      const contractByRoomAndName = new Map()
      contracts.forEach((c) => {
        const rName = residents.find((r) => r.id === c.residentId)?.name || ''
        if (rName) contractByRoomAndName.set(`${c.roomId}|${rName}`, c)
        if (c.contractorName) contractByRoomAndName.set(`${c.roomId}|${c.contractorName}`, c)
      })

      const toUpsert = []
      const errors = []
      let skipped = 0
      csvRows.slice(1).forEach((r, i) => {
        const lineNo = i + 2
        const propertyNameVal = (r[idx.property] || '').trim()
        const roomNumber = (r[idx.room] || '').trim()
        if (!propertyNameVal && !roomNumber) return // 空行スキップ
        const residentNameVal = idx.resident > -1 ? (r[idx.resident] || '').trim() : ''
        const targetMonth = normalizeMonth(r[idx.targetMonth] || '')
        const paymentDate = idx.paymentDate > -1 ? normalizeDate(r[idx.paymentDate] || '') : ''
        const amount = idx.amount > -1 ? parseAmountCell(r[idx.amount]) : NaN
        const note = idx.note > -1 ? (r[idx.note] || '').trim() : ''

        if (!targetMonth) { errors.push(`${lineNo}行目: 対象月が読み取れません(${r[idx.targetMonth] || ''})`); return }
        const room = roomByKey.get(`${propertyNameVal}|${roomNumber}`)
        if (!room) { errors.push(`${lineNo}行目: 物件「${propertyNameVal}」号室「${roomNumber}」が見つかりません(先に物件・部屋の取込を行ってください)`); return }
        const contract = contractByRoomAndName.get(`${room.id}|${residentNameVal}`)
        if (!contract) { errors.push(`${lineNo}行目: 契約者「${residentNameVal}」がこの部屋の契約として見つかりません`); return }

        if (!paymentDate) {
          // 入金日が不明な行は記録できないため、要確認としてスキップする(備考メモとしては残らないため、元のCSV側で管理してください)
          skipped++
          return
        }

        toUpsert.push(rentPaymentToRow({
          tenantId: contract.id,
          targetMonth,
          paymentDate,
          amount: Number.isNaN(amount) ? null : amount,
          note,
          source: 'manual',
        }))
      })

      // 同じ契約者+対象月の行がCSV内に複数あると、1回のupsertの中で同じ行を
      // 二重に更新しようとしてエラーになるため、先に1件にまとめる(後の行を優先)
      let duplicateCount = 0
      const dedupedMap = new Map()
      toUpsert.forEach((row) => {
        const key = `${row.tenant_id}|${row.target_month}`
        if (dedupedMap.has(key)) duplicateCount++
        dedupedMap.set(key, row)
      })
      const dedupedUpsert = [...dedupedMap.values()]

      if (dedupedUpsert.length) {
        const chunkSize = 200
        for (let i = 0; i < dedupedUpsert.length; i += chunkSize) {
          const { error: err } = await supabase.from('rent_payments').upsert(dedupedUpsert.slice(i, i + chunkSize), { onConflict: 'tenant_id,target_month' })
          if (err) throw err
        }
        await onChanged()
        await logEdit({ user, tableLabel: '家賃入金', action: '追加', summary: `CSVインポートで${dedupedUpsert.length}件を取り込み` })
      }
      if (duplicateCount > 0) {
        errors.push(`同じ契約者・同じ対象月の行が${duplicateCount}件重複していたため、後の行を優先してまとめました。`)
      }
      setResult({ ok: dedupedUpsert.length, skipped, errors })
    } catch (e) {
      setResult({ ok: 0, skipped: 0, errors: ['インポートに失敗しました: ' + e.message] })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="master-form" style={{ marginTop: 16 }}>
      <h3>家賃入金実績を一括取込</h3>
      <p className="mini" style={{ color: '#6b6167', marginBottom: 10 }}>
        1行が「1件の入金記録」です。物件名・号室・契約者名から、既に登録されている契約を探して記録します(先に上の「物件・部屋・オーナー・契約者」の取込を済ませてください)。「入金日」が空欄の行は、入金の有無が確定していないとみなして取り込まず、件数だけ表示します。
      </p>
      <div className="form-actions" style={{ marginBottom: 10 }}>
        <button className="btn-secondary" onClick={downloadTemplate}>CSVダウンロード(見本)</button>
        {canEdit && (
          <>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportFile} />
            <button className="btn-secondary" onClick={openImport} disabled={importing}>{importing ? 'インポート中...' : 'CSVインポート'}</button>
          </>
        )}
      </div>
      {result && (
        <div className={result.errors.length ? 'form-error' : 'mini'} style={{ whiteSpace: 'pre-line', color: result.errors.length ? undefined : '#6b6167' }}>
          {result.ok > 0 && `${result.ok}件を取り込みました。\n`}
          {result.skipped > 0 && `${result.skipped}件は入金日が空欄のためスキップしました。\n`}
          {result.errors.length > 0 && `以下は取り込めませんでした:\n${result.errors.join('\n')}`}
        </div>
      )}
    </div>
  )
}

export default function MasterImportPanel({ allRecords, onChanged, canEditMaster, canEditRentPayments, user }) {
  return (
    <div>
      <MasterCsvImportPanel allRecords={allRecords} onChanged={onChanged} canEdit={canEditMaster} user={user} />
      <RentPaymentCsvImportPanel allRecords={allRecords} onChanged={onChanged} canEdit={canEditRentPayments} user={user} />
    </div>
  )
}
