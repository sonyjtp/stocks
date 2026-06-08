import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'

export default function AllTimePerformance() {
  const navigate = useNavigate()
  const location = useLocation()

  const [filterTicker, setFilterTicker] = useState(location.state?.filterTicker || '')
  const [sortBy, setSortBy] = useState(location.state?.sortBy || 'realized_pnl')
  const [sortOrder, setSortOrder] = useState(location.state?.sortOrder || 'desc')

  const { data: report = [], isLoading, error } = useQuery({
    queryKey: ['consolidated'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/report/consolidated?broker=robinhood`)
      if (!res.ok) throw new Error('Failed to load performance data')
      return res.json().then(d => d.report || [])
    },
  })

  const { data: prices = {} } = useQuery({
    queryKey: ['prices', report.map(r => r.ticker).join(',')],
    queryFn: async () => {
      if (report.length === 0) return {}
      const tickers = report.map(r => r.ticker).join(',')
      const res = await fetch(`${API_BASE}/prices?tickers=${tickers}`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: report.length > 0,
  })

  const pricesLoaded = report.length > 0 && Object.keys(prices).length > 0

  const getRealizedPnl = (r) => r.realized_pnl

  // Net P&L = realized + unrealized.
  // Active stocks with held shares: add (current_price * shares_held - cost_basis_held).
  // Delisted stocks with held shares: unrealized = -cost_basis_held (written off to zero).
  // When prices haven't loaded yet, fall back to realized only.
  const getNetPnl = (r) => {
    const sharesHeld = parseFloat(r.shares_held)
    const costBasisHeld = r.cost_basis_held ?? sharesHeld * parseFloat(r.avg_cost)
    if (!pricesLoaded || sharesHeld <= 0.00005) return r.realized_pnl
    const currentPrice = prices[r.ticker]
    if (!currentPrice) return r.realized_pnl - costBasisHeld  // delisted: full write-off
    return r.realized_pnl + (currentPrice * sharesHeld - costBasisHeld)
  }

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
    let aVal = sortBy === 'realized_pnl' ? getRealizedPnl(a) : sortBy === 'net_pnl' ? getNetPnl(a) : a[sortBy]
    let bVal = sortBy === 'realized_pnl' ? getRealizedPnl(b) : sortBy === 'net_pnl' ? getNetPnl(b) : b[sortBy]

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
      {isLoading && <Spinner />}

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
          <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', border: '1px solid #ddd', borderRadius: '6px' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <SortableHeader field="ticker" label="Ticker" />
                <SortableHeader field="shares_bought" label="Bought" />
                <SortableHeader field="shares_sold" label="Sold" />
                <SortableHeader field="shares_held" label="Held" />
                <SortableHeader field="total_spent" label="Spent" />
                <SortableHeader field="total_received" label="Received" />
                <SortableHeader field="dividends" label="Dividends" />
                <SortableHeader field="realized_pnl" label="Realized P&L" />
                <SortableHeader field="net_pnl" label="Net P&L" />
              </tr>
            </thead>
            <tbody>
              {sortedReport.map((r) => {
                const sharesHeld = parseFloat(r.shares_held)
                const realizedPnl = getRealizedPnl(r)
                const netPnl = getNetPnl(r)
                const isDelisted = pricesLoaded && !prices[r.ticker] && sharesHeld > 0.00005
                return (
                  <tr key={r.ticker}>
                    <td>
                      <span
                        onClick={() => navigate('/', {
                          state: {
                            fromPerformance: true,
                            ticker: r.ticker,
                            perfState: { filterTicker, sortBy, sortOrder },
                          },
                        })}
                        style={{ fontWeight: 'bold', cursor: 'pointer', color: '#3498db', textDecoration: 'underline' }}
                      >
                        {r.ticker}
                      </span>
                    </td>
                    <td>{parseFloat(r.shares_bought).toFixed(4)}</td>
                    <td>{parseFloat(r.shares_sold).toFixed(4)}</td>
                    <td>{(Math.abs(sharesHeld) < 0.00005 ? 0 : sharesHeld).toFixed(4)}</td>
                    <td>{formatCurrency(r.total_spent)}</td>
                    <td>{formatCurrency(r.total_received)}</td>
                    <td>{formatCurrency(r.dividends)}</td>
                    <td style={{ fontWeight: 'bold', color: realizedPnl >= 0 ? '#27ae60' : '#e74c3c' }}>
                      {formatCurrency(realizedPnl)}
                    </td>
                    <td style={{ fontWeight: 'bold', color: netPnl >= 0 ? '#27ae60' : '#e74c3c' }}>
                      {formatCurrency(netPnl)}
                      {isDelisted && (
                        <span style={{ fontSize: '0.7rem', color: '#7f8c8d', fontWeight: 'normal', marginLeft: '0.35rem' }}>
                          (delisted)
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {!isLoading && report.length === 0 && (
        <p style={{ textAlign: 'center', color: '#7f8c8d', marginTop: '2rem' }}>No data available. Upload a CSV to get started.</p>
      )}
    </div>
  )
}