# Stock Trading Tracker

A comprehensive stock trading dashboard for tracking transaction history, analyzing portfolio performance, and managing holdings across multiple brokers. Currently supports Robinhood CSV and PDF imports with extensibility for other brokers.

![Python](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-dc382d?logo=redis&logoColor=white)
![License](https://img.shields.io/badge/License-Personal%20Project-lightgrey)

![Coverage](https://img.shields.io/badge/Coverage-85%25-brightgreen)
![Tests](https://img.shields.io/badge/Tests-pytest-blue?logo=pytest&logoColor=white)
![Code Quality](https://img.shields.io/badge/Code%20Quality-Black%2Fisort%2Fflake8-black)



## ✨ Features

### 📊 Pages & Reports

1. **Transaction History** — Complete log of all trades and cash movements
   - Filter by date range, ticker, and transaction type (Buy/Sell/Dividend)
   - Sortable columns for date, ticker, description, quantity, price, and amount
   - Scrollable table with sticky header for large datasets
   - **Manually add a transaction** via the "+ Add Transaction" button
   - **Auto-fill** when adding: if a ticker is active in the filter, the form pre-populates the ticker and description (company name + CUSIP)
   - **Edit any transaction** via the pencil button on each row — opens a pre-filled modal with all existing values

2. **Current Holdings** — Real-time portfolio view
   - Shares held and average cost basis (FIFO calculation)
   - Current price from Yahoo Finance
   - Current value and unrealized P&L (colored by gain/loss)
   - Sortable by any column including calculated fields
   - Total unrealized P&L summary
   - Scrollable table with sticky header

3. **All-Time Performance** — Per-ticker historical statistics
   - Shares bought/sold/held breakdown
   - Total spent and received for each ticker
   - Dividends earned per ticker
   - Realized P&L (including unrealized losses on delisted stocks)
   - Average cost basis (FIFO method)
   - Scrollable table with sticky header

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

6. **Upload** — Import transaction history
   - Upload Robinhood CSV or PDF exports
   - Step-by-step export instructions displayed in-app
   - Upload history log shown inline below the upload form

### 🎯 Core Features

- ✅ **CSV & PDF Upload** - Import Robinhood transaction exports in either format
- ✅ **Smart Deduplication** - Automatic detection of duplicate transactions on re-upload with option to upload selected duplicates
- ✅ **FIFO Cost Basis** - Accurate cost calculation using First-In-First-Out method, including broker transfers (CONV) and stock splits (SPL/SPR)
- ✅ **Real-time Stock Prices** - Live price updates from Yahoo Finance
- ✅ **Write-off Support** - Record worthless securities at $0 to recognize cost basis as realized loss
- ✅ **Manually Add Transactions** - Enter any transaction directly without uploading a file
- ✅ **Edit Transactions** - Modify any existing transaction; values pre-fill in the edit modal
- ✅ **Fast Queries** - Redis caching with 5-minute TTL for performance
- ✅ **Advanced Filtering** - Date ranges, ticker search, transaction type filtering
- ✅ **Sortable Tables** - Click any column header to sort ascending/descending
- ✅ **Scrollable Tables** - Sticky headers with vertical scroll for large datasets
- ✅ **Sticky Navbar** - Navigation bar stays anchored at the top while scrolling
- ✅ **Dark/Light Theme** - Toggle between dark and light mode
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

**Option A — CSV (Recommended)**

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

**Option B — PDF (Monthly Statements)**

1. Log in to **[Robinhood](https://robinhood.com)**
2. Go to **Account** → **Reports & Statements** → **Monthly Statements**
3. Download the PDF for the desired month
4. Upload the PDF directly — the app extracts transactions automatically

### Step 2: Upload to the Application

1. Open the application in your browser: **http://localhost:5174**
2. Click the **Upload** tab in the navigation
3. Click the upload area and select your CSV or PDF file
4. Click **Upload**
5. If duplicates are detected:
   - Review the duplicates in the modal
   - Select which duplicates to upload (or close to skip)
   - Click **Upload Selected**
6. Your upload history appears below the upload form for reference

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
- **Add transactions manually** - Use "+ Add Transaction" on the Transactions page; if a ticker is in the filter, the form auto-fills with the ticker and its description
- **Edit transactions** - Click the pencil icon on any row to edit with pre-filled values

### Re-uploading Data

If you download an updated CSV from Robinhood later:

1. Go to the **Upload** page again
2. Upload the new CSV
3. The application will **automatically detect duplicates**
4. You'll see a modal with:
   - **In CSV File** - New duplicates within the file (select which to upload)
   - **Already in Database** - Transactions already imported (read-only)
5. Select which new transactions to add and upload

**Note:** The application uses FIFO (First-In-First-Out) cost basis calculation, so your average cost may differ from Robinhood's simple average. Broker transfers (CONV) use a $0 cost basis, and stock splits (SPL/SPR) adjust existing lots proportionally.

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
│       │   ├── robinhood.py        # CSV parser
│       │   └── robinhood_pdf.py    # PDF parser (OpenFIGI CUSIP lookup)
│       └── routers/
│           ├── upload.py           # CSV/PDF upload endpoint
│           ├── transactions.py     # Transaction history + add/edit API
│           ├── holdings.py         # Current holdings API
│           ├── pnl.py              # P&L report API (FIFO with CONV/SPL/SPR)
│           └── transfers.py        # Transfers & fees API
├── backend/tests/
│   ├── test_robinhood_csv.py       # 36 tests for CSV parser
│   ├── test_robinhood_pdf.py       # 55 tests for PDF parser
│   └── test_pnl.py                 # 21 tests for FIFO P&L calculation
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Main app + routing + sticky navbar
│   │   ├── App.css                 # Global styles
│   │   ├── main.jsx                # React entry
│   │   ├── context/
│   │   │   └── ThemeContext.jsx    # Dark/light theme provider
│   │   ├── components/
│   │   │   └── Spinner.jsx         # Loading spinner
│   │   └── pages/
│   │       ├── TransactionHistory.jsx  # Add/edit transactions
│   │       ├── CurrentHoldings.jsx
│   │       ├── AllTimePerformance.jsx
│   │       ├── PnLSummary.jsx
│   │       ├── Transfers.jsx
│   │       ├── Upload.jsx          # Upload + inline history
│   │       ├── UploadHistory.jsx   # Upload log component
│   │       └── Settings.jsx
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
- `POST /api/upload` — Upload Robinhood CSV or PDF export
- `POST /api/upload-duplicates` — Manually insert one or more transactions

### Transactions
- `GET /api/transactions?broker=robinhood&start=&end=&trans_code=` — Transaction history
- `PUT /api/transactions/{id}` — Update an existing transaction

### Holdings & Report
- `GET /api/report/consolidated?broker=robinhood` — Per-ticker holdings and P&L

### P&L Summary
- `GET /api/report/pnl?broker=robinhood&start=&end=` — Portfolio performance

### Transfers
- `GET /api/transfers?broker=robinhood&start=&end=` — ACH and fee transactions
- `GET /api/report/transfers?broker=robinhood&start=&end=` — Transfers summary

### Settings
- `POST /api/settings/clear-cache` — Invalidate the Redis cache

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
- `CONV` — Broker transfer (shares moved in from another broker; cost basis set to $0)
- `SPL` / `SPR` — Stock split (adjusts existing lot quantities and cost per share proportionally)

## Future Enhancements

- Support for Stash and Fidelity CSV imports
- Interactive charts and graphs (portfolio performance over time)
- Dividend tracking and reinvestment analytics
- Tax reporting (realized gains/losses export)
- Multi-account aggregation
- User authentication

## 👨‍💻 Development

### Testing & Code Quality

**Test Coverage:** 85% minimum (enforced in CI/CD)

```bash
# Run tests with coverage
cd backend
pytest --cov=app --cov-report=html

# Run without coverage plugin
pytest --no-cov -v

# Run a specific test file
pytest tests/test_pnl.py -v
pytest tests/test_robinhood_csv.py -v
pytest tests/test_robinhood_pdf.py -v

# Run all linters
make lint

# Format code
make format
```

**Test Suites:**
- `test_robinhood_csv.py` — 36 tests covering CSV parsing, amount/decimal/date helpers
- `test_robinhood_pdf.py` — 55 tests covering PDF extraction, CUSIP lookup (OpenFIGI mocked), ticker detection
- `test_pnl.py` — 21 tests covering FIFO ordering, stock splits, broker transfers, write-offs, dividends/fees

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
- **Redis** - Caching layer with 5-minute TTL; invalidated after every mutation
- **FIFO Cost Basis** - Accurate share cost tracking including CONV ($0 basis) and SPL/SPR (lot ratio adjustment)
- **OpenFIGI API** - CUSIP-to-ticker resolution for PDF imports (with in-memory caching)
- **Structured Logging** - Colored output with timestamps

### Frontend Architecture
- **React 18** - Modern UI with hooks
- **React Router** - Client-side navigation with sticky navbar
- **React Query** - Server state management with cache invalidation after mutations
- **ThemeContext** - App-wide dark/light theme
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
  trans_code VARCHAR,       -- Buy/Sell/CDIV/INT/ACH/GOLD/MINT/CONV/SPL/SPR
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

**PDF upload produces no transactions:**
- Ensure the PDF is a Robinhood monthly statement (not a tax document)
- The parser supports the post-2020 "BOUGHT/SOLD" format and the 2019 "Margin Buy/Sell" format
- Check backend logs for CUSIP lookup errors (requires internet access for OpenFIGI)

**P&L numbers seem off:**
- Broker-transferred shares (CONV) are assigned $0 cost basis — their full sale proceeds count as realized gain
- Stock splits (SPL/SPR) adjust existing lot quantities and cost per share proportionally; the total cost basis is preserved
- Use a write-off (Sell at $0) for worthless/delisted securities to register the cost basis as a realized loss

**Cache issues - data seems stale:**
```bash
curl -X POST http://localhost:8765/api/settings/clear-cache   # Clear Redis
redis-cli KEYS '*'                                              # View cache keys
```

**Tests failing:**
```bash
cd backend
pytest -v                                  # Verbose output
pytest -s                                  # Show print statements
pytest -x                                  # Stop at first failure
pytest --cov=app --cov-report=html         # View coverage gaps
# Open htmlcov/index.html in browser
```

## 📈 Performance & Optimization

- **Caching:** All API responses cached for 5 minutes (Redis); invalidated immediately after any add/edit
- **FIFO Calculation:** Computed on-demand, results cached
- **Batch Operations:** Price fetches batched to reduce API calls; CUSIP lookups batched to OpenFIGI with in-memory caching
- **Large Uploads:** CSV/PDF parsers efficiently handle thousands of transactions
- **Database:** Single table design optimized for query flexibility

## License

Personal project for stock portfolio tracking.
