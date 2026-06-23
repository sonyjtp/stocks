import { useState, useContext } from 'react'
import { ThemeContext } from '../context/ThemeContext'

const API_BASE = 'http://localhost:8765/api'

export default function Settings() {
  const { theme, isDark, setIsDark } = useContext(ThemeContext)
  const [clearingCache, setClearingCache] = useState(false)
  const [cacheMsg, setCacheMsg] = useState(null)

  const [takeProfitPct, setTakeProfitPct] = useState(() => parseFloat(localStorage.getItem('signal_take_profit') ?? '20'))
  const [stopLossPct, setStopLossPct] = useState(() => parseFloat(localStorage.getItem('signal_stop_loss') ?? '10'))
  const [rallyPct, setRallyPct] = useState(() => parseFloat(localStorage.getItem('signal_rally') ?? '5'))
  const [thresholdSaved, setThresholdSaved] = useState(false)

  const saveThresholds = () => {
    localStorage.setItem('signal_take_profit', takeProfitPct)
    localStorage.setItem('signal_stop_loss', stopLossPct)
    localStorage.setItem('signal_rally', rallyPct)
    setThresholdSaved(true)
    setTimeout(() => setThresholdSaved(false), 2000)
  }

  const card = {
    background: theme.bgSecondary,
    borderRadius: '8px',
    boxShadow: theme.shadow,
    padding: '1.5rem',
    marginBottom: '1.5rem',
  }

  const inputStyle = {
    padding: '0.5rem 0.75rem', borderRadius: '4px', border: `1px solid ${theme.border}`,
    background: theme.bg, color: theme.text, fontSize: '0.9rem', width: '100%', boxSizing: 'border-box',
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

      {/* Signal Thresholds */}
      <div style={card}>
        <h3 style={{ marginTop: 0, color: theme.text }}>Signal Thresholds</h3>
        <p style={{ color: theme.textSecondary, marginTop: 0, marginBottom: '1rem', fontSize: '0.9rem' }}>
          Holdings that cross these thresholds appear as signals on the Dashboard.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>
              Take Profit — unrealized gain above (%)
            </label>
            <input
              type="number" min="1" max="1000" value={takeProfitPct}
              onChange={e => setTakeProfitPct(parseFloat(e.target.value) || 20)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>
              Stop Loss — unrealized loss below (%)
            </label>
            <input
              type="number" min="1" max="100" value={stopLossPct}
              onChange={e => setStopLossPct(parseFloat(e.target.value) || 10)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: theme.textSecondary }}>
              5-Day Rally — price up over 5 days above (%)
            </label>
            <input
              type="number" min="1" max="100" value={rallyPct}
              onChange={e => setRallyPct(parseFloat(e.target.value) || 5)}
              style={inputStyle}
            />
          </div>
        </div>
        {thresholdSaved && (
          <div style={{ padding: '0.6rem 0.9rem', background: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '0.88rem', marginBottom: '0.75rem' }}>
            Thresholds saved.
          </div>
        )}
        <button
          onClick={saveThresholds}
          style={{ padding: '0.6rem 1.5rem', background: theme.colors.primary, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Save Thresholds
        </button>
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
