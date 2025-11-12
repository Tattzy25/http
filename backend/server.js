// Minimal local dev server to run backend endpoints at http://localhost:4000
import http from 'http';
import connections from './api/connections.js';
import execHandler from './api/connections-[id]-execute.js';
import testHandler from './api/connections-[id]-test.js';
import healthHandler from './api/connections-[id]-health.js';
import logsHandler from './api/logs.js';

const PORT = process.env.PORT || 4000;

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url || '/';
    // CORS for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    if (url === '/api/connections' && (req.method === 'GET' || req.method === 'POST')) {
      await connections(req, res); return;
    }
    if (/^\/api\/connections\/.+?\/execute/.test(url)) {
      await execHandler(req, res); return;
    }
    if (/^\/api\/connections\/.+?\/test/.test(url)) {
      await testHandler(req, res); return;
    }
    if (/^\/api\/connections\/.+?\/health/.test(url) && req.method === 'GET') {
      await healthHandler(req, res); return;
    }
    if (url.startsWith('/api/logs') && req.method === 'GET') {
      await logsHandler(req, res); return;
    }
    res.statusCode = 404; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ error: 'Not found' }));
  } catch (e) {
    res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://localhost:${PORT}`);
});
