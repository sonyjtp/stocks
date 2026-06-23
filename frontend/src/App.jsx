import { useContext, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
import './App.css'

const queryClient = new QueryClient()

function TickerSearch({ theme }) {
  const [input, setInput] = useState('')
  const navigate = useNavigate()

  const go = () => {
    const ticker = input.trim().toUpperCase()
    if (!ticker) return
    setInput('')
    navigate(`/stock/${ticker}`)
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); go() }}
      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
    >
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
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
