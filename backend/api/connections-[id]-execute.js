// Handler for POST /api/connections/:id/execute
import { getConnection, logEvent } from '../lib/storage.js';
import { validateExecutePayload } from '../lib/validator.js';
import { DataMapper } from '../lib/dataMapper.js';
import { HttpClient } from '../lib/httpClient.js';

export default async function handler(req, res) {
  if ((req.method || 'GET') !== 'POST') {
    res.statusCode = 405; res.setHeader('Allow','POST'); res.end(); return;
  }
  try {
    const id = (req.url.match(/connections\/(.+?)\/execute/) || [])[1];
    const conn = getConnection(id);
  if (!conn) { res.statusCode = 404; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ error: 'Connection not found' })); return; }

    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const errors = validateExecutePayload({ ...body, connectionId: id });
  if (errors.length) { res.statusCode = 400; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ errors })); return; }

  const mapper = new DataMapper();
    const http = new HttpClient();

    const results = [];
    for (const record of body.records) {
  const mapped = mapper.transform(record, conn.mappings || {});
      const out = await http.request({ url: conn.destinationUrl, method: conn.method || 'POST', data: mapped });
      results.push({ input: record, mapped, responseStatus: out.status, responseBody: out.body });
      logEvent({ event: 'execute', connectionId: id, status: out.status, mapped });
    }

    res.statusCode = 200; res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ ok: true, count: results.length, results }));
  } catch (e) {
    res.statusCode = 500; res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ error: e.message }));
  }
}
