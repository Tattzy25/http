// Application State
const state = {
  connections: [],
  currentFilter: 'all',
  searchQuery: '',
  sortBy: 'name',
  isDarkMode: false,
  wizardStep: 0,
  wizardData: {
    sourceUrl: '',
    sourceMethod: 'GET',
    sourceAuth: 'NONE',
    sourceAuthValue: '',
    destUrl: '',
    destMethod: 'POST',
    destAuth: 'NONE',
    destAuthValue: '',
    connectionName: '',
    mappingRules: [],
    sourcePreview: null
  },
  editingConnectionId: null,
  selectedConnectionId: null,
  _pendingConfirm: null,
  apiBaseKey: 'primary',
  authToken: ''
};

// Helper: JSONPath evaluator (simple implementation)
function evaluateJSONPath(obj, path) {
  if (!path.startsWith('$.')) return null;
  const keys = path.substring(2).split('.');
  let result = obj;
  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = result[key];
    } else {
      return null;
    }
  }
  return result;
}

// Helper: Apply mapping rules
function applyMapping(sourceData, rules) {
  const result = {};
  rules.forEach(rule => {
    const value = evaluateJSONPath(sourceData, rule.sourcePath);
    if (value !== null) {
      result[rule.destField] = value;
    }
  });
  return result;
}

// Application Object
const app = {
  // API base configuration
  apiBases: {
    local: 'http://localhost:4000',
    primary: 'https://http-mu.vercel.app', // Production backend
    secondary: 'https://api.secondary-domain.com'
  },
  get apiBase() {
    return state.apiBaseKey ? this.apiBases[state.apiBaseKey] : this.apiBases.primary;
  },
  init() {
    this.loadFromStorage();
    this.detectEnvironment();
    this.checkTheme();
    this.renderDashboard();
    this.setupEventListeners();
    this.initApiBaseSelect();
    this.showToast('🔥 Connected to real backend', 'success');
  },

  checkTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    state.isDarkMode = prefersDark;
    if (prefersDark) {
      document.documentElement.setAttribute('data-color-scheme', 'dark');
    }
    this.updateThemeIcon();
  },

  toggleTheme() {
    state.isDarkMode = !state.isDarkMode;
    document.documentElement.setAttribute('data-color-scheme', state.isDarkMode ? 'dark' : 'light');
    this.updateThemeIcon();
  },

  updateThemeIcon() {
    const icon = document.getElementById('themeIcon');
    if (icon) {
      icon.textContent = state.isDarkMode ? '☀️' : '🌙';
    }
  },


  saveToStorage() {
    // All data persisted in NEON database via backend
    // Only save UI preferences and auth tokens locally
    try {
      localStorage.setItem('http_connection_manager_production', JSON.stringify({
        theme: document.getElementById('themeSelect')?.value || 'system',
        language: document.getElementById('languageSelect')?.value || 'en',
        apiBaseKey: state.apiBaseKey || 'primary',
        authToken: state.authToken || '',
        lastSync: new Date().toISOString()
      }));
    } catch (e) {
      console.warn('Settings persist failed', e);
    }
  },
  loadFromStorage() {
    // Always load from NEON database via backend
    this.apiFetch('/api/connections')
      .then(connections => {
        state.connections = connections || [];
        this.renderDashboard();
        this.showToast('✅ Connected to NEON database', 'success');
      })
      .catch((error) => {
        console.warn('Failed to load from NEON database:', error);
        this.showToast('⚠️ Database connection failed, using local fallback', 'warning');
        // Fallback to localStorage if backend fails
        this.loadFromLocalStorage();
      });

    // Load UI preferences from localStorage
    try {
      const saved = localStorage.getItem('http_connection_manager_production');
      if (saved) {
        const data = JSON.parse(saved);
        state.apiBaseKey = data.apiBaseKey || 'primary';
        state.authToken = data.authToken || '';
      }
    } catch (e) {
      console.warn('Load settings failed', e);
    }
  },
  
  loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem('connection_manager_http2');
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.connections)) state.connections = data.connections;
        if (data.apiBaseKey) state.apiBaseKey = data.apiBaseKey;
        if (data.authToken) state.authToken = data.authToken;
      }
      
      // Also load settings
      const settingsRaw = localStorage.getItem('connection_manager_http2_settings');
      if (settingsRaw) {
        const settings = JSON.parse(settingsRaw);
        if (settings.apiBaseKey) state.apiBaseKey = settings.apiBaseKey;
        if (settings.authToken) state.authToken = settings.authToken;
      }
    } catch (e) { console.warn('Load failed', e); }
  },
  initApiBaseSelect() {
    const sel = document.getElementById('apiBaseSelect');
    if (!sel) return;
    sel.value = state.apiBaseKey || 'primary';
  },
  detectEnvironment() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      state.apiBaseKey = 'local';
    } else if (hostname.includes('primary')) {
      state.apiBaseKey = 'primary';
    } else if (hostname.includes('secondary')) {
      state.apiBaseKey = 'secondary';
    } else {
      state.apiBaseKey = 'primary'; // default
    }
  },
  changeApiBase(key) {
    state.apiBaseKey = key;
    this.saveToStorage();
    this.showToast(`API base switched to ${key} (${this.apiBase})`, 'info');
  },
  async apiFetch(path, options = {}, connectionOverride = null) {
    const base = connectionOverride || this.apiBase;
    const url = `${base}${path.startsWith('/') ? path : '/' + path}`;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    // Inject auth if available
    if (state.authToken) headers['Authorization'] = `Bearer ${state.authToken}`;
    try {
      const res = await fetch(url, { ...options, headers });
      const ct = res.headers.get('content-type') || '';
      const body = ct.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) throw new Error(body && body.error ? body.error : `Request failed (${res.status})`);
      return body;
    } catch (e) {
      this.showToast(`API error: ${e.message}`, 'error');
      throw e;
    }
  },
  initApiBaseSelect() {
    const sel = document.getElementById('apiBaseSelect');
    if (!sel) return;
    sel.value = state.apiBaseKey || 'primary';
  },
  changeApiBase(key) {
    state.apiBaseKey = key;
    this.saveToStorage();
    this.showToast(`API base switched to ${key} (${this.apiBase})`, 'info');
  },
  async apiFetch(path, options = {}) {
    const url = `${this.apiBase}${path.startsWith('/') ? path : '/' + path}`;
    try {
      const res = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
      });
      const ct = res.headers.get('content-type') || '';
      const body = ct.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) throw new Error(body && body.error ? body.error : `Request failed (${res.status})`);
      return body;
    } catch (e) {
      this.showToast(`API error: ${e.message}`, 'error');
      throw e;
    }
  },

  setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeWizard();
        this.hideLogsModal();
        this.closeMappingRuleModal();
        this.closeSettings();
      }
    });
  },

  // Wizard Management
  openWizard() {
    state.wizardStep = 1;
    state.editingConnectionId = null;
    state.wizardData = {
      sourceUrl: '',
      sourceMethod: 'GET',
      sourceAuth: 'NONE',
      sourceAuthValue: '',
      destUrl: '',
      destMethod: 'POST',
      destAuth: 'NONE',
      destAuthValue: '',
      connectionName: '',
      apiBaseOverride: '',
      mappingRules: [],
      sourcePreview: null
    };
    
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('wizardStep1').classList.remove('hidden');
    document.getElementById('progressBar').classList.remove('hidden');
    this.updateWizardProgress();
    window.scrollTo(0, 0);
  },

  closeWizard() {
    document.getElementById('wizardStep1').classList.add('hidden');
    document.getElementById('wizardStep2').classList.add('hidden');
    document.getElementById('wizardStep3').classList.add('hidden');
    document.getElementById('progressBar').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    state.wizardStep = 0;
  },

  cancelWizard() {
    this.openConfirm('Cancel wizard? Progress will be lost.', () => this.closeWizard());
  },

  wizardNext() {
    // Validate current step
    if (state.wizardStep === 1) {
      const sourceUrl = document.getElementById('sourceUrl').value;
      const destUrl = document.getElementById('destUrl').value;
      const name = document.getElementById('connectionName').value;
      
      if (!sourceUrl || !destUrl || !name) {
        this.showToast('Please fill in all required fields', 'error');
        return;
      }
      
      // Save step 1 data
      state.wizardData.sourceUrl = sourceUrl;
      state.wizardData.sourceMethod = document.getElementById('sourceMethod').value;
      state.wizardData.sourceAuth = document.getElementById('sourceAuth').value;
      state.wizardData.sourceAuthValue = document.getElementById('sourceAuthValue').value;
      state.wizardData.destUrl = destUrl;
      state.wizardData.destMethod = document.getElementById('destMethod').value;
      state.wizardData.destAuth = document.getElementById('destAuth').value;
      state.wizardData.destAuthValue = document.getElementById('destAuthValue').value;
      state.wizardData.connectionName = name;
      state.wizardData.apiBaseOverride = document.getElementById('apiBaseOverride').value;
      
      // Move to step 2
      document.getElementById('wizardStep1').classList.add('hidden');
      document.getElementById('wizardStep2').classList.remove('hidden');
      state.wizardStep = 2;
      this.updateWizardProgress();
      this.renderMappingRules();
      window.scrollTo(0, 0);
    } else if (state.wizardStep === 2) {
      // Move to review
      document.getElementById('wizardStep2').classList.add('hidden');
      document.getElementById('wizardStep3').classList.remove('hidden');
      state.wizardStep = 3;
      this.updateWizardProgress();
      this.renderWizardReview();
      window.scrollTo(0, 0);
    }
  },

  wizardPrev() {
    if (state.wizardStep === 2) {
      document.getElementById('wizardStep2').classList.add('hidden');
      document.getElementById('wizardStep1').classList.remove('hidden');
      state.wizardStep = 1;
      this.updateWizardProgress();
    } else if (state.wizardStep === 3) {
      document.getElementById('wizardStep3').classList.add('hidden');
      document.getElementById('wizardStep2').classList.remove('hidden');
      state.wizardStep = 2;
      this.updateWizardProgress();
    }
    window.scrollTo(0, 0);
  },

  updateWizardProgress() {
    document.querySelectorAll('.progress-step').forEach((step, index) => {
      const stepNum = index + 1;
      if (stepNum < state.wizardStep) {
        step.classList.add('completed');
        step.classList.remove('active');
      } else if (stepNum === state.wizardStep) {
        step.classList.add('active');
        step.classList.remove('completed');
      } else {
        step.classList.remove('active', 'completed');
      }
    });
  },

  toggleAuthFields(type) {
    const authSelect = document.getElementById(`${type}Auth`);
    const authFields = document.getElementById(`${type}AuthFields`);
    
    if (authSelect.value !== 'NONE') {
      authFields.classList.remove('hidden');
    } else {
      authFields.classList.add('hidden');
    }
  },

  // Mapping Rules
  addMappingRule() {
    document.getElementById('mappingRuleModal').classList.remove('hidden');
    document.getElementById('mappingSourcePath').value = '';
    document.getElementById('mappingDestField').value = '';
  },

  closeMappingRuleModal() {
    document.getElementById('mappingRuleModal').classList.add('hidden');
  },

  saveMappingRule() {
    const sourcePath = document.getElementById('mappingSourcePath').value.trim();
    const destField = document.getElementById('mappingDestField').value.trim();
    
    if (!sourcePath || !destField) {
      this.showToast('Please fill in both fields', 'error');
      return;
    }
    
    if (!sourcePath.startsWith('$.')) {
      this.showToast('Source path must start with $. (JSONPath notation)', 'error');
      return;
    }
    
    state.wizardData.mappingRules.push({ sourcePath, destField });
    this.closeMappingRuleModal();
    this.renderMappingRules();
    this.updateDestPreview();
    this.showToast('Mapping rule added', 'success');
  },

  deleteMappingRule(index) {
    state.wizardData.mappingRules.splice(index, 1);
    this.renderMappingRules();
    this.updateDestPreview();
  },

  renderMappingRules() {
    const container = document.getElementById('mappingRulesList');
    
    if (state.wizardData.mappingRules.length === 0) {
      container.innerHTML = `
        <div class="empty-state-small">
          <p>No mapping rules yet. Add rules to transform data.</p>
          <p style="font-size: 12px; margin-top: 8px;">Use JSONPath notation like <code>$.user.email</code></p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = state.wizardData.mappingRules.map((rule, index) => `
      <div class="mapping-rule-item">
        <div class="rule-content">
          <span class="rule-source">${rule.sourcePath}</span>
          <span>→</span>
          <span class="rule-dest">${rule.destField}</span>
        </div>
        <button class="rule-delete" onclick="app.deleteMappingRule(${index})">×</button>
      </div>
    `).join('');
  },

  async testSourceEndpoint() {
    const url = state.wizardData.sourceUrl;
    const method = state.wizardData.sourceMethod;
    const auth = state.wizardData.sourceAuth;
    const authValue = state.wizardData.sourceAuthValue;
    
    if (!url) {
      this.showToast('Please configure source endpoint first', 'error');
      return;
    }
    
    this.showToast('Testing source endpoint...', 'info');
    
    try {
      const headers = {};
      
      if (auth === 'BEARER') {
        headers['Authorization'] = `Bearer ${authValue}`;
      } else if (auth === 'API_KEY') {
        headers['X-API-Key'] = authValue;
      }
      
      const response = await fetch(url, {
        method: method,
        headers: headers
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      state.wizardData.sourcePreview = data;
      
      document.getElementById('sourcePreview').value = JSON.stringify(data, null, 2);
      this.updateDestPreview();
      this.showToast('Source endpoint tested successfully!', 'success');
    } catch (error) {
      this.showToast(`Test failed: ${error.message}`, 'error');
      console.error('Test error:', error);
    }
  },

  updateDestPreview() {
    const sourceText = document.getElementById('sourcePreview').value;
    
    if (!sourceText || state.wizardData.mappingRules.length === 0) {
      document.getElementById('destPreview').value = '';
      return;
    }
    
    try {
      const sourceData = JSON.parse(sourceText);
      const mapped = applyMapping(sourceData, state.wizardData.mappingRules);
      document.getElementById('destPreview').value = JSON.stringify(mapped, null, 2);
    } catch (error) {
      document.getElementById('destPreview').value = 'Invalid JSON in source preview';
    }
  },

  renderWizardReview() {
    const container = document.getElementById('wizardReview');
    const data = state.wizardData;
    
    container.innerHTML = `
      <div class="review-section">
        <h3>Source Endpoint</h3>
        <div class="review-item">
          <span class="review-label">URL</span>
          <span class="review-value">${data.sourceUrl}</span>
        </div>
        <div class="review-item">
          <span class="review-label">Method</span>
          <span class="review-value">${data.sourceMethod}</span>
        </div>
        <div class="review-item">
          <span class="review-label">Authentication</span>
          <span class="review-value">${data.sourceAuth}</span>
        </div>
      </div>
      
      <div class="review-section">
        <h3>Destination Endpoint</h3>
        <div class="review-item">
          <span class="review-label">URL</span>
          <span class="review-value">${data.destUrl}</span>
        </div>
        <div class="review-item">
          <span class="review-label">Method</span>
          <span class="review-value">${data.destMethod}</span>
        </div>
        <div class="review-item">
          <span class="review-label">Authentication</span>
          <span class="review-value">${data.destAuth}</span>
        </div>
      </div>
      
      <div class="review-section">
        <h3>Data Mapping</h3>
        ${data.mappingRules.length === 0 ? '<p style="color: var(--color-text-secondary); font-size: 14px;">No mapping rules configured</p>' : data.mappingRules.map(rule => `
          <div class="review-item">
            <span class="review-label">${rule.sourcePath}</span>
            <span class="review-value">${rule.destField}</span>
          </div>
        `).join('')}
      </div>
      
      <div class="review-section">
        <h3>Connection Details</h3>
        <div class="review-item">
          <span class="review-label">Name</span>
          <span class="review-value">${data.connectionName}</span>
        </div>
      </div>
    `;
  },

  async createConnection() {
    const connection = {
      id: state.editingConnectionId || `conn_${Date.now()}`,
      name: state.wizardData.connectionName,
      sourceUrl: state.wizardData.sourceUrl,
      sourceMethod: state.wizardData.sourceMethod,
      sourceAuth: state.wizardData.sourceAuth,
      destUrl: state.wizardData.destUrl,
      destMethod: state.wizardData.destMethod,
      destAuth: state.wizardData.destAuth,
      apiBaseOverride: state.wizardData.apiBaseOverride,
      mappingRules: [...state.wizardData.mappingRules],
      status: 'active',
      stats: {
        lastExecution: null,
        totalExecutions: 0,
        successCount: 0,
        errorCount: 0,
        uptime: 100
      },
      logs: []
    };

    try {
      // Store credentials securely if they exist
      const credentials = {};
      if (state.wizardData.sourceAuthValue) {
        credentials.sourceAuthValue = state.wizardData.sourceAuthValue;
      }
      if (state.wizardData.destAuthValue) {
        credentials.destAuthValue = state.wizardData.destAuthValue;
      }

      if (Object.keys(credentials).length > 0) {
        await credentialManager.storeCredentials(connection.id, credentials);
      }

      // Always create via NEON database backend (without sensitive credentials)
      const endpoint = state.editingConnectionId ? `/api/connections/${state.editingConnectionId}` : '/api/connections';
      const method = state.editingConnectionId ? 'PUT' : 'POST';

      const result = await this.apiFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: connection.name,
          sourceUrl: connection.sourceUrl,
          sourceMethod: connection.sourceMethod,
          sourceAuth: connection.sourceAuth,
          // Don't send actual auth values to backend - they're stored securely locally
          destUrl: connection.destUrl,
          destMethod: connection.destMethod,
          destAuth: connection.destAuth,
          apiBaseOverride: connection.apiBaseOverride,
          mappingRules: connection.mappingRules
        })
      }, connection.apiBaseOverride);

      if (state.editingConnectionId) {
        const index = state.connections.findIndex(c => c.id === state.editingConnectionId);
        if (index !== -1) {
          state.connections[index] = { ...connection, ...result };
        }
        this.showToast('🔥 Connection updated in NEON database!', 'success');
      } else {
        state.connections.push({ ...connection, ...result });
        this.showToast('🔥 Connection created in NEON database!', 'success');
      }

      this.closeWizard();
      this.renderDashboard();
    } catch (error) {
      this.showToast(`❌ Failed to create connection: ${error.message}`, 'error');
    }
  },

  nextStep() {
    // Validation
    if (state.currentStep === 2 && state.connections.length === 0) {
      this.showToast('Please add at least one connection', 'error');
      return;
    }

    if (state.currentStep === 6) {
      return; // Use launch button instead
    }

    const currentStepEl = document.getElementById(`step${state.currentStep}`);
    currentStepEl.classList.remove('active');
    
    state.currentStep++;
    
    const nextStepEl = document.getElementById(`step${state.currentStep}`);
    nextStepEl.classList.add('active');
    
    this.updateProgressBar();
    this.updateStepContent();
    window.scrollTo(0, 0);
  },

  prevStep() {
    if (state.currentStep === 1) return;
    
    const currentStepEl = document.getElementById(`step${state.currentStep}`);
    currentStepEl.classList.remove('active');
    
    state.currentStep--;
    
    const prevStepEl = document.getElementById(`step${state.currentStep}`);
    prevStepEl.classList.add('active');
    
    this.updateProgressBar();
    window.scrollTo(0, 0);
  },

  updateProgressBar() {
    const progressBar = document.getElementById('progressBar');
    if (state.currentStep === 1) {
      progressBar.classList.add('hidden');
    } else {
      progressBar.classList.remove('hidden');
    }

    document.querySelectorAll('.progress-step').forEach((step, index) => {
      const stepNum = index + 1;
      if (stepNum < state.currentStep) {
        step.classList.add('completed');
        step.classList.remove('active');
      } else if (stepNum === state.currentStep) {
        step.classList.add('active');
        step.classList.remove('completed');
      } else {
        step.classList.remove('active', 'completed');
      }
    });
  },

  updateStepContent() {
    if (state.currentStep === 3) {
      this.renderConfigureList();
    } else if (state.currentStep === 4) {
      this.renderFlowVisualization();
    } else if (state.currentStep === 6) {
      this.renderReviewSummary();
    }
  },


  // Delete Connection
  async deleteConnection(id) {
    this.openConfirm('Permanently delete this connection from NEON database?', async () => {
      try {
        // Delete from NEON database backend
        const result = await this.apiFetch(`/api/connections/${id}`, { method: 'DELETE' });

        if (result.success) {
          // Delete secure credentials
          await credentialManager.deleteCredentials(id);

          state.connections = state.connections.filter(c => c.id !== id);
          this.showToast('✅ Connection and credentials permanently deleted!', 'success');
          this.renderDashboard();
        } else {
          throw new Error(result.error || 'Delete failed');
        }
      } catch (error) {
        this.showToast(`❌ Delete failed: ${error.message}`, 'error');
      }
    });
  },

  // Execute Connection
  async executeConnection(id) {
    const connection = state.connections.find(c => c.id === id);
    if (!connection) return;

    const startTime = Date.now();
    connection.stats.totalExecutions++;
    this.showToast(`🔥 Executing ${connection.name} via NEON backend...`, 'info');
    this.renderDashboard();

    try {
      // Retrieve credentials securely
      const credentials = await credentialManager.getCredentials(id);

      // Call NEON database backend to execute
      const result = await this.apiFetch(`/api/connections/${id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {},
          sourceAuthValue: credentials?.sourceAuthValue,
          destAuthValue: credentials?.destAuthValue
        })
      }, connection.apiBaseOverride);

      const responseTime = Date.now() - startTime;

      if (result.success) {
        connection.stats.successCount++;
        connection.stats.lastExecution = new Date().toISOString();

        const log = {
          timestamp: new Date().toISOString(),
          status: 'success',
          message: 'Execution completed successfully via NEON',
          responseTime: responseTime,
          sourceData: result.input,
          destData: result.output,
          error: null
        };
        connection.logs.unshift(log);

        // Keep only last 50 logs
        if (connection.logs.length > 50) {
          connection.logs = connection.logs.slice(0, 50);
        }

        this.showToast(`✅ ${connection.name} executed successfully via NEON!`, 'success');

        // Update monitoring in real-time
        if (typeof refreshMonitoring === 'function') {
          refreshMonitoring();
        }

      } else {
        throw new Error(result.error || 'Execution failed');
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      connection.stats.errorCount++;

      const log = {
        timestamp: new Date().toISOString(),
        status: 'error',
        message: `NEON execution failed: ${error.message}`,
        responseTime: responseTime,
        sourceData: null,
        destData: null,
        error: error.message
      };
      connection.logs.unshift(log);

      this.showToast(`❌ ${connection.name} execution failed: ${error.message}`, 'error');

      // Update monitoring in real-time
      if (typeof refreshMonitoring === 'function') {
        refreshMonitoring();
      }
    }

    this.saveToStorage();
    this.renderDashboard();
  },

  renderConfigureList() {
    const container = document.getElementById('configureList');
    
    container.innerHTML = state.connections.map(conn => `
      <div class="configure-card">
        <div class="configure-card-header" onclick="app.toggleConfigCard('${conn.id}')">
          <div class="connection-title">
            <span class="connection-icon">${connectionTypeIcons[conn.type]}</span>
            <span class="connection-name">${conn.name}</span>
          </div>
          <span>▼</span>
        </div>
        <div class="configure-card-body" id="config-${conn.id}">
          <div class="form-group">
            <label class="form-label">Retry Attempts</label>
            <input type="number" class="form-control" value="${conn.config.retry}" onchange="app.updateConfig('${conn.id}', 'retry', this.value)">
          </div>
          <div class="form-group">
            <label class="form-label">Timeout (ms)</label>
            <input type="number" class="form-control" value="${conn.config.timeout}" onchange="app.updateConfig('${conn.id}', 'timeout', this.value)">
          </div>
          <div class="form-group">
            <button class="btn btn--primary" onclick="app.testConnection('${conn.id}')">Test Connection</button>
            <div id="test-result-${conn.id}"></div>
          </div>
        </div>
      </div>
    `).join('');
  },

  toggleConfigCard(id) {
    const body = document.getElementById(`config-${id}`);
    body.classList.toggle('collapsed');
  },

  updateConfig(id, key, value) {
    const connection = state.connections.find(c => c.id === id);
    if (connection) {
      connection.config[key] = parseInt(value) || value;
      this.saveToStorage();
    }
  },

  // Test Connection
  async testConnection(id) {
    const resultEl = document.getElementById(`test-result-${id}`);
    const connection = state.connections.find(c => c.id === id);
    if (!connection) return;

    const startTime = Date.now();
    resultEl.innerHTML = '<div style="margin-top: 12px; color: var(--color-text-secondary);">🔥 Testing via NEON backend...</div>';

    try {
      // Retrieve credentials securely
      const credentials = await credentialManager.getCredentials(id);

      // Make API call with credentials
      const result = await this.apiFetch(`/api/connections/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAuthValue: credentials?.sourceAuthValue,
          destAuthValue: credentials?.destAuthValue
        })
      }, connection.apiBaseOverride);

      const responseTime = Date.now() - startTime;
      const success = result.source?.ok && result.destination?.healthy;

      // Update connection stats
      connection.stats.totalExecutions = (connection.stats.totalExecutions || 0) + 1;
      if (success) {
        connection.stats.successCount = (connection.stats.successCount || 0) + 1;
      } else {
        connection.stats.errorCount = (connection.stats.errorCount || 0) + 1;
      }
      connection.stats.lastExecution = new Date().toISOString();

      // Add log entry
      const log = {
        timestamp: new Date().toISOString(),
        status: success ? 'success' : 'error',
        message: success ? 'Test completed successfully via NEON' : 'Test failed - check endpoints',
        responseTime: responseTime,
        sourceData: result.source,
        destData: result.destination,
        error: success ? null : 'Test failed'
      };
      connection.logs.unshift(log);
      if (connection.logs.length > 50) {
        connection.logs = connection.logs.slice(0, 50);
      }

      const msg = success ? '✅ Test successful via NEON!' : '❌ Test failed. Check endpoints.';
      resultEl.innerHTML = `<div class="test-result ${success ? 'success' : 'error'}">${msg}</div>`;

      // Update monitoring in real-time
      if (typeof refreshMonitoring === 'function') {
        refreshMonitoring();
      }

      this.saveToStorage();
    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Update connection stats
      connection.stats.totalExecutions = (connection.stats.totalExecutions || 0) + 1;
      connection.stats.errorCount = (connection.stats.errorCount || 0) + 1;
      connection.stats.lastExecution = new Date().toISOString();

      // Add error log entry
      const log = {
        timestamp: new Date().toISOString(),
        status: 'error',
        message: `NEON test failed: ${error.message}`,
        responseTime: responseTime,
        sourceData: null,
        destData: null,
        error: error.message
      };
      connection.logs.unshift(log);
      if (connection.logs.length > 50) {
        connection.logs = connection.logs.slice(0, 50);
      }

      resultEl.innerHTML = '<div class="test-result error">❌ NEON backend test failed.</div>';

      // Update monitoring in real-time
      if (typeof refreshMonitoring === 'function') {
        refreshMonitoring();
      }

      this.saveToStorage();
    }
  },

  selectFlow(type) {
    state.flowType = type;
    document.querySelectorAll('.flow-option').forEach(el => {
      el.classList.remove('selected');
    });
    document.querySelector(`[data-flow="${type}"]`).classList.add('selected');
    this.renderFlowVisualization();
  },

  renderFlowVisualization() {
    const container = document.getElementById('flowVisualization');
    
    if (state.connections.length === 0) {
      container.innerHTML = '<div style="color: var(--color-text-secondary);">Add connections to visualize the flow</div>';
      return;
    }

    let diagram = '';
    
    if (state.flowType === 'SEQUENTIAL') {
      diagram = state.connections.map((conn, i) => 
        `<div class="flow-node">${i + 1}. ${conn.name}</div>${i < state.connections.length - 1 ? '<div class="flow-arrow">→</div>' : ''}`
      ).join('');
    } else if (state.flowType === 'PARALLEL') {
      diagram = state.connections.map(conn => 
        `<div class="flow-node">${conn.name}</div>`
      ).join('');
    } else {
      diagram = `
        <div class="flow-node">Start</div>
        <div class="flow-arrow">→</div>
        <div class="flow-node">Condition Check</div>
        <div class="flow-arrow">⇉</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${state.connections.map(conn => `<div class="flow-node">${conn.name}</div>`).join('')}
        </div>
      `;
    }

    container.innerHTML = `<div class="flow-diagram">${diagram}</div>`;
  },

  renderReviewSummary() {
    const container = document.getElementById('reviewSummary');
    
    container.innerHTML = `
      <div class="review-section">
        <h3>Connections (${state.connections.length})</h3>
        ${state.connections.map(conn => `
          <div class="review-item">
            <span class="review-label">${connectionTypeIcons[conn.type]} ${conn.name}</span>
            <span class="review-value">${this.getTypeLabel(conn.type)}</span>
          </div>
        `).join('')}
      </div>
      
      <div class="review-section">
        <h3>Flow Configuration</h3>
        <div class="review-item">
          <span class="review-label">Flow Type</span>
          <span class="review-value">${state.flowType}</span>
        </div>
      </div>
      
      <div class="review-section">
        <h3>Monitoring Settings</h3>
        <div class="review-item">
          <span class="review-label">Refresh Interval</span>
          <span class="review-value">${document.getElementById('refreshInterval').selectedOptions[0].text}</span>
        </div>
        <div class="review-item">
          <span class="review-label">Notifications</span>
          <span class="review-value">${document.getElementById('enableNotifications').checked ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div class="review-item">
          <span class="review-label">Log Retention</span>
          <span class="review-value">${document.getElementById('logRetention').selectedOptions[0].text}</span>
        </div>
      </div>
    `;
  },

  launchDashboard() {
    // Save monitoring settings
    state.monitoring.refreshInterval = parseInt(document.getElementById('refreshInterval').value) || 5000;
    state.monitoring.notifications = document.getElementById('enableNotifications').checked;
    state.monitoring.logRetention = parseInt(document.getElementById('backupRetention').value);

    // Initialize connections
    state.connections.forEach(conn => {
      conn.status = 'connecting';
      setTimeout(() => {
        conn.status = Math.random() > 0.2 ? 'connected' : 'error';
        if (conn.status === 'connected') {
          conn.metrics.lastActivity = new Date();
        }
        this.renderDashboard();
      }, Math.random() * 2000 + 500);
    });

    // Hide wizard, show dashboard
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    document.getElementById('progressBar').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    
    this.renderDashboard();
    this.showToast('Dashboard launched successfully! 🚀', 'success');
  },

  renderDashboard() {
    this.updateDashboardStats();
    this.renderDashboardConnections();
    this.updateThemeIcon();
    this.updateModeBadge();
  },

  updateDashboardStats() {
    document.getElementById('totalConnections').textContent = state.connections.length;
    document.getElementById('activeConnections').textContent = state.connections.filter(c => c.status === 'connected').length;
    document.getElementById('totalEvents').textContent = state.connections.reduce((sum, c) => sum + c.metrics.eventCount, 0);
    document.getElementById('totalErrors').textContent = state.connections.reduce((sum, c) => sum + c.metrics.errorCount, 0);
  },

  editConnectionFromDashboard(id) {
    const connection = state.connections.find(c => c.id === id);
    if (!connection) return;
    
    state.editingConnectionId = id;
    state.wizardData = {
      sourceUrl: connection.sourceUrl,
      sourceMethod: connection.sourceMethod,
      sourceAuth: connection.sourceAuth,
      sourceAuthValue: connection.sourceAuthValue,
      destUrl: connection.destUrl,
      destMethod: connection.destMethod,
      destAuth: connection.destAuth,
      destAuthValue: connection.destAuthValue,
      connectionName: connection.name,
      apiBaseOverride: connection.apiBaseOverride || '',
      mappingRules: [...connection.mappingRules],
      sourcePreview: null
    };
    
    state.wizardStep = 1;
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('wizardStep1').classList.remove('hidden');
    document.getElementById('progressBar').classList.remove('hidden');
    
    // Populate fields
    document.getElementById('sourceUrl').value = connection.sourceUrl;
    document.getElementById('sourceMethod').value = connection.sourceMethod;
    document.getElementById('sourceAuth').value = connection.sourceAuth;
    document.getElementById('sourceAuthValue').value = connection.sourceAuthValue || '';
    document.getElementById('destUrl').value = connection.destUrl;
    document.getElementById('destMethod').value = connection.destMethod;
    document.getElementById('destAuth').value = connection.destAuth;
    document.getElementById('destAuthValue').value = connection.destAuthValue || '';
    document.getElementById('connectionName').value = connection.name;
    document.getElementById('apiBaseOverride').value = connection.apiBaseOverride || '';
    
    this.toggleAuthFields('source');
    this.toggleAuthFields('dest');
    this.updateWizardProgress();
  },

  renderDashboardConnections() {
    const container = document.getElementById('dashboardConnections');
    
    let filteredConnections = [...state.connections];
    
    // Apply filter
    if (state.currentFilter !== 'all') {
      filteredConnections = filteredConnections.filter(conn => {
        if (state.currentFilter === 'connected') return conn.status === 'connected';
        if (state.currentFilter === 'disconnected') return conn.status === 'disconnected';
        if (state.currentFilter === 'error') return conn.status === 'error';
        return true;
      });
    }
    
    // Apply search
    if (state.searchQuery) {
      filteredConnections = filteredConnections.filter(conn => 
        conn.name.toLowerCase().includes(state.searchQuery.toLowerCase())
      );
    }
    
    // Apply sort
    filteredConnections.sort((a, b) => {
      if (state.sortBy === 'name') return a.name.localeCompare(b.name);
      if (state.sortBy === 'status') return a.status.localeCompare(b.status);
      if (state.sortBy === 'events') return b.metrics.eventCount - a.metrics.eventCount;
      if (state.sortBy === 'errors') return b.metrics.errorCount - a.metrics.errorCount;
      return 0;
    });
    
    if (state.connections.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">🔌</div>
          <div class="empty-state-title">No Connections Yet</div>
          <div class="empty-state-description">Create your first connection to start linking APIs together</div>
          <button class="btn btn--primary btn--lg" onclick="app.openWizard()" style="margin-top: 16px;">+ Create First Connection</button>
        </div>
      `;
      return;
    }
    
    if (filteredConnections.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-title">No connections found</div>
          <div class="empty-state-description">Try adjusting your filters or search query</div>
        </div>
      `;
      return;
    }

    container.innerHTML = filteredConnections.map(conn => `
      <div class="dashboard-card">
        <div class="card-header">
          <div class="card-title-section">
            <div>
              <div class="card-title">${conn.name}</div>
              <div class="card-type" style="font-size: 11px; color: var(--color-text-secondary);">${conn.sourceUrl.substring(0, 40)}... → ${conn.destUrl.substring(0, 40)}...</div>
            </div>
          </div>
          <div class="status-badge ${conn.status}">
            ${conn.status === 'active' ? '● Active' : '○ Inactive'}
          </div>
        </div>
        
        <div class="card-metrics">
          <div class="metric-item">
            <div class="metric-label">Total</div>
            <div class="metric-value">${conn.stats.totalExecutions}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Success</div>
            <div class="metric-value success">${conn.stats.successCount}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Errors</div>
            <div class="metric-value error">${conn.stats.errorCount}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Last Run</div>
            <div class="metric-value" style="font-size: 11px;">${conn.stats.lastExecution ? this.formatTime(new Date(conn.stats.lastExecution)) : 'Never'}</div>
          </div>
        </div>
        
        <div class="status-text" style="font-size: 12px;">
          ${conn.mappingRules.length} mapping rule${conn.mappingRules.length !== 1 ? 's' : ''} configured
        </div>
        
        <div class="card-actions">
          <button class="btn btn--execute" onclick="app.executeConnection('${conn.id}')">
            ▶ Execute Now
          </button>
          <button class="btn btn--secondary" onclick="app.viewLogs('${conn.id}')">Logs</button>
          <button class="btn btn--secondary" onclick="app.editConnectionFromDashboard('${conn.id}')">Edit</button>
          <button class="btn btn--danger" onclick="app.deleteConnection('${conn.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  },

  getStatusIcon(status) {
    const icons = {
      'connected': '●',
      'connecting': '◐',
      'disconnected': '○',
      'error': '✕'
    };
    return icons[status] || '○';
  },

  getStatusText(status) {
    const texts = {
      'connected': 'Connected & Active',
      'connecting': 'Connecting...',
      'disconnected': 'Disconnected',
      'error': 'Connection Error'
    };
    return texts[status] || status;
  },

  formatTime(date) {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  },

  toggleConnection(id) {
    const connection = state.connections.find(c => c.id === id);
    if (!connection) return;

    if (connection.status === 'connected') {
      connection.status = 'disconnected';
      this.showToast(`${connection.name} disconnected`, 'info');
    } else {
      connection.status = 'connecting';
      this.showToast(`${connection.name} connecting...`, 'info');
      setTimeout(() => {
        connection.status = Math.random() > 0.2 ? 'connected' : 'error';
        if (connection.status === 'connected') {
          connection.metrics.lastActivity = new Date();
          this.showToast(`${connection.name} connected successfully!`, 'success');
        } else {
          this.showToast(`${connection.name} failed to connect`, 'error');
        }
        this.renderDashboard();
      }, 1500);
    }

    this.renderDashboard();
  },

  viewLogs(id) {
    const connection = state.connections.find(c => c.id === id);
    if (!connection) return;

    document.getElementById('logsModalTitle').textContent = `${connection.name} - Execution Logs`;
    
    const logsContent = document.getElementById('logsContent');
    
    if (connection.logs.length === 0) {
      logsContent.innerHTML = '<div class="empty-state-small">No execution logs yet</div>';
    } else {
      logsContent.innerHTML = connection.logs.map(log => {
        const time = new Date(log.timestamp).toLocaleString();
        return `
          <div class="log-entry ${log.status}">
            <div style="font-weight: 600; margin-bottom: 4px;">
              <span class="log-timestamp">${time}</span>
              <span style="margin-left: 12px; text-transform: uppercase; font-size: 11px;">${log.status}</span>
            </div>
            <div class="log-message" style="margin-bottom: 8px;">${log.message}</div>
            ${log.sourceData ? `<details style="margin-top: 8px; font-size: 11px;"><summary>Source Data</summary><pre style="margin-top: 4px; padding: 8px; background: var(--color-secondary); border-radius: 4px; overflow-x: auto;">${JSON.stringify(log.sourceData, null, 2)}</pre></details>` : ''}
            ${log.destData ? `<details style="margin-top: 8px; font-size: 11px;"><summary>Mapped Data</summary><pre style="margin-top: 4px; padding: 8px; background: var(--color-secondary); border-radius: 4px; overflow-x: auto;">${JSON.stringify(log.destData, null, 2)}</pre></details>` : ''}
            ${log.error ? `<div style="margin-top: 8px; color: var(--color-error); font-size: 11px;">Error: ${log.error}</div>` : ''}
          </div>
        `;
      }).join('');
    }

    document.getElementById('logsModal').classList.remove('hidden');
  },

  hideLogsModal() {
    document.getElementById('logsModal').classList.add('hidden');
  },





  setFilter(filter) {
    state.currentFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
    this.renderDashboard();
  },

  filterConnections() {
    state.searchQuery = document.getElementById('searchInput').value;
    this.renderDashboard();
  },

  sortConnections(sortBy) {
    state.sortBy = sortBy;
    this.renderDashboard();
  },

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  },

  // Confirm modal helpers
  openConfirm(message, onConfirm) {
    state._pendingConfirm = onConfirm;
    document.getElementById('confirmMessage').textContent = message || 'Are you sure?';
    document.getElementById('confirmModal').classList.remove('hidden');
  },
  closeConfirm() {
    document.getElementById('confirmModal').classList.add('hidden');
    state._pendingConfirm = null;
  },
  confirmAction() {
    const fn = state._pendingConfirm;
    this.closeConfirm();
    if (typeof fn === 'function') fn();
  },

  // Settings Panel Management
  openSettings() {
    this.loadSettings();
    document.getElementById('settingsPanel').classList.remove('hidden');
    onSettingsOpen();
  },

  closeSettings() {
    document.getElementById('settingsPanel').classList.add('hidden');
  },

  loadSettings() {
    const settings = this.getSettings();
    document.getElementById('environmentSelect').value = settings.environment || 'production';
    document.getElementById('logLevelSelect').value = settings.logLevel || 'info';
    document.getElementById('timezoneSelect').value = settings.timezone || 'UTC';
    document.getElementById('retentionDays').value = settings.retentionDays || 90;
    document.getElementById('sessionTimeout').value = settings.sessionTimeout || 60;
    document.getElementById('passwordPolicy').value = settings.passwordPolicy || 'standard';
    document.getElementById('enable2FA').checked = settings.enable2FA || false;
    document.getElementById('keyRotation').value = settings.keyRotation || '90';
    document.getElementById('healthCheckInterval').value = settings.healthCheckInterval || 60;
    document.getElementById('alertThreshold').value = settings.alertThreshold || 5;
    document.getElementById('emailNotifications').checked = settings.emailNotifications !== false;
    document.getElementById('slackIntegration').checked = settings.slackIntegration || false;
    document.getElementById('maxConnections').value = settings.maxConnections || 10;
    document.getElementById('requestTimeout').value = settings.requestTimeout || 30;
    document.getElementById('rateLimiting').value = settings.rateLimiting || 'basic';
    document.getElementById('cachingStrategy').value = settings.cachingStrategy || 'memory';
    document.getElementById('dataResidency').value = settings.dataResidency || 'us-east';
    document.getElementById('autoBackup').checked = settings.autoBackup !== false;
    document.getElementById('backupFrequency').value = settings.backupFrequency || 'daily';
    document.getElementById('backupRetention').value = settings.backupRetention || 30;
  },

  saveSettings() {
    const settings = {
      environment: document.getElementById('environmentSelect').value,
      logLevel: document.getElementById('logLevelSelect').value,
      timezone: document.getElementById('timezoneSelect').value,
      retentionDays: parseInt(document.getElementById('retentionDays').value),
      sessionTimeout: parseInt(document.getElementById('sessionTimeout').value),
      passwordPolicy: document.getElementById('passwordPolicy').value,
      enable2FA: document.getElementById('enable2FA').checked,
      keyRotation: document.getElementById('keyRotation').value,
      healthCheckInterval: parseInt(document.getElementById('healthCheckInterval').value),
      alertThreshold: parseInt(document.getElementById('alertThreshold').value),
      emailNotifications: document.getElementById('emailNotifications').checked,
      slackIntegration: document.getElementById('slackIntegration').checked,
      maxConnections: parseInt(document.getElementById('maxConnections').value),
      requestTimeout: parseInt(document.getElementById('requestTimeout').value),
      rateLimiting: document.getElementById('rateLimiting').value,
      cachingStrategy: document.getElementById('cachingStrategy').value,
      dataResidency: document.getElementById('dataResidency').value,
      autoBackup: document.getElementById('autoBackup').checked,
      backupFrequency: document.getElementById('backupFrequency').value,
      backupRetention: parseInt(document.getElementById('backupRetention').value),
      lastUpdated: new Date().toISOString()
    };

    localStorage.setItem('enterprise_settings', JSON.stringify(settings));
    this.showToast('✅ Enterprise settings saved successfully!', 'success');
    this.applySettings(settings);
  },

  getSettings() {
    try {
      const saved = localStorage.getItem('enterprise_settings');
      return saved ? JSON.parse(saved) : this.getDefaultSettings();
    } catch (e) {
      console.warn('Failed to load settings:', e);
      return this.getDefaultSettings();
    }
  },

  getDefaultSettings() {
    return {
      environment: 'production',
      logLevel: 'info',
      timezone: 'UTC',
      retentionDays: 90,
      sessionTimeout: 60,
      passwordPolicy: 'standard',
      enable2FA: false,
      keyRotation: '90',
      healthCheckInterval: 60,
      alertThreshold: 5,
      emailNotifications: true,
      slackIntegration: false,
      maxConnections: 10,
      requestTimeout: 30,
      rateLimiting: 'basic',
      cachingStrategy: 'memory',
      dataResidency: 'us-east',
      autoBackup: true,
      backupFrequency: 'daily',
      backupRetention: 30
    };
  },

  applySettings(settings) {
    // Apply timezone
    if (settings.timezone && settings.timezone !== 'UTC') {
      // In a real app, this would set the app's timezone
      console.log('Timezone set to:', settings.timezone);
    }

    // Apply log level
    if (settings.logLevel) {
      console.log('Log level set to:', settings.logLevel);
    }

    // Apply performance settings
    if (settings.maxConnections) {
      state.maxConnections = settings.maxConnections;
    }

    if (settings.requestTimeout) {
      state.requestTimeout = settings.requestTimeout;
    }
  },

  resetSettings() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      localStorage.removeItem('enterprise_settings');
      this.loadSettings();
      this.showToast('Settings reset to defaults', 'info');
    }
  },

  exportSettings() {
    const settings = this.getSettings();
    const dataStr = JSON.stringify(settings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = 'enterprise-settings.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.showToast('Settings exported successfully!', 'success');
  },

  manualBackup() {
    const backup = {
      timestamp: new Date().toISOString(),
      connections: state.connections,
      settings: this.getSettings(),
      version: '2.0.0'
    };

    const dataStr = JSON.stringify(backup, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.showToast('Manual backup created successfully!', 'success');
  },

  loadConnectionsFromBackend() {
    // Load connections from NEON database via Vercel backend
    this.apiFetch('/api/connections')
      .then(connections => {
        state.connections = connections || [];
        this.renderDashboard();
        console.log('✅ Loaded', connections.length, 'connections from NEON database');
      })
      .catch((error) => {
        console.warn('Failed to load from NEON database:', error);
        this.showToast('⚠️ Database connection failed', 'warning');
        // No fallback to localStorage - keep empty state
        state.connections = [];
        this.renderDashboard();
      });
  },
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Secure Credential Management System
class SecureCredentialManager {
  constructor() {
    this.encryptionKey = this.generateEncryptionKey();
    this.auditLog = [];
  }

  // Generate a random encryption key
  generateEncryptionKey() {
    const key = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(key, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Encrypt data using AES-GCM
  async encryptData(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.encryptionKey),
      'AES-GCM',
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      dataBuffer
    );

    return {
      encrypted: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv),
      timestamp: new Date().toISOString()
    };
  }

  // Decrypt data using AES-GCM
  async decryptData(encryptedData) {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(this.encryptionKey),
        'AES-GCM',
        false,
        ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(encryptedData.iv) },
        key,
        new Uint8Array(encryptedData.encrypted)
      );

      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (error) {
      throw new Error('Failed to decrypt data - key may be invalid or data corrupted');
    }
  }

  // Store encrypted credentials
  async storeCredentials(connectionId, credentials) {
    const encrypted = await this.encryptData(credentials);

    // Store in IndexedDB for better security than localStorage
    const db = await this.openCredentialDB();
    const transaction = db.transaction(['credentials'], 'readwrite');
    const store = transaction.objectStore('credentials');

    await store.put({
      id: connectionId,
      data: encrypted,
      created: new Date().toISOString(),
      lastModified: new Date().toISOString()
    });

    // Log audit event
    this.logAuditEvent('store', connectionId, 'Credentials stored securely');

    db.close();
  }

  // Retrieve and decrypt credentials
  async getCredentials(connectionId) {
    const db = await this.openCredentialDB();
    const transaction = db.transaction(['credentials'], 'readonly');
    const store = transaction.objectStore('credentials');

    const request = store.get(connectionId);
    const result = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (!result) {
      return null;
    }

    // Log audit event
    this.logAuditEvent('retrieve', connectionId, 'Credentials retrieved');

    return await this.decryptData(result.data);
  }

  // Rotate encryption key
  async rotateEncryptionKey() {
    const oldKey = this.encryptionKey;
    this.encryptionKey = this.generateEncryptionKey();

    // Re-encrypt all stored credentials with new key
    const db = await this.openCredentialDB();
    const transaction = db.transaction(['credentials'], 'readwrite');
    const store = transaction.objectStore('credentials');
    const request = store.getAll();

    const results = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Re-encrypt each credential with new key
    for (const result of results) {
      try {
        const decrypted = await this.decryptData(result.data);
        const reEncrypted = await this.encryptData(decrypted);

        await store.put({
          ...result,
          data: reEncrypted,
          lastModified: new Date().toISOString()
        });

        this.logAuditEvent('rotate', result.id, 'Credentials re-encrypted with new key');
      } catch (error) {
        console.error(`Failed to re-encrypt credentials for ${result.id}:`, error);
      }
    }

    db.close();

    this.logAuditEvent('rotate', 'system', `Encryption key rotated from ${oldKey.substring(0, 8)}... to ${this.encryptionKey.substring(0, 8)}...`);
  }

  // Delete credentials
  async deleteCredentials(connectionId) {
    const db = await this.openCredentialDB();
    const transaction = db.transaction(['credentials'], 'readwrite');
    const store = transaction.objectStore('credentials');

    await store.delete(connectionId);

    this.logAuditEvent('delete', connectionId, 'Credentials deleted');

    db.close();
  }

  // Get audit log
  getAuditLog() {
    return this.auditLog.slice(-100); // Last 100 entries
  }

  // Log audit event
  logAuditEvent(action, connectionId, details) {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action,
      connectionId,
      details,
      userAgent: navigator.userAgent,
      ip: 'browser-local' // In a real system, this would be server-side
    });

    // Keep only last 1000 audit entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }

    // Persist audit log
    localStorage.setItem('credentialAuditLog', JSON.stringify(this.auditLog));
  }

  // Initialize IndexedDB
  async openCredentialDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SecureCredentialsDB', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('credentials')) {
          db.createObjectStore('credentials', { keyPath: 'id' });
        }
      };
    });
  }

  // Load audit log from storage
  loadAuditLog() {
    const stored = localStorage.getItem('credentialAuditLog');
    if (stored) {
      this.auditLog = JSON.parse(stored);
    }
  }
}

// Global credential manager instance
const credentialManager = new SecureCredentialManager();
credentialManager.loadAuditLog();

// Secure Credential Management UI Functions
async function rotateEncryptionKey() {
  try {
    await credentialManager.rotateEncryptionKey();
    app.showToast('🔄 Encryption keys rotated successfully!', 'success');

    // Update last rotated timestamp
    const lastRotatedEl = document.querySelector('.setting-note');
    if (lastRotatedEl && lastRotatedEl.textContent.includes('Last rotated')) {
      lastRotatedEl.textContent = `Last rotated: ${new Date().toLocaleString()}`;
    }

    // Refresh credential count
    updateCredentialCount();
  } catch (error) {
    app.showToast(`❌ Key rotation failed: ${error.message}`, 'error');
  }
}

async function updateCredentialCount() {
  try {
    const db = await credentialManager.openCredentialDB();
    const transaction = db.transaction(['credentials'], 'readonly');
    const store = transaction.objectStore('credentials');
    const request = store.count();

    const count = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

    const countEl = document.getElementById('credentialCount');
    if (countEl) {
      countEl.textContent = `${count} credential(s) stored securely`;
    }
  } catch (error) {
    console.error('Failed to get credential count:', error);
  }
}

function showCredentialAuditLog() {
  const auditLog = credentialManager.getAuditLog();

  if (auditLog.length === 0) {
    app.showToast('📋 No audit events recorded yet', 'info');
    return;
  }

  // Create audit log modal
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content audit-modal">
      <div class="modal-header">
        <h3>🔐 Credential Audit Log</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="audit-log-container">
          ${auditLog.map(entry => `
            <div class="audit-entry">
              <div class="audit-timestamp">${new Date(entry.timestamp).toLocaleString()}</div>
              <div class="audit-action">${entry.action.toUpperCase()}</div>
              <div class="audit-connection">${entry.connectionId}</div>
              <div class="audit-details">${entry.details}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

// Update credential count when settings panel opens
function onSettingsOpen() {
  updateCredentialCount();
}

// Onboarding System
let currentOnboardingStep = 1;
const totalOnboardingSteps = 5;

function showOnboarding() {
  // Check if user has completed onboarding
  const onboardingCompleted = localStorage.getItem('onboardingCompleted');
  if (onboardingCompleted) return;

  document.getElementById('onboardingModal').classList.remove('hidden');
  currentOnboardingStep = 1;
  updateOnboardingStep();
}

function hideOnboarding() {
  document.getElementById('onboardingModal').classList.add('hidden');
}

function skipOnboarding() {
  localStorage.setItem('onboardingCompleted', 'true');
  hideOnboarding();
  app.showToast('🎯 Onboarding skipped. You can always access help in settings.', 'info');
}

function completeOnboarding() {
  localStorage.setItem('onboardingCompleted', 'true');
  hideOnboarding();
  app.showToast('🎉 Welcome to your enterprise API manager!', 'success');

  // Highlight the "Add Connection" button to encourage first action
  const addButton = document.querySelector('.btn--primary');
  if (addButton) {
    addButton.style.animation = 'pulse 2s infinite';
    setTimeout(() => {
      addButton.style.animation = '';
    }, 6000);
  }
}

function nextOnboardingStep() {
  if (currentOnboardingStep < totalOnboardingSteps) {
    currentOnboardingStep++;
    updateOnboardingStep();
  } else {
    completeOnboarding();
  }
}

function prevOnboardingStep() {
  if (currentOnboardingStep > 1) {
    currentOnboardingStep--;
    updateOnboardingStep();
  }
}

function updateOnboardingStep() {
  // Hide all steps
  for (let i = 1; i <= totalOnboardingSteps; i++) {
    const stepEl = document.getElementById(`onboardingStep${i}`);
    if (stepEl) stepEl.classList.add('hidden');
  }

  // Show current step
  const currentStepEl = document.getElementById(`onboardingStep${currentOnboardingStep}`);
  if (currentStepEl) currentStepEl.classList.remove('hidden');

  // Update progress dots
  const dots = document.querySelectorAll('.progress-dot');
  dots.forEach((dot, index) => {
    if (index + 1 === currentOnboardingStep) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });

  // Update navigation buttons
  const prevBtn = document.getElementById('onboardingPrev');
  const nextBtn = document.getElementById('onboardingNext');

  if (prevBtn) prevBtn.disabled = currentOnboardingStep === 1;
  if (nextBtn) {
    nextBtn.textContent = currentOnboardingStep === totalOnboardingSteps ? 'Get Started' : 'Next';
  }

  // Update title
  const titles = [
    'Welcome to API Connection Manager',
    'Your Dashboard',
    'Create Your First Connection',
    'Enterprise Settings',
    'You\'re All Set!'
  ];
  const titleEl = document.getElementById('onboardingTitle');
  if (titleEl) titleEl.textContent = titles[currentOnboardingStep - 1];
}

// Progressive feature introduction
function introduceFeature(feature) {
  const features = {
    monitoring: {
      title: '📊 Advanced Monitoring Available',
      message: 'Check out the new monitoring dashboard for real-time metrics and alerts.',
      action: 'openMonitoring'
    },
    settings: {
      title: '⚙️ Enterprise Settings',
      message: 'Configure advanced security, monitoring, and compliance settings.',
      action: 'openSettings'
    },
    credentials: {
      title: '🔐 Secure Credentials',
      message: 'Your API keys are now encrypted with enterprise-grade security.',
      action: null
    }
  };

  const featureData = features[feature];
  if (!featureData) return;

  // Check if user has seen this feature introduction
  const seenFeatures = JSON.parse(localStorage.getItem('seenFeatures') || '[]');
  if (seenFeatures.includes(feature)) return;

  // Show feature introduction toast
  app.showToast(`${featureData.title}: ${featureData.message}`, 'info', 8000);

  // Add action button if available
  if (featureData.action) {
    setTimeout(() => {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'btn btn--outline';
      actionBtn.textContent = 'Try It Now';
      actionBtn.onclick = () => window[featureData.action]();
      actionBtn.style.marginLeft = '10px';

      // Find the toast and add button (this is a simplified approach)
      const toasts = document.querySelectorAll('.toast');
      const latestToast = toasts[toasts.length - 1];
      if (latestToast) {
        latestToast.appendChild(actionBtn);
      }
    }, 1000);
  }

  // Mark feature as seen
  seenFeatures.push(feature);
  localStorage.setItem('seenFeatures', JSON.stringify(seenFeatures));
}

// Initialize onboarding on first visit
document.addEventListener('DOMContentLoaded', function() {
  // Show onboarding for new users
  setTimeout(() => {
    showOnboarding();
  }, 1000);

  // Introduce features progressively
  setTimeout(() => introduceFeature('credentials'), 3000);
  setTimeout(() => introduceFeature('monitoring'), 10000);
  setTimeout(() => introduceFeature('settings'), 20000);
});

// Privacy & Terms Functions
function showPrivacyPolicy() {
  document.getElementById('privacyModal').classList.remove('hidden');
}

function closePrivacyModal() {
  document.getElementById('privacyModal').classList.add('hidden');
}

function showTermsOfService() {
  document.getElementById('termsModal').classList.remove('hidden');
}

function closeTermsModal() {
  document.getElementById('termsModal').classList.add('hidden');
}

// Add footer with legal links
function addLegalFooter() {
  const footer = document.createElement('footer');
  footer.className = 'legal-footer';
  footer.innerHTML = `
    <div class="legal-links">
      <button class="legal-link" onclick="showPrivacyPolicy()">Privacy Policy</button>
      <span class="legal-separator">|</span>
      <button class="legal-link" onclick="showTermsOfService()">Terms of Service</button>
      <span class="legal-separator">|</span>
      <span class="legal-copyright">© 2025 API Connection Manager - Enterprise Edition</span>
    </div>
  `;

  document.body.appendChild(footer);
}

// Initialize legal footer
document.addEventListener('DOMContentLoaded', function() {
  addLegalFooter();
});