import { useContext } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ThemeContext } from '../context/ThemeContext'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'

export default function StockDetail() {
  const { ticker } = useParams()
  const upper = ticker.toUpperCase()
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

  const { data: prices = {} } = useQuery({
    queryKey: ['price', upper],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/prices?tickers=${upper}`)
      if (!res.ok) return {}
      return res.json()
    },
  })

  const { data: priceChanges = {} } = useQuery({
    queryKey: ['price-change', upper],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/prices/change?tickers=${upper}`)
      if (!res.ok) return {}
      return res.json()
    },
  })

  const { data: analystRaw = {} } = useQuery({
    queryKey: ['analyst', upper],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/analyst?tickers=${upper}`)
      if (!res.ok) return {}
      return res.json()
    },
  })

  const { data: newsRaw = {} } = useQuery({
    queryKey: ['news', upper],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/news?tickers=${upper}`)
      if (!res.ok) return {}
      return res.json()
    },
  })

  const { data: txData = [] } = useQuery({
    queryKey: ['transactions', upper],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/transactions?broker=robinhood&ticker=${upper}`)
      if (!res.ok) return []
      return res.json()
    },
  })

  if (holdLoading) return <Spinner />

  const holding = consolidatedData?.holdings?.find(h => h.ticker === upper)
  const currentPrice = prices[upper]
  const priceChange5d = priceChanges[upper]
  const analyst = analystRaw[upper] || { ratings: {}, price_target: {} }
  const news = newsRaw[upper] || []

  const sharesHeld = holding ? parseFloat(holding.shares_held) : 0
  const avgCost = holding ? parseFloat(holding.avg_cost) : 0
  const costBasis = sharesHeld * avgCost
  const currentValue = currentPrice != null ? sharesHeld * currentPrice : null
  const unrealizedPnL = currentValue != null ? currentValue - costBasis : null
  const unrealizedPct = unrealizedPnL != null && costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : null

  const takeProfit = parseFloat(localStorage.getItem('signal_take_profit') ?? '20')
  const stopLoss = parseFloat(localStorage.getItem('signal_stop_loss') ?? '10')
  const rallyThreshold = parseFloat(localStorage.getItem('signal_rally') ?? '5')

  const signals = []
  if (unrealizedPct != null) {
    if (unrealizedPct >= takeProfit)
      signals.push({ type: 'take_profit', pct: unrealizedPct, icon: '🎯', label: 'Take Profit', color: theme.colors.success })
    else if (unrealizedPct <= -stopLoss)
      signals.push({ type: 'stop_loss', pct: unrealizedPct, icon: '🛑', label: 'Stop Loss', color: theme.colors.danger })
  }
  if (priceChange5d != null && priceChange5d >= rallyThreshold)
    signals.push({ type: 'rally', pct: priceChange5d, icon: '📈', label: '5-Day Rally', color: theme.colors.warning })

  const fmt = (val) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val)
  const fmtPct = (val) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`

  const ratings = analyst.ratings
  const totalRatings = (ratings.strong_buy || 0) + (ratings.buy || 0) + (ratings.hold || 0) + (ratings.sell || 0) + (ratings.strong_sell || 0)
  const bullish = (ratings.strong_buy || 0) + (ratings.buy || 0)
  const bearish = (ratings.sell || 0) + (ratings.strong_sell || 0)
  const consensusLabel = totalRatings === 0 ? null
    : bullish > totalRatings * 0.6 ? 'Buy'
    : bearish > totalRatings * 0.4 ? 'Sell'
    : 'Hold'
  const consensusColor = consensusLabel === 'Buy' ? theme.colors.success
    : consensusLabel === 'Sell' ? theme.colors.danger
    : theme.colors.warning

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: '4px', padding: '0.4rem 0.75rem', cursor: 'pointer', color: theme.textSecondary, fontSize: '0.875rem' }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: '1.75rem', color: theme.colors.primary }}>{upper}</h1>
        {currentPrice != null && (
          <span style={{ fontSize: '1.4rem', color: theme.text, fontWeight: 600 }}>{fmt(currentPrice)}</span>
        )}
        {priceChange5d != null && (
          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: priceChange5d >= 0 ? theme.colors.success : theme.colors.danger }}>
            {fmtPct(priceChange5d)} (5d)
          </span>
        )}
      </div>

      {/* Position + Analyst row */}
      <div style={{ display: 'grid', gridTemplateColumns: holding && totalRatings > 0 ? '1fr 1fr' : '1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {holding && (
          <Card theme={theme} title="Your Position">
            <InfoRow theme={theme} label="Shares Held" value={sharesHeld.toLocaleString('en-US', { maximumFractionDigits: 8 })} />
            <InfoRow theme={theme} label="Avg Cost" value={fmt(avgCost)} />
            <InfoRow theme={theme} label="Cost Basis" value={fmt(costBasis)} />
            {currentValue != null && <InfoRow theme={theme} label="Current Value" value={fmt(currentValue)} />}
            {unrealizedPnL != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.6rem', marginTop: '0.25rem', borderTop: `1px solid ${theme.border}` }}>
                <span style={{ color: theme.textSecondary, fontSize: '0.9rem' }}>Unrealized P&L</span>
                <span style={{ fontWeight: 700, color: unrealizedPnL >= 0 ? theme.colors.success : theme.colors.danger }}>
                  {fmt(unrealizedPnL)} ({fmtPct(unrealizedPct)})
                </span>
              </div>
            )}
          </Card>
        )}

        {totalRatings > 0 && (
          <Card theme={theme} title="Analyst Consensus">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: consensusColor }}>{consensusLabel}</span>
              <span style={{ fontSize: '0.85rem', color: theme.textSecondary }}>{totalRatings} analysts</span>
            </div>
            {/* Stacked rating bar */}
            <div style={{ display: 'flex', borderRadius: '4px', overflow: 'hidden', height: '10px', marginBottom: '0.6rem' }}>
              {[
                { key: 'strong_buy', color: '#16a34a' },
                { key: 'buy',        color: '#4ade80' },
                { key: 'hold',       color: '#facc15' },
                { key: 'sell',       color: '#f97316' },
                { key: 'strong_sell',color: '#dc2626' },
              ].map(({ key, color }) => {
                const pct = (ratings[key] || 0) / totalRatings * 100
                return pct > 0 ? <div key={key} style={{ width: `${pct}%`, background: color }} /> : null
              })}
            </div>
            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {[
                { key: 'strong_buy',  label: 'Strong Buy',  color: '#16a34a' },
                { key: 'buy',         label: 'Buy',         color: '#4ade80' },
                { key: 'hold',        label: 'Hold',        color: '#facc15' },
                { key: 'sell',        label: 'Sell',        color: '#f97316' },
                { key: 'strong_sell', label: 'Strong Sell', color: '#dc2626' },
              ].filter(({ key }) => (ratings[key] || 0) > 0).map(({ key, label, color }) => (
                <span key={key} style={{ fontSize: '0.78rem', color: theme.textSecondary }}>
                  <span style={{ color, fontWeight: 700 }}>■</span> {label} ({ratings[key]})
                </span>
              ))}
            </div>
            {analyst.price_target?.mean && (
              <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '0.75rem' }}>
                <div style={{ fontSize: '0.8rem', color: theme.textSecondary, marginBottom: '0.5rem' }}>Price Target</div>
                <div style={{ display: 'flex', gap: '1.25rem' }}>
                  {[
                    { label: 'Low',  val: analyst.price_target.low },
                    { label: 'Mean', val: analyst.price_target.mean, primary: true },
                    { label: 'High', val: analyst.price_target.high },
                  ].map(({ label, val, primary }) => (
                    <div key={label}>
                      <div style={{ fontSize: '0.75rem', color: theme.textSecondary }}>{label}</div>
                      <div style={{ fontWeight: 600, color: primary ? theme.colors.primary : theme.text }}>{fmt(val)}</div>
                    </div>
                  ))}
                  {currentPrice != null && (
                    <div>
                      <div style={{ fontSize: '0.75rem', color: theme.textSecondary }}>Upside</div>
                      <div style={{ fontWeight: 600, color: analyst.price_target.mean > currentPrice ? theme.colors.success : theme.colors.danger }}>
                        {fmtPct((analyst.price_target.mean - currentPrice) / currentPrice * 100)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Signals */}
      {signals.length > 0 && (
        <Card theme={theme} title="Active Signals" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {signals.map(s => (
              <div key={s.type} style={{ padding: '0.65rem 1.1rem', borderRadius: '8px', background: `${s.color}18`, border: `1px solid ${s.color}55` }}>
                <span style={{ fontSize: '1.1rem', marginRight: '0.4rem' }}>{s.icon}</span>
                <span style={{ fontWeight: 700, color: s.color }}>{s.label}</span>
                <span style={{ marginLeft: '0.5rem', color: s.color, fontSize: '0.9rem' }}>{fmtPct(s.pct)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* News */}
      {news.length > 0 && (
        <Card theme={theme} title="Recent News" style={{ marginBottom: '1.5rem' }}>
          {news.map((article, i) => (
            <div key={i} style={{
              paddingBottom: i < news.length - 1 ? '0.75rem' : 0,
              marginBottom: i < news.length - 1 ? '0.75rem' : 0,
              borderBottom: i < news.length - 1 ? `1px solid ${theme.border}` : 'none',
            }}>
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.colors.primary, fontWeight: 600, fontSize: '0.92rem', textDecoration: 'none', lineHeight: 1.4, display: 'block', marginBottom: '0.2rem' }}
              >
                {article.title}
              </a>
              <span style={{ fontSize: '0.8rem', color: theme.textSecondary }}>
                {article.publisher}{article.published_at ? ` · ${timeAgo(article.published_at)}` : ''}
              </span>
            </div>
          ))}
        </Card>
      )}

      {/* Trades link */}
      {txData.length > 0 && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => navigate('/', { state: { fromStock: upper, ticker: upper, tickerExact: true } })}
            style={{ padding: '0.65rem 1.5rem', background: 'none', border: `1px solid ${theme.colors.primary}`, borderRadius: '6px', color: theme.colors.primary, cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}
          >
            View all {txData.length} trades for {upper} →
          </button>
        </div>
      )}
    </div>
  )
}

function Card({ theme, title, children }) {
  return (
    <div style={{ background: theme.bgSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
      {title && (
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.85rem' }}>
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

function InfoRow({ theme, label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.55rem' }}>
      <span style={{ color: theme.textSecondary, fontSize: '0.9rem' }}>{label}</span>
      <span style={{ fontWeight: 600, color: theme.text }}>{value}</span>
    </div>
  )
}

function timeAgo(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
