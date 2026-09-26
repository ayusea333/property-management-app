import { useState } from 'react'
import { currentFiscalStartYear, fiscalYearLabel, fiscalMonths } from './lib/period'

// 売上・経費を1つの画面で横断的に確認するための表示専用タブ。
// 登録・編集・削除は行わない(従来通り「売上」「経費」の各画面で行う)。
// sales・expenses テーブルはそのまま利用し、新しいデータの持ち場は作らない。

function yen(n) {
  return '¥' + Math.round(n || 0).toLocaleString()
}

function periodYearOptions() {
  const cur = currentFiscalStartYear()
  const arr = []
  for (let y = cur; y >= cur - 4; y--) arr.push(y)
  return arr
}

function inPeriod(dateStr, year, month) {
  if (!dateStr) return false
  const m = dateStr.slice(0, 7)
  if (month === 'all') return fiscalMonths(year).includes(m)
  return m === month
}

export default function TransactionsSection({ sales, expenses, allRecords }) {
  const [periodYear, setPeriodYear] = useState(currentFiscalStartYear())
  const [periodMonth, setPeriodMonth] = useState('all')
  const [kind, setKind] = useState('all') // all | sales | expenses
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')

  const properties = allRecords.properties || []
  const rooms = allRecords.rooms || []
  const propertyName = (id) => properties.find((p) => p.id === id)?.name || ''
  const roomLabel = (id) => rooms.find((r) => r.id === id)?.roomNumber || ''

  const months = fiscalMonths(periodYear)

  const merged = [
    ...(sales || []).map((s) => ({
      id: `sale-${s.id}`,
      kind: 'sales',
      date: s.date,
      category: s.category,
      propertyId: s.propertyId,
      roomId: s.roomId,
      content: s.content,
      amount: s.amount,
    })),
    ...(expenses || []).map((e) => ({
      id: `expense-${e.id}`,
      kind: 'expenses',
      date: e.date,
      category: e.category,
      propertyId: e.propertyId,
      roomId: e.roomId,
      content: e.content,
      amount: e.amount,
    })),
  ]

  const categories = Array.from(new Set(merged.map((m) => m.category).filter(Boolean))).sort()

  const filtered = merged
    .filter((m) => inPeriod(m.date, periodYear, periodMonth))
    .filter((m) => kind === 'all' || m.kind === kind)
    .filter((m) => !categoryFilter || m.category === categoryFilter)
    .filter((m) => {
      if (!search) return true
      const text = `${propertyName(m.propertyId)} ${m.content} ${m.category}`.toLowerCase()
      return text.includes(search.toLowerCase())
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  const totalSales = filtered.filter((m) => m.kind === 'sales').reduce((z, m) => z + m.amount, 0)
  const totalExpenses = filtered.filter((m) => m.kind === 'expenses').reduce((z, m) => z + m.amount, 0)
  const net = totalSales - totalExpenses

  return (
    <div className="panel">
      <h2>取引管理(売上・経費 横断表示)</h2>
      <p className="mini" style={{ color: '#6b7280', marginTop: -6, marginBottom: 12 }}>
        売上・経費を1つの画面で確認できる一覧です。登録・修正・削除は従来通り「売上」「経費」の各画面で行ってください(この画面はまとめて見るための表示専用です)。
      </p>

      <div className="cards">
        <div className="card">
          <div className="label">売上合計</div>
          <div className="num">{yen(totalSales)}</div>
        </div>
        <div className="card">
          <div className="label">経費合計</div>
          <div className="num">{yen(totalExpenses)}</div>
        </div>
        <div className="card">
          <div className="label">差引(売上−経費)</div>
          <div className="num">{yen(net)}</div>
        </div>
        <div className="card">
          <div className="label">件数</div>
          <div className="num">{filtered.length}件</div>
        </div>
      </div>

      <div className="master-toolbar">
        <select value={periodYear} onChange={(e) => { setPeriodYear(Number(e.target.value)); setPeriodMonth('all') }}>
          {periodYearOptions().map((y) => <option key={y} value={y}>{fiscalYearLabel(y)}</option>)}
        </select>
        <select value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)}>
          <option value="all">期全体</option>
          {months.map((m) => <option key={m} value={m}>{Number(m.slice(5))}月</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">すべて</option>
          <option value="sales">売上のみ</option>
          <option value="expenses">経費のみ</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">勘定科目(すべて)</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          className="search-input"
          placeholder="物件名・内容・科目で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <table className="master-table">
        <thead>
          <tr>
            <th>日付</th>
            <th>種別</th>
            <th>勘定科目</th>
            <th>物件</th>
            <th>号室</th>
            <th>内容</th>
            <th className="amount">金額</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((m) => (
            <tr key={m.id}>
              <td>{m.date}</td>
              <td>
                <span className={m.kind === 'sales' ? 'status ok' : 'status bad'}>
                  {m.kind === 'sales' ? '売上' : '経費'}
                </span>
              </td>
              <td>{m.category}</td>
              <td>{propertyName(m.propertyId)}</td>
              <td>{roomLabel(m.roomId)}</td>
              <td>{m.content}</td>
              <td className="amount">{m.kind === 'sales' ? yen(m.amount) : '−' + yen(m.amount)}</td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={7} className="empty-row">データがありません</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
