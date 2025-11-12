// Handler for GET /api/logs?connectionId=...&limit=...
import { listLogs } from '../lib/storage.js';

export default async function handler(req, res) {
  if ((req.method || 'GET') !== 'GET') { res.statusCode = 405; res.setHeader('Allow','GET'); res.end(); return; }
  const url = new URL(req.url, 'http://localhost');
  const connectionId = url.searchParams.get('connectionId') || url.searchParams.get('connection_id') || undefined;
  const limitStr = url.searchParams.get('limit');
  const limit = limitStr ? Math.max(1, Math.min(200, parseInt(limitStr, 10))) : 50;
  const items = listLogs({ connectionId, limit });
  res.statusCode = 200; res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({ items }));
}
