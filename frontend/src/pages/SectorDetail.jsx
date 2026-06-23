import { useContext } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ThemeContext } from '../context/ThemeContext'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'

export default function SectorDetail() {
  const { sector } = useParams()
  const decodedSector = decodeURIComponent(sector)
  const navigate = useNavigate()
  const { theme } = useContext(ThemeContext)

  const { data: consolidatedData, isLoading: holdLoading } = useQuery({
    queryKey: ['holdings-all'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/report/consolidated?broker=robinhood`)
      if (!res.ok) throw new Error('Failed to load holdings')
      return res.json()
    },
  })

  const holdings = consolidatedData?.holdings || []
  const heldTickers = holdings.filter(h => parseFloat(h.shares_held) > 0).map(h => h.ticker)

  const { data: prices = {}, isLoading: priceLoading } = useQuery({
    queryKey: ['prices-all', heldTickers.join(',')],
    queryFn: async () => {
      if (heldTickers.length === 0) return {}
      const res = await fetch(`${API_BASE}/prices?tickers=${heldTickers.join(',')}`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: heldTickers.length > 0,
  })

  const { data: sectorData = {}, isLoading: sectorLoading } = useQuery({
    queryKey: ['sectors', heldTickers.join(',')],
    queryFn: async () => {
      if (heldTickers.length === 0) return {}
      const res = await fetch(`${API_BASE}/sector?tickers=${heldTickers.join(',')}`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: heldTickers.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
  })

  if (holdLoading) return <Spinner />
  if (sectorLoading && heldTickers.length > 0) return <Spinner />

  const sectorHoldings = holdings.filter(
    h => parseFloat(h.shares_held) > 0 && sectorData[h.ticker] === decodedSector
  )

  const fmt = (val) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val)
  const fmtPct = (val) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`

  let totalCostBasis = 0
  let totalCurrentValue = 0
  let allPricesLoaded = true

  const rows = sectorHoldings.map(h => {
    const shares = parseFloat(h.shares_held)
    const avgCost = parseFloat(h.avg_cost)
    const currentPrice = prices[h.ticker]
    const costBasis = shares * avgCost
    const currentValue = currentPrice != null ? shares * currentPrice : null
    const unrealizedPnL = currentValue != null ? currentValue - costBasis : null
    const unrealizedPct = unrealizedPnL != null && costBasis > 0
      ? (unrealizedPnL / costBasis) * 100 : null

    totalCostBasis += costBasis
    if (currentValue != null) totalCurrentValue += currentValue
    else allPricesLoaded = false

    return { ticker: h.ticker, shares, avgCost, currentPrice, costBasis, currentValue, unrealizedPnL, unrealizedPct }
  })

  const totalUnrealizedPnL = allPricesLoaded && rows.length > 0 ? totalCurrentValue - totalCostBasis : null
  const totalUnrealizedPct = totalUnrealizedPnL != null && totalCostBasis > 0
    ? (totalUnrealizedPnL / totalCostBasis) * 100 : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: '4px', padding: '0.4rem 0.75rem', cursor: 'pointer', color: theme.textSecondary, fontSize: '0.875rem' }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: '1.75rem', color: theme.colors.primary }}>{decodedSector}</h1>
        <span style={{ color: theme.textSecondary, fontSize: '0.95rem' }}>Sector</span>
      </div>

      {sectorHoldings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: theme.textSecondary }}>
          <p style={{ fontSize: '1.1rem' }}>No held positions in the {decodedSector} sector.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
            <StatCard theme={theme} label="Positions" value={sectorHoldings.length} />
            <StatCard theme={theme} label="Cost Basis" value={fmt(totalCostBasis)} />
            <StatCard
              theme={theme}
              label="Current Value"
              value={priceLoading ? '…' : allPricesLoaded && totalCurrentValue > 0 ? fmt(totalCurrentValue) : '—'}
            />
            <StatCard
              theme={theme}
              label="Unrealized P&L"
              value={
                priceLoading ? '…'
                : totalUnrealizedPnL != null
                  ? `${fmt(totalUnrealizedPnL)}${totalUnrealizedPct != null ? ` (${fmtPct(totalUnrealizedPct)})` : ''}`
                  : '—'
              }
              color={totalUnrealizedPnL != null ? (totalUnrealizedPnL >= 0 ? theme.colors.success : theme.colors.danger) : undefined}
            />
          </div>

          <div style={{ background: theme.bgSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Ticker', 'Shares', 'Avg Cost', 'Current Price', 'Current Value', 'Unrealized P&L'].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '0.85rem 1rem',
                        textAlign: h === 'Ticker' ? 'left' : 'right',
                        color: theme.textSecondary,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        background: theme.bgSecondary,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr
                    key={row.ticker}
                    style={{ borderBottom: `1px solid ${theme.border}` }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = theme.bg}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span
                        onClick={() => navigate(`/stock/${row.ticker}`)}
                        style={{ fontWeight: 700, color: theme.colors.primary, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {row.ticker}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: theme.text }}>
                      {row.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: theme.text }}>{fmt(row.avgCost)}</td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: theme.text }}>
                      {priceLoading ? '…' : row.currentPrice != null ? fmt(row.currentPrice) : '—'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: theme.text }}>
                      {priceLoading ? '…' : row.currentValue != null ? fmt(row.currentValue) : '—'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      {priceLoading ? (
                        <span style={{ color: theme.textSecondary }}>…</span>
                      ) : row.unrealizedPnL != null ? (
                        <span style={{ fontWeight: 700, color: row.unrealizedPnL >= 0 ? theme.colors.success : theme.colors.danger }}>
                          {fmt(row.unrealizedPnL)}{row.unrealizedPct != null ? ` (${fmtPct(row.unrealizedPct)})` : ''}
                        </span>
                      ) : (
                        <span style={{ color: theme.textSecondary }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${theme.border}`, background: theme.bg }}>
                    <td colSpan={3} style={{ padding: '0.85rem 1rem', fontWeight: 700, color: theme.text }}>
                      Total ({rows.length} positions)
                    </td>
                    <td />
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, color: theme.text }}>
                      {priceLoading ? '…' : allPricesLoaded && totalCurrentValue > 0 ? fmt(totalCurrentValue) : '—'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      {totalUnrealizedPnL != null ? (
                        <span style={{ fontWeight: 700, color: totalUnrealizedPnL >= 0 ? theme.colors.success : theme.colors.danger }}>
                          {fmt(totalUnrealizedPnL)}{totalUnrealizedPct != null ? ` (${fmtPct(totalUnrealizedPct)})` : ''}
                        </span>
                      ) : <span style={{ color: theme.textSecondary }}>—</span>}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ theme, label, value, color }) {
  return (
    <div style={{ background: theme.bgSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '1rem 1.25rem' }}>
      <div style={{ fontSize: '0.75rem', color: theme.textSecondary, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: color || theme.text }}>{value}</div>
    </div>
  )
}
