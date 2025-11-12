// Handler for POST /api/connections/:id/test
import { getConnection, logEvent } from '../lib/storage.js';
import { HttpClient } from '../lib/httpClient.js';

export default async function handler(req, res) {
  if ((req.method || 'GET') !== 'POST') { res.statusCode = 405; res.setHeader('Allow','POST'); res.end(); return; }
  const id = (req.url.match(/connections\/(.+?)\/test/) || [])[1];
  const conn = getConnection(id);
  if (!conn) { res.statusCode = 404; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ error: 'Connection not found' })); return; }
  const http = new HttpClient();
  try {
    // lightweight connectivity checks
    const sourceCheck = await http.request({ url: conn.sourceUrl, method: 'GET' }).catch(e => ({ error: e.message }));
    const destCheck = await http.healthCheck(conn.destinationUrl);
    const result = {
      source: sourceCheck.status ? { ok: true, status: sourceCheck.status } : { ok: false, error: sourceCheck.error },
      destination: destCheck,
    };
    logEvent({ event: 'test', connectionId: id, status: (result.source.ok && result.destination.healthy) ? 'ok' : 'fail' });
    res.statusCode = 200; res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(result));
  } catch (e) {
    res.statusCode = 500; res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ error: e.message }));
  }
}
