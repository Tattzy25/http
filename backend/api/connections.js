// Serverless-style handler for GET/POST /api/connections
import { addConnection, listConnections } from '../lib/storage.js';
import { validateConnection } from '../lib/validator.js';

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method === 'GET') {
    const items = listConnections();
    res.statusCode = 200; res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ items }));
    return;
  }
  if (method === 'POST') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const errors = validateConnection(body);
      if (errors.length) {
        res.statusCode = 400; res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({ errors })); return;
      }
      const saved = addConnection(body);
      res.statusCode = 201; res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify(saved));
    } catch (e) {
      res.statusCode = 500; res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  res.statusCode = 405; res.setHeader('Allow','GET, POST'); res.end();
}
