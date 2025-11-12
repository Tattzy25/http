# Connection Hub / API Connection Manager

A frontend-first, no-framework web app for creating, testing, and monitoring connections between HTTP/SSE endpoints. Includes a production-ready design for a secure backend (serverless-friendly) that performs real HTTP execution, JSON mapping, health checks, and logging.

This workspace contains two variants:

- `http/` — Onboarding wizard + dashboard (frontend only, simulated tests). Ideal for demos or as a starting point.
- `merged_http2/` — Streamlined production-oriented UX with a real backend design: connection creation, execution, data mapping, health checks, and Google Sheets logging.


## Features

- Guided wizard to configure endpoints and mappings
- Connection dashboard with search, filters, sorting, and stats
- Multiple connection types: HTTP GET/POST, Webhooks, SSE (viewer/stream client)
- JSONPath-style data mapping editor (visual preview)
- Simulated testing in `http/` and real HTTP flow design in `merged_http2/`
- Dark/light theme toggle and polished, responsive UI


## Folder structure

```text
http/                 # Frontend-only wizard/demo
  index.html
  app.js
  style.css

merged_http2/         # Production-oriented UX + backend patterns
  index.html
  app.js
  style.css
  http-backend-setup.md           # Backend architecture, env, endpoints
  backend-create.js               # Example: POST /api/connections (create)
  backend-execute.js              # Example: POST /api/connections/:id/execute
  dataMapper.js                   # Mapping logic (backend/lib)
  httpClient.js                   # HTTP and SSE client (backend/lib)
```


## Quick start (frontend)

You can open either variant directly in a browser.

### Basic demo (frontend-only)

- Open `http/index.html` in your browser.
- Click "Get Started" and add one or more connections (HTTP GET/POST, SSE, Webhook).
- Use the wizard to configure and explore the dashboard. Test connection in this version is simulated.

### Production-oriented UX

- Open `merged_http2/index.html` in your browser.
- Click "+ Add Connection" to launch the 3-step wizard: Endpoints → Mapping → Review.
- Use "Test Source Endpoint" to fetch and preview real JSON (CORS must allow it if hitting external sites from your browser).
- Mapping rules use JSONPath-like selectors, e.g. `$.user.email`.

Tip (local file permissions): If your browser blocks fetches from file://, serve the directory via a simple static server or open with a local HTTP server.

### Local backend (dev)

You can run a local backend to enable REAL mode end-to-end:

1. Open a terminal in `http/backend/` and start the server:

  Optional

  ```pwsh
   npm run dev
   ```

1. The backend listens on `http://localhost:4000`.
1. Point your frontend to use `http://localhost:4000` as the API base (e.g., `/api/connections`). If you're opening the HTML from the filesystem, you may need to allow CORS or run a simple local web server.

### Multiple domain API bases

The frontend now supports selecting different API bases (e.g., local, primary, secondary domains) via a dropdown in the dashboard header.

Configuration:

```json
// Replace placeholder domains in app.js files
{
  "apiBases": {
    "local": "http://localhost:4000",
    "primary": "https://api.primary-domain.com",
    "secondary": "https://api.secondary-domain.com"
  }
}
```

Behavior:

- Selection persists to localStorage.
- All backend calls go through a helper (`apiFetch`) that prefixes the chosen base.
- REAL mode should typically pair with a domain base; Simulation can use any.
- Ensure CORS headers are configured on domain APIs (`Access-Control-Allow-Origin`).


## Backend (production design)

The production backend is described in `merged_http2/http-backend-setup.md`. It assumes a serverless-friendly Node/JS backend (e.g., Vercel Functions) and keeps API keys secure on the server.

High-level endpoints:

- POST `/api/connections` — Create a connection
- POST `/api/connections/:id/test` — Test/health check
- POST `/api/connections/:id/execute` — Execute: fetch source → map → post to destination
- GET `/api/connections/:id/health` — Health status
- GET `/api/logs?connection_id=...` — Retrieve execution logs

What the backend does:

- Performs real HTTP requests to source and destination services
- Transforms JSON using mapping rules
- Runs health checks and latency measurements
- Logs runs to Google Sheets (or your DB of choice)
- Never exposes API keys to the frontend

Example backend modules (see `merged_http2/`):

- `backend-create.js` — Validates input, persists connection metadata, logs creation
- `backend-execute.js` — Calls source, maps data, posts to destination, logs results
- `dataMapper.js` — JSONPath-like `$.path.to.value` evaluation and transforms
- `httpClient.js` — Robust HTTP client with JSON/text parsing, SSE support, and health check helpers

Suggested backend directory layout (serverless):

```text
backend/
  api/
    connections.js        # CRUD
    execute.js            # Data transform & routing
    health.js             # Real health checks
    logs.js               # Google Sheets / DB logging
  lib/
    dataMapper.js         # Transform rules
    httpClient.js         # HTTP + SSE helpers
    authHandler.js        # Key management
  config/
    connections.json
  .env.example
  server.js
```

Environment variables (example):

```ini
STABILITY_API_KEY=your_real_key
PAYPAL_API_KEY=your_real_key
GOOGLE_SHEETS_API_KEY=your_real_key
GOOGLE_SHEETS_ID=your_sheet_id
NODE_ENV=production
PORT=3001
```

## Data mapping guide

Mapping uses simple JSONPath-like selectors on the source JSON to build the destination JSON.

Example source:

```json
{
  "user": { "name": "Ava", "email": "ava@example.com" },
  "status": "active"
}
```

Rules:

```json
[
  { "sourcePath": "$.user.email", "destField": "recipient_email" },
  { "sourcePath": "$.user.name",  "destField": "recipient_name" }
]
```

Mapped result:

```json
{
  "recipient_email": "ava@example.com",
  "recipient_name": "Ava"
}
```

Advanced mapping can be implemented with small transform functions on the backend (see `transformAdvanced` in `dataMapper.js`).


## How to deploy (serverless)

- Add a `backend/` folder with `api/**` functions (Node 18+).
- Configure function runtime in `vercel.json`:

```json
{
  "functions": { "api/**/*.js": { "runtime": "node18.x" } }
}
```

- Store secrets as environment variables (Vercel project settings or your host).
- Deploy. Your frontend then calls `https://your-app.vercel.app/api/...`.


## Development tips

- CORS: When testing from a local file or dev server, ensure the backend allows your origin or use a proxy.
- SSE: Use `httpClient.streamRequest` for streaming APIs (e.g., AI generation, event feeds).
- Health checks: Prefer `HEAD`, fall back to `GET` if needed. Track latency and status.
- Logging: Google Sheets is a lightweight start; migrate to a database when volume grows.


## Troubleshooting

- Test fails in `http2` when hitting external APIs from a local file: run a local web server to avoid mixed content/CORS issues.
- Mapping preview shows "Invalid JSON": ensure the Source Preview contains valid JSON and update the rules.
- No logs appear in Sheets: confirm `GOOGLE_SHEETS_API_KEY` and `GOOGLE_SHEETS_ID`, and that your service account has access.


## Roadmap ideas

- Persist connections to localStorage in the pure-frontend variant
- Auth presets for popular providers (Bearer/API key/Basic)
- Visual flow editor with branching/conditions
- Built-in connectors for common APIs


## License

No license file was provided. Add one (e.g., MIT) to clarify usage in your organization or open source.
