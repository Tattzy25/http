// backend/lib/httpClient.js - PRODUCTION READY
// Real HTTP requests with proper error handling

export class HttpClient {
  async request({ url, method = 'GET', headers = {}, data = null, timeout = 10000 }) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      // Parse response
      const contentType = response.headers.get('content-type');
      let body;

      if (contentType && contentType.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      // Check for errors
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.body = body;
        throw error;
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body,
        data: body // Alias for convenience
      };

    } catch (error) {
      // Enhance error with more context
      const enhancedError = new Error(`Request failed: ${error.message}`);
      enhancedError.originalError = error;
      enhancedError.url = url;
      enhancedError.method = method;
      throw enhancedError;
    }
  }

  // SSE (Server-Sent Events) support
  async *streamRequest({ url, headers = {}, data = null }) {
    const options = {
      method: data ? 'POST' : 'GET',
      headers: {
        'Accept': 'text/event-stream',
        ...headers
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              yield data;
            } catch (e) {
              // Ignore parse errors for non-JSON events
              yield { raw: line };
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`SSE stream failed: ${error.message}`);
    }
  }

  // Health check - ping an endpoint
  async healthCheck(url, timeout = 5000) {
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        timeout
      }).catch(() => {
        // If HEAD fails, try GET
        return fetch(url, { method: 'GET', timeout });
      });

      const latency = Date.now() - startTime;

      return {
        healthy: response.ok,
        status: response.status,
        latency,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }
}
