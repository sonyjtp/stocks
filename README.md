# Stock Trading Tracker

A personal stock portfolio dashboard for tracking trades, P&L, holdings, and transfers. Supports Robinhood CSV and PDF imports.

![Python](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-dc382d?logo=redis&logoColor=white)
![Coverage](https://img.shields.io/badge/Coverage-90.88%25-brightgreen)
![Tests](https://img.shields.io/badge/Tests-pytest-blue?logo=pytest&logoColor=white)
![Code Quality](https://img.shields.io/badge/Code%20Quality-Black%2Fisort%2Fflake8-black)

---

## Features

| Page                     | Description                                                                                            |
|--------------------------|--------------------------------------------------------------------------------------------------------|
| **Dashboard**            | Portfolio allocation donut chart, realized P&L bar chart, monthly buy activity chart                   |
| **Transaction History**  | All trades (Buy/Sell/CDIV/CONV/SPL). Filter by date, ticker, type. Add/edit rows. Export to Excel      |
| **Current Holdings**     | Live prices via Yahoo Finance. FIFO cost basis, unrealized P&L per ticker                              |
| **All-Time Performance** | Per-ticker: shares bought/sold/held, realized P&L, dividends, cost basis                               |
| **P&L Summary**          | Realized vs unrealized breakdown. Sold + held + dividends − fees = net P&L                             |
| **Transfers & Fees**     | ACH, debit card (DCF), interest (INT/MINT/SLIP), Gold fees (GOLD), foreign tax (DTAX). Export to Excel |
| **Upload**               | Upload Robinhood CSV or PDF. Smart duplicate detection with per-row selection                          |
| **Upload History**       | Audit log of all uploads. Rollback (delete) individual uploads and their transactions                  |
| **Settings**             | Clear Redis cache                                                                                      |

**Core capabilities:**
- FIFO cost basis with broker transfers (CONV = $0 basis) and stock splits (SPL/SPR)
- Duplicate detection on re-upload; select which duplicates to include
- Redis caching (5-min TTL), invalidated on every mutation
- Dark/light theme toggle
- Color-coded P&L (green/red)

---

## Tech Stack

- **Backend:** FastAPI + SQLAlchemy ORM + Python 3.11+
- **Frontend:** React 18 + Vite + React Query + SheetJS (Excel export)
- **Database:** PostgreSQL 15
- **Cache:** Redis 7
- **Ports:** API `8765` · Frontend `5174` · PostgreSQL `5436` · Redis `6380`

---

## Quick Start

**Prerequisites:** Docker, Python 3.11+, Node.js 18+

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Backend
pip install -r requirements.txt
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8765

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

- App: http://localhost:5174
- API docs: http://localhost:8765/docs

**Environment** — `.env.local` is pre-configured for local Docker defaults. Override via env vars:

| Variable         | Default                                                                     |
|------------------|-----------------------------------------------------------------------------|
| `DATABASE_URL`   | `postgresql+psycopg://stocks_user:stocks_password@localhost:5436/stocks_db` |
| `REDIS_URL`      | `redis://localhost:6380`                                                    |
| `FRONTEND_URL_1` | `http://localhost:5174`                                                     |
| `API_PORT`       | `8765`                                                                      |
| `LOG_LEVEL`      | `INFO`                                                                      |

---

## Importing Data

1. In Robinhood: **Account → Reports & Statements → Activity Reports → Export Activity** (CSV recommended)
2. In the app: go to **Upload**, select your file, click **Upload**
3. If duplicates appear, review and select which rows to add, then click **Upload Selected**

**Expected CSV columns:**
```
Activity Date, Process Date, Settle Date, Instrument, Description, Trans Code, Quantity, Price, Amount
```

**Supported trans codes:**

| Code                    | Meaning                                             |
|-------------------------|-----------------------------------------------------|
| `Buy` / `Sell`          | Equity trades                                       |
| `CDIV`                  | Cash dividend                                       |
| `CONV`                  | Broker transfer (shares in; $0 cost basis)          |
| `SPL` / `SPR`           | Stock split (adjusts lot quantities proportionally) |
| `ACH` / `DCF`           | Bank / debit card transfer                          |
| `INT` / `MINT` / `SLIP` | Interest income                                     |
| `GOLD`                  | Robinhood Gold subscription fee                     |
| `DTAX`                  | Foreign tax withheld                                |

---

## API Reference

### Upload
| Method   | Path                                 | Description                         |
|----------|--------------------------------------|-------------------------------------|
| `POST`   | `/api/upload`                        | Upload CSV or PDF                   |
| `POST`   | `/api/upload-duplicates`             | Insert selected duplicate rows      |
| `GET`    | `/api/upload-logs`                   | List all upload log entries         |
| `DELETE` | `/api/upload-logs`                   | Delete all upload logs              |
| `GET`    | `/api/upload-logs/{id}/errors`       | Errors for a specific upload        |
| `GET`    | `/api/upload-logs/{id}/duplicates`   | Duplicates for a specific upload    |
| `DELETE` | `/api/upload-logs/{id}`              | Delete upload log entry             |
| `DELETE` | `/api/upload-logs/{id}/transactions` | Rollback transactions for an upload |

### Transactions
| Method   | Path                     | Description                                            |
|----------|--------------------------|--------------------------------------------------------|
| `GET`    | `/api/transactions`      | Trade history (`broker`, `start`, `end`, `trans_code`) |
| `PUT`    | `/api/transactions/{id}` | Update a transaction                                   |
| `DELETE` | `/api/transactions/{id}` | Delete a transaction                                   |

### Holdings & P&L
| Method | Path                       | Description                    |
|--------|----------------------------|--------------------------------|
| `GET`  | `/api/report/consolidated` | Per-ticker holdings + P&L      |
| `GET`  | `/api/report/pnl`          | Portfolio P&L summary          |
| `GET`  | `/api/transfers`           | Transfers & fee transactions   |
| `GET`  | `/api/report/transfers`    | Transfers summary              |
| `GET`  | `/api/prices`              | Current prices (Yahoo Finance) |

### Admin
| Method | Path                        | Description            |
|--------|-----------------------------|------------------------|
| `POST` | `/api/settings/clear-cache` | Invalidate Redis cache |
| `POST` | `/admin/clear-cache`        | Alias for above        |

All list endpoints accept optional `start` / `end` date params (`YYYY-MM-DD`).

---

## Project Structure

```
stocks/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + CORS
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── schemas.py           # Pydantic schemas
│   │   ├── database.py          # DB connection
│   │   ├── cache.py             # Redis helpers
│   │   ├── parsers/
│   │   │   ├── robinhood.py     # CSV parser
│   │   │   └── robinhood_pdf.py # PDF parser (OpenFIGI CUSIP lookup)
│   │   └── routers/
│   │       ├── upload.py        # Upload + upload-logs endpoints
│   │       ├── transactions.py  # Transaction CRUD
│   │       ├── holdings.py      # Holdings report
│   │       ├── pnl.py           # P&L report (FIFO)
│   │       ├── transfers.py     # Transfers & fees
│   │       ├── prices.py        # Live price fetch
│   │       └── settings.py      # Cache management
│   └── tests/
│       ├── conftest.py
│       ├── test_robinhood_csv.py   # 36 tests — CSV parser
│       ├── test_robinhood_pdf.py   # 55 tests — PDF parser
│       ├── test_pnl.py             # 21 tests — FIFO P&L
│       ├── test_prices.py          #  7 tests — price fetcher
│       ├── test_upload.py          # 12 tests — upload endpoint
│       └── test_api_endpoints.py   # 57 tests — all routers
├── frontend/
│   └── src/
│       ├── App.jsx              # Routing + sticky navbar + theme
│       ├── context/
│       │   └── ThemeContext.jsx
│       └── pages/
│           ├── Dashboard.jsx
│           ├── TransactionHistory.jsx
│           ├── CurrentHoldings.jsx
│           ├── AllTimePerformance.jsx
│           ├── PnLSummary.jsx
│           ├── Transfers.jsx
│           ├── Upload.jsx
│           ├── UploadHistory.jsx
│           └── Settings.jsx
├── docker-compose.yml
└── requirements.txt
```

---

## Development

### Testing

```bash
cd backend

pytest --cov=app --cov-report=html   # Coverage report (open htmlcov/index.html)
pytest --no-cov -v                    # Quick run
pytest tests/test_pnl.py -v          # Single file
```

Coverage requirement: **≥ 85%** (current: **90.88%**)

### Linting & Formatting

```bash
make lint       # flake8 check
make format     # black + isort
make pre-commit # Install git pre-commit hooks
```

Pre-commit hooks require `pre-commit install` to activate. Without it, hooks are skipped even if `.pre-commit-config.yaml` exists.

### Makefile targets

```
make install    install Python deps
make test       run tests
make coverage   coverage report
make lint       check style
make format     auto-format
make clean      remove artifacts
```

---

## Troubleshooting

**Backend can't connect to DB:**
```bash
docker ps | grep stocks
docker logs stocks-postgres
psql postgresql://stocks_user:stocks_password@localhost:5436/stocks_db -c "SELECT 1;"
```

**CORS / frontend can't reach API:**
```bash
curl http://localhost:8765/health
# Check browser console for CORS errors; verify FRONTEND_URL_1 env var
```

**Data looks stale:**
```bash
curl -X POST http://localhost:8765/api/settings/clear-cache
```

**P&L seems off:** CONV shares use $0 cost basis (full proceeds = realized gain). SPL/SPR adjust lot quantities proportionally. For worthless/delisted stocks, enter a Sell at $0 to recognize the loss.

---

## License

Personal project for stock portfolio tracking.