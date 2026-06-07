import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'

export default function CurrentHoldings() {
  const [filterTicker, setFilterTicker] = useState('')
  const [sortBy, setSortBy] = useState('ticker')
  const [sortOrder, setSortOrder] = useState('asc')

  const { data: holdings = [], isLoading, error } = useQuery({
    queryKey: ['consolidated'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/report/consolidated?broker=robinhood`)
      if (!res.ok) throw new Error('Failed to load holdings')
      return res.json().then(d => d.holdings || [])
    },
  })

  const { data: prices = {} } = useQuery({
    queryKey: ['prices', holdings.map(h => h.ticker).join(',')],
    queryFn: async () => {
      if (holdings.length === 0) return {}
      const tickers = holdings.map(h => h.ticker).join(',')
      console.log('Fetching prices for:', tickers)
      const res = await fetch(`${API_BASE}/prices?tickers=${tickers}`)
      console.log('Prices response:', res.status)
      if (!res.ok) {
        console.error('Failed to fetch prices')
        return {}
      }
      const data = await res.json()
      console.log('Prices data:', data)
      return data
    },
    enabled: holdings.length > 0,
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

  const filteredHoldings = holdings.filter(h =>
    h.shares_held > 0 &&
    (!filterTicker || h.ticker.toUpperCase().includes(filterTicker.toUpperCase()))
  )

  const sortedHoldings = [...filteredHoldings].sort((a, b) => {
    let aVal, bVal

    // Handle special case for gainLoss (calculated field)
    if (sortBy === 'gainLoss') {
      const aPrice = prices[a.ticker]
      const bPrice = prices[b.ticker]
      aVal = aPrice ? parseFloat(a.shares_held) * aPrice - parseFloat(a.shares_held) * parseFloat(a.avg_cost) : 0
      bVal = bPrice ? parseFloat(b.shares_held) * bPrice - parseFloat(b.shares_held) * parseFloat(b.avg_cost) : 0
    } else {
      aVal = a[sortBy]
      bVal = b[sortBy]

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase()
        bVal = bVal.toLowerCase()
      }
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
      <h2>Current Holdings</h2>

      {error && <div className="error">{error.message}</div>}
      {isLoading && <Spinner />}

      {!isLoading && holdings.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="Filter by ticker..."
              value={filterTicker}
              onChange={(e) => setFilterTicker(e.target.value)}
              style={{
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #ccc',
                width: '200px',
              }}
            />
            {prices && Object.keys(prices).length > 0 && (
              <div>
                <span style={{ fontSize: '0.9rem', color: '#7f8c8d' }}>Total Unrealized P&L: </span>
                <span style={{
                  fontWeight: 'bold',
                  color: (() => {
                    const totalGainLoss = filteredHoldings.reduce((sum, h) => {
                      const currentPrice = prices[h.ticker]
                      if (!currentPrice) return sum
                      const sharesHeld = parseFloat(h.shares_held)
                      const avgCost = parseFloat(h.avg_cost)
                      const gainLoss = sharesHeld * currentPrice - sharesHeld * avgCost
                      return sum + gainLoss
                    }, 0)
                    return totalGainLoss >= 0 ? '#27ae60' : '#e74c3c'
                  })(),
                }}>
                  {(() => {
                    const totalGainLoss = filteredHoldings.reduce((sum, h) => {
                      const currentPrice = prices[h.ticker]
                      if (!currentPrice) return sum
                      const sharesHeld = parseFloat(h.shares_held)
                      const avgCost = parseFloat(h.avg_cost)
                      const gainLoss = sharesHeld * currentPrice - sharesHeld * avgCost
                      return sum + gainLoss
                    }, 0)
                    return formatCurrency(totalGainLoss)
                  })()}
                </span>
              </div>
            )}
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', border: '1px solid #ddd', borderRadius: '6px' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <SortableHeader field="ticker" label="Ticker" />
                <SortableHeader field="shares_held" label="Shares Held" />
                <SortableHeader field="avg_cost" label="Avg Cost" />
                <th style={{ cursor: 'default', color: '#7f8c8d' }}>Current Price</th>
                <th style={{ cursor: 'default', color: '#7f8c8d' }}>Current Value</th>
                <SortableHeader field="gainLoss" label="Unrealized P&L" />
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((h) => {
                const currentPrice = prices[h.ticker]
                const sharesHeld = parseFloat(h.shares_held)
                const avgCost = parseFloat(h.avg_cost)
                const currentValue = currentPrice ? sharesHeld * currentPrice : null
                const costBasis = sharesHeld * avgCost
                const gainLoss = currentValue ? currentValue - costBasis : null
                return (
                  <tr key={h.ticker}>
                    <td><strong>{h.ticker}</strong></td>
                    <td>{sharesHeld.toFixed(4)}</td>
                    <td>{formatCurrency(avgCost)}</td>
                    <td>{currentPrice ? formatCurrency(currentPrice) : '-'}</td>
                    <td>{currentValue ? formatCurrency(currentValue) : '-'}</td>
                    <td style={{ fontWeight: 'bold', color: gainLoss && gainLoss >= 0 ? '#27ae60' : '#e74c3c' }}>
                      {gainLoss ? formatCurrency(gainLoss) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {!isLoading && holdings.length === 0 && (
        <p style={{ textAlign: 'center', color: '#7f8c8d', marginTop: '2rem' }}>No data available. Upload a CSV to get started.</p>
      )}
    </div>
  )
}
