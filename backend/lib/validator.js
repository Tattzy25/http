// Basic validator for connection objects and execution payloads
export function validateConnection(conn) {
  const errors = [];
  if (!conn) return ['Connection object required'];
  if (!conn.id) errors.push('id is required');
  if (!conn.name) errors.push('name is required');
  if (!conn.sourceUrl) errors.push('sourceUrl is required');
  if (!conn.destinationUrl) errors.push('destinationUrl is required');
  if (conn.mappings && !(Array.isArray(conn.mappings) || typeof conn.mappings === 'object')) errors.push('mappings must be an array or object');
  return errors;
}

export function validateExecutePayload(payload) {
  const errors = [];
  if (!payload) return ['Payload required'];
  if (!payload.connectionId) errors.push('connectionId required');
  if (!Array.isArray(payload.records)) errors.push('records must be an array');
  return errors;
}
