import { useState, useContext } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ThemeContext } from '../context/ThemeContext'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'

export default function CurrentHoldings() {
  const { theme } = useContext(ThemeContext)
  const navigate = useNavigate()
  const location = useLocation()
  const [filterTicker, setFilterTicker] = useState(location.state?.filterTicker || '')
  const [sortBy, setSortBy] = useState(location.state?.sortBy || 'ticker')
  const [sortOrder, setSortOrder] = useState(location.state?.sortOrder || 'asc')

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
      const res = await fetch(`${API_BASE}/prices?tickers=${tickers}`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: holdings.length > 0,
  })

  const formatCurrency = (val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(num)
  }

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const pricesLoaded = Object.keys(prices).length > 0
  const filteredHoldings = holdings.filter(h =>
    h.shares_held > 0 &&
    (!pricesLoaded || prices[h.ticker]) &&
    (!filterTicker || h.ticker.toUpperCase().includes(filterTicker.toUpperCase()))
  )

  const sortedHoldings = [...filteredHoldings].sort((a, b) => {
    let aVal, bVal
    if (sortBy === 'gainLoss') {
      aVal = prices[a.ticker] ? parseFloat(a.shares_held) * prices[a.ticker] - parseFloat(a.shares_held) * parseFloat(a.avg_cost) : 0
      bVal = prices[b.ticker] ? parseFloat(b.shares_held) * prices[b.ticker] - parseFloat(b.shares_held) * parseFloat(b.avg_cost) : 0
    } else {
      aVal = typeof a[sortBy] === 'string' ? a[sortBy].toLowerCase() : a[sortBy]
      bVal = typeof b[sortBy] === 'string' ? b[sortBy].toLowerCase() : b[sortBy]
    }
    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const totalGainLoss = filteredHoldings.reduce((sum, h) => {
    const currentPrice = prices[h.ticker]
    if (!currentPrice) return sum
    return sum + parseFloat(h.shares_held) * currentPrice - parseFloat(h.shares_held) * parseFloat(h.avg_cost)
  }, 0)

  const SortableHeader = ({ field, label }) => (
    <th
      onClick={() => handleSort(field)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        padding: '1rem',
        color: theme.textSecondary,
        backgroundColor: sortBy === field ? theme.border : theme.bgSecondary,
        fontWeight: 600,
      }}
    >
      {label} {sortBy === field && (sortOrder === 'asc' ? '↑' : '↓')}
    </th>
  )

  return (
    <div>
      <h2 style={{ color: theme.text }}>Current Holdings</h2>

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
                border: `1px solid ${theme.border}`,
                background: theme.bg,
                color: theme.text,
                width: '200px',
              }}
            />
            {pricesLoaded && (
              <div>
                <span style={{ fontSize: '0.9rem', color: theme.textSecondary }}>Total Unrealized P&L: </span>
                <span style={{ fontWeight: 'bold', color: totalGainLoss >= 0 ? theme.colors.success : theme.colors.danger }}>
                  {formatCurrency(totalGainLoss)}
                </span>
              </div>
            )}
          </div>

          <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', border: `1px solid ${theme.border}`, borderRadius: '6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <SortableHeader field="ticker" label="Ticker" />
                  <SortableHeader field="shares_held" label="Shares Held" />
                  <SortableHeader field="avg_cost" label="Avg Cost" />
                  <th style={{ cursor: 'default', color: theme.textSecondary, padding: '1rem', backgroundColor: theme.bgSecondary, fontWeight: 600 }}>Current Price</th>
                  <th style={{ cursor: 'default', color: theme.textSecondary, padding: '1rem', backgroundColor: theme.bgSecondary, fontWeight: 600 }}>Current Value</th>
                  <SortableHeader field="gainLoss" label="Unrealized P&L" />
                </tr>
              </thead>
              <tbody>
                {sortedHoldings.map((h) => {
                  const currentPrice = prices[h.ticker]
                  const sharesHeld = parseFloat(h.shares_held)
                  const avgCost = parseFloat(h.avg_cost)
                  const currentValue = currentPrice ? sharesHeld * currentPrice : null
                  const gainLoss = currentValue ? currentValue - sharesHeld * avgCost : null
                  return (
                    <tr
                      key={h.ticker}
                      style={{ borderBottom: `1px solid ${theme.border}` }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bgSecondary}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '1rem', color: theme.text }}>
                        <span
                          onClick={() => navigate('/', {
                            state: { fromHoldings: true, ticker: h.ticker, holdingsState: { filterTicker, sortBy, sortOrder } },
                          })}
                          style={{ fontWeight: 'bold', cursor: 'pointer', color: theme.colors.primary, textDecoration: 'underline' }}
                        >
                          {h.ticker}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', color: theme.text }}>{sharesHeld.toFixed(4)}</td>
                      <td style={{ padding: '1rem', color: theme.text }}>{formatCurrency(avgCost)}</td>
                      <td style={{ padding: '1rem', color: theme.text }}>{currentPrice ? formatCurrency(currentPrice) : '-'}</td>
                      <td style={{ padding: '1rem', color: theme.text }}>{currentValue ? formatCurrency(currentValue) : '-'}</td>
                      <td style={{ padding: '1rem', fontWeight: 'bold', color: gainLoss != null ? (gainLoss >= 0 ? theme.colors.success : theme.colors.danger) : theme.text }}>
                        {gainLoss != null ? formatCurrency(gainLoss) : '-'}
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
        <p style={{ textAlign: 'center', color: theme.textSecondary, marginTop: '2rem' }}>No data available. Upload a CSV to get started.</p>
      )}
    </div>
  )
}
