# Stock Trading Tracker

A personal stock trading dashboard for tracking transaction history, performance analytics, and portfolio management across multiple brokers. Currently supports Robinhood, with extensibility for Stash and Fidelity.

## Features

### Pages & Reports

1. **Transaction History** — Complete log of all trades, dividends, and cash movements
   - Filter by date range
   - View all Buy/Sell/CDIV transactions
   - Sortable columns for date, ticker, price, and amount

2. **Consolidated Report** — Per-ticker performance summary
   - Current holdings (shares held, average cost)
   - All-time statistics: shares bought/sold, total spent/received, dividends, realized P&L

3. **P&L Summary** — Overall portfolio performance with date filtering
   - Total invested and received
   - Gross P&L from trades
   - Dividends earned
   - Fees paid (Gold subscription + margin interest)
   - **Net P&L** (after all fees and dividends)

4. **Transfers & Fees** — Bank transfers and account charges
   - ACH deposits/withdrawals
   - Interest earned
   - Subscription and margin fees

### Features

- ✅ CSV upload from Robinhood exports
- ✅ Automatic deduplication on re-upload
- ✅ Real-time calculation of holdings, P&L, and summaries
- ✅ Responsive UI with date range filtering
- ✅ Redis caching for fast aggregation queries
- ✅ RESTful API for programmatic access

## Tech Stack

- **Backend:** FastAPI (Python) + SQLAlchemy ORM
- **Frontend:** React 18 + Vite
- **Database:** PostgreSQL 15
- **Cache:** Redis 7
- **Port Allocation:**
  - Backend API: `8765`
  - Frontend: `5174`
  - PostgreSQL: `5436`
  - Redis: `6380`

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.14+
- Node.js 18+
- Virtual environment (recommended)

### Setup

1. **Clone and navigate:**
   ```bash
   cd stocks
   ```

2. **Start Docker containers:**
   ```bash
   docker compose up -d
   ```

3. **Install backend dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start backend (from project root):**
   ```bash
   uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8765
   ```

5. **Install & run frontend (in another terminal):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

6. **Open browser:**
   - Frontend: http://localhost:5174
   - API docs: http://localhost:8765/docs

### Upload Data

1. Export your Robinhood transaction history as a CSV file
2. Go to the "Upload" page in the UI
3. Select your CSV file and upload
4. View your data across all 4 report pages

## Project Structure

```
stocks/
├── backend/
│   └── app/
│       ├── main.py                 # FastAPI app entry
│       ├── models.py               # SQLAlchemy models
│       ├── schemas.py              # Pydantic schemas
│       ├── database.py             # DB connection
│       ├── cache.py                # Redis helpers
│       ├── parsers/
│       │   └── robinhood.py        # CSV parser
│       └── routers/
│           ├── upload.py           # CSV upload endpoint
│           ├── transactions.py     # Page 1 API
│           ├── holdings.py         # Page 2 API
│           ├── pnl.py              # Page 3 API
│           └── transfers.py        # Page 4 API
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Main app + routing
│   │   ├── App.css                 # Global styles
│   │   ├── main.jsx                # React entry
│   │   └── pages/
│   │       ├── TransactionHistory.jsx
│   │       ├── ConsolidatedReport.jsx
│   │       ├── PnLSummary.jsx
│   │       ├── Transfers.jsx
│   │       └── Upload.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
├── docker-compose.yml              # Postgres + Redis
├── requirements.txt                # Python deps
└── tmp/
    └── sample.csv                  # Sample Robinhood export

```

## API Endpoints

### Upload
- `POST /api/upload` — Upload Robinhood CSV export

### Transactions (Page 1)
- `GET /api/transactions?broker=robinhood&start=&end=` — Transaction history

### Holdings & Report (Page 2)
- `GET /api/report/consolidated?broker=robinhood` — Per-ticker holdings and P&L

### P&L Summary (Page 3)
- `GET /api/report/pnl?broker=robinhood&start=&end=` — Portfolio performance

### Transfers (Page 4)
- `GET /api/transfers?broker=robinhood&start=&end=` — ACH and fee transactions
- `GET /api/report/transfers?broker=robinhood&start=&end=` — Transfers summary

All endpoints support optional date range filtering via `start` and `end` query parameters (format: `YYYY-MM-DD`).

## CSV Format

The application expects Robinhood CSV exports with the following columns:

```
Activity Date, Process Date, Settle Date, Instrument, Description, Trans Code, Quantity, Price, Amount
```

Supported transaction types:
- `Buy` / `Sell` — Equity trades
- `CDIV` — Cash dividends
- `INT` — Interest payments
- `ACH` — Bank transfers
- `GOLD` — Robinhood Gold subscription fee
- `MINT` — Margin interest charge

## Future Enhancements

- Support for Stash and Fidelity CSV imports
- Interactive charts and graphs (portfolio performance over time)
- Dividend tracking and reinvestment analytics
- Tax reporting (realized gains/losses)
- Real-time price quotes and current valuations
- Multi-account aggregation
- User authentication and persistent storage

## Development

### Backend
- Uses SQLAlchemy for ORM with PostgreSQL
- FastAPI with async support
- Redis for caching with 5-minute TTL
- CORS enabled for localhost:5174

### Frontend
- React 18 with React Router for navigation
- Tanstack React Query for server state management
- Recharts for future charting needs
- Responsive CSS Grid layout

### Database
Single `transactions` table with transaction codes to differentiate types:

```sql
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  broker VARCHAR (robinhood/stash/fidelity),
  activity_date DATE,
  process_date DATE,
  settle_date DATE,
  ticker VARCHAR (nullable),
  description TEXT,
  trans_code VARCHAR (Buy/Sell/INT/GOLD/CDIV/MINT/ACH),
  quantity NUMERIC(18,6),
  price NUMERIC(18,4),
  amount NUMERIC(18,4)
);
```

## Troubleshooting

**Backend fails to connect to database:**
- Ensure Docker containers are running: `docker ps`
- Check database is healthy: `docker logs stocks-postgres-1`
- Verify DATABASE_URL in `backend/app/database.py` matches docker-compose ports

**Frontend can't reach API:**
- Verify backend is running on port 8765: `curl http://localhost:8765/health`
- Check browser console for CORS errors
- Ensure API URL in frontend code is `http://localhost:8765`

**CSV upload fails:**
- Confirm file is valid Robinhood export (check column headers)
- Check backend logs: `tail -f /tmp/backend.log`
- Verify file uses standard Robinhood CSV format

## License

Personal project for stock portfolio tracking.
