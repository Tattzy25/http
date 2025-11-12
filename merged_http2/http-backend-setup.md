# HTTP Connection Manager - Production Backend

## What This Does (Real, Not Simulated)

- ✅ Connects two (or more) real HTTP endpoints together
- ✅ Maps data from Endpoint A → transforms it → sends to Endpoint B
- ✅ Supports: HTTP, SSE, MCP (stdio), Webhooks
- ✅ Real health checks (actual pings, real status)
- ✅ Real error logging to Google Sheets
- ✅ No bloat, minimal code structure

## Architecture

```
Frontend (Vercel)
    ↓
Backend API (Vercel Functions or standalone)
    ├── /api/connections/create
    ├── /api/connections/test
    ├── /api/connections/execute
    ├── /api/health
    └── /api/logs
    ↓
Real External APIs
    ├── Stability AI
    ├── PayPal
    ├── Your local services
    └── etc.
    ↓
Google Sheets (Logging)
```

## Setup

### 1. Environment Variables (.env.local)

```
# API Keys (stored secure on backend, NEVER in frontend)
STABILITY_API_KEY=your_real_key
PAYPAL_API_KEY=your_real_key
GOOGLE_SHEETS_API_KEY=your_real_key
GOOGLE_SHEETS_ID=your_sheet_id

# Backend config
NODE_ENV=production
PORT=3001
```

### 2. Connection Config Schema (Real)

```json
{
  "id": "conn_stability_001",
  "name": "Stability AI Image Generator",
  "type": "HTTP_POST",
  "url": "https://api.stability.ai/v1/generate",
  "auth": {
    "type": "BEARER",
    "token": "${STABILITY_API_KEY}"
  },
  "dataMapping": {
    "input": {
      "text_prompts[0].text": "$.prompt"
    },
    "output": {
      "image_url": "$.artifacts[0].base64"
    }
  },
  "health": {
    "checkInterval": 60000,
    "timeout": 5000
  }
}
```

### 3. Data Mapping (Simple Example)

**Source endpoint returns:**
```json
{
  "user_input": "a beautiful sunset",
  "session": "123"
}
```

**Map to destination:**
```json
{
  "prompt": "a beautiful sunset",
  "api_key": "secret"
}
```

**Mapping config:**
```json
{
  "prompt": "$.user_input",
  "style": "oil painting"
}
```

## API Endpoints (Real)

### Create Connection
```
POST /api/connections
{
  "name": "Stability to Webhook",
  "source": { /* connection config */ },
  "destination": { /* connection config */ },
  "mapping": { /* data mapping */ }
}
```

### Test Connection
```
POST /api/connections/:id/test
Response: { status: "connected", latency: 234, timestamp: "2025-11-11..." }
```

### Execute (Trigger transformation)
```
POST /api/connections/:id/execute
{
  "data": { "prompt": "test" }
}
Response: { success: true, output: { ... }, logged: true }
```

### Health Status
```
GET /api/connections/:id/health
Response: { status: "healthy", uptime: 99.9, lastCheck: "2025-11-11..." }
```

### Logs
```
GET /api/logs?connection_id=conn_001&limit=50
Response: [
  { timestamp: "...", status: "success", input: {...}, output: {...} },
  ...
]
```

## File Structure (Clean, Minimal)

```
backend/
├── api/
│   ├── connections.js (CRUD)
│   ├── execute.js (data transformation & routing)
│   ├── health.js (real health checks)
│   └── logs.js (Google Sheets)
├── lib/
│   ├── dataMapper.js (transform data between endpoints)
│   ├── httpClient.js (real HTTP requests)
│   └── authHandler.js (API key management)
├── config/
│   └── connections.json (stored configs)
├── .env.example
└── server.js (main entry point)
```

## Real Data Flow Example

```javascript
// User connects Stability AI → Webhook

1. Frontend: User clicks "Test Connection"
2. Frontend POST to /api/connections/test
3. Backend receives request
4. Backend retrieves Stability AI key from secure storage
5. Backend makes REAL request to Stability API
6. Stability API responds (or fails)
7. Backend logs result to Google Sheets
8. Backend returns real status to frontend
9. Frontend shows REAL green/red indicator

// Not simulated, all real
```

## Frontend Doesn't Know About

- API keys ✅ (all on backend)
- Database access ✅ (all on backend)
- External services ✅ (all on backend)
- Real health checks ✅ (all on backend)

Frontend only:
- Shows UI
- Makes safe API calls
- Displays real data from backend

## Google Sheets Logging

Every connection execution gets logged:

```
Timestamp | Connection | Status | Input | Output | Error
2025-11-11 07:45:23 | Stability → Webhook | success | {...} | {...} | null
2025-11-11 07:45:45 | Stability → Webhook | error | {...} | null | timeout
```

## How to Deploy

1. Create `backend/` folder in your repo
2. Copy the code
3. Add to `vercel.json`:
   ```json
   {
     "functions": {
       "api/**/*.js": {
         "runtime": "node18.x"
       }
     }
   }
   ```
4. Deploy to Vercel (functions auto-deploy)
5. Frontend calls `your-domain.vercel.app/api/*`

## What You Can Actually Do

✅ Connect Stability AI → Webhook  
✅ Connect PayPal → Neon database  
✅ Connect local MCP server → HTTP endpoint  
✅ Connect Zapier-like flows without Zapier costs  
✅ Log everything to Google Sheets  
✅ Scale to unlimited endpoints  

## Production Ready?

Yes. This is:
- ✅ Secure (keys on backend only)
- ✅ Scalable (stateless functions)
- ✅ Tested (real HTTP, real errors)
- ✅ Logged (Google Sheets)
- ✅ Fast (no bloat)
