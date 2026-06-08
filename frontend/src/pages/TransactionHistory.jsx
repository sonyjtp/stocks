import { useState, useContext, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ThemeContext } from '../context/ThemeContext'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'

const TRANS_CODES = ['Buy', 'Sell', 'CDIV', 'CONV', 'SPL', 'Other']

const CODE_DISPLAY = {
  CDIV: 'Dividend',
  CONV: 'Conversion',
  SPL: 'Stock Split',
}
const displayCode = (code) => CODE_DISPLAY[code] || code

const EMPTY_FORM = {
  activity_date: '',
  ticker: '',
  description: '',
  trans_code: 'Buy',
  customCode: '',
  quantity: '',
  price: '',
  amount: '',
}

function applyCalc(row, name, value) {
  const next = { ...row, [name]: value }
  const code = name === 'trans_code' ? value : next.trans_code
  if (code !== 'Buy' && code !== 'Sell') return next
  const sign = code === 'Buy' ? -1 : 1
  if (name === 'quantity') {
    const qty = parseFloat(value)
    if (!isNaN(qty) && qty !== 0) {
      const prc = parseFloat(row.price)
      const amt = parseFloat(row.amount)
      if (row.price !== '' && !isNaN(prc)) next.amount = (sign * qty * prc).toFixed(2)
      else if (row.amount !== '' && !isNaN(amt)) next.price = (Math.abs(amt) / qty).toFixed(2)
    }
  } else if (name === 'price') {
    const qty = parseFloat(row.quantity)
    const prc = parseFloat(value)
    if (row.quantity !== '' && !isNaN(qty) && !isNaN(prc)) next.amount = (sign * qty * prc).toFixed(2)
  } else if (name === 'amount') {
    const qty = parseFloat(row.quantity)
    const amt = parseFloat(value)
    if (row.quantity !== '' && !isNaN(qty) && qty !== 0 && !isNaN(amt)) next.price = (Math.abs(amt) / qty).toFixed(2)
  } else if (name === 'trans_code') {
    const qty = parseFloat(row.quantity)
    const prc = parseFloat(row.price)
    if (row.quantity !== '' && row.price !== '' && !isNaN(qty) && !isNaN(prc))
      next.amount = (sign * qty * prc).toFixed(2)
  }
  return next
}

export default function TransactionHistory() {
  const { theme } = useContext(ThemeContext)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()

  const fromPerformance = location.state?.fromPerformance || false
  const perfState = location.state?.perfState || null
  const fromHoldings = location.state?.fromHoldings || false
  const holdingsState = location.state?.holdingsState || null

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [ticker, setTicker] = useState(location.state?.ticker || '')
  const [tickerExact, setTickerExact] = useState(!!(location.state?.fromPerformance || location.state?.fromHoldings))
  const [transCode, setTransCode] = useState('')
  const [sortBy, setSortBy] = useState('activity_date')
  const [sortOrder, setSortOrder] = useState('desc')

  // Add button dropdown
  const [showAddMenu, setShowAddMenu] = useState(false)
  const addMenuRef = useRef(null)

  // Single add/edit modal
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Multi-add modal
  const [multiModal, setMultiModal] = useState(false)
  const [multiRows, setMultiRows] = useState([{ ...EMPTY_FORM }])
  const [multiSaving, setMultiSaving] = useState(false)
  const [multiSaveError, setMultiSaveError] = useState(null)

  // Delete
  const [deleting, setDeleting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Close add dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target))
        setShowAddMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
    !ticker || (t.ticker && (
      tickerExact
        ? t.ticker.toUpperCase() === ticker.toUpperCase()
        : t.ticker.toUpperCase().includes(ticker.toUpperCase())
    ))
  )
    const transactionTypes = ['Buy', 'Sell', 'CDIV', 'CONV', 'SPL']

  const formatCurrency = (val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(num)
  }

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-US')

  const toInputDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (isNaN(d)) return ''
    return d.toISOString().split('T')[0]
  }

  const handleReset = () => { setStartDate(''); setEndDate(''); setTicker(''); setTickerExact(false); setTransCode('') }

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

  const getDescriptionForTicker = (tickerVal) => {
    if (!tickerVal) return ''
    const match = allTransactions.find(t =>
      t.ticker && t.ticker.toUpperCase() === tickerVal.toUpperCase() &&
      t.description && t.description.trim()
    )
    return match ? match.description : ''
  }

  // ── Single add/edit ──────────────────────────────────────────────────────

  const openAdd = () => {
    setShowAddMenu(false)
    setSaveError(null)
    const prefillTicker = ticker.trim().toUpperCase()
    setForm({ ...EMPTY_FORM, ticker: prefillTicker, description: getDescriptionForTicker(prefillTicker) })
    setModal('add')
  }

  const openEdit = (tx) => {
    setSaveError(null)
    setForm({
      activity_date: toInputDate(tx.activity_date),
      ticker: tx.ticker || '',
      description: tx.description || '',
      trans_code: TRANS_CODES.includes(tx.trans_code) ? tx.trans_code : 'Other',
      customCode: TRANS_CODES.includes(tx.trans_code) ? '' : tx.trans_code,
      quantity: tx.quantity != null ? String(tx.quantity) : '',
      price: tx.price != null ? String(tx.price) : '',
      amount: tx.amount != null ? String(tx.amount) : '',
    })
    setModal(tx)
  }

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setForm(prev => {
      const next = applyCalc(prev, name, value)
      if (name === 'ticker') {
        const desc = getDescriptionForTicker(value.trim().toUpperCase())
        if (desc && !prev.description) next.description = desc
      }
      return next
    })
  }

  const buildPayload = (row) => ({
    broker: 'robinhood',
    activity_date: row.activity_date,
    ticker: row.ticker.trim().toUpperCase() || null,
    description: row.description.trim(),
    trans_code: row.trans_code === 'Other' ? (row.customCode?.trim() || 'Other') : row.trans_code,
    quantity: row.quantity !== '' ? parseFloat(row.quantity) : null,
    price: row.price !== '' ? parseFloat(row.price) : null,
    amount: parseFloat(row.amount),
  })

  const handleSave = async () => {
    setSaveError(null)
    if (!form.activity_date || !form.trans_code || !form.description || form.amount === '') {
      setSaveError('Date, Type, Description, and Amount are required.')
      return
    }
    setSaving(true)
    try {
      const payload = buildPayload(form)
      let res
      if (modal === 'add') {
        res = await fetch(`${API_BASE}/upload-duplicates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactions: [payload] }),
        })
      } else {
        res = await fetch(`${API_BASE}/transactions/${modal.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
      await fetch(`${API_BASE}/settings/clear-cache`, { method: 'POST' })
      setModal(null)
      setForm(EMPTY_FORM)
      queryClient.invalidateQueries()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Multi-add ────────────────────────────────────────────────────────────

  const openMultiAdd = () => {
    setShowAddMenu(false)
    setMultiSaveError(null)
    const prefillTicker = ticker.trim().toUpperCase()
    const prefillDesc = getDescriptionForTicker(prefillTicker)
    setMultiRows([{ ...EMPTY_FORM, ticker: prefillTicker, description: prefillDesc }])
    setMultiModal(true)
  }

  const addRow = () => setMultiRows(prev => {
    const last = prev[prev.length - 1]
    const prefillTicker = ticker.trim().toUpperCase() || last.ticker
    const prefillDate = last.activity_date || ''
    const prefillDesc = getDescriptionForTicker(prefillTicker)
    return [...prev, { ...EMPTY_FORM, ticker: prefillTicker, activity_date: prefillDate, description: prefillDesc }]
  })

  const removeRow = (idx) => setMultiRows(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx))

  const updateRow = (idx, name, value) => {
    setMultiRows(prev => prev.map((row, i) => {
      if (i !== idx) return row
      const next = applyCalc(row, name, value)
      if (name === 'ticker') {
        const desc = getDescriptionForTicker(value.trim().toUpperCase())
        if (desc && !row.description) next.description = desc
      }
      return next
    }))
  }

  const handleMultiSave = async () => {
    setMultiSaveError(null)
    const invalid = multiRows.find(r => !r.activity_date || !r.description || r.amount === '')
    if (invalid) {
      setMultiSaveError('Every row needs Date, Description, and Amount.')
      return
    }
    setMultiSaving(true)
    try {
      const res = await fetch(`${API_BASE}/upload-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: multiRows.map(buildPayload) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
      await fetch(`${API_BASE}/settings/clear-cache`, { method: 'POST' })
      setMultiModal(false)
      setMultiRows([{ ...EMPTY_FORM }])
      queryClient.invalidateQueries()
    } catch (e) {
      setMultiSaveError(e.message)
    } finally {
      setMultiSaving(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = (tx) => setConfirmDelete(tx)

  const handleConfirmDelete = async () => {
    const tx = confirmDelete
    setConfirmDelete(null)
    setDeleting(tx.id)
    try {
      const res = await fetch(`${API_BASE}/transactions/${tx.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete transaction')
      await fetch(`${API_BASE}/settings/clear-cache`, { method: 'POST' })
      queryClient.invalidateQueries()
    } catch (e) {
      alert(e.message)
    } finally {
      setDeleting(null)
    }
  }

  // ── Styles ───────────────────────────────────────────────────────────────

  const inputStyle = {
    padding: '0.5rem 0.75rem', borderRadius: '4px', border: `1px solid ${theme.border}`,
    background: theme.bg, color: theme.text, fontSize: '0.9rem', width: '100%', boxSizing: 'border-box',
  }

  const cellInput = {
    padding: '0.35rem 0.5rem', borderRadius: '4px', border: `1px solid ${theme.border}`,
    background: theme.bg, color: theme.text, fontSize: '0.82rem', width: '100%', boxSizing: 'border-box',
  }

  const TableHeader = ({ field, label }) => (
    <th
      onClick={() => handleSort(field)}
      style={{
        cursor: 'pointer', userSelect: 'none',
        backgroundColor: sortBy === field ? (theme.isDark ? '#1e293b' : '#f0f0f0') : theme.bgSecondary,
        color: theme.text, padding: '0.6rem 0.75rem',
        textAlign: 'left', whiteSpace: 'nowrap',
        borderBottom: `2px solid ${theme.border}`,
      }}
    >
      {label} {sortBy === field && (sortOrder === 'asc' ? '↑' : '↓')}
    </th>
  )

  const isEditing = modal !== null && modal !== 'add'

  return (
    <div>
      {fromPerformance && (
        <button
          onClick={() => navigate('/performance', { state: perfState })}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            marginBottom: '1rem', padding: '0.4rem 1rem',
            background: 'transparent', border: `1px solid ${theme.border}`,
            borderRadius: '6px', cursor: 'pointer', color: theme.text, fontSize: '0.9rem',
          }}
        >
          ← Back to All-Time Performance
        </button>
      )}
      {fromHoldings && (
        <button
          onClick={() => navigate('/holdings', { state: holdingsState })}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            marginBottom: '1rem', padding: '0.4rem 1rem',
            background: 'transparent', border: `1px solid ${theme.border}`,
            borderRadius: '6px', cursor: 'pointer', color: theme.text, fontSize: '0.9rem',
          }}
        >
          ← Back to Current Holdings
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, color: theme.colors.primary }}>Trades History</h2>

        {/* Add button with dropdown */}
        <div ref={addMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAddMenu(v => !v)}
            style={{
              padding: '0.5rem 1.25rem', background: theme.colors.primary,
              color: 'white', border: 'none', borderRadius: '6px',
              cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}
          >
            + Add Transaction <span style={{ fontSize: '0.7rem' }}>▾</span>
          </button>

          {showAddMenu && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 4px)',
              background: theme.bgSecondary, border: `1px solid ${theme.border}`,
              borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              minWidth: '160px', zIndex: 200, overflow: 'hidden',
            }}>
              <button
                onClick={openAdd}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '0.65rem 1rem', background: 'none', border: 'none',
                  color: theme.text, cursor: 'pointer', fontSize: '0.9rem',
                  borderBottom: `1px solid ${theme.border}`,
                }}
                onMouseEnter={e => e.currentTarget.style.background = theme.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                Add One
              </button>
              <button
                onClick={openMultiAdd}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '0.65rem 1rem', background: 'none', border: 'none',
                  color: theme.text, cursor: 'pointer', fontSize: '0.9rem',
                }}
                onMouseEnter={e => e.currentTarget.style.background = theme.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                Add Multiple
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="date-range" style={{ marginBottom: '1.5rem', alignItems: 'center' }}>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <input
          type="text" placeholder="Filter by ticker..." value={ticker}
          onChange={(e) => { setTicker(e.target.value); setTickerExact(false) }}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9rem', width: '200px' }}
        />
        <select
          value={transCode} onChange={(e) => setTransCode(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9rem' }}
        >
          <option value="">All Types</option>
          {transactionTypes.map(t => <option key={t} value={t}>{displayCode(t)}</option>)}
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

      {transactions.length > 0 && (() => {
        const TYPE_ORDER = ['Buy', 'Sell', 'Dividend', 'Conversion', 'Stock Split']
        const typeCounts = {}
        let totalDebited = 0
        let totalCredited = 0
        for (const t of transactions) {
          const label = displayCode(t.trans_code)
          typeCounts[label] = (typeCounts[label] || 0) + 1
          const amt = parseFloat(t.amount)
          if (amt < 0) totalDebited += amt
          else totalCredited += amt
        }
        const sortedTypes = Object.entries(typeCounts).sort(([a], [b]) => {
          const ai = TYPE_ORDER.indexOf(a)
          const bi = TYPE_ORDER.indexOf(b)
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
        return (
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 1.25rem',
            padding: '0.6rem 1rem', marginBottom: '0.75rem',
            background: theme.bgSecondary, borderRadius: '6px', border: `1px solid ${theme.border}`,
            fontSize: '0.85rem', color: theme.textSecondary,
          }}>
            {sortedTypes.map(([label, count]) => (
              <span key={label}>
                <strong style={{ color: theme.text }}>{count}</strong> {label}{count !== 1 ? 's' : ''}
              </span>
            ))}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '1.25rem' }}>
              <span>Debited: <strong style={{ color: theme.colors.danger }}>{formatCurrency(totalDebited)}</strong></span>
              <span>Credited: <strong style={{ color: theme.colors.success }}>{formatCurrency(totalCredited)}</strong></span>
            </span>
          </div>
        )
      })()}

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
                <th style={{ padding: '0.6rem 0.75rem', background: theme.bgSecondary, borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary, fontSize: '0.8rem' }} />
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.map((t) => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '0.5rem 0.75rem', color: theme.text, whiteSpace: 'nowrap' }}>{formatDate(t.activity_date)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: theme.text, fontWeight: 'bold' }}>{t.ticker || '-'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: theme.textSecondary, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: theme.text }}>{displayCode(t.trans_code)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: theme.text, textAlign: 'right' }}>{t.quantity ? parseFloat(t.quantity).toFixed(4) : '-'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: theme.text, textAlign: 'right' }}>{t.price ? formatCurrency(t.price) : '-'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 'bold', textAlign: 'right', color: t.amount >= 0 ? theme.colors.success : theme.colors.danger }}>
                    {formatCurrency(t.amount)}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => openEdit(t)}
                      style={{ marginRight: '0.4rem', padding: '0.25rem 0.65rem', fontSize: '0.8rem', border: `1px solid ${theme.border}`, borderRadius: '4px', cursor: 'pointer', background: theme.bg, color: theme.text }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      disabled={deleting === t.id}
                      style={{ padding: '0.25rem 0.65rem', fontSize: '0.8rem', border: 'none', borderRadius: '4px', cursor: deleting === t.id ? 'not-allowed' : 'pointer', background: theme.colors.danger, color: 'white' }}
                    >
                      {deleting === t.id ? '...' : 'Delete'}
                    </button>
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

      {/* ── Single Add / Edit Modal ── */}
      {modal !== null && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null) }}
        >
          <div style={{ background: theme.bgSecondary, borderRadius: '10px', padding: '2rem', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 1.5rem', color: theme.colors.primary }}>
              {isEditing ? 'Edit Transaction' : 'Add Transaction'}
            </h3>

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
                  <input type="text" name="customCode" value={form.customCode} onChange={handleFormChange} placeholder="e.g. SPR" style={inputStyle} />
                </div>
              )}
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>Ticker</label>
                <input type="text" name="ticker" value={form.ticker} onChange={handleFormChange} placeholder="e.g. AAPL" style={{ ...inputStyle, textTransform: 'uppercase' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>
                  Amount * <span style={{ fontWeight: 'normal', fontSize: '0.78rem' }}>(negative = cash out)</span>
                </label>
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
                <input type="text" name="description" value={form.description} onChange={handleFormChange} placeholder="e.g. Apple Inc CUSIP: 037833100" style={inputStyle} />
              </div>
            </div>

            {saveError && (
              <div style={{ padding: '0.6rem 0.9rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', fontSize: '0.88rem', marginBottom: '1rem' }}>
                {saveError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.6rem 1.25rem', border: `1px solid ${theme.border}`, borderRadius: '6px', background: 'transparent', color: theme.text, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '0.6rem 1.5rem', background: theme.colors.primary, color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Multiple Modal ── */}
      {multiModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
          onClick={(e) => { if (e.target === e.currentTarget) setMultiModal(false) }}
        >
          <div style={{ background: theme.bgSecondary, borderRadius: '10px', padding: '1.75rem', width: '100%', maxWidth: '1100px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <h3 style={{ margin: '0 0 1.25rem', color: theme.colors.primary }}>Add Multiple Transactions</h3>

            <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    {['Date *', 'Type', 'Ticker', 'Qty', 'Price', 'Amount *', 'Description *', ''].map(h => (
                      <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: theme.textSecondary, whiteSpace: 'nowrap', borderBottom: `2px solid ${theme.border}`, fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {multiRows.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '0.4rem 0.4rem' }}>
                        <input type="date" value={row.activity_date} onChange={e => updateRow(idx, 'activity_date', e.target.value)} style={cellInput} data-multi-date />
                      </td>
                      <td style={{ padding: '0.4rem 0.4rem', minWidth: '110px' }}>
                        <select value={row.trans_code} onChange={e => updateRow(idx, 'trans_code', e.target.value)} style={cellInput}>
                          {TRANS_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '0.4rem 0.4rem', minWidth: '80px' }}>
                        <input type="text" value={row.ticker} onChange={e => updateRow(idx, 'ticker', e.target.value)} placeholder="AAPL" style={{ ...cellInput, textTransform: 'uppercase' }} />
                      </td>
                      <td style={{ padding: '0.4rem 0.4rem', minWidth: '80px' }}>
                        <input type="number" value={row.quantity} onChange={e => updateRow(idx, 'quantity', e.target.value)} placeholder="10" step="any" style={cellInput} />
                      </td>
                      <td style={{ padding: '0.4rem 0.4rem', minWidth: '90px' }}>
                        <input type="number" value={row.price} onChange={e => updateRow(idx, 'price', e.target.value)} placeholder="150.00" step="0.01" style={cellInput} />
                      </td>
                      <td style={{ padding: '0.4rem 0.4rem', minWidth: '100px' }}>
                        <input type="number" value={row.amount} onChange={e => updateRow(idx, 'amount', e.target.value)} placeholder="-1500.00" step="0.01" style={cellInput} />
                      </td>
                      <td style={{ padding: '0.4rem 0.4rem', minWidth: '200px' }}>
                        <input
                          type="text"
                          value={row.description}
                          onChange={e => updateRow(idx, 'description', e.target.value)}
                          placeholder="Description"
                          style={cellInput}
                          onKeyDown={e => {
                            if (e.key === 'Tab' && !e.shiftKey && idx === multiRows.length - 1) {
                              e.preventDefault()
                              addRow()
                              setTimeout(() => {
                                const dateInputs = document.querySelectorAll('[data-multi-date]')
                                if (dateInputs.length) dateInputs[dateInputs.length - 1].focus()
                              }, 0)
                            }
                          }}
                        />
                      </td>
                      <td style={{ padding: '0.4rem 0.4rem', textAlign: 'center' }}>
                        <button
                          onClick={() => removeRow(idx)}
                          disabled={multiRows.length === 1}
                          style={{ background: 'none', border: 'none', cursor: multiRows.length === 1 ? 'not-allowed' : 'pointer', color: '#e74c3c', fontSize: '1rem', opacity: multiRows.length === 1 ? 0.3 : 1 }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={addRow}
                style={{ padding: '0.45rem 1rem', background: 'none', border: `1px dashed ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, cursor: 'pointer', fontSize: '0.85rem' }}
              >
                + Add Row
              </button>
            </div>

            {multiSaveError && (
              <div style={{ padding: '0.6rem 0.9rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', fontSize: '0.88rem', marginTop: '0.75rem' }}>
                {multiSaveError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => setMultiModal(false)} style={{ padding: '0.6rem 1.25rem', border: `1px solid ${theme.border}`, borderRadius: '6px', background: 'transparent', color: theme.text, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleMultiSave} disabled={multiSaving} style={{ padding: '0.6rem 1.5rem', background: theme.colors.primary, color: 'white', border: 'none', borderRadius: '6px', cursor: multiSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {multiSaving ? 'Saving...' : `Save ${multiRows.length} Transaction${multiRows.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {confirmDelete && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null) }}
        >
          <div style={{ background: theme.bgSecondary, borderRadius: '10px', padding: '2rem', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: '#e74c3c' }}>Delete Transaction</h3>
            <p style={{ margin: '0 0 0.5rem', color: theme.text }}>Are you sure you want to delete this transaction?</p>
            <div style={{ background: theme.bg, borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: '0.9rem', color: theme.textSecondary, lineHeight: 1.6 }}>
              <div><strong style={{ color: theme.text }}>Type:</strong> {displayCode(confirmDelete.trans_code)}</div>
              <div><strong style={{ color: theme.text }}>Date:</strong> {formatDate(confirmDelete.activity_date)}</div>
              {confirmDelete.ticker && <div><strong style={{ color: theme.text }}>Ticker:</strong> {confirmDelete.ticker}</div>}
              <div><strong style={{ color: theme.text }}>Amount:</strong> {formatCurrency(confirmDelete.amount)}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '0.6rem 1.25rem', border: `1px solid ${theme.border}`, borderRadius: '6px', background: 'transparent', color: theme.text, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleConfirmDelete} style={{ padding: '0.6rem 1.5rem', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}