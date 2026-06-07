import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'

export default function Transfers() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const { data: summary, isLoading: sumLoading, error: sumError } = useQuery({
    queryKey: ['transfers-summary', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        broker: 'robinhood',
        ...(startDate && { start: startDate }),
        ...(endDate && { end: endDate }),
      })
      const res = await fetch(`${API_BASE}/report/transfers?${params}`)
      if (!res.ok) throw new Error('Failed to load transfers summary')
      return res.json()
    },
  })

  const { data: transfers = [], isLoading: transLoading } = useQuery({
    queryKey: ['transfers', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        broker: 'robinhood',
        ...(startDate && { start: startDate }),
        ...(endDate && { end: endDate }),
      })
      const res = await fetch(`${API_BASE}/transfers?${params}`)
      if (!res.ok) throw new Error('Failed to load transfers')
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

  const transTypeColor = (code) => {
    if (code === 'ACH') return '#3498db'
    if (code === 'INT') return '#27ae60'
    if (['GOLD', 'MINT'].includes(code)) return '#e74c3c'
    return '#333'
  }

  return (
    <div>
      <h2>Transfers & Fees</h2>

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

      {(sumError || transLoading) && <div className="error">{sumError?.message}</div>}
      {sumLoading && <Spinner />}

      {summary && (
        <div className="cards">
          <div className="card positive">
            <h3>ACH Deposits</h3>
            <div className="value">{formatCurrency(summary.ach_deposits)}</div>
          </div>

          <div className="card negative">
            <h3>ACH Withdrawals</h3>
            <div className="value">{formatCurrency(summary.ach_withdrawals)}</div>
          </div>

          <div className="card positive">
            <h3>Interest Earned</h3>
            <div className="value">{formatCurrency(summary.interest_earned)}</div>
          </div>

          <div className="card negative">
            <h3>Fees Paid</h3>
            <div className="value">{formatCurrency(summary.fees_paid)}</div>
          </div>
        </div>
      )}

      {transfers.length > 0 && (
        <>
          <h3 className="section-title">Transfer Details</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.activity_date)}</td>
                  <td style={{ color: transTypeColor(t.trans_code), fontWeight: 'bold' }}>
                    {t.trans_code}
                  </td>
                  <td>{t.description}</td>
                  <td style={{
                    fontWeight: 'bold',
                    color: t.amount >= 0 ? '#27ae60' : '#e74c3c'
                  }}>
                    {formatCurrency(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!sumLoading && transfers.length === 0 && (
        <p style={{ textAlign: 'center', color: '#7f8c8d', marginTop: '2rem' }}>No transfers found.</p>
      )}
    </div>
  )
}
