import { useState, useContext } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ThemeContext } from '../context/ThemeContext'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'

const TRANS_CODES = ['Buy', 'Sell', 'CDIV', 'ACH', 'SLIP', 'GOLD', 'MINT', 'INT', 'CONV', 'SPL', 'Other']

const EMPTY_FORM = {
  activity_date: '',
  ticker: '',
  description: '',
  trans_code: 'Buy',
  quantity: '',
  price: '',
  amount: '',
}

export default function TransactionHistory() {
  const { theme } = useContext(ThemeContext)
  const queryClient = useQueryClient()

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [ticker, setTicker] = useState('')
  const [transCode, setTransCode] = useState('')
  const [sortBy, setSortBy] = useState('activity_date')
  const [sortOrder, setSortOrder] = useState('desc')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const { data: allTransactions = [], isLoading, error } = useQuery({
    queryKey: ['transactions', startDate, endDate, transCode],
    queryFn: async () => {
      const params = new URLSearchParams({
        broker: 'robinhood',
        ...(startDate && { start: startDate }),
        ...(endDate && { end: endDate }),
        ...(transCode && { trans_code: transCode }),
      })
      const res = await fetch(`${API_BASE}/transactions?${params}`)
      if (!res.ok) throw new Error('Failed to load transactions')
      return res.json()
    },
  })

  const transactions = allTransactions.filter(t =>
    !ticker || (t.ticker && t.ticker.toUpperCase().includes(ticker.toUpperCase()))
  )

  const transactionTypes = ['Buy', 'Sell', 'CDIV', 'ACH', 'SLIP', 'GOLD', 'MINT', 'INT']

  const aggregatedQuantity = transactions.reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0)
  const aggregatedAmount = transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)

  const formatCurrency = (val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(num)
  }

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-US')

  const handleReset = () => {
    setStartDate('')
    setEndDate('')
    setTicker('')
    setTransCode('')
  }

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortOrder('asc') }
  }

  const sortedTransactions = [...transactions].sort((a, b) => {
    let aVal = a[sortBy] ?? ''
    let bVal = b[sortBy] ?? ''
    if (typeof aVal === 'string') { aVal = aVal.toLowerCase(); bVal = bVal.toLowerCase() }
    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    setSaveError(null)
    if (!form.activity_date || !form.trans_code || !form.description || form.amount === '') {
      setSaveError('Date, Type, Description, and Amount are required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        broker: 'robinhood',
        activity_date: form.activity_date,
        process_date: form.activity_date,
        settle_date: form.activity_date,
        ticker: form.ticker.trim().toUpperCase() || null,
        description: form.description.trim(),
        trans_code: form.trans_code === 'Other' ? form.customCode || 'Other' : form.trans_code,
        quantity: form.quantity !== '' ? parseFloat(form.quantity) : null,
        price: form.price !== '' ? parseFloat(form.price) : null,
        amount: parseFloat(form.amount),
      }
      const res = await fetch(`${API_BASE}/upload-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: [payload] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
      // Clear backend cache so holdings/P&L reflect the new transaction
      await fetch(`${API_BASE}/settings/clear-cache`, { method: 'POST' })
      setShowModal(false)
      setForm(EMPTY_FORM)
      queryClient.invalidateQueries()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const TableHeader = ({ field, label }) => (
    <th
      onClick={() => handleSort(field)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        backgroundColor: sortBy === field ? (theme.isDark ? '#1e293b' : '#f0f0f0') : theme.bgSecondary,
        color: theme.text,
        padding: '0.6rem 0.75rem',
        textAlign: 'left',
        whiteSpace: 'nowrap',
        borderBottom: `2px solid ${theme.border}`,
      }}
    >
      {label} {sortBy === field && (sortOrder === 'asc' ? '↑' : '↓')}
    </th>
  )

  const inputStyle = {
    padding: '0.5rem 0.75rem',
    borderRadius: '4px',
    border: `1px solid ${theme.border}`,
    background: theme.bg,
    color: theme.text,
    fontSize: '0.9rem',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, color: theme.colors.primary }}>Transaction History</h2>
        <button
          onClick={() => { setShowModal(true); setSaveError(null) }}
          style={{
            padding: '0.5rem 1.25rem',
            background: theme.colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '0.9rem',
          }}
        >
          + Add Transaction
        </button>
      </div>

      <div className="date-range" style={{ marginBottom: '1.5rem', alignItems: 'center' }}>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <input
          type="text"
          placeholder="Filter by ticker..."
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9rem', width: '200px' }}
        />
        <select
          value={transCode}
          onChange={(e) => setTransCode(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9rem' }}
        >
          <option value="">All Types</option>
          {transactionTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          onClick={handleReset}
          style={{ padding: '0.5rem 1rem', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', marginLeft: 'auto' }}
        >
          Reset
        </button>
      </div>

      {error && <div className="error">{error.message}</div>}
      {isLoading && <Spinner />}

      {transactions.length > 0 && (
        <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', border: `1px solid ${theme.border}`, borderRadius: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
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
                <tr key={t.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '0.5rem 0.75rem', color: theme.text, whiteSpace: 'nowrap' }}>{formatDate(t.activity_date)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: theme.text, fontWeight: 'bold' }}>{t.ticker || '-'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: theme.textSecondary, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: theme.text }}>{t.trans_code}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: theme.text, textAlign: 'right' }}>{t.quantity ? parseFloat(t.quantity).toFixed(4) : '-'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: theme.text, textAlign: 'right' }}>{t.price ? formatCurrency(t.price) : '-'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 'bold', textAlign: 'right', color: t.amount >= 0 ? theme.colors.success : theme.colors.danger }}>
                    {formatCurrency(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && transactions.length === 0 && (
        <p style={{ textAlign: 'center', color: theme.textSecondary, marginTop: '2rem' }}>No transactions found.</p>
      )}

      {/* Add Transaction Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div style={{
            background: theme.bgSecondary, borderRadius: '10px', padding: '2rem',
            width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <h3 style={{ margin: '0 0 1.5rem', color: theme.colors.primary }}>Add Transaction</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>Date *</label>
                <input type="date" name="activity_date" value={form.activity_date} onChange={handleFormChange} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>Type *</label>
                <select name="trans_code" value={form.trans_code} onChange={handleFormChange} style={inputStyle}>
                  {TRANS_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {form.trans_code === 'Other' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>Custom Type Code</label>
                  <input type="text" name="customCode" value={form.customCode || ''} onChange={handleFormChange} placeholder="e.g. SPR" style={inputStyle} />
                </div>
              )}
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>Ticker</label>
                <input type="text" name="ticker" value={form.ticker} onChange={handleFormChange} placeholder="e.g. AAPL" style={{ ...inputStyle, textTransform: 'uppercase' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>Amount * <span style={{ fontWeight: 'normal' }}>(negative = cash out)</span></label>
                <input type="number" name="amount" value={form.amount} onChange={handleFormChange} placeholder="-1500.00" step="0.01" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>Quantity</label>
                <input type="number" name="quantity" value={form.quantity} onChange={handleFormChange} placeholder="10" step="any" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>Price per share</label>
                <input type="number" name="price" value={form.price} onChange={handleFormChange} placeholder="150.00" step="0.01" style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>Description *</label>
                <input type="text" name="description" value={form.description} onChange={handleFormChange} placeholder="e.g. Apple Inc" style={inputStyle} />
              </div>
            </div>

            {saveError && (
              <div style={{ padding: '0.6rem 0.9rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', fontSize: '0.88rem', marginBottom: '1rem' }}>
                {saveError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ padding: '0.6rem 1.25rem', border: `1px solid ${theme.border}`, borderRadius: '6px', background: 'transparent', color: theme.text, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '0.6rem 1.5rem', background: theme.colors.primary, color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
              >
                {saving ? 'Saving...' : 'Save Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
