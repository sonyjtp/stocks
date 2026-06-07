import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

const API_BASE = 'http://localhost:8765/api'

export default function PnLSummary() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(num)
  }

  const getCardClass = (value) => {
    return value >= 0 ? 'card positive' : 'card negative'
  }

  const StatRow = ({ label, value, color = null }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', alignItems: 'center' }}>
      <span style={{ fontSize: '0.95rem' }}>{label}</span>
      <span style={{ fontWeight: 'bold', color: color || (value >= 0 ? '#27ae60' : '#e74c3c') }}>
        {formatCurrency(value)}
      </span>
    </div>
  )

  const PanelSection = ({ title, children }) => (
    <div style={{
      backgroundColor: '#f9f9f9',
      border: '1px solid #e0e0e0',
      borderRadius: '6px',
      padding: '1.25rem',
      marginBottom: '1.5rem'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem', color: '#333' }}>{title}</h3>
      {children}
    </div>
  )

  return (
    <div>
      <h2>P&L Summary</h2>

      <div className="date-range" style={{ marginBottom: '1.5rem' }}>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          placeholder="Start date"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          placeholder="End date"
        />
      </div>

      {error && <div className="error">{error.message}</div>}
      {isLoading && <div className="loading">Loading...</div>}

      {data && (
        <div>
          {/* Sold Shares Section */}
          <PanelSection title="Sold Shares (Closed Positions)">
            <StatRow label="Cost of Sold Shares" value={data.cost_of_sold_shares} color="#666" />
            <StatRow label="Proceeds from Sales" value={data.total_received} color="#666" />
            <div style={{ borderTop: '1px solid #ddd', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
              <StatRow label="Realized P&L" value={data.realized_pnl} />
            </div>
          </PanelSection>

          {/* Held Shares Section */}
          <PanelSection title="Held Shares (Open Positions)">
            <StatRow label="Cost Basis of Held Shares" value={data.cost_of_held_shares} color="#666" />
            <StatRow label="Current Value of Held Shares" value={data.held_shares_current_value} color="#666" />
            <div style={{ borderTop: '1px solid #ddd', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
              <StatRow label="Unrealized P&L" value={data.unrealized_pnl} />
            </div>
          </PanelSection>

          {/* Summary Section */}
          <PanelSection title="P&L Summary">
            <StatRow label="Realized P&L" value={data.realized_pnl} />
            <StatRow label="Unrealized P&L" value={data.unrealized_pnl} />
            <StatRow label="Dividends" value={data.dividends} />
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.95rem' }}>Fees</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontWeight: 'bold', color: '#e74c3c' }}>-{formatCurrency(data.fees)}</span>
            </div>
            <div style={{ borderTop: '2px solid #ddd', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
              <StatRow label="Net P&L" value={data.net_pnl} />
            </div>
          </PanelSection>

          {/* Investment Totals (For Reference) */}
          <PanelSection title="Investment Totals">
            <StatRow label="Total Invested (All Shares)" value={data.total_invested} color="#999" />
            <StatRow label="Total Cost Breakdown" value={data.cost_of_sold_shares + data.cost_of_held_shares} color="#999" />
          </PanelSection>
        </div>
      )}
    </div>
  )
}
