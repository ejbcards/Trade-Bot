# AI Trading Bot

## Overview

A full-stack AI trading bot dashboard built with React + Vite (frontend) and Express 5 + PostgreSQL (backend). Supports multiple broker connections, configurable AI-driven trading strategies, and comprehensive performance reporting.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite, TailwindCSS, shadcn/ui, Recharts, Wouter
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Features

- **Dashboard** — Command center with portfolio overview, bot status control, daily P&L, open positions, activity feed
- **Broker Connections** — Connect Schwab, Robinhood (and more); test connections, view account value & buying power
- **Trading Strategies** — Create AI-driven strategies with guardrails (stop-loss, rolling stop, take-profit, RSI overbought/oversold, max position size, max daily loss)
- **Open Positions** — Live positions table across all brokers with unrealized P&L
- **Trade History** — Filterable trade log with realized P&L, AI signal used, and broker/strategy info
- **Performance Reports** — Daily/weekly/monthly/quarterly/annual reports with P&L charts, win rate, top symbols, profit factor, Sharpe ratio

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Database Schema

- `brokers` — Broker account connections (Schwab, Robinhood, etc.)
- `strategies` — Trading strategy configs with AI settings and guardrails
- `trades` — Historical and open trade records
- `positions` — Current open positions per broker (includes `high_water_mark` for rolling stop tracking)
- `bot_state` — Bot running state (singleton row)
- `bot_logs` — Bot activity log entries
- `activity` — Recent activity feed items

## API Routes

All routes under `/api`:
- `GET/POST /brokers` — list/create brokers
- `GET/PATCH/DELETE /brokers/:id` — manage broker
- `POST /brokers/:id/test` — test connection
- `GET/POST /strategies` — list/create strategies
- `GET/PATCH/DELETE /strategies/:id` — manage strategy
- `GET /bot/status` — bot status
- `POST /bot/start` — start bot (requires strategyId + brokerId)
- `POST /bot/stop` — stop bot
- `GET /bot/logs` — recent bot logs
- `GET /positions` — open positions
- `GET /positions/summary` — positions totals
- `GET /trades` — trade history (filterable)
- `GET /trades/:id` — single trade
- `GET /reports/performance?period=` — performance report
- `GET /reports/pnl-chart?period=` — P&L time series
- `GET /reports/win-rate?period=` — win/loss stats
- `GET /reports/top-symbols?period=` — symbol rankings
- `GET /dashboard/summary` — dashboard totals
- `GET /dashboard/recent-activity` — activity feed

## Broker Integration Notes

- Current broker connections are simulated (test connection generates mock account data)
- Real integration requires broker-specific OAuth/API key flows:
  - **Schwab**: OAuth 2.0 via developer.schwab.com
  - **Robinhood**: Unofficial API or RobinHood's new OAuth (for eligible developers)
- API credentials are stored in the `brokers` table (api_key, api_secret, access_token, refresh_token)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
