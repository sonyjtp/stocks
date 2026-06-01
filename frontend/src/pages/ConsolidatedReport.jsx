import { useQuery } from '@tanstack/react-query'

const API_BASE = 'http://localhost:8765/api'

export default function ConsolidatedReport() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['consolidated'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/report/consolidated?broker=robinhood`)
      if (!res.ok) throw new Error('Failed to load report')
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

  const holdings = data?.holdings || []
  const report = data?.report || []

  return (
    <div>
      <h2>Consolidated Report</h2>

      {error && <div className="error">{error.message}</div>}
      {isLoading && <div className="loading">Loading...</div>}

      {holdings.length > 0 && (
        <>
          <h3 className="section-title">Current Holdings</h3>
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Shares Held</th>
                <th>Avg Cost</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.ticker}>
                  <td><strong>{h.ticker}</strong></td>
                  <td>{parseFloat(h.shares_held).toFixed(4)}</td>
                  <td>{formatCurrency(h.avg_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {report.length > 0 && (
        <>
          <h3 className="section-title">All-Time Performance by Ticker</h3>
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Bought</th>
                <th>Sold</th>
                <th>Held</th>
                <th>Spent</th>
                <th>Received</th>
                <th>Dividends</th>
                <th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.ticker}>
                  <td><strong>{r.ticker}</strong></td>
                  <td>{parseFloat(r.shares_bought).toFixed(4)}</td>
                  <td>{parseFloat(r.shares_sold).toFixed(4)}</td>
                  <td>{parseFloat(r.shares_held).toFixed(4)}</td>
                  <td>{formatCurrency(r.total_spent)}</td>
                  <td>{formatCurrency(r.total_received)}</td>
                  <td>{formatCurrency(r.dividends)}</td>
                  <td style={{
                    fontWeight: 'bold',
                    color: r.realized_pnl >= 0 ? '#27ae60' : '#e74c3c'
                  }}>
                    {formatCurrency(r.realized_pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!isLoading && report.length === 0 && (
        <p style={{ textAlign: 'center', color: '#7f8c8d', marginTop: '2rem' }}>No data available. Upload a CSV to get started.</p>
      )}
    </div>
  )
}
