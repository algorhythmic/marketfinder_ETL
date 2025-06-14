# BUILD PLAN

This document outlines the build plan for the Market Finder project. It draws from the functional requirements in `docs/specs.md` and the Convex conventions in `.cursor/rules/convex_rules.mdc`.

---

## 1. Project Overview

- **Goals & Scope**: Provide users with real-time market data, price comparisons, and insights from Polymarket, Kalshi, Predictit, and other prediction market platforms.
- **Key Technologies**:
  - Frontend: React + TypeScript + Vite
  - Backend: Convex (queries, mutations, crons)
  - Data sources: Polymarket API, Kalshi API, Predictit API
  - CI/CD: GitHub Actions / Vercel / Convex deploy

## 2. Directory Structure & Components

```text
/docs
  ├── specs.md
  └── BUILD_PLAN.md
/src
  ├── App.tsx         # Root component & routing
  ├── components
  │   ├── MarketDataTable.tsx  # Table view of markets
  │   └── ui
  │       └── Button.tsx       # Shared button component
  └── jobs
      └── fetchPolymarket.ts   # Background job for Polymarket sync
      └── fetchKalshi.ts       # Background job for Kalshi sync
/convex
  ├── schema.ts     # Database schema definitions
  ├── http.ts       # HTTP endpoints (httpAction)
  └── *.ts          # Queries, mutations, crons using new function syntax
.env.local           # Convex env vars & API keys

### Component Implementation Status

- [x] `src/components/MarketDataTable.tsx`: fully implemented with dynamic filtering; integrated in `MarketsView`.
- [x] `src/components/MarketsView.tsx`: Enhanced with market selection (checkboxes), UI controls for semantic analysis and arbitrage detection. Triggers backend Convex actions (`analyzeSelectedMarkets`, `findArbitrageForSelectedMarkets`) with loading/feedback states.
- [ ] `src/components/MarketGroupsView.tsx`: UI implemented and fetches data from `api.semanticAnalysis.getMarketGroups`; backend semantic group generation (`generateSemanticGroups` action) may be disabled or require further implementation/testing.
- [ ] `src/components/ArbitrageView.tsx`: placeholder with `mockOpportunities`; needs real `api.arbitrage.getArbitrageOpportunities` integration and live data.
- [ ] `src/components/AutomationView.tsx`: placeholder with `mockPlaybooks`; requires integration with Convex API for playbook management and actions.
- [ ] `src/components/AlertsView.tsx`: UI skeleton exists; lacks alerts fetching logic and notification handling.
- [ ] `src/components/DashboardOverview.tsx` / `Dashboard.tsx`: layout in place; needs data hooks for summary metrics and charts.
- [ ] `src/components/PlatformStatusList.tsx`: placeholder status list; integrate real platform health endpoints.
- [ ] `src/components/SettingsView.tsx`: API credentials form UI implemented. Next: Add component for user to input LLM API key for semantic analysis provider configuration. User preferences persistence and account info still pending.
- [ ] `src/components/Sidebar.tsx` / `NeobrutalistSidebar.tsx`: static navigation menus; consider dynamic configuration based on user roles.
- [x] `src/components/ThemeToggle.tsx`: implemented; manages light/dark theme toggle.
- [x] `src/components/market-table-columns.tsx`: implemented column definitions; extend for additional filter types as needed.
- [x] `convex/semanticAnalysis.ts`: `analyzeSelectedMarkets` action implemented for pairwise semantic similarity using an LLM. Creates/updates market groups.
- [x] `convex/arbitrage.ts`: `findArbitrageForSelectedMarkets` action implemented as a placeholder; full arbitrage logic pending.

- **Core UI**: `MarketDataTable` (grid of markets), shared UI primitives (`Button`, `Card`).
- **Data Sync**: Cron jobs to call Polymarket and Kalshi, and upsert markets/outcomes via internal mutations.
  - [x] `fetchPolymarket.ts`: Implement data fetching, transformation, and Convex cron.
  - [x] `fetchKalshi.ts`: Implement data fetching, transformation, and Convex cron.

### Anticipated Convex Schema (`convex/schema.ts`)

- [ ] `platforms`: Information about each prediction market platform (e.g., name, API base URL, status).
- [ ] `markets`: Core market data (title, outcomes, volume, liquidity, status, platform ID, etc.).
- [ ] `outcomes`: Individual outcomes for each market (name, price, token ID if applicable).
- [ ] `marketGroups`: Semantically grouped markets (name, description, associated market IDs).
- [ ] `arbitrageOpportunities`: Detected arbitrage opportunities (buy/sell markets, profit margin).
- [ ] `automationPlaybooks`: User-defined automation rules and their status.
- [ ] `alerts`: System or user-defined alerts.
- [ ] `userSettings`: User-specific preferences and configurations.

## 3. Convex Backend Rules

Follow guidelines from `.cursor/rules/convex_rules.mdc`:

1. **Function Syntax**: Always use the `query`, `mutation`, `action`, `internalQuery`, `internalMutation`, `internalAction` syntax with validators (`v.*`).
2. **HTTP Endpoints**: Define in `convex/http.ts` via `httpRouter` + `httpAction`.
3. **Validators**: Use `v.string()`, `v.int64()`, `v.array()`, etc., and `returns: v.null()` for void returns.
4. **Schema**: All tables in `convex/schema.ts` with explicit indexes.
5. **Function Calls**:
   - Public: `ctx.runQuery(api.*)` / `ctx.runMutation(api.*)`
   - Internal: `ctx.runQuery(internal.*)` / `ctx.runMutation(internal.*)`
6. **Pagination**: Use `paginationOptsValidator` + `.paginate()` for list endpoints.

## 4. Build & Deployment Steps

### 4.1 Local Development

```bash
npm install
# Configure .env.local with CONVEX_DEPLOYMENT, VITE_CONVEX_URL, CONVEX_DEPLOY_KEY
npm run dev
``` 

  **Note on API Keys**: External API keys (for Polymarket, Kalshi, etc.) required by backend jobs should be configured as environment variables in the Convex dashboard for secure access within `internalAction` functions. Avoid committing keys to `.env.local` if it's tracked by git; use it only for local frontend variables like `VITE_CONVEX_URL`. 

### 4.2 Code Quality

```bash
npm run lint       # ESLint
npm run typecheck  # tsc
npm run test       # Unit & integration tests
``` 

### 4.3 Production Build & Preview

```bash
npm run build      # Vite build
npm run preview    # Local production preview
``` 

### 4.4 Deployment

1. Deploy frontend to Vercel/Netlify.
2. Deploy Convex functions via `convex deploy` using the `CONVEX_DEPLOYMENT` env var.

## 5. Testing & CI

- **Unit Tests**: Jest/React Testing Library for components and utility functions.
- **Integration Tests**: Mock Convex API and external platform API responses (Polymarket, Kalshi, etc.).
- **Data Fetcher Tests**: Specific tests for each data fetching job (`fetchPolymarket.ts`, etc.) to ensure correct API interaction, data transformation, and error handling, possibly using recorded API responses (fixtures).
- **CI Pipeline** (GitHub Actions): `lint` -> `typecheck` -> `test` -> `build` -> `deploy-preview`.

## 6. Future Extensions & Maintenance

- Implement full arbitrage detection logic in `convex/arbitrage.ts` (compare selected markets, identify opportunities).
- Develop UI in `src/components/SettingsView.tsx` for users to input and manage their LLM API key for the semantic analysis feature.
- Integrate additional data sources (e.g. Augur).
- Support schema migrations with Convex.
- Add performance monitoring & logging.
- Automate versioned releases and changelogs.
- Regular dependency updates and security audits.
