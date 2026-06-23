import { useContext, useState, useRef, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { ThemeContext, ThemeProvider } from './context/ThemeContext'
import Dashboard from './pages/Dashboard'
import TransactionHistory from './pages/TransactionHistory'
import CurrentHoldings from './pages/CurrentHoldings'
import AllTimePerformance from './pages/AllTimePerformance'
import Transfers from './pages/Transfers'
import Upload from './pages/Upload'
import UploadHistory from './pages/UploadHistory'
import Settings from './pages/Settings'
import StockDetail from './pages/StockDetail'
import SectorDetail from './pages/SectorDetail'
import './App.css'

const queryClient = new QueryClient()

function TickerSearch({ theme }) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const navigate = useNavigate()
  const wrapperRef = useRef(null)

  const { data: allTickers = [] } = useQuery({
    queryKey: ['all-tickers'],
    queryFn: async () => {
      const res = await fetch('http://localhost:8765/api/report/consolidated?broker=robinhood')
      if (!res.ok) return []
      const data = await res.json()
      return (data.report || []).map(r => r.ticker).sort()
    },
    staleTime: 5 * 60 * 1000,
  })

  const query = input.trim().toUpperCase()
  const suggestions = query.length >= 2 ? allTickers.filter(t => t.startsWith(query)) : []

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const go = (ticker) => {
    setInput('')
    setOpen(false)
    setHighlighted(-1)
    navigate(`/stock/${ticker}`)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, -1))
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlighted(-1)
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          highlighted >= 0 ? go(suggestions[highlighted]) : query && go(query)
        }}
        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
      >
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); setHighlighted(-1) }}
          onKeyDown={handleKeyDown}
          placeholder="Search ticker…"
          style={{
            width: '130px',
            padding: '0.3rem 0.6rem',
            borderRadius: '4px',
            border: `1px solid ${theme.border}`,
            background: theme.bg,
            color: theme.text,
            fontSize: '0.85rem',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          style={{
            background: theme.colors.primary,
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            padding: '0.3rem 0.6rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          Go
        </button>
      </form>
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          background: theme.bgSecondary,
          border: `1px solid ${theme.border}`,
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          minWidth: '130px',
          overflow: 'hidden',
        }}>
          {suggestions.map((t, i) => (
            <div
              key={t}
              onMouseDown={() => go(t)}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: i === highlighted ? theme.colors.primary : 'transparent',
                color: i === highlighted ? '#fff' : theme.text,
              }}
            >
              {t}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AppContent() {
  const { theme, isDark, setIsDark } = useContext(ThemeContext)

  return (
    <BrowserRouter>
      <div
        className="app"
        style={{
          backgroundColor: theme.bg,
          color: theme.text,
          minHeight: '100vh',
          transition: 'background-color 0.3s, color 0.3s',
        }}
      >
        <nav
          className="navbar"
          style={{
            backgroundColor: theme.bgSecondary,
            borderBottom: `1px solid ${theme.border}`,
            boxShadow: theme.shadow,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 2rem',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <h1 style={{ margin: '0', fontSize: '1.5rem', color: theme.colors.primary }}>
            📈 Stock Tracker
          </h1>
          <ul
            style={{
              display: 'flex',
              gap: '2rem',
              listStyle: 'none',
              margin: 0,
              padding: 0,
            }}
          >
            {[
              { to: '/dashboard', label: 'Dashboard' },
              { to: '/holdings', label: 'Holdings' },
              { to: '/performance', label: 'Performance' },
              { to: '/', label: 'Trades History', end: true },
              { to: '/transfers', label: 'Transfers' },
              { to: '/upload', label: 'Upload' },
              { to: '/settings', label: 'Settings' },
            ].map(({ to, label, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  style={({ isActive }) => ({
                    color: isActive ? theme.colors.primary : theme.text,
                    textDecoration: 'none',
                    fontWeight: isActive ? '600' : '400',
                    borderBottom: isActive ? `2px solid ${theme.colors.primary}` : '2px solid transparent',
                    paddingBottom: '4px',
                  })}
                >
                  {label}
                </NavLink>
              </li>
            ))}
            <li style={{ display: 'flex', alignItems: 'center' }}>
              <TickerSearch theme={theme} />
            </li>
            <li>
              <button
                onClick={() => setIsDark(!isDark)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  padding: 0,
                }}
              >
                {isDark ? '☀️' : '🌙'}
              </button>
            </li>
          </ul>
        </nav>

        <main className="content" style={{ padding: '2rem' }}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/" element={<TransactionHistory />} />
            <Route path="/holdings" element={<CurrentHoldings />} />
            <Route path="/performance" element={<AllTimePerformance />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/upload-history" element={<UploadHistory />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/stock/:ticker" element={<StockDetail />} />
            <Route path="/sector/:sector" element={<SectorDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
