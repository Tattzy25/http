// Minimal stub for Google Sheets logging; replace with real Sheets API later
export class GoogleSheetsLogger {
  constructor({ sheetId, apiKey } = {}) {
    this.sheetId = sheetId;
    this.apiKey = apiKey;
  }
  async appendLog(_row) {
    // In this stub, we just noop; integration can be added later
    return { ok: true, id: Math.random().toString(36).slice(2) };
  }
}
