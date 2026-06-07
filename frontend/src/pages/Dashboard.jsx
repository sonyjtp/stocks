import { useState, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { ThemeContext } from '../context/ThemeContext'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'

export default function Dashboard() {
  const { theme } = useContext(ThemeContext)
  const [activeTab, setActiveTab] = useState('overview')

  const { data: pnlData = null, isLoading: pnlLoading } = useQuery({
    queryKey: ['pnl-summary'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/report/pnl?broker=robinhood`)
      if (!res.ok) throw new Error('Failed to load P&L summary')
      return res.json()
    },
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

  const { data: holdings = [], isLoading: holdLoading } = useQuery({
    queryKey: ['holdings-all'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/report/consolidated?broker=robinhood`)
      if (!res.ok) throw new Error('Failed to load holdings')
      return res.json().then(d => d.holdings || [])
    },
  })

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


  if (txLoading || holdLoading || pnlLoading || achLoading) return <Spinner />

  // Use backend-calculated P&L data which is always correct
  const metrics = pnlData ? {
    totalInvested: pnlData.total_invested,
    currentValue: pnlData.held_shares_current_value + (pnlData.total_invested - pnlData.cost_of_sold_shares - pnlData.cost_of_held_shares),
    totalGainLoss: pnlData.net_pnl,
    winRate: holdings.length > 0 ? (holdings.filter(h => {
      const current = parseFloat(h.shares_held) * (parseFloat(prices[h.ticker]) || 0)
      const cost = parseFloat(h.shares_held) * parseFloat(h.avg_cost)
      return current > cost
    }).length / holdings.length) * 100 : 0
  } : {
    totalInvested: 0,
    currentValue: 0,
    totalGainLoss: 0,
    winRate: 0
  }
  const topPerformers = getTopPerformers(holdings, prices, 5)
  const worstPerformers = getWorstPerformers(holdings, prices, 5)
  const cashFlowData = generateCashFlowData(achTransactions)
  const volatilityData = calculateVolatility(transactions)

  return (
    <div>
      <h1 style={{ color: theme.colors.primary, marginBottom: '2rem' }}>📊 Dashboard</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: `2px solid ${theme.border}` }}>
        {['overview', 'holdings', 'analytics'].map(tab => (
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
            {tab === 'holdings' && '💼 Holdings'}
            {tab === 'analytics' && '📊 Analytics'}
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

        </div>
      )}

      {/* Tab 2: Holdings */}
      {activeTab === 'holdings' && (
        <div>
          <PerformersTable theme={theme} title="🏆 Top Performers" data={topPerformers} />
          <PerformersTable theme={theme} title="📉 Worst Performers" data={worstPerformers} style={{ marginTop: '1.5rem' }} />
        </div>
      )}

      {/* Tab 3: Analytics */}
      {activeTab === 'analytics' && (
        <div>
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
              <MetricBox theme={theme} label="Best Day" value={`$${volatilityData.bestDay.toFixed(2)}`} />
              <MetricBox theme={theme} label="Worst Day" value={`$${volatilityData.worstDay.toFixed(2)}`} />
              <MetricBox theme={theme} label="Largest Drawdown" value={`$${volatilityData.largestDrawdown.toFixed(2)}`} />
              <MetricBox theme={theme} label="Transaction Count" value={transactions.length} />
            </div>
          </div>
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

function PerformersTable({ theme, title, data, style }) {
  return (
    <div
      style={{
        background: theme.bgSecondary,
        padding: '1.5rem',
        borderRadius: '8px',
        boxShadow: theme.shadow,
        ...style,
      }}
    >
      <h3 style={{ marginTop: 0, color: theme.text }}>{title}</h3>
      {data.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.bg }}>
              <th style={{ textAlign: 'left', padding: '0.75rem', color: theme.textSecondary }}>Ticker</th>
              <th style={{ textAlign: 'right', padding: '0.75rem', color: theme.textSecondary }}>Return %</th>
              <th style={{ textAlign: 'right', padding: '0.75rem', color: theme.textSecondary }}>Gain/Loss</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: '0.75rem', color: theme.text }}><strong>{row.ticker}</strong></td>
                <td style={{ textAlign: 'right', padding: '0.75rem', color: row.return >= 0 ? theme.colors.success : theme.colors.danger }}>
                  {row.return >= 0 ? '+' : ''}{row.return.toFixed(2)}%
                </td>
                <td style={{ textAlign: 'right', padding: '0.75rem', color: row.gainLoss >= 0 ? theme.colors.success : theme.colors.danger }}>
                  ${row.gainLoss.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: theme.textSecondary }}>No data</p>
      )}
    </div>
  )
}

function MetricBox({ theme, label, value }) {
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
    </div>
  )
}

// Helper functions
const COLORS = ['#3498db', '#e74c3c', '#27ae60', '#f39c12', '#9b59b6', '#1abc9c', '#34495e', '#95a5a6']

function calculateMetrics(transactions, holdings, prices) {
  // Total cash deposited (ACH deposits)
  const totalDeposited = transactions
    .filter(t => t.trans_code === 'ACH')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)

  // Total amount spent on buys (absolute value)
  const totalSpentOnBuys = transactions
    .filter(t => t.trans_code === 'Buy')
    .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0)

  // Total received from sells
  const totalReceivedFromSells = transactions
    .filter(t => t.trans_code === 'Sell')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)

  // Current portfolio value (cash + holdings)
  const currentHoldingsValue = holdings
    .filter(h => h.shares_held > 0)
    .reduce((sum, h) => {
      const price = parseFloat(prices[h.ticker]) || 0
      return sum + parseFloat(h.shares_held) * price
    }, 0)

  // Current cash remaining = deposited - spent + received
  const currentCash = totalDeposited - totalSpentOnBuys + totalReceivedFromSells

  // Total invested = cash deposited
  const totalInvested = totalDeposited

  // Current portfolio value
  const currentValue = currentCash + currentHoldingsValue

  // Total gain/loss = current value - total invested
  const totalGainLoss = currentValue - totalInvested

  // Win rate = % of holdings currently in profit
  const holdingsWithPrices = holdings.filter(h => h.shares_held > 0 && prices[h.ticker])
  const winners = holdingsWithPrices.filter(h => {
    const current = parseFloat(h.shares_held) * parseFloat(prices[h.ticker])
    const cost = parseFloat(h.shares_held) * parseFloat(h.avg_cost)
    return current > cost
  }).length
  const winRate = holdingsWithPrices.length > 0 ? (winners / holdingsWithPrices.length) * 100 : 0

  return { totalInvested, currentValue, totalGainLoss, winRate }
}



function getTopPerformers(holdings, prices, limit) {
  return holdings
    .filter(h => h.shares_held > 0 && prices[h.ticker])
    .map(h => ({
      ticker: h.ticker,
      return: ((parseFloat(prices[h.ticker]) - parseFloat(h.avg_cost)) / parseFloat(h.avg_cost)) * 100,
      gainLoss: parseFloat(h.shares_held) * (parseFloat(prices[h.ticker]) - parseFloat(h.avg_cost)),
    }))
    .sort((a, b) => b.return - a.return)
    .slice(0, limit)
}

function getWorstPerformers(holdings, prices, limit) {
  return holdings
    .filter(h => h.shares_held > 0 && prices[h.ticker])
    .map(h => ({
      ticker: h.ticker,
      return: ((parseFloat(prices[h.ticker]) - parseFloat(h.avg_cost)) / parseFloat(h.avg_cost)) * 100,
      gainLoss: parseFloat(h.shares_held) * (parseFloat(prices[h.ticker]) - parseFloat(h.avg_cost)),
    }))
    .sort((a, b) => a.return - b.return)
    .slice(0, limit)
}

function generateCashFlowData(transactions) {
  const byMonth = {}

  transactions.forEach(tx => {
    if (tx.trans_code === 'ACH') {
      const date = new Date(tx.activity_date)
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

      if (!byMonth[month]) byMonth[month] = { deposits: 0, withdrawals: 0 }

      const amount = parseFloat(tx.amount) || 0
      if (amount > 0) {
        byMonth[month].deposits += amount
      } else if (amount < 0) {
        byMonth[month].withdrawals += Math.abs(amount)
      }
    }
  })

  return Object.entries(byMonth)
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

function calculateVolatility(transactions) {
  let bestDay = 0
  let worstDay = 0
  let maxValue = 0
  let largestDrawdown = 0
  let runningValue = 0

  transactions.forEach(tx => {
    const amount = parseFloat(tx.amount) || 0
    runningValue += amount

    if (amount > bestDay) bestDay = amount
    if (amount < worstDay) worstDay = amount
    if (runningValue > maxValue) maxValue = runningValue
    if (runningValue < maxValue) {
      const drawdown = maxValue - runningValue
      if (drawdown > largestDrawdown) largestDrawdown = drawdown
    }
  })

  return { bestDay, worstDay, largestDrawdown }
}
