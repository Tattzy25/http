const { Client } = require('pg');
const express = require('express');
const cors = require('cors');

// Database connection
const getDbClient = () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  return client;
};

// Express app
const app = express();
app.use(cors());
app.use(express.json());

// Initialize database
async function initDatabase() {
  const client = getDbClient();
  try {
    await client.connect();

    // Create connections table
    await client.query(`
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_url TEXT NOT NULL,
        source_method TEXT NOT NULL DEFAULT 'GET',
        source_headers JSONB,
        dest_url TEXT NOT NULL,
        dest_method TEXT NOT NULL DEFAULT 'POST',
        dest_headers JSONB,
        mapping_rules JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_executed TIMESTAMP,
        execution_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0
      )
    `);

    // Create execution logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS execution_logs (
        id SERIAL PRIMARY KEY,
        connection_id TEXT REFERENCES connections(id),
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN NOT NULL,
        source_response JSONB,
        dest_response JSONB,
        error_message TEXT,
        execution_time_ms INTEGER
      )
    `);

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  } finally {
    await client.end();
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'HTTP Connection Manager API', version: '1.0.0' });
});

app.get('/api/connections', async (req, res) => {
  try {
    const client = getDbClient();
    await client.connect();

    const result = await client.query(`
      SELECT id, name, source_url, dest_url, execution_count,
             success_count, error_count, created_at, last_executed
      FROM connections
      ORDER BY created_at DESC
    `);

    const connections = result.rows.map(row => ({
      ...row,
      success_rate: row.execution_count > 0 ? (row.success_count / row.execution_count * 100) : 0
    }));

    res.json({ connections });
    await client.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/connections', async (req, res) => {
  try {
    const { name, source_url, source_method = 'GET', source_headers,
            dest_url, dest_method = 'POST', dest_headers, mapping_rules = [] } = req.body;

    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const client = getDbClient();
    await client.connect();

    await client.query(`
      INSERT INTO connections (
        id, name, source_url, source_method, source_headers,
        dest_url, dest_method, dest_headers, mapping_rules
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      connectionId, name, source_url, source_method, JSON.stringify(source_headers || {}),
      dest_url, dest_method, JSON.stringify(dest_headers || {}), JSON.stringify(mapping_rules)
    ]);

    res.json({ message: `Connection '${name}' created successfully`, connection_id: connectionId });
    await client.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/connections/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const client = getDbClient();
    await client.connect();

    // Get connection details
    const connResult = await client.query('SELECT * FROM connections WHERE id = $1', [id]);
    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const connection = connResult.rows[0];
    const startTime = Date.now();

    // Execute source request
    const sourceResponse = await fetch(connection.source_url, {
      method: connection.source_method,
      headers: connection.source_headers || {}
    });

    if (!sourceResponse.ok) {
      await client.query(`
        INSERT INTO execution_logs (connection_id, success, error_message, execution_time_ms)
        VALUES ($1, $2, $3, $4)
      `, [id, false, `Source request failed: ${sourceResponse.status}`, Date.now() - startTime]);

      return res.status(500).json({ error: `Source request failed: ${sourceResponse.status}` });
    }

    const sourceData = await sourceResponse.json();

    // Apply mapping rules
    let destData = sourceData;
    if (connection.mapping_rules && connection.mapping_rules.length > 0) {
      destData = {};
      for (const rule of connection.mapping_rules) {
        if (rule.source_path && rule.dest_field) {
          // Simple mapping - in production you'd want a proper JSONPath implementation
          const value = getNestedValue(sourceData, rule.source_path);
          if (value !== undefined) {
            destData[rule.dest_field] = value;
          }
        }
      }
    }

    // Execute destination request
    const destHeaders = { 'Content-Type': 'application/json', ...(connection.dest_headers || {}) };
    const destResponse = await fetch(connection.dest_url, {
      method: connection.dest_method,
      headers: destHeaders,
      body: JSON.stringify(destData)
    });

    const executionTime = Date.now() - startTime;
    const success = destResponse.ok;

    // Log execution
    await client.query(`
      INSERT INTO execution_logs (
        connection_id, success, source_response, dest_response, execution_time_ms
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
      id, success, JSON.stringify(sourceData),
      destResponse.ok ? await destResponse.text() : null, executionTime
    ]);

    // Update connection stats
    await client.query(`
      UPDATE connections
      SET execution_count = execution_count + 1,
          success_count = success_count + $1,
          error_count = error_count + $2,
          last_executed = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [success ? 1 : 0, success ? 0 : 1, id]);

    res.json({
      message: `Connection executed ${success ? 'successfully' : 'with errors'}`,
      execution_time_ms: executionTime,
      success
    });

    await client.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/connections/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const client = getDbClient();
    await client.connect();

    const connResult = await client.query('SELECT * FROM connections WHERE id = $1', [id]);
    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const connection = connResult.rows[0];
    const results = [];

    // Test source endpoint
    try {
      const response = await fetch(connection.source_url, {
        method: connection.source_method,
        headers: connection.source_headers || {}
      });
      results.push({ endpoint: 'source', status: response.status, ok: response.ok });
    } catch (error) {
      results.push({ endpoint: 'source', error: error.message });
    }

    // Test destination endpoint
    try {
      const response = await fetch(connection.dest_url, {
        method: connection.dest_method,
        headers: { 'Content-Type': 'application/json', ...(connection.dest_headers || {}) },
        body: JSON.stringify({})
      });
      results.push({ endpoint: 'destination', status: response.status, ok: response.ok });
    } catch (error) {
      results.push({ endpoint: 'destination', error: error.message });
    }

    res.json({ connection_id: id, tests: results });
    await client.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/connections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = getDbClient();
    await client.connect();

    const connResult = await client.query('SELECT name FROM connections WHERE id = $1', [id]);
    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Delete logs first
    await client.query('DELETE FROM execution_logs WHERE connection_id = $1', [id]);
    // Delete connection
    await client.query('DELETE FROM connections WHERE id = $1', [id]);

    res.json({ message: `Connection '${connResult.rows[0].name}' deleted successfully` });
    await client.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/connections/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const client = getDbClient();
    await client.connect();

    const connResult = await client.query('SELECT * FROM connections WHERE id = $1', [id]);
    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const connection = connResult.rows[0];

    // Get recent logs
    const logsResult = await client.query(`
      SELECT executed_at, success, execution_time_ms, error_message
      FROM execution_logs
      WHERE connection_id = $1
      ORDER BY executed_at DESC
      LIMIT 10
    `, [id]);

    const stats = {
      connection: {
        id: connection.id,
        name: connection.name,
        execution_count: connection.execution_count,
        success_count: connection.success_count,
        error_count: connection.error_count,
        success_rate: connection.execution_count > 0 ? (connection.success_count / connection.execution_count * 100) : 0,
        last_executed: connection.last_executed
      },
      recent_logs: logsResult.rows
    };

    res.json(stats);
    await client.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SSE endpoint
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  // In a serverless environment, we can't keep connections open indefinitely
  // This is a basic implementation - in production you'd want persistent connections
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

// Helper function for nested object access
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Initialize database on startup
initDatabase();

module.exports = app;