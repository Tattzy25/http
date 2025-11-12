// Simple in-memory storage for connections & logs.
// In serverless this resets on each cold start; replace with DB or Sheets for persistence.
export const storage = {
  connections: new Map(), // id -> connection object
  logs: [], // array of { timestamp, connectionId, event, status, ... }
};

export function addConnection(conn) {
  storage.connections.set(conn.id, conn);
  return conn;
}
export function getConnection(id) {
  return storage.connections.get(id);
}
export function updateConnection(id, patch) {
  const existing = storage.connections.get(id);
  if (!existing) return false;
  const updated = { ...existing, ...patch };
  storage.connections.set(id, updated);
  return updated;
}
export function listConnections() {
  return Array.from(storage.connections.values());
}
export function logEvent(entry) {
  const withMeta = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  storage.logs.unshift(withMeta);
  // keep last 500
  if (storage.logs.length > 500) storage.logs = storage.logs.slice(0, 500);
}
export function listLogs(filter = {}) {
  const { connectionId, limit = 50 } = filter;
  return storage.logs.filter(l => !connectionId || l.connectionId === connectionId).slice(0, limit);
}
