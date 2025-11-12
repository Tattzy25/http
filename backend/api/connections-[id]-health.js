// Handler for GET /api/connections/:id/health
import { getConnection } from '../lib/storage.js';
import { HttpClient } from '../lib/httpClient.js';

export default async function handler(req, res) {
  if ((req.method || 'GET') !== 'GET') { res.statusCode = 405; res.setHeader('Allow','GET'); res.end(); return; }
  const id = (req.url.match(/connections\/(.+?)\/health/) || [])[1];
  const conn = getConnection(id);
  if (!conn) { res.statusCode = 404; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ error: 'Connection not found' })); return; }
  const http = new HttpClient();
  const source = await http.healthCheck(conn.sourceUrl).catch(e => ({ healthy:false, error:e.message }));
  const dest = await http.healthCheck(conn.destinationUrl).catch(e => ({ healthy:false, error:e.message }));
  res.statusCode = 200; res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({ connectionId: id, source, destination: dest }));
}
