import { useState } from 'react'
import { currentFiscalStartYear, fiscalYearLabel, fiscalMonths } from './lib/period'

// 案件(契約)ごとに、紐づく売上・経費をまとめて表示する画面。
// 「取引管理」の入力フォームで「案件(契約)」を選択して登録した売上・経費だけが対象。
// AD・付帯・契約手数料のように、オーナー分・仲介業者分・日割精算分などをまとめて
// 1つの案件として見られるようにする(sales・expensesテーブルはそのまま利用、二重管理はしない)。

function yen(n) {
  return '¥' + Math.round(n || 0).toLocaleString()
}

function periodYearOptions() {
  const cur = currentFiscalStartYear()
  const arr = []
  for (let y = cur; y >= cur - 4; y--) arr.push(y)
  return arr
}

export default function CaseProfitSection({ sales, expenses, allRecords }) {
  const [periodMode, setPeriodMode] = useState('all') // all | year
  const [periodYear, setPeriodYear] = useState(currentFiscalStartYear())
  const [search, setSearch] = useState('')

  const properties = allRecords.properties || []
  const rooms = allRecords.rooms || []
  const tenants = allRecords.tenants || [] // 契約+入居者名をまとめた一覧(App.jsxのloadAllで作成)

  const merged = [
    ...(sales || [])
      .filter((s) => s.contractId)
      .map((s) => ({
        id: `sale-${s.id}`, kind: 'sales', date: s.date, category: s.category,
        content: s.content, payee: '', amount: s.amount, contractId: s.contractId,
      })),
    ...(expenses || [])
      .filter((e) => e.contractId)
      .map((e) => ({
        id: `expense-${e.id}`, kind: 'expenses', date: e.date, category: e.category,
        content: e.content, payee: e.payee, amount: e.amount, contractId: e.contractId,
      })),
  ].filter((m) => periodMode === 'all' || fiscalMonths(periodYear).includes((m.date || '').slice(0, 7)))

  const byContract = {}
  merged.forEach((m) => {
    if (!byContract[m.contractId]) byContract[m.contractId] = []
    byContract[m.contractId].push(m)
  })

  let cases = Object.entries(byContract).map(([contractId, items]) => {
    const contract = tenants.find((t) => t.id === contractId)
    const room = rooms.find((r) => r.id === contract?.roomId)
    const property = properties.find((p) => p.id === room?.propertyId)
    const salesTotal = items.filter((m) => m.kind === 'sales').reduce((z, m) => z + m.amount, 0)
    const expensesTotal = items.filter((m) => m.kind === 'expenses').reduce((z, m) => z + m.amount, 0)
    const sortedItems = [...items].sort((a, b) => (a.date < b.date ? 1 : -1))
    return {
      contractId, contract, property, room, items: sortedItems,
      salesTotal, expensesTotal, subtotal: salesTotal - expensesTotal,
      latestDate: sortedItems[0]?.date || '',
    }
  })

  if (search) {
    const q = search.toLowerCase()
    cases = cases.filter((c) => {
      const text = `${c.property?.name || ''} ${c.room?.roomNumber || ''} ${c.contract?.name || ''} ${c.contract?.contractorName || ''}`.toLowerCase()
      return text.includes(q)
    })
  }

  cases.sort((a, b) => (a.latestDate < b.latestDate ? 1 : -1))

  const grandSales = cases.reduce((z, c) => z + c.salesTotal, 0)
  const grandExpenses = cases.reduce((z, c) => z + c.expensesTotal, 0)

  return (
    <div>
      <div className="mini" style={{ marginBottom: 12, color: '#6b6167' }}>
        「取引管理」の入力フォームで「案件(契約)」を選んで登録した売上・経費を、案件ごとにまとめて表示します。管理料のように毎月発生する取引で案件を選ばなかったものは、ここには表示されません。
      </div>

      <div className="cards">
        <div className="card"><div className="label">売上合計</div><div className="num">{yen(grandSales)}</div></div>
        <div className="card"><div className="label">経費合計</div><div className="num">{yen(grandExpenses)}</div></div>
        <div className="card"><div className="label">差引合計</div><div className="num">{yen(grandSales - grandExpenses)}</div></div>
        <div className="card"><div className="label">案件数</div><div className="num">{cases.length}件</div></div>
      </div>

      <div className="master-toolbar">
        <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value)}>
          <option value="all">全期間</option>
          <option value="year">期を指定</option>
        </select>
        {periodMode === 'year' && (
          <select value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value))}>
            {periodYearOptions().map((y) => <option key={y} value={y}>{fiscalYearLabel(y)}</option>)}
          </select>
        )}
        <input className="search-input" placeholder="物件・号室・氏名で検索..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {cases.map((c) => (
        <div key={c.contractId} className="master-form" style={{ marginBottom: 16 }}>
          <h3>
            {c.property?.name || '(物件不明)'} {c.room?.roomNumber || ''} — {c.contract?.name || c.contract?.contractorName || '(契約者不明)'}
            <span className="mini" style={{ color: '#6b6167', marginLeft: 8, fontWeight: 'normal' }}>
              {c.contract?.moveInDate || ''}〜{c.contract?.moveOutDate || '在籍中'}
            </span>
          </h3>
          <table className="master-table">
            <thead>
              <tr><th>日付</th><th>種別</th><th>勘定科目</th><th>内容</th><th className="amount">金額</th></tr>
            </thead>
            <tbody>
              {c.items.map((m) => (
                <tr key={m.id}>
                  <td>{m.date}</td>
                  <td><span className={m.kind === 'sales' ? 'status ok' : 'status bad'}>{m.kind === 'sales' ? '売上' : '経費'}</span></td>
                  <td>{m.category}</td>
                  <td>{m.content}{m.kind === 'expenses' && m.payee ? ` / ${m.payee}` : ''}</td>
                  <td className="amount">{m.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cards" style={{ marginTop: 8 }}>
            <div className="card"><div className="label">売上合計</div><div className="num">{yen(c.salesTotal)}</div></div>
            <div className="card"><div className="label">経費合計</div><div className="num">{yen(c.expensesTotal)}</div></div>
            <div className="card"><div className="label">差引小計</div><div className="num">{yen(c.subtotal)}</div></div>
          </div>
        </div>
      ))}
      {cases.length === 0 && <div className="mini" style={{ color: '#6b6167' }}>表示できる案件がありません</div>}
    </div>
  )
}
