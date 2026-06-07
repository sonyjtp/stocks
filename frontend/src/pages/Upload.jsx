import { useState } from 'react'

export default function Upload() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [duplicates, setDuplicates] = useState({ csv: [], db: [] })
  const [selectedDuplicates, setSelectedDuplicates] = useState(new Set())
  const [uploadingDuplicates, setUploadingDuplicates] = useState(false)

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setError('')
    }
  }

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

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file')
      return
    }

    setLoading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('http://localhost:8765/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Upload failed')

      const data = await response.json()
      setMessage(`${data.message}`)
      setFile(null)
      setError('')
      if (data.duplicates && data.duplicates.length > 0) {
        setDuplicates({ csv: data.duplicates, db: data.db_duplicates || [] })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleDuplicateSelection = (index) => {
    const newSelected = new Set(selectedDuplicates)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedDuplicates(newSelected)
  }

  const toggleAllDuplicates = () => {
    const csvLen = duplicates.csv.length
    if (selectedDuplicates.size === csvLen) {
      setSelectedDuplicates(new Set())
    } else {
      setSelectedDuplicates(new Set(duplicates.csv.map((_, i) => i)))
    }
  }

  const copySelectedDuplicates = () => {
    let csvText = 'Activity Date,Ticker,Description,Type,Quantity,Price,Amount\n'
    Array.from(selectedDuplicates).forEach(idx => {
      const d = duplicates.csv[idx]
      csvText += `${formatDate(d.activity_date)},${d.ticker || ''},${d.description},${d.trans_code},${d.quantity || ''},${d.price || ''},${d.amount}\n`
    })
    navigator.clipboard.writeText(csvText)
    alert(`${selectedDuplicates.size} duplicate(s) copied to clipboard!`)
  }

  const uploadSelectedDuplicates = async () => {
    if (selectedDuplicates.size === 0) {
      alert('Please select at least one duplicate to upload')
      return
    }

    setUploadingDuplicates(true)
    const selectedTrans = Array.from(selectedDuplicates).map(idx => duplicates.csv[idx])

    try {
      const response = await fetch('http://localhost:8765/api/upload-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: selectedTrans }),
      })

      if (!response.ok) throw new Error('Upload failed')

      const data = await response.json()
      alert(`Successfully uploaded ${data.rows_inserted} transaction(s)`)
      const newCsvDups = duplicates.csv.filter((_, i) => !selectedDuplicates.has(i))
      setDuplicates({ csv: newCsvDups, db: duplicates.db })
      setSelectedDuplicates(new Set())
    } catch (err) {
      alert(`Error uploading: ${err.message}`)
    } finally {
      setUploadingDuplicates(false)
    }
  }

  return (
    <div>
      <h2>Upload CSV</h2>

      {error && <div className="error">{error}</div>}
      {message && <div style={{ background: '#e6ffe6', color: '#27ae60', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>{message}</div>}

      <div className="upload-area" onClick={() => document.getElementById('file-input').click()}>
        <input
          id="file-input"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
        />
        <p>{file ? file.name : 'Click to select CSV file or drag and drop'}</p>
      </div>

      {file && (
        <button onClick={handleUpload} disabled={loading} style={{ marginTop: '1rem' }}>
          {loading ? 'Uploading...' : 'Upload'}
        </button>
      )}

      {(duplicates.csv.length > 0 || duplicates.db.length > 0) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '800px',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>
              Duplicate Transactions Found
            </h3>

            {duplicates.csv.length > 0 && (
              <>
                <h4 style={{ marginTop: '1rem', marginBottom: '0.75rem', color: '#e74c3c' }}>
                  In CSV File ({duplicates.csv.length})
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd', backgroundColor: '#f9f9f9' }}>
                      <th style={{ textAlign: 'center', padding: '0.5rem', fontWeight: 'bold', width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedDuplicates.size === duplicates.csv.length && duplicates.csv.length > 0}
                          onChange={toggleAllDuplicates}
                        />
                      </th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 'bold' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 'bold' }}>Ticker</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 'bold' }}>Description</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 'bold' }}>Type</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem', fontWeight: 'bold' }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem', fontWeight: 'bold' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicates.csv.map((d, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #eee', backgroundColor: selectedDuplicates.has(idx) ? '#e8f4f8' : 'white' }}>
                        <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                          <input
                            type="checkbox"
                            checked={selectedDuplicates.has(idx)}
                            onChange={() => toggleDuplicateSelection(idx)}
                          />
                        </td>
                        <td style={{ padding: '0.5rem' }}>{formatDate(d.activity_date)}</td>
                        <td style={{ padding: '0.5rem' }}>{d.ticker || '-'}</td>
                        <td style={{ padding: '0.5rem' }}>{d.description}</td>
                        <td style={{ padding: '0.5rem' }}>{d.trans_code}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>{d.quantity ? parseFloat(d.quantity).toFixed(4) : '-'}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatCurrency(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {duplicates.db.length > 0 && (
              <>
                <h4 style={{ marginTop: '1rem', marginBottom: '0.75rem', color: '#27ae60' }}>
                  Already in Database ({duplicates.db.length})
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.9rem', opacity: 0.7 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd', backgroundColor: '#f9f9f9' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 'bold' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 'bold' }}>Ticker</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 'bold' }}>Description</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 'bold' }}>Type</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem', fontWeight: 'bold' }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem', fontWeight: 'bold' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicates.db.map((d, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #eee', backgroundColor: '#f0f0f0' }}>
                        <td style={{ padding: '0.5rem' }}>{formatDate(d.activity_date)}</td>
                        <td style={{ padding: '0.5rem' }}>{d.ticker || '-'}</td>
                        <td style={{ padding: '0.5rem' }}>{d.description}</td>
                        <td style={{ padding: '0.5rem' }}>{d.trans_code}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>{d.quantity ? parseFloat(d.quantity).toFixed(4) : '-'}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatCurrency(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDuplicates({ csv: [], db: [] })}
                style={{
                  padding: '0.5rem 1.5rem',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
              <button
                onClick={copySelectedDuplicates}
                disabled={selectedDuplicates.size === 0}
                style={{
                  padding: '0.5rem 1.5rem',
                  backgroundColor: selectedDuplicates.size === 0 ? '#bdc3c7' : '#f39c12',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: selectedDuplicates.size === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Copy Selected ({selectedDuplicates.size})
              </button>
              <button
                onClick={uploadSelectedDuplicates}
                disabled={selectedDuplicates.size === 0 || uploadingDuplicates}
                style={{
                  padding: '0.5rem 1.5rem',
                  backgroundColor: selectedDuplicates.size === 0 ? '#bdc3c7' : '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: selectedDuplicates.size === 0 || uploadingDuplicates ? 'not-allowed' : 'pointer',
                }}
              >
                {uploadingDuplicates ? 'Uploading...' : `Upload Selected (${selectedDuplicates.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
