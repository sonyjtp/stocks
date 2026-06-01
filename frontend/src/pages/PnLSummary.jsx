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

  return (
    <div>
      <h2>P&L Summary</h2>

      <div className="date-range">
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
        <div className="cards">
          <div className="card">
            <h3>Total Invested</h3>
            <div className="value">{formatCurrency(data.total_invested)}</div>
          </div>

          <div className="card">
            <h3>Total Received</h3>
            <div className="value">{formatCurrency(data.total_received)}</div>
          </div>

          <div className={getCardClass(data.realized_pnl)}>
            <h3>Realized P&L</h3>
            <div className="value">{formatCurrency(data.realized_pnl)}</div>
          </div>

          <div className={getCardClass(data.dividends)}>
            <h3>Dividends</h3>
            <div className="value">{formatCurrency(data.dividends)}</div>
          </div>

          <div className="card negative">
            <h3>Fees (Gold + Margin)</h3>
            <div className="value">{formatCurrency(data.fees)}</div>
          </div>

          <div className={getCardClass(data.net_pnl)}>
            <h3>Net P&L</h3>
            <div className="value">{formatCurrency(data.net_pnl)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
