import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

const API_BASE = 'http://localhost:8765/api'

export default function ConsolidatedReport() {
  const [activeTab, setActiveTab] = useState('holdings')
  const [filterTicker, setFilterTicker] = useState('')
  const [sortBy, setSortBy] = useState('shares_held')
  const [sortOrder, setSortOrder] = useState('desc')

  const { data, isLoading, error } = useQuery({
    queryKey: ['consolidated'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/report/consolidated?broker=robinhood`)
      if (!res.ok) throw new Error('Failed to load report')
      return res.json()
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

  const holdings = data?.holdings || []
  const report = data?.report || []

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const filteredHoldings = holdings.filter(h =>
    !filterTicker || h.ticker.toUpperCase().includes(filterTicker.toUpperCase())
  )

  const sortedHoldings = [...filteredHoldings].sort((a, b) => {
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
      <h2>Consolidated Report</h2>

      {error && <div className="error">{error.message}</div>}
      {isLoading && <div className="loading">Loading...</div>}

      {!isLoading && (report.length > 0 || holdings.length > 0) && (
        <>
          <div style={{ borderBottom: '1px solid #ddd', marginBottom: '1.5rem' }}>
            <button
              onClick={() => setActiveTab('holdings')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1rem',
                backgroundColor: activeTab === 'holdings' ? '#3498db' : '#f5f5f5',
                color: activeTab === 'holdings' ? 'white' : '#7f8c8d',
                fontWeight: activeTab === 'holdings' ? 'bold' : 'normal',
                borderRadius: '4px 4px 0 0',
                marginRight: '0.5rem',
              }}
            >
              Current Holdings
            </button>
            <button
              onClick={() => setActiveTab('performance')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1rem',
                backgroundColor: activeTab === 'performance' ? '#3498db' : '#f5f5f5',
                color: activeTab === 'performance' ? 'white' : '#7f8c8d',
                fontWeight: activeTab === 'performance' ? 'bold' : 'normal',
                borderRadius: '4px 4px 0 0',
              }}
            >
              All-Time Performance
            </button>
          </div>

          {activeTab === 'holdings' && holdings.length > 0 && (
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
                    <SortableHeader field="shares_held" label="Shares Held" />
                    <SortableHeader field="avg_cost" label="Avg Cost" />
                  </tr>
                </thead>
                <tbody>
                  {sortedHoldings.map((h) => (
                    <tr key={h.ticker}>
                      <td><strong>{h.ticker}</strong></td>
                      <td>{parseFloat(h.shares_held).toFixed(4)}</td>
                      <td>{formatCurrency(h.avg_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {activeTab === 'performance' && report.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Bought</th>
                  <th>Sold</th>
                  <th>Held</th>
                  <th>Spent</th>
                  <th>Received</th>
                  <th>Dividends</th>
                  <th>P&L</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => (
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
          )}
        </>
      )}

      {!isLoading && report.length === 0 && holdings.length === 0 && (
        <p style={{ textAlign: 'center', color: '#7f8c8d', marginTop: '2rem' }}>No data available. Upload a CSV to get started.</p>
      )}
    </div>
  )
}
