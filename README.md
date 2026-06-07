# Stock Trading Tracker

A comprehensive stock trading dashboard for tracking transaction history, analyzing portfolio performance, and managing holdings across multiple brokers. Currently supports Robinhood CSV imports with extensibility for other brokers.

## ✨ Features

### 📊 Pages & Reports

1. **Transaction History** — Complete log of all trades and cash movements
   - Filter by date range, ticker, and transaction type (Buy/Sell/Dividend)
   - Sortable columns for date, ticker, description, quantity, price, and amount
   - View dividends, fees, and transfers

2. **Current Holdings** — Real-time portfolio view
   - Shares held and average cost basis (FIFO calculation)
   - Current price from Yahoo Finance
   - Current value and unrealized P&L (colored by gain/loss)
   - Sortable by any column including calculated fields
   - Total unrealized P&L summary

3. **All-Time Performance** — Per-ticker historical statistics
   - Shares bought/sold/held breakdown
   - Total spent and received for each ticker
   - Dividends earned per ticker
   - Realized P&L (including unrealized losses on delisted stocks)
   - Average cost basis (FIFO method)

4. **P&L Summary** — Overall portfolio performance breakdown
   - **Sold Shares** section: cost basis, proceeds, realized P&L
   - **Held Shares** section: cost basis, current value, unrealized P&L
   - Summary: realized + unrealized + dividends - fees = net P&L
   - Investment totals for reference
   - Date range filtering for period analysis

5. **Transfers & Fees** — Bank transfers and account charges
   - ACH deposits/withdrawals with amounts and dates
   - Interest earned
   - Subscription fees (Robinhood Gold) and margin interest
   - Summary: total deposits, withdrawals, interest, and fees

### 🎯 Core Features

- ✅ **CSV Upload** - Import Robinhood transaction exports
- ✅ **Smart Deduplication** - Automatic detection of duplicate transactions on re-upload with option to upload selected duplicates
- ✅ **FIFO Cost Basis** - Accurate average cost calculation using First-In-First-Out method
- ✅ **Real-time Stock Prices** - Live price updates from Yahoo Finance
- ✅ **Delisted Stock Handling** - Correctly calculates losses for delisted holdings
- ✅ **Fast Queries** - Redis caching with 5-minute TTL for performance
- ✅ **Advanced Filtering** - Date ranges, ticker search, transaction type filtering
- ✅ **Sortable Tables** - Click any column header to sort ascending/descending
- ✅ **Color Coding** - Gains in green, losses in red for quick visual scanning
- ✅ **Comprehensive Logging** - Colored logs with DEBUG/INFO/WARNING/ERROR levels

## 🛠️ Tech Stack

- **Backend:** FastAPI (Python 3.11+) + SQLAlchemy ORM + async support
- **Frontend:** React 18 + Vite + React Query
- **Database:** PostgreSQL 15 with persistent volumes
- **Cache:** Redis 7 with persistence
- **Testing:** pytest with 85% coverage requirement, pre-commit hooks, GitHub Actions CI/CD
- **Linting:** Black, isort, flake8, bandit, mypy
- **Port Allocation:**
  - Backend API: `8765` (http://localhost:8765)
  - Frontend: `5174` (http://localhost:5174)
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

2. **Configure environment (optional, defaults included):**
   ```bash
   # .env.local is pre-configured for local development
   # See ENV_SETUP.md for configuration details
   export $(cat .env.local | xargs)
   ```

3. **Start Docker containers:**
   ```bash
   docker compose up -d
   ```

4. **Install backend dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

5. **Start backend (from project root):**
   ```bash
   uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8765
   ```

6. **Install & run frontend (in another terminal):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

7. **Open browser:**
   - Frontend: http://localhost:5174
   - API docs: http://localhost:8765/docs

## 📊 How to Use This Application

### Step 1: Download Your Transaction History from Robinhood

1. Log in to **[Robinhood](https://robinhood.com)**
2. Go to **Account** → **Reports & Statements** → **Activity Reports**
3. Click **Export Activity** (or **Download** if available)
4. Select date range (or "All time" to get everything)
5. Choose **CSV format**
6. Click **Download** and save the file (typically `activity.csv`)

**Expected CSV columns:**
```
Activity Date, Process Date, Settle Date, Symbol, Description, Trans Code, Quantity, Price, Amount
```

### Step 2: Upload to the Application

1. Open the application in your browser: **http://localhost:5174**
2. Click the **Upload** tab in the navigation
3. Click the upload area and select your CSV file
4. Click **Upload**
5. If duplicates are detected:
   - Review the duplicates in the modal
   - Select which duplicates to upload (or close to skip)
   - Click **Upload Selected**

### Step 3: View Your Portfolio Data

Once uploaded, navigate to each page:

1. **Holdings** - Current positions with average cost (FIFO) and unrealized P&L
2. **Performance** - All-time statistics per ticker (bought/sold/held, P&L)
3. **P&L Summary** - Overall portfolio breakdown (realized vs unrealized)
4. **Transfers** - Bank deposits/withdrawals and fees
5. **Transaction History** - Complete log of all trades, dividends, and transfers

### Features You Can Use

- **Filter by date range** - Select dates to narrow down reports
- **Filter by ticker** - Search for specific stocks
- **Sort columns** - Click any column header to sort (ascending/descending)
- **View unrealized P&L** - See gains/losses on your current holdings (in green/red)
- **Analyze realized P&L** - Understand profit/loss from trades you've completed
- **Track dividends** - See all dividends earned per stock

### Re-uploading Data

If you download an updated CSV from Robinhood later:

1. Go to the **Upload** page again
2. Upload the new CSV
3. The application will **automatically detect duplicates**
4. You'll see a modal with:
   - **In CSV File** - New duplicates within the file (select which to upload)
   - **Already in Database** - Transactions already imported (read-only)
5. Select which new transactions to add and upload

**Note:** The application uses FIFO (First-In-First-Out) cost basis calculation, so your average cost may differ from Robinhood's simple average.

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

## 👨‍💻 Development

### Testing & Code Quality

**Test Coverage:** 85% minimum (enforced in CI/CD)

```bash
# Run tests with coverage
pytest --cov=backend/app --cov-report=html

# Run all linters
make lint

# Format code
make format
```

**Tools:**
- **pytest** - Unit and integration tests
- **Black** - Code formatting (100 char lines)
- **isort** - Import sorting
- **flake8** - Style linting
- **bandit** - Security scanning
- **mypy** - Type checking (optional)
- **pre-commit hooks** - Run checks before commits
- **GitHub Actions** - CI/CD on every push/PR

**Quick Commands:**
```bash
make install          # Install dependencies
make test            # Run tests
make coverage        # Generate coverage report
make lint            # Check code quality
make format          # Auto-format code
make pre-commit      # Install git hooks
make clean           # Clean test artifacts
```

### Backend Architecture
- **SQLAlchemy ORM** - Database models and queries
- **FastAPI** - Async web framework with auto-generated docs
- **Redis** - Caching layer with 5-minute TTL
- **FIFO Cost Basis** - Accurate share cost tracking
- **Structured Logging** - Colored output with timestamps

### Frontend Architecture
- **React 18** - Modern UI with hooks
- **React Router** - Client-side navigation
- **React Query** - Server state management with caching
- **Responsive Design** - Mobile-friendly layout
- **Real-time Updates** - Live stock price fetching

### Database Schema
Single `transactions` table normalized for flexibility:

```sql
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  broker VARCHAR,           -- robinhood/stash/fidelity
  activity_date DATE,
  process_date DATE,
  settle_date DATE,
  ticker VARCHAR,           -- NULL for non-equity transactions
  description TEXT,
  trans_code VARCHAR,       -- Buy/Sell/CDIV/INT/ACH/GOLD/MINT
  quantity NUMERIC(18,6),   -- NULL for non-equity
  price NUMERIC(18,4),      -- NULL for non-equity
  amount NUMERIC(18,4)      -- Negative for expenses, positive for income
);
```

## ⚙️ Configuration

### Environment Variables

`.env.local` is pre-configured for local development with Docker Compose. For production or custom setup:

**Database:**
- `DATABASE_URL` - PostgreSQL connection string
  - Default: `postgresql+psycopg://stocks_user:stocks_password@localhost:5436/stocks_db`

**Cache:**
- `REDIS_URL` - Redis connection string
  - Default: `redis://localhost:6380`

**Frontend:**
- `FRONTEND_URL_1` - Primary frontend origin (default: `http://localhost:5174`)
- `FRONTEND_URL_2` - Secondary frontend origin (default: `http://localhost:3000`)

**API:**
- `API_HOST` - Server host (default: `0.0.0.0`)
- `API_PORT` - Server port (default: `8765`)
- `API_TITLE` - API documentation title
- `LOG_LEVEL` - Logging verbosity: DEBUG/INFO/WARNING/ERROR (default: INFO)

**Security:**
- `CORS_CREDENTIALS` - Allow credentials in CORS (default: true)
- `ALLOW_METHODS` - Allowed HTTP methods (default: *)
- `ALLOW_HEADERS` - Allowed headers (default: *)

### Setup Production Environment

```bash
# Copy template
cp .env.example .env

# Edit with production values
nano .env

# Load environment
export $(cat .env | xargs)

# Start backend
uvicorn backend.app.main:app --host 0.0.0.0 --port 8765
```

## 🐛 Troubleshooting

**Backend fails to connect to database:**
```bash
docker ps | grep stocks              # Check containers are running
docker logs stocks-postgres          # View database logs
echo $DATABASE_URL                   # Verify connection string
psql postgresql://stocks_user:stocks_password@localhost:5436/stocks_db -c "SELECT 1;"
```

**Frontend can't reach API:**
```bash
curl http://localhost:8765/health    # Verify backend is running
echo $FRONTEND_URL_1                  # Check CORS configuration
# Check browser console (F12 → Console) for CORS errors
```

**CSV upload fails:**
- Verify Robinhood CSV format (headers: Activity Date, Process Date, Settle Date, Symbol, Description, Trans Code, Quantity, Price, Amount)
- Check backend logs: `tail -f /tmp/uvicorn.log`
- Check upload modal for duplicate transactions (can select which to upload)

**Cache issues - data seems stale:**
```bash
curl -X POST http://localhost:8765/admin/clear-cache    # Clear Redis
redis-cli KEYS '*'                                        # View cache keys
```

**Tests failing:**
```bash
pytest -v                                  # Verbose output
pytest -s                                  # Show print statements  
pytest -x                                  # Stop at first failure
pytest --cov=backend/app --cov-report=html # View coverage gaps
# Open htmlcov/index.html in browser
```

## 📈 Performance & Optimization

- **Caching:** All API responses cached for 5 minutes (Redis)
- **FIFO Calculation:** Computed on-demand, results cached
- **Batch Operations:** Price fetches batched to reduce API calls
- **Large Uploads:** CSV parser efficiently handles thousands of transactions
- **Database:** Single table design optimized for query flexibility

## License

Personal project for stock portfolio tracking.
