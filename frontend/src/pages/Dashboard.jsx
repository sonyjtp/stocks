import { useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { ThemeContext } from '../context/ThemeContext'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'
const PIE_COLORS = ['#3498db', '#9b59b6', '#27ae60', '#f39c12', '#e67e22', '#1abc9c', '#e74c3c', '#2980b9', '#95a5a6']

export default function Dashboard() {
  const { theme } = useContext(ThemeContext)
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [signalSort, setSignalSort] = useState({ take_profit: 'desc', stop_loss: 'asc', rally: 'desc' })
  const [pnlLimit, setPnlLimit] = useState(5)
  const [pnlStart, setPnlStart] = useState('')
  const [pnlEnd, setPnlEnd] = useState(new Date().toISOString().split('T')[0])

  const { data: pnlData = null, isLoading: pnlLoading } = useQuery({
    queryKey: ['pnl-summary'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/report/pnl?broker=robinhood`)
      if (!res.ok) throw new Error('Failed to load P&L summary')
      return res.json()
    },
  })

  const { data: pnlTabData = null, isLoading: pnlTabLoading } = useQuery({
    queryKey: ['pnl-tab', pnlStart, pnlEnd],
    queryFn: async () => {
      const params = new URLSearchParams({ broker: 'robinhood', ...(pnlStart && { start: pnlStart }), ...(pnlEnd && { end: pnlEnd }) })
      const res = await fetch(`${API_BASE}/report/pnl?${params}`)
      if (!res.ok) throw new Error('Failed to load P&L summary')
      return res.json()
    },
    enabled: activeTab === 'pnl',
  })

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['transactions-all'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/transactions?broker=robinhood`)
      if (!res.ok) throw new Error('Failed to load transactions')
      return res.json()
    },
  })

  const { data: achTransactions = [], isLoading: achLoading } = useQuery({
    queryKey: ['ach-transactions'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/transfers?broker=robinhood`)
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: consolidatedData = null, isLoading: holdLoading } = useQuery({
    queryKey: ['holdings-all'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/report/consolidated?broker=robinhood`)
      if (!res.ok) throw new Error('Failed to load holdings')
      return res.json()
    },
  })

  const holdings = consolidatedData?.holdings || []
  const report = consolidatedData?.report || []

  const { data: prices = {} } = useQuery({
    queryKey: ['prices-all', holdings.map(h => h.ticker).join(',')],
    queryFn: async () => {
      if (holdings.length === 0) return {}
      const tickers = holdings.map(h => h.ticker).join(',')
      const res = await fetch(`${API_BASE}/prices?tickers=${tickers}`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: holdings.length > 0,
  })

  const heldTickers = holdings.filter(h => h.shares_held > 0).map(h => h.ticker)
  const { data: priceChanges = {} } = useQuery({
    queryKey: ['price-changes', heldTickers.join(',')],
    queryFn: async () => {
      if (heldTickers.length === 0) return {}
      const res = await fetch(`${API_BASE}/prices/change?tickers=${heldTickers.join(',')}`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: heldTickers.length > 0,
  })

  const { data: sectorData = {} } = useQuery({
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

  const signals = computeSignals(holdings, prices, priceChanges)
  const signalTickers = [...new Set(signals.map(s => s.ticker))]

  const { data: newsData = {}, isLoading: newsLoading } = useQuery({
    queryKey: ['news', signalTickers.join(',')],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/news?tickers=${signalTickers.join(',')}`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: activeTab === 'news' && signalTickers.length > 0,
    staleTime: 30 * 60 * 1000,
  })

  if (txLoading || holdLoading || pnlLoading || achLoading) return <Spinner />

  const metrics = pnlData ? {
    totalInvested: pnlData.total_invested,
    currentValue: pnlData.held_shares_current_value + (pnlData.total_invested - pnlData.cost_of_sold_shares - pnlData.cost_of_held_shares),
    totalGainLoss: pnlData.net_pnl,
    winRate: holdings.length > 0 ? (holdings.filter(h => {
      const current = parseFloat(h.shares_held) * (parseFloat(prices[h.ticker]) || 0)
      const cost = parseFloat(h.shares_held) * parseFloat(h.avg_cost)
      return current > cost
    }).length / holdings.length) * 100 : 0
  } : { totalInvested: 0, currentValue: 0, totalGainLoss: 0, winRate: 0 }

  const cashFlowData = generateCashFlowData(achTransactions)
  const volatilityData = calculateVolatility(transactions)
  const portfolioAllocation = getPortfolioAllocation(holdings, prices)
  const sectorAllocation = getSectorAllocation(holdings, prices, sectorData)
  const totalPortfolioValue = portfolioAllocation.reduce((s, e) => s + e.value, 0)
  const realizedPnlData = getRealizedPnlChart(report, pnlLimit)
  const monthlyInvestedData = getMonthlyInvested(transactions)

  return (
    <div>
      <h1 style={{ color: theme.colors.primary, marginBottom: '2rem' }}>📊 Dashboard</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: `2px solid ${theme.border}` }}>
        {['overview', 'analytics', 'pnl', 'news'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.75rem 1.5rem',
              background: activeTab === tab ? theme.colors.primary : 'transparent',
              color: activeTab === tab ? 'white' : theme.text,
              border: 'none',
              borderBottom: activeTab === tab ? `3px solid ${theme.colors.primary}` : 'none',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              marginBottom: '-2px',
              transition: 'all 0.2s',
              opacity: activeTab === tab ? 1 : 0.7,
            }}
          >
            {tab === 'overview' && '📈 Overview'}
            {tab === 'analytics' && '📊 Analytics'}
            {tab === 'pnl' && '💰 P&L'}
            {tab === 'news' && '📰 News'}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <SummaryCard theme={theme} label="Total Invested" value={`$${metrics.totalInvested.toFixed(2)}`} color={theme.colors.secondary} />
            <SummaryCard theme={theme} label="Current Value" value={`$${metrics.currentValue.toFixed(2)}`} color={theme.colors.success} />
            <SummaryCard theme={theme} label="Total Gain/Loss" value={`$${metrics.totalGainLoss.toFixed(2)}`} color={metrics.totalGainLoss >= 0 ? theme.colors.success : theme.colors.danger} />
            <SummaryCard theme={theme} label="Win Rate" value={`${metrics.winRate.toFixed(1)}%`} color={theme.colors.warning} />
          </div>

          {/* Signals */}
          {signals.length > 0 && (
            <div style={{ background: theme.bgSecondary, padding: '1.5rem', borderRadius: '8px', boxShadow: theme.shadow, marginBottom: '2rem' }}>
              <h2 style={{ marginTop: 0, marginBottom: '1.25rem', color: theme.text }}>Signals</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                {[
                  { type: 'take_profit', icon: '🎯', label: 'Take Profit', color: theme.colors.success },
                  { type: 'stop_loss',   icon: '🛑', label: 'Stop Loss',   color: theme.colors.danger },
                  { type: 'rally',       icon: '📈', label: '5-Day Rally', color: theme.colors.warning },
                ].map(({ type, icon, label, color }) => {
                  const group = signals.filter(s => s.type === type)
                  const order = signalSort[type]
                  const sorted = [...group].sort((a, b) => order === 'desc' ? b.pct - a.pct : a.pct - b.pct)
                  return (
                    <div key={type} style={{ border: `1px solid ${theme.border}`, borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 0.75rem', background: `${color}18`,
                        borderBottom: `1px solid ${theme.border}`, flexShrink: 0,
                      }}>
                        <span>{icon}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color, flex: 1 }}>{label}</span>
                        {group.length > 0 && (
                          <span style={{ fontSize: '0.8rem', color: theme.textSecondary }}>{group.length}</span>
                        )}
                        {group.length > 1 && (
                          <button
                            onClick={() => setSignalSort(prev => ({ ...prev, [type]: prev[type] === 'desc' ? 'asc' : 'desc' }))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textSecondary, fontSize: '0.85rem', padding: '0 0.1rem' }}
                          >
                            {order === 'desc' ? '↓' : '↑'}
                          </button>
                        )}
                      </div>
                      <div style={{ overflowY: 'auto', maxHeight: '370px' }}>
                        {sorted.length === 0 ? (
                          <div style={{ padding: '1rem 0.75rem', color: theme.textSecondary, fontSize: '0.85rem', textAlign: 'center' }}>—</div>
                        ) : sorted.map(s => (
                          <div key={s.ticker} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.5rem 0.75rem', borderBottom: `1px solid ${theme.border}`,
                          }}>
                            <span
                              onClick={() => navigate(`/stock/${s.ticker}`)}
                              style={{ fontWeight: 'bold', color: theme.colors.primary, fontSize: '0.88rem', cursor: 'pointer', textDecoration: 'underline' }}
                            >{s.ticker}</span>
                            <span style={{ fontSize: '0.85rem', color, fontWeight: 600 }}>
                              {s.pct >= 0 ? '+' : ''}{s.pct.toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Sector Allocation */}
          {sectorAllocation.length > 0 && (
            <div style={{ background: theme.bgSecondary, padding: '1.5rem', borderRadius: '8px', boxShadow: theme.shadow, marginBottom: '1.5rem' }}>
              <h2 style={{ marginTop: 0, color: theme.text }}>Sector Allocation</h2>
              {sectorAllocation.map(({ sector, value }) => {
                const pct = (value / totalPortfolioValue) * 100
                return (
                  <div key={sector} style={{ marginBottom: '0.9rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span
                        onClick={() => navigate(`/sector/${encodeURIComponent(sector)}`)}
                        style={{ fontWeight: 600, fontSize: '0.9rem', color: theme.colors.primary, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {sector}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: theme.textSecondary }}>
                        {pct.toFixed(1)}% &nbsp;·&nbsp; ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div style={{ background: theme.border, borderRadius: '4px', height: '7px' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: theme.colors.primary, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Portfolio Allocation */}
          {portfolioAllocation.length > 0 && (
            <div style={{ background: theme.bgSecondary, padding: '1.5rem', borderRadius: '8px', boxShadow: theme.shadow }}>
              <h2 style={{ marginTop: 0, color: theme.text }}>Portfolio Allocation</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'center' }}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={portfolioAllocation}
                      cx="50%"
                      cy="50%"
                      innerRadius={75}
                      outerRadius={120}
                      dataKey="value"
                      nameKey="ticker"
                    >
                      {portfolioAllocation.map((entry, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Value']}
                      contentStyle={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}`, color: theme.text }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div>
                  {portfolioAllocation.map((entry, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.55rem' }}>
                      <div style={{ width: 11, height: 11, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                      <span style={{ flex: 1, color: theme.text, fontWeight: 'bold', fontSize: '0.88rem' }}>{entry.ticker}</span>
                      <span style={{ color: theme.textSecondary, fontSize: '0.83rem', minWidth: '3.5rem', textAlign: 'right' }}>
                        {((entry.value / totalPortfolioValue) * 100).toFixed(1)}%
                      </span>
                      <span style={{ color: theme.text, fontSize: '0.83rem', minWidth: '6rem', textAlign: 'right' }}>
                        ${entry.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}



      {/* Tab 3: Analytics */}
      {activeTab === 'analytics' && (
        <div>
          {/* Realized P&L — Top Gainers & Losers */}
          {realizedPnlData.length > 0 && (
            <div style={{ background: theme.bgSecondary, padding: '1.5rem', borderRadius: '8px', boxShadow: theme.shadow, marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, color: theme.text }}>Realized P&L — Top Gainers & Losers</h2>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: theme.textSecondary }}>Show top/bottom</label>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={pnlLimit}
                    onChange={e => setPnlLimit(Math.min(20, Math.max(3, parseInt(e.target.value) || 3)))}
                    style={{ width: '3.5rem', padding: '0.25rem 0.4rem', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: '0.85rem', textAlign: 'center' }}
                  />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(300, realizedPnlData.length * 40)}>
                <BarChart data={realizedPnlData} layout="vertical" margin={{ left: 10, right: 60, top: 5, bottom: 5 }}>
                  <CartesianGrid stroke={theme.border} strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke={theme.textSecondary}
                    tickFormatter={(v) => `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <YAxis type="category" dataKey="ticker" stroke={theme.textSecondary} width={55} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Realized P&L']}
                    contentStyle={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}`, color: theme.text }}
                  />
                  <ReferenceLine x={0} stroke={theme.border} strokeWidth={2} />
                  <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                    {realizedPnlData.map((entry, i) => (
                      <Cell key={i} fill={entry.pnl >= 0 ? theme.colors.success : theme.colors.danger} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly Buy Activity */}
          {monthlyInvestedData.length > 0 && (
            <div style={{ background: theme.bgSecondary, padding: '1.5rem', borderRadius: '8px', boxShadow: theme.shadow, marginBottom: '2rem' }}>
              <h2 style={{ marginTop: 0, color: theme.text }}>Monthly Buy Activity</h2>
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={monthlyInvestedData} margin={{ bottom: 30, right: 20 }}>
                  <CartesianGrid stroke={theme.border} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    stroke={theme.textSecondary}
                    tick={{ fontSize: 10, fill: theme.textSecondary }}
                    angle={-45}
                    textAnchor="end"
                    interval={Math.ceil(monthlyInvestedData.length / 16) - 1}
                  />
                  <YAxis
                    stroke={theme.textSecondary}
                    tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip
                    formatter={(value) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Amount Invested']}
                    contentStyle={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}`, color: theme.text }}
                  />
                  <Bar dataKey="invested" fill={theme.colors.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Cash Flow */}
          <div style={{ background: theme.bgSecondary, padding: '1.5rem', borderRadius: '8px', boxShadow: theme.shadow, marginBottom: '2rem' }}>
            <h2 style={{ marginTop: 0, color: theme.text }}>Cash Flow Timeline</h2>
            {cashFlowData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={cashFlowData}>
                  <CartesianGrid stroke={theme.border} strokeDasharray="3 3" />
                  <XAxis dataKey="month" stroke={theme.textSecondary} />
                  <YAxis stroke={theme.textSecondary} />
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} contentStyle={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }} />
                  <Legend />
                  <Bar dataKey="deposits" fill={theme.colors.danger} name="Deposits" />
                  <Bar dataKey="withdrawals" fill={theme.colors.success} name="Withdrawals" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ textAlign: 'center', color: theme.textSecondary }}>No cash flow data</p>
            )}
          </div>

          {/* Volatility */}
          <div style={{ background: theme.bgSecondary, padding: '1.5rem', borderRadius: '8px', boxShadow: theme.shadow }}>
            <h2 style={{ marginTop: 0, color: theme.text }}>Volatility Analysis</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <MetricBox theme={theme} label="Best Day" value={`$${volatilityData.bestDay.toFixed(2)}`} subtitle={volatilityData.bestDayDate} />
              <MetricBox theme={theme} label="Worst Day" value={`$${volatilityData.worstDay.toFixed(2)}`} subtitle={volatilityData.worstDayDate} />
              <MetricBox theme={theme} label="Largest Drawdown" value={`$${volatilityData.largestDrawdown.toFixed(2)}`} />
              <MetricBox theme={theme} label="Transaction Count" value={transactions.length} />
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: News */}
      {activeTab === 'news' && (
        <div>
          {signalTickers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: theme.textSecondary }}>
              <p style={{ fontSize: '1.1rem' }}>No high-volatility tickers detected.</p>
              <p style={{ fontSize: '0.9rem' }}>News is shown only for tickers with an active Take Profit, Stop Loss, or Rally signal.</p>
            </div>
          ) : newsLoading ? (
            <Spinner />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {signalTickers.map(ticker => {
                const tickerSignals = signals.filter(s => s.ticker === ticker)
                const articles = newsData[ticker] || []
                return (
                  <div key={ticker} style={{ background: theme.bgSecondary, borderRadius: '8px', boxShadow: theme.shadow, overflow: 'hidden' }}>
                    {/* Ticker header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1.25rem', borderBottom: `1px solid ${theme.border}` }}>
                      <span
                        onClick={() => navigate(`/stock/${ticker}`)}
                        style={{ fontWeight: 'bold', fontSize: '1.05rem', color: theme.colors.primary, cursor: 'pointer', textDecoration: 'underline' }}
                      >{ticker}</span>
                      {tickerSignals.map(s => {
                        const sigMeta = {
                          take_profit: { label: 'Take Profit', color: theme.colors.success, icon: '🎯' },
                          stop_loss:   { label: 'Stop Loss',   color: theme.colors.danger,  icon: '🛑' },
                          rally:       { label: '5-Day Rally', color: theme.colors.warning, icon: '📈' },
                        }[s.type]
                        return (
                          <span key={s.type} style={{
                            fontSize: '0.75rem', fontWeight: 600,
                            padding: '0.2rem 0.55rem', borderRadius: '999px',
                            background: `${sigMeta.color}22`, color: sigMeta.color,
                            border: `1px solid ${sigMeta.color}55`,
                          }}>
                            {sigMeta.icon} {sigMeta.label} {s.pct >= 0 ? '+' : ''}{s.pct.toFixed(1)}%
                          </span>
                        )
                      })}
                    </div>
                    {/* Articles */}
                    {articles.length === 0 ? (
                      <p style={{ padding: '1rem 1.25rem', color: theme.textSecondary, fontSize: '0.9rem', margin: 0 }}>No recent news found.</p>
                    ) : articles.map((article, i) => (
                      <div key={i} style={{ padding: '0.9rem 1.25rem', borderBottom: i < articles.length - 1 ? `1px solid ${theme.border}` : 'none' }}>
                        <a
                          href={article.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: theme.colors.primary, fontWeight: 600, fontSize: '0.92rem', textDecoration: 'none', lineHeight: 1.4, display: 'block', marginBottom: '0.3rem' }}
                        >
                          {article.title}
                        </a>
                        <span style={{ fontSize: '0.8rem', color: theme.textSecondary }}>
                          {article.publisher}{article.published_at ? ` · ${timeAgo(article.published_at)}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: P&L */}
      {activeTab === 'pnl' && (
        <div>
          {/* Date filter */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
            <input
              type="date"
              value={pnlStart}
              onChange={(e) => setPnlStart(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text }}
            />
            <input
              type="date"
              value={pnlEnd}
              onChange={(e) => setPnlEnd(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text }}
            />
            <button
              onClick={() => { setPnlStart(''); setPnlEnd(new Date().toISOString().split('T')[0]) }}
              style={{ padding: '0.5rem 1rem', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', marginLeft: 'auto' }}
            >
              Reset
            </button>
          </div>

          {pnlTabLoading && <Spinner />}

          {pnlTabData && (
            <div>
              <PnLPanel theme={theme} title="Sold Shares (Closed Positions)">
                <PnLRow theme={theme} label="Cost of Sold Shares" value={pnlTabData.cost_of_sold_shares} neutral />
                <PnLRow theme={theme} label="Proceeds from Sales" value={pnlTabData.total_received} neutral />
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                  <PnLRow theme={theme} label="Realized P&L" value={pnlTabData.realized_pnl} />
                </div>
              </PnLPanel>

              <PnLPanel theme={theme} title="Held Shares (Open Positions)">
                <PnLRow theme={theme} label="Cost Basis of Held Shares" value={pnlTabData.cost_of_held_shares} neutral />
                <PnLRow theme={theme} label="Current Value of Held Shares" value={pnlTabData.held_shares_current_value} neutral />
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                  <PnLRow theme={theme} label="Unrealized P&L" value={pnlTabData.unrealized_pnl} />
                </div>
              </PnLPanel>

              <PnLPanel theme={theme} title="P&L Summary">
                <PnLRow theme={theme} label="Realized P&L" value={pnlTabData.realized_pnl} />
                <PnLRow theme={theme} label="Unrealized P&L" value={pnlTabData.unrealized_pnl} />
                <PnLRow theme={theme} label="Dividends" value={pnlTabData.dividends} />
                <PnLRow theme={theme} label="Interest" value={pnlTabData.interest} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.95rem', color: theme.text }}>Fees</span>
                  <span style={{ fontWeight: 'bold', color: theme.colors.danger }}>
                    -{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(pnlTabData.fees)}
                  </span>
                </div>
                <div style={{ borderTop: `2px solid ${theme.border}`, paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                  <PnLRow theme={theme} label="Net P&L" value={pnlTabData.net_pnl} />
                </div>
              </PnLPanel>

              <PnLPanel theme={theme} title="Investment Totals">
                <PnLRow theme={theme} label="Total Invested (All Shares)" value={pnlTabData.total_invested} neutral />
                <PnLRow theme={theme} label="Total Cost Breakdown" value={pnlTabData.cost_of_sold_shares + pnlTabData.cost_of_held_shares} neutral />
              </PnLPanel>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Components
function SummaryCard({ theme, label, value, color }) {
  return (
    <div
      style={{
        background: theme.bgSecondary,
        padding: '1.5rem',
        borderRadius: '8px',
        boxShadow: theme.shadow,
        borderLeft: `5px solid ${color}`,
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = theme.shadowMd
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = theme.shadow
      }}
    >
      <p style={{ margin: '0 0 0.5rem 0', color: theme.textSecondary, fontSize: '0.9rem' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold', color }}>{value}</p>
    </div>
  )
}


function MetricBox({ theme, label, value, subtitle }) {
  return (
    <div
      style={{
        background: theme.bg,
        padding: '1rem',
        borderRadius: '8px',
        border: `1px solid ${theme.border}`,
        textAlign: 'center',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      <p style={{ margin: '0 0 0.5rem 0', color: theme.textSecondary, fontSize: '0.9rem' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 'bold', color: theme.colors.primary }}>{value}</p>
      {subtitle && <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: theme.textSecondary }}>{subtitle}</p>}
    </div>
  )
}

function PnLPanel({ theme, title, children }) {
  return (
    <div style={{ backgroundColor: theme.bgSecondary, border: `1px solid ${theme.border}`, borderRadius: '6px', padding: '1.25rem', marginBottom: '1.5rem' }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem', color: theme.text }}>{title}</h3>
      {children}
    </div>
  )
}

function PnLRow({ theme, label, value, neutral = false }) {
  const num = typeof value === 'string' ? parseFloat(value) : value
  const color = neutral ? theme.textSecondary : (num >= 0 ? theme.colors.success : theme.colors.danger)
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(num)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', alignItems: 'center' }}>
      <span style={{ fontSize: '0.95rem', color: theme.text }}>{label}</span>
      <span style={{ fontWeight: 'bold', color }}>{formatted}</span>
    </div>
  )
}

// Helper functions
function getPortfolioAllocation(holdings, prices, topN = 8) {
  const withValue = holdings
    .filter(h => parseFloat(h.shares_held) > 0 && prices[h.ticker])
    .map(h => ({
      ticker: h.ticker,
      value: parseFloat(h.shares_held) * parseFloat(prices[h.ticker])
    }))
    .sort((a, b) => b.value - a.value)

  if (withValue.length === 0) return []
  if (withValue.length <= topN) return withValue

  const top = withValue.slice(0, topN)
  const othersValue = withValue.slice(topN).reduce((sum, h) => sum + h.value, 0)
  return [...top, { ticker: 'Others', value: othersValue }]
}

function getSectorAllocation(holdings, prices, sectorData) {
  if (Object.keys(sectorData).length === 0) return []
  const sectorValues = {}
  holdings
    .filter(h => parseFloat(h.shares_held) > 0 && prices[h.ticker])
    .forEach(h => {
      const s = sectorData[h.ticker] || 'Other'
      sectorValues[s] = (sectorValues[s] || 0) + parseFloat(h.shares_held) * parseFloat(prices[h.ticker])
    })
  return Object.entries(sectorValues)
    .map(([sector, value]) => ({ sector, value }))
    .sort((a, b) => b.value - a.value)
}

function getRealizedPnlChart(report, limit = 5) {
  const sorted = [...report].sort((a, b) => b.realized_pnl - a.realized_pnl)
  const gainers = sorted.filter(r => r.realized_pnl > 0).slice(0, limit)
  const losers = sorted.filter(r => r.realized_pnl < 0).slice(-limit)
  return [...gainers, ...losers].map(r => ({ ticker: r.ticker, pnl: parseFloat(r.realized_pnl.toFixed(2)) }))
}

function getMonthlyInvested(transactions) {
  const byMonth = {}
  transactions
    .filter(t => t.trans_code === 'Buy')
    .forEach(t => {
      const d = new Date(t.activity_date + 'T12:00:00')
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      byMonth[month] = (byMonth[month] || 0) + Math.abs(parseFloat(t.amount) || 0)
    })
  return Object.entries(byMonth)
    .map(([month, invested]) => ({ month, invested: parseFloat(invested.toFixed(2)) }))
    .sort((a, b) => a.month.localeCompare(b.month))
}


function generateCashFlowData(transactions) {
  const byMonth = {}
  transactions.forEach(tx => {
    if (tx.trans_code === 'ACH' || tx.trans_code === 'DCF') {
      const date = new Date(tx.activity_date)
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth[month]) byMonth[month] = { deposits: 0, withdrawals: 0 }
      const amount = parseFloat(tx.amount) || 0
      if (amount > 0) byMonth[month].deposits += amount
      else if (amount < 0) byMonth[month].withdrawals += Math.abs(amount)
    }
  })
  return Object.entries(byMonth)
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

function computeSignals(holdings, prices, priceChanges) {
  const takeProfit = parseFloat(localStorage.getItem('signal_take_profit') ?? '20')
  const stopLoss = parseFloat(localStorage.getItem('signal_stop_loss') ?? '10')
  const rally = parseFloat(localStorage.getItem('signal_rally') ?? '5')

  const signals = []
  const heldSet = new Set()

  holdings
    .filter(h => h.shares_held > 0 && prices[h.ticker])
    .forEach(h => {
      heldSet.add(h.ticker)
      const gainPct = (parseFloat(prices[h.ticker]) - parseFloat(h.avg_cost)) / parseFloat(h.avg_cost) * 100
      if (gainPct >= takeProfit) {
        signals.push({ ticker: h.ticker, type: 'take_profit', pct: gainPct, label: 'Take Profit' })
      } else if (gainPct <= -stopLoss) {
        signals.push({ ticker: h.ticker, type: 'stop_loss', pct: gainPct, label: 'Stop Loss' })
      }
    })

  Object.entries(priceChanges).forEach(([ticker, change]) => {
    if (change !== null && change >= rally && heldSet.has(ticker)) {
      signals.push({ ticker, type: 'rally', pct: change, label: '5d Rally' })
    }
  })

  return signals
}

function timeAgo(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function calculateVolatility(transactions) {
  let bestDay = 0, worstDay = 0, bestDayDate = null, worstDayDate = null
  let maxValue = 0, largestDrawdown = 0, runningValue = 0

  transactions.forEach(tx => {
    const amount = parseFloat(tx.amount) || 0
    runningValue += amount
    if (amount > bestDay) { bestDay = amount; bestDayDate = tx.activity_date }
    if (amount < worstDay) { worstDay = amount; worstDayDate = tx.activity_date }
    if (runningValue > maxValue) maxValue = runningValue
    if (runningValue < maxValue) {
      const drawdown = maxValue - runningValue
      if (drawdown > largestDrawdown) largestDrawdown = drawdown
    }
  })

  return { bestDay, worstDay, bestDayDate, worstDayDate, largestDrawdown }
}
