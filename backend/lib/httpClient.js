// Real HTTP client using built-in fetch (Node 18+)
export class HttpClient {
  async request({ url, method = 'GET', headers = {}, data = null, timeout = 15000 }) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeout);
    const opts = { method, headers: { 'Content-Type': 'application/json', ...headers }, signal: controller.signal };
    if (data && ['POST','PUT','PATCH','DELETE'].includes(method)) opts.body = JSON.stringify(data);
    try {
      const res = await fetch(url, opts);
      clearTimeout(to);
      const ct = res.headers.get('content-type') || '';
      let body = ct.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${res.statusText}`);
        err.status = res.status; err.body = body; throw err;
      }
      return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body };
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Request timeout');
      throw e;
    }
  }
  async healthCheck(url, timeout = 5000) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal }).catch(() => fetch(url, { signal: controller.signal }));
      clearTimeout(to);
      return { healthy: res.ok, status: res.status, latency: Date.now() - start, timestamp: new Date().toISOString() };
    } catch (e) {
      return { healthy: false, error: e.message, latency: Date.now() - start, timestamp: new Date().toISOString() };
    }
  }
}
