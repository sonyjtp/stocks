import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

const API_BASE = 'http://localhost:8765/api'

export default function TransactionHistory() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const { data: transactions = [], isLoading, error } = useQuery({
    queryKey: ['transactions', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        broker: 'robinhood',
        ...(startDate && { start: startDate }),
        ...(endDate && { end: endDate }),
      })
      const res = await fetch(`${API_BASE}/transactions?${params}`)
      if (!res.ok) throw new Error('Failed to load transactions')
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

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US')
  }

  return (
    <div>
      <h2>Transaction History</h2>

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

      {transactions.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Ticker</th>
              <th>Description</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td>{formatDate(t.activity_date)}</td>
                <td>{t.ticker || '-'}</td>
                <td>{t.description}</td>
                <td>{t.trans_code}</td>
                <td>{t.quantity ? parseFloat(t.quantity).toFixed(4) : '-'}</td>
                <td>{t.price ? formatCurrency(t.price) : '-'}</td>
                <td style={{ fontWeight: 'bold', color: t.amount >= 0 ? '#27ae60' : '#e74c3c' }}>
                  {formatCurrency(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!isLoading && transactions.length === 0 && (
        <p style={{ textAlign: 'center', color: '#7f8c8d', marginTop: '2rem' }}>No transactions found. Upload a CSV to get started.</p>
      )}
    </div>
  )
}
