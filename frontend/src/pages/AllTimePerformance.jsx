import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

const API_BASE = 'http://localhost:8765/api'

export default function AllTimePerformance() {
  const [filterTicker, setFilterTicker] = useState('')
  const [sortBy, setSortBy] = useState('realized_pnl')
  const [sortOrder, setSortOrder] = useState('desc')

  const { data: report = [], isLoading, error } = useQuery({
    queryKey: ['consolidated'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/report/consolidated?broker=robinhood`)
      if (!res.ok) throw new Error('Failed to load performance data')
      return res.json().then(d => d.report || [])
    },
  })

  const formatCurrency = (val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(num)
  }

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const filteredReport = report.filter(r =>
    !filterTicker || r.ticker.toUpperCase().includes(filterTicker.toUpperCase())
  )

  const sortedReport = [...filteredReport].sort((a, b) => {
    let aVal = a[sortBy]
    let bVal = b[sortBy]

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase()
      bVal = bVal.toLowerCase()
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const SortableHeader = ({ field, label }) => (
    <th
      onClick={() => handleSort(field)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        backgroundColor: sortBy === field ? '#f0f0f0' : 'transparent',
      }}
    >
      {label} {sortBy === field && (sortOrder === 'asc' ? '↑' : '↓')}
    </th>
  )

  return (
    <div>
      <h2>All-Time Performance</h2>

      {error && <div className="error">{error.message}</div>}
      {isLoading && <div className="loading">Loading...</div>}

      {!isLoading && report.length > 0 && (
        <>
          <input
            type="text"
            placeholder="Filter by ticker..."
            value={filterTicker}
            onChange={(e) => setFilterTicker(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
              marginBottom: '1rem',
              width: '200px',
            }}
          />
          <table>
            <thead>
              <tr>
                <SortableHeader field="ticker" label="Ticker" />
                <SortableHeader field="shares_bought" label="Bought" />
                <SortableHeader field="shares_sold" label="Sold" />
                <SortableHeader field="shares_held" label="Held" />
                <SortableHeader field="total_spent" label="Spent" />
                <SortableHeader field="total_received" label="Received" />
                <SortableHeader field="dividends" label="Dividends" />
                <SortableHeader field="realized_pnl" label="P&L" />
              </tr>
            </thead>
            <tbody>
              {sortedReport.map((r) => (
                <tr key={r.ticker}>
                  <td><strong>{r.ticker}</strong></td>
                  <td>{parseFloat(r.shares_bought).toFixed(4)}</td>
                  <td>{parseFloat(r.shares_sold).toFixed(4)}</td>
                  <td>{parseFloat(r.shares_held).toFixed(4)}</td>
                  <td>{formatCurrency(r.total_spent)}</td>
                  <td>{formatCurrency(r.total_received)}</td>
                  <td>{formatCurrency(r.dividends)}</td>
                  <td style={{
                    fontWeight: 'bold',
                    color: r.realized_pnl >= 0 ? '#27ae60' : '#e74c3c'
                  }}>
                    {formatCurrency(r.realized_pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!isLoading && report.length === 0 && (
        <p style={{ textAlign: 'center', color: '#7f8c8d', marginTop: '2rem' }}>No data available. Upload a CSV to get started.</p>
      )}
    </div>
  )
}
