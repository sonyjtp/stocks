import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TransactionHistory from './pages/TransactionHistory'
import CurrentHoldings from './pages/CurrentHoldings'
import AllTimePerformance from './pages/AllTimePerformance'
import PnLSummary from './pages/PnLSummary'
import Transfers from './pages/Transfers'
import Upload from './pages/Upload'
import './App.css'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="app">
          <nav className="navbar">
            <h1>Stock Tracker</h1>
            <ul>
              <li><Link to="/holdings">Holdings</Link></li>
              <li><Link to="/performance">Performance</Link></li>
              <li><Link to="/pnl">P&L</Link></li>
              <li><Link to="/">Transactions</Link></li>
              <li><Link to="/transfers">Transfers</Link></li>
              <li><Link to="/upload">Upload</Link></li>
            </ul>
          </nav>

          <main className="content">
            <Routes>
              <Route path="/" element={<TransactionHistory />} />
              <Route path="/holdings" element={<CurrentHoldings />} />
              <Route path="/performance" element={<AllTimePerformance />} />
              <Route path="/pnl" element={<PnLSummary />} />
              <Route path="/transfers" element={<Transfers />} />
              <Route path="/upload" element={<Upload />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
