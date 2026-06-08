import { useState, useContext, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ThemeContext } from '../context/ThemeContext'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'

const TRANSFER_CODES = ['ACH', 'INT', 'GOLD', 'MINT', 'SLIP', 'DTAX']

const CODE_LABEL = {
  INT: 'Interest',
  GOLD: 'Gold Subscription',
  MINT: 'Savings Interest',
  SLIP: 'Stock Loan Income',
  DTAX: 'Foreign Tax Withheld',
}

const displayLabel = (code, amount) => {
  if (code === 'ACH') return parseFloat(amount) >= 0 ? 'Deposit' : 'Withdrawal'
  return CODE_LABEL[code] || code
}

const ALL_LABELS = ['Deposit', 'Withdrawal', 'Interest', 'Gold Subscription', 'Savings Interest', 'Stock Loan Income', 'Foreign Tax Withheld']

const EMPTY_FORM = { activity_date: '', description: '', trans_code: 'ACH', amount: '' }

export default function Transfers() {
  const { theme } = useContext(ThemeContext)
  const queryClient = useQueryClient()
  const addMenuRef = useRef(null)

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortBy, setSortBy] = useState('activity_date')
  const [sortOrder, setSortOrder] = useState('desc')

  const [showAddMenu, setShowAddMenu] = useState(false)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [multiModal, setMultiModal] = useState(false)
  const [multiRows, setMultiRows] = useState([{ ...EMPTY_FORM }])
  const [multiSaving, setMultiSaving] = useState(false)
  const [multiSaveError, setMultiSaveError] = useState(null)

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setShowAddMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['transfers-summary', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ broker: 'robinhood', ...(startDate && { start: startDate }), ...(endDate && { end: endDate }) })
      const res = await fetch(`${API_BASE}/report/transfers?${params}`)
      if (!res.ok) throw new Error('Failed to load summary')
      return res.json()
    },
  })

  const { data: allTransfers = [], isLoading } = useQuery({
    queryKey: ['transfers', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ broker: 'robinhood', ...(startDate && { start: startDate }), ...(endDate && { end: endDate }) })
      const res = await fetch(`${API_BASE}/transfers?${params}`)
      if (!res.ok) throw new Error('Failed to load transfers')
      return res.json()
    },
  })

  const filtered = allTransfers.filter(t => !typeFilter || displayLabel(t.trans_code, t.amount) === typeFilter)

  const sorted = [...filtered].sort((a, b) => {
    let aVal = sortBy === 'type' ? displayLabel(a.trans_code, a.amount) : a[sortBy] ?? ''
    let bVal = sortBy === 'type' ? displayLabel(b.trans_code, b.amount) : b[sortBy] ?? ''
    if (typeof aVal === 'string') { aVal = aVal.toLowerCase(); bVal = bVal.toLowerCase() }
    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const formatCurrency = (val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(num)
  }
  const formatDate = (d) => new Date(d).toLocaleDateString('en-US')
  const toInputDate = (d) => {
    if (!d) return ''
    const dt = new Date(d)
    return isNaN(dt) ? '' : dt.toISOString().split('T')[0]
  }

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortOrder('asc') }
  }

  const buildPayload = (f) => ({
    broker: 'robinhood',
    activity_date: f.activity_date,
    description: f.description || '',
    trans_code: f.trans_code,
    amount: parseFloat(f.amount),
    ticker: null, quantity: null, price: null,
  })

  // ── Single add/edit ──────────────────────────────────────────────────────

  const openAdd = () => {
    setShowAddMenu(false); setSaveError(null)
    setForm({ ...EMPTY_FORM }); setModal('add')
  }

  const openEdit = (t) => {
    setSaveError(null)
    setForm({ activity_date: toInputDate(t.activity_date), description: t.description || '', trans_code: t.trans_code, amount: String(t.amount) })
    setModal(t)
  }

  const handleSave = async () => {
    setSaveError(null)
    if (!form.activity_date || !form.trans_code || form.amount === '') {
      setSaveError('Date, Type, and Amount are required.')
      return
    }
    setSaving(true)
    try {
      const payload = buildPayload(form)
      let res
      if (modal === 'add') {
        res = await fetch(`${API_BASE}/upload-duplicates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions: [payload] }) })
      } else {
        res = await fetch(`${API_BASE}/transactions/${modal.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
      await fetch(`${API_BASE}/settings/clear-cache`, { method: 'POST' })
      setModal(null); setForm(EMPTY_FORM)
      queryClient.invalidateQueries()
    } catch (e) { setSaveError(e.message) }
    finally { setSaving(false) }
  }

  // ── Multi-add ─────────────────────────────────────────────────────────────

  const openMultiAdd = () => {
    setShowAddMenu(false); setMultiSaveError(null)
    setMultiRows([{ ...EMPTY_FORM }]); setMultiModal(true)
  }

  const updateRow = (idx, name, value) =>
    setMultiRows(prev => prev.map((r, i) => i === idx ? { ...r, [name]: value } : r))

  const addRow = () =>
    setMultiRows(prev => {
      const last = prev[prev.length - 1]
      return [...prev, { ...EMPTY_FORM, activity_date: last.activity_date, trans_code: last.trans_code }]
    })

  const removeRow = (idx) =>
    setMultiRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const handleMultiSave = async () => {
    setMultiSaveError(null)
    const valid = multiRows.filter(r => r.activity_date && r.trans_code && r.amount !== '')
    if (valid.length === 0) { setMultiSaveError('No valid rows to save.'); return }
    setMultiSaving(true)
    try {
      const res = await fetch(`${API_BASE}/upload-duplicates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions: valid.map(buildPayload) }) })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
      await fetch(`${API_BASE}/settings/clear-cache`, { method: 'POST' })
      setMultiModal(false); setMultiRows([{ ...EMPTY_FORM }])
      queryClient.invalidateQueries()
    } catch (e) { setMultiSaveError(e.message) }
    finally { setMultiSaving(false) }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleConfirmDelete = async () => {
    const t = confirmDelete; setConfirmDelete(null); setDeleting(t.id)
    try {
      const res = await fetch(`${API_BASE}/transactions/${t.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete')
      await fetch(`${API_BASE}/settings/clear-cache`, { method: 'POST' })
      queryClient.invalidateQueries()
    } catch (e) { alert(e.message) }
    finally { setDeleting(null) }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  const exportToExcel = () => {
    const rows = sorted.map(t => {
      const isIncome = t.trans_code === 'MINT' || t.trans_code === 'SLIP'
      const amt = isIncome ? Math.abs(parseFloat(t.amount)) : parseFloat(t.amount)
      return {
        'Activity Date': formatDate(t.activity_date),
        'Type': displayLabel(t.trans_code, t.amount),
        'Ticker': t.ticker || '',
        'Description': t.description || '',
        'Amount': amt,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transfers')
    const datePart = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `transfers_fees_${datePart}.xlsx`)
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputStyle = { padding: '0.5rem 0.75rem', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }
  const cellInput = { padding: '0.35rem 0.5rem', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: '0.82rem', width: '100%', boxSizing: 'border-box' }

  const Th = ({ field, label, align = 'left' }) => (
    <th onClick={() => handleSort(field)} style={{ cursor: 'pointer', userSelect: 'none', padding: '0.6rem 0.75rem', textAlign: align, whiteSpace: 'nowrap', color: theme.text, background: sortBy === field ? theme.border : theme.bgSecondary, borderBottom: `2px solid ${theme.border}` }}>
      {label} {sortBy === field && (sortOrder === 'asc' ? '↑' : '↓')}
    </th>
  )

  const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
  const modalBox = { background: theme.bgSecondary, borderRadius: '10px', boxShadow: theme.shadow, padding: '2rem', width: '90%', maxWidth: '480px' }
  const label = (text) => <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>{text}</label>
  const fieldWrap = { marginBottom: '1rem' }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, color: theme.colors.primary }}>Transfers & Fees</h2>
        <div ref={addMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAddMenu(v => !v)}
            style={{ padding: '0.5rem 1.25rem', background: theme.colors.primary, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            + Add Transfer <span style={{ fontSize: '0.7rem' }}>▾</span>
          </button>
          {showAddMenu && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: theme.bgSecondary, border: `1px solid ${theme.border}`, borderRadius: '6px', boxShadow: theme.shadow, zIndex: 100, minWidth: '160px', overflow: 'hidden' }}>
              {[['Add One', openAdd], ['Add Multiple', openMultiAdd]].map(([lbl, fn]) => (
                <button key={lbl} onClick={fn} style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: theme.text, fontSize: '0.9rem' }}
                  onMouseEnter={e => e.currentTarget.style.background = theme.bg}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text }} />
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text }} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text }}>
          <option value="">All Types</option>
          {ALL_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={exportToExcel}
            disabled={sorted.length === 0}
            style={{ padding: '0.5rem 1rem', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: sorted.length === 0 ? 'not-allowed' : 'pointer', fontSize: '0.9rem', opacity: sorted.length === 0 ? 0.5 : 1 }}
          >
            Export
          </button>
          <button onClick={() => { setStartDate(''); setEndDate(''); setTypeFilter('') }} style={{ padding: '0.5rem 1rem', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>
            Reset
          </button>
        </div>
      </div>

      {(isLoading || sumLoading) && <Spinner />}

      {/* Summary cards */}
      {summary && (
        <div className="cards" style={{ marginBottom: '1.5rem' }}>
          <div className="card positive"><h3>Deposits</h3><div className="value">{formatCurrency(summary.ach_deposits)}</div></div>
          <div className="card negative"><h3>Withdrawals</h3><div className="value">{formatCurrency(summary.ach_withdrawals)}</div></div>
          <div className="card positive"><h3>Interest Earned</h3><div className="value">{formatCurrency(summary.interest_earned)}</div></div>
          <div className="card negative"><h3>Fees Paid</h3><div className="value">{formatCurrency(summary.fees_paid)}</div></div>
        </div>
      )}

      {/* Table */}
      {sorted.length > 0 && (
        <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 420px)', border: `1px solid ${theme.border}`, borderRadius: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <Th field="activity_date" label="Date" />
                <Th field="type" label="Type" />
                <Th field="description" label="Description" />
                <Th field="amount" label="Amount" align="right" />
                <th style={{ background: theme.bgSecondary, color: theme.text, padding: '0.6rem 0.75rem', borderBottom: `2px solid ${theme.border}`, whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => {
                const lbl = displayLabel(t.trans_code, t.amount)
                // MINT (Savings Interest) and SLIP (Stock Loan Income) are income — always show positive/green
                const isIncome = t.trans_code === 'MINT' || t.trans_code === 'SLIP'
                const amt = isIncome ? Math.abs(parseFloat(t.amount)) : parseFloat(t.amount)
                const color = amt >= 0 ? theme.colors.success : theme.colors.danger
                return (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '0.55rem 0.75rem', color: theme.textSecondary, whiteSpace: 'nowrap' }}>{formatDate(t.activity_date)}</td>
                    <td style={{ padding: '0.55rem 0.75rem', fontWeight: '600', whiteSpace: 'nowrap', color }}>{lbl}</td>
                    <td style={{ padding: '0.55rem 0.75rem', color: theme.text }}>{t.description}</td>
                    <td style={{ padding: '0.55rem 0.75rem', fontWeight: 'bold', textAlign: 'right', whiteSpace: 'nowrap', color }}>{formatCurrency(amt)}</td>
                    <td style={{ padding: '0.55rem 0.75rem', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(t)} style={{ marginRight: '0.4rem', padding: '0.25rem 0.65rem', fontSize: '0.8rem', border: `1px solid ${theme.border}`, borderRadius: '4px', cursor: 'pointer', background: theme.bg, color: theme.text }}>Edit</button>
                      <button onClick={() => setConfirmDelete(t)} disabled={deleting === t.id} style={{ padding: '0.25rem 0.65rem', fontSize: '0.8rem', border: 'none', borderRadius: '4px', cursor: 'pointer', background: theme.colors.danger, color: 'white' }}>
                        {deleting === t.id ? '...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && sorted.length === 0 && (
        <p style={{ textAlign: 'center', color: theme.textSecondary, marginTop: '2rem' }}>No transfers found.</p>
      )}

      {/* ── Single add/edit modal ── */}
      {modal !== null && (
        <div style={modalOverlay} onClick={() => setModal(null)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1.25rem', color: theme.text }}>{modal === 'add' ? 'Add Transfer' : 'Edit Transfer'}</h3>
            <div style={fieldWrap}>{label('Date')}<input type="date" value={form.activity_date} onChange={e => setForm(f => ({ ...f, activity_date: e.target.value }))} style={inputStyle} /></div>
            <div style={fieldWrap}>
              {label('Type')}
              <select value={form.trans_code} onChange={e => setForm(f => ({ ...f, trans_code: e.target.value }))} style={inputStyle}>
                {TRANSFER_CODES.map(c => <option key={c} value={c}>{c === 'ACH' ? 'ACH (Deposit / Withdrawal)' : CODE_LABEL[c] || c}</option>)}
              </select>
            </div>
            <div style={fieldWrap}>{label('Description')}<input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" style={inputStyle} /></div>
            <div style={fieldWrap}>{label('Amount (negative = withdrawal/fee)')}<input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 1000 or -25.00" style={inputStyle} /></div>
            {saveError && <p style={{ color: theme.colors.danger, margin: '0 0 1rem', fontSize: '0.88rem' }}>{saveError}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.5rem 1.25rem', background: 'transparent', color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.25rem', background: theme.colors.primary, color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Multi-add modal ── */}
      {multiModal && (
        <div style={modalOverlay} onClick={() => setMultiModal(false)}>
          <div style={{ background: theme.bgSecondary, borderRadius: '10px', boxShadow: theme.shadow, width: '96%', maxWidth: '800px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: theme.text }}>Add Multiple Transfers</h3>
              <button onClick={() => setMultiModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: theme.textSecondary, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr>
                    {['Date', 'Type', 'Description', 'Amount', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: theme.textSecondary, borderBottom: `2px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {multiRows.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '0.4rem 0.5rem', minWidth: '130px' }}>
                        <input type="date" value={row.activity_date} onChange={e => updateRow(idx, 'activity_date', e.target.value)} style={cellInput} />
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', minWidth: '160px' }}>
                        <select value={row.trans_code} onChange={e => updateRow(idx, 'trans_code', e.target.value)} style={cellInput}>
                          {TRANSFER_CODES.map(c => <option key={c} value={c}>{c === 'ACH' ? 'ACH' : CODE_LABEL[c] || c}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', minWidth: '180px' }}>
                        <input type="text" value={row.description} onChange={e => updateRow(idx, 'description', e.target.value)} placeholder="Optional" style={cellInput} />
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', minWidth: '120px' }}>
                        <input type="number" step="0.01" value={row.amount} onChange={e => updateRow(idx, 'amount', e.target.value)} placeholder="e.g. 500" style={cellInput} />
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        <button onClick={() => removeRow(idx)} style={{ padding: '0.2rem 0.5rem', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '4px', cursor: 'pointer', color: theme.colors.danger, fontSize: '0.8rem' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addRow} style={{ marginTop: '0.75rem', padding: '0.4rem 1rem', background: 'none', border: `1px dashed ${theme.border}`, borderRadius: '6px', cursor: 'pointer', color: theme.textSecondary, fontSize: '0.85rem' }}>
                + Add Row
              </button>
            </div>
            {multiSaveError && <p style={{ color: theme.colors.danger, margin: '0 1.5rem', fontSize: '0.88rem' }}>{multiSaveError}</p>}
            <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${theme.border}`, display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setMultiModal(false)} style={{ padding: '0.5rem 1.25rem', background: 'transparent', color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleMultiSave} disabled={multiSaving} style={{ padding: '0.5rem 1.5rem', background: theme.colors.primary, color: 'white', border: 'none', borderRadius: '6px', cursor: multiSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {multiSaving ? 'Saving...' : `Save ${multiRows.filter(r => r.activity_date && r.trans_code && r.amount !== '').length} Transfer(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete modal ── */}
      {confirmDelete && (
        <div style={modalOverlay}>
          <div style={{ ...modalBox, maxWidth: '400px' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: theme.text }}>Delete Transfer</h3>
            <p style={{ margin: '0 0 1.5rem', color: theme.textSecondary, fontSize: '0.95rem' }}>
              Delete the <strong style={{ color: theme.text }}>{displayLabel(confirmDelete.trans_code, confirmDelete.amount)}</strong> of <strong style={{ color: theme.text }}>{formatCurrency(confirmDelete.amount)}</strong> on {formatDate(confirmDelete.activity_date)}? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '0.5rem 1.25rem', background: 'transparent', color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleConfirmDelete} style={{ padding: '0.5rem 1.25rem', background: theme.colors.danger, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
