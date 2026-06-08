import { useState, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ThemeContext } from '../context/ThemeContext'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'

const today = () => new Date().toISOString().split('T')[0]

export default function PnLSummary() {
  const { theme } = useContext(ThemeContext)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState(today())

  const handleReset = () => { setStartDate(''); setEndDate(today()) }

  const { data, isLoading, error } = useQuery({
    queryKey: ['pnl', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        broker: 'robinhood',
        ...(startDate && { start: startDate }),
        ...(endDate && { end: endDate }),
      })
      const res = await fetch(`${API_BASE}/report/pnl?${params}`)
      if (!res.ok) throw new Error('Failed to load P&L summary')
      return res.json()
    },
  })

  const formatCurrency = (val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(num)
  }

  const inputStyle = {
    padding: '0.5rem',
    borderRadius: '4px',
    border: `1px solid ${theme.border}`,
    background: theme.bg,
    color: theme.text,
  }

  const StatRow = ({ label, value, color = null }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', alignItems: 'center' }}>
      <span style={{ fontSize: '0.95rem', color: theme.text }}>{label}</span>
      <span style={{ fontWeight: 'bold', color: color || (value >= 0 ? theme.colors.success : theme.colors.danger) }}>
        {formatCurrency(value)}
      </span>
    </div>
  )

  const PanelSection = ({ title, children }) => (
    <div style={{
      backgroundColor: theme.bgSecondary,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      padding: '1.25rem',
      marginBottom: '1.5rem',
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem', color: theme.text }}>{title}</h3>
      {children}
    </div>
  )

  return (
    <div>
      <h2 style={{ color: theme.text }}>P&L Summary</h2>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
        <button
          onClick={handleReset}
          style={{ padding: '0.5rem 1rem', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', marginLeft: 'auto' }}
        >
          Reset
        </button>
      </div>

      {error && <div className="error">{error.message}</div>}
      {isLoading && <Spinner />}

      {data && (
        <div>
          <PanelSection title="Sold Shares (Closed Positions)">
            <StatRow label="Cost of Sold Shares" value={data.cost_of_sold_shares} color={theme.textSecondary} />
            <StatRow label="Proceeds from Sales" value={data.total_received} color={theme.textSecondary} />
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '0.75rem', marginTop: '0.75rem' }}>
              <StatRow label="Realized P&L" value={data.realized_pnl} />
            </div>
          </PanelSection>

          <PanelSection title="Held Shares (Open Positions)">
            <StatRow label="Cost Basis of Held Shares" value={data.cost_of_held_shares} color={theme.textSecondary} />
            <StatRow label="Current Value of Held Shares" value={data.held_shares_current_value} color={theme.textSecondary} />
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '0.75rem', marginTop: '0.75rem' }}>
              <StatRow label="Unrealized P&L" value={data.unrealized_pnl} />
            </div>
          </PanelSection>

          <PanelSection title="P&L Summary">
            <StatRow label="Realized P&L" value={data.realized_pnl} />
            <StatRow label="Unrealized P&L" value={data.unrealized_pnl} />
            <StatRow label="Dividends" value={data.dividends} />
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.95rem', color: theme.text }}>Fees</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontWeight: 'bold', color: theme.colors.danger }}>-{formatCurrency(data.fees)}</span>
            </div>
            <div style={{ borderTop: `2px solid ${theme.border}`, paddingTop: '0.75rem', marginTop: '0.75rem' }}>
              <StatRow label="Net P&L" value={data.net_pnl} />
            </div>
          </PanelSection>

          <PanelSection title="Investment Totals">
            <StatRow label="Total Invested (All Shares)" value={data.total_invested} color={theme.textSecondary} />
            <StatRow label="Total Cost Breakdown" value={data.cost_of_sold_shares + data.cost_of_held_shares} color={theme.textSecondary} />
          </PanelSection>
        </div>
      )}
    </div>
  )
}