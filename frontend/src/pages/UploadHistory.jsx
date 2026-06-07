import { useState, useContext } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ThemeContext } from '../context/ThemeContext'
import Spinner from '../components/Spinner'

const API_BASE = 'http://localhost:8765/api'

export default function UploadHistory() {
  const { theme } = useContext(ThemeContext)
  const queryClient = useQueryClient()
  const [expandedLog, setExpandedLog] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [clearingAll, setClearingAll] = useState(false)

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['upload-logs'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/upload-logs`)
      if (!res.ok) throw new Error('Failed to load upload logs')
      return res.json()
    },
  })

  const { data: errors = [], isFetching: errFetching } = useQuery({
    queryKey: ['upload-errors', expandedLog],
    queryFn: async () => {
      if (!expandedLog) return []
      const res = await fetch(`${API_BASE}/upload-logs/${expandedLog}/errors`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: expandedLog !== null,
  })

  const deleteLog = async (id) => {
    setDeletingId(id)
    try {
      await fetch(`${API_BASE}/upload-logs/${id}`, { method: 'DELETE' })
      if (expandedLog === id) setExpandedLog(null)
      queryClient.invalidateQueries(['upload-logs'])
    } finally {
      setDeletingId(null)
    }
  }

  const clearAll = async () => {
    if (!window.confirm('Clear all upload history? This cannot be undone.')) return
    setClearingAll(true)
    try {
      await fetch(`${API_BASE}/upload-logs`, { method: 'DELETE' })
      setExpandedLog(null)
      queryClient.invalidateQueries(['upload-logs'])
    } finally {
      setClearingAll(false)
    }
  }

  const fmt = (dt) => {
    if (!dt) return '-'
    return new Date(dt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const badge = (text, color) => (
    <span style={{
      background: color, color: 'white', borderRadius: '4px',
      padding: '0.15rem 0.5rem', fontSize: '0.78rem', fontWeight: 'bold',
    }}>
      {text}
    </span>
  )

  const card = {
    background: theme.bgSecondary, borderRadius: '8px',
    boxShadow: theme.shadow, marginBottom: '1rem', overflow: 'hidden',
  }

  const totalInserted = logs.reduce((s, l) => s + (l.rows_inserted || 0), 0)
  const totalFailed = logs.filter(l => l.status === 'error').length
  const totalCsvDups = logs.reduce((s, l) => s + (l.csv_duplicates || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, color: theme.colors.primary }}>Upload History</h2>
        {logs.length > 0 && (
          <button
            onClick={clearAll}
            disabled={clearingAll}
            style={{
              padding: '0.5rem 1.25rem', background: theme.colors.danger,
              color: 'white', border: 'none', borderRadius: '6px',
              cursor: clearingAll ? 'not-allowed' : 'pointer', fontSize: '0.9rem',
            }}
          >
            {clearingAll ? 'Clearing...' : '🗑️ Clear All History'}
          </button>
        )}
      </div>

      {/* Summary tiles */}
      {logs.length > 0 && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Total Uploads', value: logs.length, color: theme.colors.info },
            { label: 'Transactions Imported', value: totalInserted.toLocaleString(), color: theme.colors.success },
            { label: 'Failed Uploads', value: totalFailed, color: theme.colors.danger },
            { label: 'Within-file Duplicates', value: totalCsvDups.toLocaleString(), color: theme.colors.warning },
          ].map(t => (
            <div key={t.label} style={{
              background: theme.bgSecondary, borderRadius: '8px', padding: '1rem 1.5rem',
              borderTop: `3px solid ${t.color}`, boxShadow: theme.shadow, minWidth: '140px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: t.color }}>{t.value}</div>
              <div style={{ fontSize: '0.8rem', color: theme.textSecondary, marginTop: '0.25rem' }}>{t.label}</div>
            </div>
          ))}
        </div>
      )}

      {isLoading && <Spinner />}

      {!isLoading && logs.length === 0 && (
        <div style={{ ...card, padding: '3rem', textAlign: 'center', color: theme.textSecondary }}>
          No upload history yet. Upload some files to see results here.
        </div>
      )}

      {logs.map(log => (
        <div key={log.id} style={card}>
          {/* Log header row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
            flexWrap: 'wrap', borderLeft: `4px solid ${log.status === 'error' ? theme.colors.danger : theme.colors.success}`,
          }}>
            <span style={{ fontSize: '1.1rem' }}>{log.status === 'error' ? '❌' : '✅'}</span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 'bold', color: theme.text, fontSize: '0.95rem', wordBreak: 'break-all' }}>
                {log.filename}
              </div>
              <div style={{ color: theme.textSecondary, fontSize: '0.82rem', marginTop: '0.2rem' }}>
                {fmt(log.upload_time)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {badge(`${log.rows_inserted} imported`, theme.colors.success)}
              {log.csv_duplicates > 0 && badge(`${log.csv_duplicates} CSV dups`, theme.colors.warning)}
              {log.db_duplicates > 0 && badge(`${log.db_duplicates} DB dups`, theme.colors.neutral)}
              {log.failed_count > 0 && badge(`${log.failed_count} row errors`, theme.colors.danger)}
              {log.status === 'error' && badge('FILE ERROR', theme.colors.danger)}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(log.failed_count > 0 || log.status === 'error') && (
                <button
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  style={{
                    padding: '0.35rem 0.85rem', fontSize: '0.82rem', border: `1px solid ${theme.border}`,
                    borderRadius: '4px', cursor: 'pointer', background: expandedLog === log.id ? theme.colors.primary : theme.bg,
                    color: expandedLog === log.id ? 'white' : theme.text,
                  }}
                >
                  {expandedLog === log.id ? 'Hide Details' : 'Show Details'}
                </button>
              )}
              <button
                onClick={() => deleteLog(log.id)}
                disabled={deletingId === log.id}
                style={{
                  padding: '0.35rem 0.85rem', fontSize: '0.82rem', border: 'none',
                  borderRadius: '4px', cursor: 'pointer', background: theme.colors.danger, color: 'white',
                }}
              >
                {deletingId === log.id ? '...' : 'Delete'}
              </button>
            </div>
          </div>

          {/* File-level error */}
          {log.status === 'error' && log.error_message && (
            <div style={{ padding: '0.75rem 1.25rem', background: '#fee2e2', color: '#991b1b', fontSize: '0.88rem' }}>
              <strong>Error:</strong> {log.error_message}
            </div>
          )}

          {/* Row-level errors */}
          {expandedLog === log.id && (
            <div style={{ padding: '1rem 1.25rem', borderTop: `1px solid ${theme.border}` }}>
              {errFetching ? (
                <Spinner />
              ) : errors.length === 0 ? (
                <p style={{ color: theme.textSecondary, margin: 0 }}>No row-level errors recorded.</p>
              ) : (
                <>
                  <h4 style={{ marginTop: 0, color: theme.text }}>Failed Rows ({errors.length})</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: theme.bg, borderBottom: `2px solid ${theme.border}` }}>
                          {['Date', 'Ticker', 'Type', 'Qty', 'Amount', 'Reason'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '0.5rem', color: theme.textSecondary }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {errors.map(e => (
                          <tr key={e.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: '0.5rem', color: theme.text }}>{e.activity_date || '-'}</td>
                            <td style={{ padding: '0.5rem', color: theme.text }}>{e.ticker || '-'}</td>
                            <td style={{ padding: '0.5rem', color: theme.text }}>{e.trans_code || '-'}</td>
                            <td style={{ padding: '0.5rem', color: theme.text }}>{e.quantity || '-'}</td>
                            <td style={{ padding: '0.5rem', color: theme.text }}>{e.amount || '-'}</td>
                            <td style={{ padding: '0.5rem', color: theme.colors.danger, maxWidth: '300px' }}>{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
