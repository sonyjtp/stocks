import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

const API_BASE = 'http://localhost:8765/api'

export default function TransactionHistory() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [ticker, setTicker] = useState('')
  const [transCode, setTransCode] = useState('')
  const [sortBy, setSortBy] = useState('activity_date')
  const [sortOrder, setSortOrder] = useState('desc')

  const { data: transactions = [], isLoading, error } = useQuery({
    queryKey: ['transactions', startDate, endDate, ticker, transCode],
    queryFn: async () => {
      const params = new URLSearchParams({
        broker: 'robinhood',
        ...(startDate && { start: startDate }),
        ...(endDate && { end: endDate }),
        ...(ticker && { ticker }),
        ...(transCode && { trans_code: transCode }),
      })
      const res = await fetch(`${API_BASE}/transactions?${params}`)
      if (!res.ok) throw new Error('Failed to load transactions')
      return res.json()
    },
  })

  // Get unique tickers and trans_codes from transactions
  const uniqueTickers = [...new Set(transactions.filter(t => t.ticker).map(t => t.ticker))].sort()
  const transactionTypes = ['Buy', 'Sell', 'CDIV']

  // Calculate aggregated totals based on filters
  const aggregatedQuantity = transactions.reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0)
  const aggregatedAmount = transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)

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

  const handleReset = () => {
    setStartDate('')
    setEndDate('')
    setTicker('')
    setTransCode('')
  }

  const handleSort = (field) => {
    if (sortBy === field) {
      // Toggle sort order if clicking the same header
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // Set new sort field and default to ascending
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  // Sort transactions
  const sortedTransactions = [...transactions].sort((a, b) => {
    let aVal = a[sortBy]
    let bVal = b[sortBy]

    // Handle null values
    if (aVal == null) aVal = ''
    if (bVal == null) bVal = ''

    // Convert to comparable values
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase()
      bVal = bVal.toLowerCase()
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const TableHeader = ({ field, label }) => (
    <th
      onClick={() => handleSort(field)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        backgroundColor: sortBy === field ? '#f0f0f0' : 'transparent',
      }}
    >
      {label} {sortBy === field && (sortOrder === 'asc' ? '↑' : '↓')}
    </th>
  )

  return (
    <div>
      <h2>Transaction History</h2>

      <div className="date-range" style={{ marginBottom: '1.5rem', alignItems: 'center' }}>
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

        <input
          type="text"
          placeholder="Filter by ticker..."
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          style={{
            padding: '0.5rem',
            borderRadius: '4px',
            border: '1px solid #ccc',
            fontSize: '0.9rem',
            width: '200px',
          }}
        />

        <select
          value={transCode}
          onChange={(e) => setTransCode(e.target.value)}
          style={{
            padding: '0.5rem',
            borderRadius: '4px',
            border: '1px solid #ccc',
            fontSize: '0.9rem',
          }}
        >
          <option value="">All Types</option>
          {transactionTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <button
          onClick={handleReset}
          style={{
            padding: '0.5rem 1rem',
            background: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            marginLeft: 'auto',
          }}
        >
          Reset
        </button>
      </div>

      {error && <div className="error">{error.message}</div>}
      {isLoading && <div className="loading">Loading...</div>}

      {transactions.length > 0 && (
        <table>
            <thead>
              <tr>
                <TableHeader field="activity_date" label="Date" />
                <TableHeader field="ticker" label="Ticker" />
                <TableHeader field="description" label="Description" />
                <TableHeader field="trans_code" label="Type" />
                <TableHeader field="quantity" label="Quantity" />
                <TableHeader field="price" label="Price" />
                <TableHeader field="amount" label="Amount" />
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.map((t) => (
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
