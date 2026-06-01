import { useState } from 'react'

export default function Upload() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setError('')
    }
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
      setMessage(`${data.message} (${data.rows_inserted} new rows)`)
      setFile(null)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2>Upload CSV</h2>

      {error && <div className="error">{error}</div>}
      {message && <div style={{ background: '#e6ffe6', color: '#27ae60', padding: '1rem', borderRadius: '4px' }}>{message}</div>}

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
    </div>
  )
}
