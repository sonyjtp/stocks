import { useState, useContext } from 'react'
import { ThemeContext } from '../context/ThemeContext'

const API_BASE = 'http://localhost:8765/api'

export default function Settings() {
  const { theme, isDark, setIsDark } = useContext(ThemeContext)
  const [clearingCache, setClearingCache] = useState(false)
  const [cacheMsg, setCacheMsg] = useState(null)

  const card = {
    background: theme.bgSecondary,
    borderRadius: '8px',
    boxShadow: theme.shadow,
    padding: '1.5rem',
    marginBottom: '1.5rem',
  }

  const clearCache = async () => {
    setClearingCache(true)
    setCacheMsg(null)
    try {
      const res = await fetch(`${API_BASE}/settings/clear-cache`, { method: 'POST' })
      const data = await res.json()
      setCacheMsg({ ok: true, text: data.message })
    } catch (e) {
      setCacheMsg({ ok: false, text: 'Failed to clear cache' })
    } finally {
      setClearingCache(false)
    }
  }

  return (
    <div>
      <h2 style={{ color: theme.colors.primary }}>Settings</h2>

      {/* Appearance */}
      <div style={card}>
        <h3 style={{ marginTop: 0, color: theme.text }}>Appearance</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: theme.text }}>Theme</span>
          <button
            onClick={() => setIsDark(!isDark)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1.25rem',
              background: theme.colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.95rem',
            }}
          >
            {isDark ? '☀️ Switch to Light Mode' : '🌙 Switch to Dark Mode'}
          </button>
        </div>
      </div>

      {/* Cache */}
      <div style={card}>
        <h3 style={{ marginTop: 0, color: theme.text }}>Cache</h3>
        <p style={{ color: theme.textSecondary, marginTop: 0 }}>
          The backend caches P&L, holdings, and transaction data for 5 minutes to improve performance.
          Clear the cache if you see stale data after an upload.
        </p>
        {cacheMsg && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            background: cacheMsg.ok ? '#dcfce7' : '#fee2e2',
            color: cacheMsg.ok ? '#166534' : '#991b1b',
            fontSize: '0.9rem',
          }}>
            {cacheMsg.ok ? '✅' : '❌'} {cacheMsg.text}
          </div>
        )}
        <button
          onClick={clearCache}
          disabled={clearingCache}
          style={{
            padding: '0.6rem 1.5rem',
            background: clearingCache ? theme.colors.neutral : theme.colors.warning,
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: clearingCache ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
          }}
        >
          {clearingCache ? 'Clearing...' : '🗑️ Clear Cache'}
        </button>
      </div>

      {/* About */}
      <div style={card}>
        <h3 style={{ marginTop: 0, color: theme.text }}>About</h3>
        <p style={{ color: theme.textSecondary, margin: 0, fontSize: '0.9rem' }}>
          Stock Tracker — tracks Robinhood transactions, holdings, and P&L.<br />
          Supports CSV and PDF upload formats.
        </p>
      </div>
    </div>
  )
}
