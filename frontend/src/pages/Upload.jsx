import { useState, useContext } from 'react'
import { ThemeContext } from '../context/ThemeContext'
import UploadHistory from './UploadHistory'

const API_BASE = 'http://localhost:8765/api'

const STATUS = { PENDING: 'pending', UPLOADING: 'uploading', SUCCESS: 'success', ERROR: 'error' }

export default function Upload() {
  const { theme } = useContext(ThemeContext)
  const [files, setFiles] = useState([])
  const [textInput, setTextInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState([])
  const [selectedDuplicates, setSelectedDuplicates] = useState({}) // fileIndex -> Set of dup indexes
  const [uploadingDups, setUploadingDups] = useState({})
  const [expandedDups, setExpandedDups] = useState({}) // fileIndex -> bool
  const [validating, setValidating] = useState(false)
  const [validateModal, setValidateModal] = useState(null) // null or { filename, total_rows, error_count, errors }

  const formatCurrency = (val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val
    return isNaN(num) ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US') : '-'

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || [])
    setFiles(selected)
    setResults([])
  }

  const uploadFile = async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) {
      const msg = data.detail
        ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
        : 'Upload failed'
      throw new Error(msg)
    }
    return data
  }

  const handleBulkUpload = async () => {
    if (files.length === 0 && !textInput.trim()) return

    setUploading(true)
    setResults([])

    const filesToProcess = [...files]

    // Add text input as virtual file
    if (textInput.trim()) {
      const blob = new Blob([textInput], { type: 'text/csv' })
      filesToProcess.push(new File([blob], 'pasted-transactions.csv', { type: 'text/csv' }))
    }

    // Initialize results with pending state
    const initialResults = filesToProcess.map(f => ({
      name: f.name,
      status: STATUS.PENDING,
      inserted: 0,
      csvDuplicates: [],
      dbDuplicates: [],
      error: null,
    }))
    setResults(initialResults)

    // Upload each file sequentially
    for (let i = 0; i < filesToProcess.length; i++) {
      setResults(prev => prev.map((r, idx) =>
        idx === i ? { ...r, status: STATUS.UPLOADING } : r
      ))

      try {
        const data = await uploadFile(filesToProcess[i])
        setResults(prev => prev.map((r, idx) =>
          idx === i ? {
            ...r,
            status: STATUS.SUCCESS,
            inserted: data.rows_inserted,
            csvDuplicates: data.duplicates || [],
            dbDuplicates: data.db_duplicates || [],
          } : r
        ))
      } catch (err) {
        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, status: STATUS.ERROR, error: err.message } : r
        ))
      }
    }

    setUploading(false)
    setFiles([])
    setTextInput('')
    document.getElementById('file-input').value = ''
  }

  const toggleDup = (fileIdx, dupIdx) => {
    setSelectedDuplicates(prev => {
      const set = new Set(prev[fileIdx] || [])
      set.has(dupIdx) ? set.delete(dupIdx) : set.add(dupIdx)
      return { ...prev, [fileIdx]: set }
    })
  }

  const toggleAllDups = (fileIdx, csvDups) => {
    setSelectedDuplicates(prev => {
      const set = prev[fileIdx] || new Set()
      if (set.size === csvDups.length) {
        return { ...prev, [fileIdx]: new Set() }
      }
      return { ...prev, [fileIdx]: new Set(csvDups.map((_, i) => i)) }
    })
  }

  const uploadSelectedDups = async (fileIdx) => {
    const selected = selectedDuplicates[fileIdx] || new Set()
    if (selected.size === 0) return

    const csvDups = results[fileIdx].csvDuplicates
    const transactions = Array.from(selected).map(i => ({ broker: 'robinhood', ...csvDups[i] }))

    setUploadingDups(prev => ({ ...prev, [fileIdx]: true }))
    try {
      const res = await fetch(`${API_BASE}/upload-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.detail
          ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
          : 'Failed'
        throw new Error(msg)
      }

      // Remove uploaded dups from the list, update inserted count
      const remaining = csvDups.filter((_, i) => !selected.has(i))
      setResults(prev => prev.map((r, idx) =>
        idx === fileIdx
          ? { ...r, inserted: r.inserted + data.rows_inserted, csvDuplicates: remaining }
          : r
      ))
      setSelectedDuplicates(prev => ({ ...prev, [fileIdx]: new Set() }))
    } catch (err) {
      alert(`Error: ${err.message}`)
    } finally {
      setUploadingDups(prev => ({ ...prev, [fileIdx]: false }))
    }
  }

  const handleValidate = async () => {
    const filesToValidate = [...files]
    if (textInput.trim()) {
      const blob = new Blob([textInput], { type: 'text/csv' })
      filesToValidate.push(new File([blob], 'pasted-transactions.csv', { type: 'text/csv' }))
    }
    if (filesToValidate.length === 0) return

    setValidating(true)
    // Validate each file and merge results
    const allErrors = []
    let totalRows = 0
    let firstName = filesToValidate[0].name

    for (const file of filesToValidate) {
      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await fetch(`${API_BASE}/validate`, { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail || 'Validation failed')
        totalRows += data.total_rows
        // Prefix row errors with filename if multiple files
        const prefix = filesToValidate.length > 1 ? `[${file.name}] ` : ''
        for (const e of data.errors) {
          allErrors.push({ ...e, filePrefix: prefix })
        }
      } catch (err) {
        allErrors.push({
          row: '—', date: '', ticker: '', description: '', trans_code: '', quantity: '', price: '', amount: '',
          errors: [`Could not validate: ${err.message}`],
          filePrefix: filesToValidate.length > 1 ? `[${file.name}] ` : '',
        })
      }
    }

    setValidating(false)
    setValidateModal({
      filename: filesToValidate.length === 1 ? firstName : `${filesToValidate.length} files`,
      total_rows: totalRows,
      error_count: allErrors.length,
      errors: allErrors,
    })
  }

  const card = { background: theme.bgSecondary, borderRadius: '8px', boxShadow: theme.shadow, padding: '1.5rem', marginBottom: '1rem' }
  const badge = (text, color) => (
    <span style={{ background: color, color: 'white', borderRadius: '4px', padding: '0.2rem 0.6rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
      {text}
    </span>
  )

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0)
  const totalCsvDups = results.reduce((s, r) => s + r.csvDuplicates.length, 0)
  const totalDbDups = results.reduce((s, r) => s + r.dbDuplicates.length, 0)
  const totalErrors = results.filter(r => r.status === STATUS.ERROR).length
  const totalSuccess = results.filter(r => r.status === STATUS.SUCCESS).length

  return (
    <div>
      <h2 style={{ color: theme.colors.primary }}>Upload Transactions</h2>

      {/* How to export guide */}
      <div style={{ ...card, borderLeft: `4px solid ${theme.colors.info}`, marginBottom: '1.5rem' }}>
        <h3 style={{ marginTop: 0, color: theme.text }}>How to Export Your Robinhood Data</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', fontSize: '0.9rem' }}>
          <div>
            <div style={{ fontWeight: 'bold', color: theme.colors.success, marginBottom: '0.5rem' }}>CSV (Recommended) — Full History</div>
            <ol style={{ margin: 0, paddingLeft: '1.25rem', color: theme.textSecondary, lineHeight: '1.8' }}>
              <li>Open Robinhood app or website</li>
              <li>Go to <strong style={{ color: theme.text }}>Account → Reports &amp; Statements</strong></li>
              <li>Tap <strong style={{ color: theme.text }}>Tax Documents</strong> or <strong style={{ color: theme.text }}>Activity Reports</strong></li>
              <li>Select a year and download the <strong style={{ color: theme.text }}>CSV</strong></li>
              <li>Repeat for each year you traded</li>
            </ol>
            <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: theme.bg, borderRadius: '4px', fontSize: '0.82rem', color: theme.colors.success }}>
              CSV files contain complete buy/sell/dividend/ACH history and parse with correct ticker symbols.
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 'bold', color: theme.colors.warning, marginBottom: '0.5rem' }}>PDF — Monthly Statements</div>
            <ol style={{ margin: 0, paddingLeft: '1.25rem', color: theme.textSecondary, lineHeight: '1.8' }}>
              <li>Open Robinhood app or website</li>
              <li>Go to <strong style={{ color: theme.text }}>Account → Reports &amp; Statements</strong></li>
              <li>Tap <strong style={{ color: theme.text }}>Monthly Statements</strong></li>
              <li>Download PDFs for the months you need</li>
            </ol>
            <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: theme.bg, borderRadius: '4px', fontSize: '0.82rem', color: theme.colors.warning }}>
              PDFs use CUSIP lookup to find ticker symbols — may be slower and less complete than CSV.
            </div>
          </div>
        </div>
      </div>

      {/* Upload area */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
        <div style={card}>
          <h3 style={{ marginTop: 0, color: theme.text }}>Upload Files</h3>
          <div
            style={{
              border: `2px dashed ${theme.border}`,
              borderRadius: '8px',
              padding: '2rem',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: theme.bg,
              transition: 'border-color 0.2s',
            }}
            onClick={() => document.getElementById('file-input').click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv') || f.name.endsWith('.pdf'))
              setFiles(dropped)
              setResults([])
            }}
          >
            <input
              id="file-input"
              type="file"
              accept=".csv,.pdf"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📂</div>
            <p style={{ margin: 0, color: theme.textSecondary, fontSize: '0.9rem' }}>
              {files.length > 0
                ? `${files.length} file(s) selected`
                : 'Click or drag & drop CSV/PDF files here'}
            </p>
            {files.length > 0 && (
              <ul style={{ textAlign: 'left', marginTop: '1rem', color: theme.text, fontSize: '0.85rem' }}>
                {files.map((f, i) => (
                  <li key={i}>{f.name} <span style={{ color: theme.textSecondary }}>({(f.size / 1024).toFixed(1)} KB)</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0, color: theme.text }}>Paste CSV Data</h3>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={`Activity Date,Ticker,Description,Type,Quantity,Price,Amount\n01/02/2018,AAPL,Apple Inc,Buy,10,150.00,-1500.00`}
            style={{
              width: '100%',
              minHeight: '160px',
              padding: '0.75rem',
              borderRadius: '4px',
              border: `1px solid ${theme.border}`,
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              boxSizing: 'border-box',
              background: theme.bg,
              color: theme.text,
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleValidate}
          disabled={validating || uploading || (files.length === 0 && !textInput.trim())}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: (validating || uploading || (files.length === 0 && !textInput.trim())) ? theme.colors.neutral : theme.colors.warning,
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: (validating || uploading || (files.length === 0 && !textInput.trim())) ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
          }}
        >
          {validating ? 'Validating...' : 'Validate First'}
        </button>
        <button
          onClick={handleBulkUpload}
          disabled={uploading || validating || (files.length === 0 && !textInput.trim())}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: (uploading || validating || (files.length === 0 && !textInput.trim())) ? theme.colors.neutral : theme.colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
          }}
        >
          {uploading ? `Uploading... (${results.filter(r => r.status === STATUS.SUCCESS || r.status === STATUS.ERROR).length}/${results.length})` : `Upload ${files.length > 1 ? `${files.length} Files` : 'File'}`}
        </button>
      </div>

      {/* Validation modal */}
      {validateModal && (
        <div
          onClick={() => setValidateModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: theme.bgSecondary, borderRadius: '10px', boxShadow: theme.shadow,
              width: '90%', maxWidth: '900px', maxHeight: '80vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '1.25rem 1.5rem', borderBottom: `1px solid ${theme.border}`,
            }}>
              <div>
                <h3 style={{ margin: 0, color: theme.text }}>Validation Results — {validateModal.filename}</h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: theme.textSecondary }}>
                  {validateModal.total_rows} rows parsed
                  {validateModal.error_count === 0
                    ? ' — no errors found'
                    : ` — ${validateModal.error_count} row${validateModal.error_count !== 1 ? 's' : ''} with errors`}
                </p>
              </div>
              <button
                onClick={() => setValidateModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: theme.textSecondary, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div style={{ overflowY: 'auto', padding: '1.5rem' }}>
              {validateModal.error_count === 0 ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem',
                  color: theme.colors.success, gap: '0.5rem',
                }}>
                  <div style={{ fontSize: '2.5rem' }}>✓</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>All {validateModal.total_rows} rows look good!</div>
                  <div style={{ fontSize: '0.9rem', color: theme.textSecondary }}>No validation errors were found. The file is ready to upload.</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: theme.bg, position: 'sticky', top: 0 }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary, whiteSpace: 'nowrap' }}>Row</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary, whiteSpace: 'nowrap' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary }}>Ticker</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary }}>Type</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary }}>Amount</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: `2px solid ${theme.border}`, color: theme.colors.danger }}>Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validateModal.errors.map((e, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.border}`, background: i % 2 === 0 ? theme.bg : 'transparent' }}>
                        <td style={{ padding: '0.6rem 0.75rem', color: theme.textSecondary, whiteSpace: 'nowrap' }}>{e.filePrefix}{e.row}</td>
                        <td style={{ padding: '0.6rem 0.75rem', color: theme.text, whiteSpace: 'nowrap' }}>{e.date || '—'}</td>
                        <td style={{ padding: '0.6rem 0.75rem', color: theme.text, fontWeight: e.ticker ? 'bold' : 'normal' }}>{e.ticker || '—'}</td>
                        <td style={{ padding: '0.6rem 0.75rem', color: theme.text }}>{e.trans_code || '—'}</td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: theme.text }}>{e.quantity || '—'}</td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: theme.text }}>{e.amount ? formatCurrency(Math.abs(parseFloat(e.amount))) : '—'}</td>
                        <td style={{ padding: '0.6rem 0.75rem', color: theme.colors.danger }}>
                          {e.errors.map((msg, j) => (
                            <div key={j} style={{ marginBottom: j < e.errors.length - 1 ? '0.25rem' : 0 }}>• {msg}</div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              padding: '1rem 1.5rem', borderTop: `1px solid ${theme.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
            }}>
              <span style={{ fontSize: '0.95rem', color: theme.text, fontWeight: '500' }}>
                Upload this file?
              </span>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => setValidateModal(null)}
                  style={{
                    padding: '0.5rem 1.5rem', background: 'transparent', color: theme.text,
                    border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
                  }}
                >
                  No, Cancel
                </button>
                <button
                  onClick={() => { setValidateModal(null); handleBulkUpload() }}
                  style={{
                    padding: '0.5rem 1.5rem', background: theme.colors.primary, color: 'white',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
                  }}
                >
                  Yes, Upload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary banner */}
      {results.length > 0 && results.every(r => r.status !== STATUS.UPLOADING && r.status !== STATUS.PENDING) && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <SummaryTile label="Files Processed" value={results.length} color={theme.colors.info} theme={theme} />
          <SummaryTile label="Succeeded" value={totalSuccess} color={theme.colors.success} theme={theme} />
          <SummaryTile label="Failed" value={totalErrors} color={theme.colors.danger} theme={theme} />
          <SummaryTile label="Transactions Imported" value={totalInserted} color={theme.colors.primary} theme={theme} />
          <SummaryTile label="Within-file Duplicates" value={totalCsvDups} color={theme.colors.warning} theme={theme} />
          <SummaryTile label="Already in DB" value={totalDbDups} color={theme.colors.neutral} theme={theme} />
        </div>
      )}

      {/* Per-file results */}
      {results.length > 0 && (
        <div>
          <h3 style={{ color: theme.text }}>Results per File</h3>
          {results.map((r, fileIdx) => (
            <div key={fileIdx} style={{ ...card, borderLeft: `4px solid ${r.status === STATUS.ERROR ? theme.colors.danger : r.status === STATUS.SUCCESS ? theme.colors.success : r.status === STATUS.UPLOADING ? theme.colors.warning : theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>
                    {r.status === STATUS.SUCCESS ? '✅' : r.status === STATUS.ERROR ? '❌' : r.status === STATUS.UPLOADING ? '⏳' : '⏸️'}
                  </span>
                  <strong style={{ color: theme.text }}>{r.name}</strong>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {r.status === STATUS.SUCCESS && badge(`${r.inserted} imported`, theme.colors.success)}
                  {r.csvDuplicates.length > 0 && badge(`${r.csvDuplicates.length} within-file dups`, theme.colors.warning)}
                  {r.dbDuplicates.length > 0 && badge(`${r.dbDuplicates.length} already in DB`, theme.colors.neutral)}
                  {r.status === STATUS.ERROR && badge('FAILED', theme.colors.danger)}
                  {r.status === STATUS.UPLOADING && badge('Uploading...', theme.colors.warning)}
                  {r.status === STATUS.PENDING && badge('Pending', theme.colors.neutral)}
                </div>
              </div>

              {r.status === STATUS.ERROR && (
                <p style={{ color: theme.colors.danger, margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{r.error}</p>
              )}

              {/* Within-file duplicates section */}
              {r.csvDuplicates.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <button
                      onClick={() => setExpandedDups(prev => ({ ...prev, [fileIdx]: !prev[fileIdx] }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.warning, fontWeight: 'bold', padding: 0 }}
                    >
                      {expandedDups[fileIdx] ? '▾' : '▸'} Within-file duplicates ({r.csvDuplicates.length}) — select to upload
                    </button>
                    {expandedDups[fileIdx] && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => toggleAllDups(fileIdx, r.csvDuplicates)}
                          style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', border: `1px solid ${theme.border}`, borderRadius: '4px', cursor: 'pointer', background: theme.bg, color: theme.text }}
                        >
                          {(selectedDuplicates[fileIdx]?.size || 0) === r.csvDuplicates.length ? 'Deselect All' : 'Select All'}
                        </button>
                        <button
                          onClick={() => uploadSelectedDups(fileIdx)}
                          disabled={!(selectedDuplicates[fileIdx]?.size > 0) || uploadingDups[fileIdx]}
                          style={{
                            padding: '0.3rem 0.75rem',
                            fontSize: '0.8rem',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: !(selectedDuplicates[fileIdx]?.size > 0) ? 'not-allowed' : 'pointer',
                            background: !(selectedDuplicates[fileIdx]?.size > 0) ? theme.colors.neutral : theme.colors.success,
                            color: 'white',
                          }}
                        >
                          {uploadingDups[fileIdx] ? 'Uploading...' : `Upload Selected (${selectedDuplicates[fileIdx]?.size || 0})`}
                        </button>
                      </div>
                    )}
                  </div>

                  {expandedDups[fileIdx] && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: theme.bg, borderBottom: `2px solid ${theme.border}` }}>
                          <th style={{ padding: '0.5rem', width: '32px' }}>
                            <input type="checkbox"
                              checked={(selectedDuplicates[fileIdx]?.size || 0) === r.csvDuplicates.length}
                              onChange={() => toggleAllDups(fileIdx, r.csvDuplicates)}
                            />
                          </th>
                          <th style={{ textAlign: 'left', padding: '0.5rem', color: theme.textSecondary }}>Date</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem', color: theme.textSecondary }}>Ticker</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem', color: theme.textSecondary }}>Type</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem', color: theme.textSecondary }}>Qty</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem', color: theme.textSecondary }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.csvDuplicates.map((d, dupIdx) => (
                          <tr key={dupIdx} style={{ borderBottom: `1px solid ${theme.border}`, background: selectedDuplicates[fileIdx]?.has(dupIdx) ? theme.bg : 'transparent' }}>
                            <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                              <input type="checkbox" checked={selectedDuplicates[fileIdx]?.has(dupIdx) || false} onChange={() => toggleDup(fileIdx, dupIdx)} />
                            </td>
                            <td style={{ padding: '0.5rem', color: theme.text }}>{formatDate(d.activity_date)}</td>
                            <td style={{ padding: '0.5rem', color: theme.text }}>{d.ticker || '-'}</td>
                            <td style={{ padding: '0.5rem', color: theme.text }}>{d.trans_code}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right', color: theme.text }}>{d.quantity ? parseFloat(d.quantity).toFixed(4) : '-'}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right', color: theme.text }}>{formatCurrency(Math.abs(parseFloat(d.amount)))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Already in DB section */}
              {r.dbDuplicates.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <button
                    onClick={() => setExpandedDups(prev => ({ ...prev, [`db-${fileIdx}`]: !prev[`db-${fileIdx}`] }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textSecondary, padding: 0, fontSize: '0.9rem' }}
                  >
                    {expandedDups[`db-${fileIdx}`] ? '▾' : '▸'} Already in database ({r.dbDuplicates.length}) — skipped
                  </button>
                  {expandedDups[`db-${fileIdx}`] && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.7 }}>
                      <thead>
                        <tr style={{ background: theme.bg, borderBottom: `2px solid ${theme.border}` }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem', color: theme.textSecondary }}>Date</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem', color: theme.textSecondary }}>Ticker</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem', color: theme.textSecondary }}>Type</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem', color: theme.textSecondary }}>Qty</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem', color: theme.textSecondary }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.dbDuplicates.map((d, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: '0.5rem', color: theme.text }}>{formatDate(d.activity_date)}</td>
                            <td style={{ padding: '0.5rem', color: theme.text }}>{d.ticker || '-'}</td>
                            <td style={{ padding: '0.5rem', color: theme.text }}>{d.trans_code}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right', color: theme.text }}>{d.quantity ? parseFloat(d.quantity).toFixed(4) : '-'}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right', color: theme.text }}>{formatCurrency(Math.abs(parseFloat(d.amount)))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload History inline */}
      <div style={{ marginTop: '3rem', borderTop: `2px solid ${theme.border}`, paddingTop: '2rem' }}>
        <UploadHistory />
      </div>
    </div>
  )
}

function SummaryTile({ label, value, color, theme }) {
  return (
    <div style={{
      background: theme.bgSecondary,
      borderRadius: '8px',
      padding: '1rem 1.5rem',
      borderTop: `3px solid ${color}`,
      boxShadow: theme.shadow,
      minWidth: '130px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: theme.textSecondary, marginTop: '0.25rem' }}>{label}</div>
    </div>
  )
}
