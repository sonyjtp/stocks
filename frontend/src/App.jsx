import { useContext } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeContext, ThemeProvider } from './context/ThemeContext'
import Dashboard from './pages/Dashboard'
import TransactionHistory from './pages/TransactionHistory'
import CurrentHoldings from './pages/CurrentHoldings'
import AllTimePerformance from './pages/AllTimePerformance'
import PnLSummary from './pages/PnLSummary'
import Transfers from './pages/Transfers'
import Upload from './pages/Upload'
import UploadHistory from './pages/UploadHistory'
import Settings from './pages/Settings'
import './App.css'

const queryClient = new QueryClient()

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
            <li><Link to="/dashboard" style={{ color: theme.text, textDecoration: 'none' }}>Dashboard</Link></li>
            <li><Link to="/holdings" style={{ color: theme.text, textDecoration: 'none' }}>Holdings</Link></li>
            <li><Link to="/performance" style={{ color: theme.text, textDecoration: 'none' }}>Performance</Link></li>
            <li><Link to="/pnl" style={{ color: theme.text, textDecoration: 'none' }}>P&L</Link></li>
            <li><Link to="/" style={{ color: theme.text, textDecoration: 'none' }}>Trades History</Link></li>
            <li><Link to="/transfers" style={{ color: theme.text, textDecoration: 'none' }}>Transfers</Link></li>
            <li><Link to="/upload" style={{ color: theme.text, textDecoration: 'none' }}>Upload</Link></li>
            <li><Link to="/settings" style={{ color: theme.text, textDecoration: 'none' }}>Settings</Link></li>
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
            <Route path="/pnl" element={<PnLSummary />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/upload-history" element={<UploadHistory />} />
            <Route path="/settings" element={<Settings />} />
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
