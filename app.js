// Application State
const state = {
  currentStep: 1,
  connections: [],
  flowType: 'SEQUENTIAL',
  monitoring: {
    refreshInterval: 5000,
    notifications: true,
    logRetention: 7
  },
  editingConnectionId: null,
  currentFilter: 'all',
  searchQuery: '',
  sortBy: 'name',
  isDarkMode: false,
  simulationInterval: null,
  isRealMode: false,
  _pendingConfirm: null
};

// Templates Data
const templates = [
  { name: 'Slack Webhook', type: 'WEBHOOK', url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL', icon: '🔔' },
  { name: 'GitHub Events', type: 'SSE', url: 'https://api.github.com/events', icon: '📡' },
  { name: 'Weather API', type: 'HTTP_GET', url: 'https://api.weather.com/v1/current', icon: '🌐' },
  { name: 'Twitter API', type: 'HTTP_POST', url: 'https://api.twitter.com/2/tweets', icon: '📤' }
];

const connectionTypeIcons = {
  'HTTP_GET': '🌐',
  'HTTP_POST': '📤',
  'SSE': '📡',
  'WEBHOOK': '🔔'
};

// Application Object
const app = {
  // API base configuration (local + domain options)
  apiBases: {
    local: 'http://localhost:4000',
    primary: 'https://api.primary-domain.com', // replace with real domain
    secondary: 'https://api.secondary-domain.com' // replace with real domain
  },
  get apiBase() {
    return state.apiBaseKey ? this.apiBases[state.apiBaseKey] : this.apiBases.local;
  },
  init() {
    this.loadFromStorage();
    this.renderTemplates();
    this.updateConnectionsList();
    this.setupEventListeners();
    this.checkTheme();
    this.updateModeBadge();
    this.initApiBaseSelect();
  },

  checkTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    state.isDarkMode = prefersDark;
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

  // Mode toggle & persistence
  toggleMode() {
    state.isRealMode = !state.isRealMode;
    if (state.isRealMode) {
      // Stop any simulations
      this.stopSimulation();
      this.showToast('REAL mode enabled. Simulation disabled. Connect to a backend for live data.', 'info');
    } else {
      this.showToast('Simulation mode enabled. Using fake statuses/events.', 'info');
    }
    this.updateModeBadge();
    this.saveToStorage();
  },

  updateModeBadge() {
    const badge = document.getElementById('modeBadge');
    if (badge) {
      badge.textContent = state.isRealMode ? 'REAL' : 'Simulation';
      badge.classList.toggle('real', state.isRealMode);
    }
  },

  saveToStorage() {
    try {
      // Scrub credentials before persisting
      const safeConnections = state.connections.map(c => ({
        ...c,
        auth: c.auth ? { ...c.auth, credentials: '' } : c.auth
      }));
      const payload = {
        connections: safeConnections,
        monitoring: state.monitoring,
        isRealMode: state.isRealMode,
        apiBaseKey: state.apiBaseKey || 'local'
      };
      localStorage.setItem('connection_hub_http', JSON.stringify(payload));
    } catch (e) {
      console.warn('Persist failed:', e);
    }
  },

  loadFromStorage() {
    try {
      const raw = localStorage.getItem('connection_hub_http');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.connections)) state.connections = data.connections;
      if (data.monitoring) state.monitoring = { ...state.monitoring, ...data.monitoring };
      if (typeof data.isRealMode === 'boolean') state.isRealMode = data.isRealMode;
      if (data.apiBaseKey) state.apiBaseKey = data.apiBaseKey;
    } catch (e) {
      console.warn('Load failed:', e);
    }
  },
  initApiBaseSelect() {
    const sel = document.getElementById('apiBaseSelect');
    if (!sel) return;
    sel.value = state.apiBaseKey || 'local';
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
    const connType = document.getElementById('connType');
    const connAuth = document.getElementById('connAuth');
    
    if (connType) {
      connType.addEventListener('change', () => {
        const bodyGroup = document.getElementById('bodyGroup');
        if (connType.value === 'HTTP_POST') {
          bodyGroup.classList.remove('hidden');
        } else {
          bodyGroup.classList.add('hidden');
        }
      });
    }

    if (connAuth) {
      connAuth.addEventListener('change', () => {
        const authCreds = document.getElementById('authCredentials');
        if (connAuth.value !== 'NONE') {
          authCreds.classList.remove('hidden');
        } else {
          authCreds.classList.add('hidden');
        }
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideConnectionForm();
        this.hideLogsModal();
      }
    });
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

  renderTemplates() {
    const container = document.getElementById('templatesList');
    container.innerHTML = templates.map(template => `
      <div class="template-card" onclick="app.useTemplate('${template.name}')">
        <div class="template-icon">${template.icon}</div>
        <div class="template-name">${template.name}</div>
        <div class="template-desc">${this.getTypeLabel(template.type)}</div>
      </div>
    `).join('');
  },

  useTemplate(templateName) {
    const template = templates.find(t => t.name === templateName);
    if (template) {
      document.getElementById('connName').value = template.name;
      document.getElementById('connType').value = template.type;
      document.getElementById('connUrl').value = template.url;
      this.showConnectionForm();
    }
  },

  showConnectionForm() {
    document.getElementById('connectionModal').classList.remove('hidden');
    document.getElementById('modalTitle').textContent = state.editingConnectionId ? 'Edit Connection' : 'Add Connection';
    
    if (!state.editingConnectionId) {
      document.getElementById('connectionForm').reset();
      document.getElementById('bodyGroup').classList.add('hidden');
      document.getElementById('authCredentials').classList.add('hidden');
    }
  },

  hideConnectionForm() {
    document.getElementById('connectionModal').classList.add('hidden');
    state.editingConnectionId = null;
    document.getElementById('connectionForm').reset();
  },

  saveConnection(event) {
    event.preventDefault();
    
    const connection = {
      id: state.editingConnectionId || Date.now().toString(),
      name: document.getElementById('connName').value,
      type: document.getElementById('connType').value,
      url: document.getElementById('connUrl').value,
      auth: {
        type: document.getElementById('connAuth').value,
        credentials: document.getElementById('connCredentials').value
      },
      headers: document.getElementById('connHeaders').value,
      body: document.getElementById('connBody').value,
      config: {
        retry: 3,
        timeout: 30000,
        errorHandling: 'retry'
      },
      status: 'disconnected',
      metrics: {
        eventCount: 0,
        errorCount: 0,
        uptime: 0,
        lastActivity: null
      }
    };

    if (state.editingConnectionId) {
      const index = state.connections.findIndex(c => c.id === state.editingConnectionId);
      if (index !== -1) {
        // Preserve metrics and status when editing
        connection.metrics = state.connections[index].metrics;
        connection.status = state.connections[index].status;
        state.connections[index] = connection;
      }
    } else {
      state.connections.push(connection);
    }

    this.hideConnectionForm();
    this.updateConnectionsList();
    this.saveToStorage();
    this.showToast(state.editingConnectionId ? 'Connection updated!' : 'Connection added!', 'success');
    state.editingConnectionId = null;
  },

  updateConnectionsList() {
    const container = document.getElementById('connectionsList');
    
    if (state.connections.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔌</div>
          <div class="empty-state-title">No connections yet</div>
          <div class="empty-state-description">Add your first connection or use a template to get started</div>
        </div>
      `;
      return;
    }

    container.innerHTML = state.connections.map(conn => `
      <div class="connection-card">
        <div class="connection-header">
          <div class="connection-title">
            <span class="connection-icon">${connectionTypeIcons[conn.type]}</span>
            <div>
              <div class="connection-name">${conn.name}</div>
            </div>
          </div>
          <div class="connection-actions">
            <button class="btn btn--secondary" onclick="app.editConnection('${conn.id}')">Edit</button>
            <button class="btn btn--danger" onclick="app.deleteConnection('${conn.id}')">Delete</button>
          </div>
        </div>
        <div class="connection-info">
          <div class="info-row">
            <span class="info-label">Type:</span>
            <span>${this.getTypeLabel(conn.type)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">URL:</span>
            <span style="word-break: break-all;">${conn.url}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Auth:</span>
            <span>${conn.auth.type}</span>
          </div>
        </div>
      </div>
    `).join('');
  },

  editConnection(id) {
    const connection = state.connections.find(c => c.id === id);
    if (connection) {
      state.editingConnectionId = id;
      document.getElementById('connName').value = connection.name;
      document.getElementById('connType').value = connection.type;
      document.getElementById('connUrl').value = connection.url;
      document.getElementById('connAuth').value = connection.auth.type;
      document.getElementById('connCredentials').value = connection.auth.credentials || '';
      document.getElementById('connHeaders').value = connection.headers || '';
      document.getElementById('connBody').value = connection.body || '';
      
      if (connection.type === 'HTTP_POST') {
        document.getElementById('bodyGroup').classList.remove('hidden');
      }
      if (connection.auth.type !== 'NONE') {
        document.getElementById('authCredentials').classList.remove('hidden');
      }
      
      this.showConnectionForm();
    }
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

  deleteConnection(id) {
    this.openConfirm('Delete this connection?', () => {
      state.connections = state.connections.filter(c => c.id !== id);
      this.updateConnectionsList();
      this.saveToStorage();
      this.showToast('Connection deleted', 'info');
    });
  },

  getTypeLabel(type) {
    const labels = {
      'HTTP_GET': 'HTTP GET',
      'HTTP_POST': 'HTTP POST',
      'SSE': 'Server-Sent Events',
      'WEBHOOK': 'Webhook'
    };
    return labels[type] || type;
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

  testConnection(id) {
    const resultEl = document.getElementById(`test-result-${id}`);
    if (state.isRealMode) {
      resultEl.innerHTML = '<div class="test-result info">REAL mode: backend test endpoint not wired in this demo.</div>';
      return;
    }
    resultEl.innerHTML = '<div style="margin-top: 12px; color: var(--color-text-secondary);">Testing...</div>';
    setTimeout(() => {
      const success = Math.random() > 0.3;
      const cssClass = success ? 'success' : 'error';
      const message = success ? '✓ Connection successful!' : '✗ Connection failed. Please check your settings.';
      resultEl.innerHTML = `<div class="test-result ${cssClass}">${message}</div>`;
    }, 1500);
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
    state.monitoring.logRetention = parseInt(document.getElementById('logRetention').value);

    // Initialize connections
    state.connections.forEach(conn => {
      if (state.isRealMode) {
        conn.status = 'disconnected';
      } else {
        conn.status = 'connecting';
        setTimeout(() => {
          conn.status = Math.random() > 0.2 ? 'connected' : 'error';
          if (conn.status === 'connected') {
            conn.metrics.lastActivity = new Date();
          }
          this.renderDashboard();
        }, Math.random() * 2000 + 500);
      }
    });

    // Hide wizard, show dashboard
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    document.getElementById('progressBar').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    
    this.renderDashboard();
    if (!state.isRealMode) this.startSimulation();
    this.showToast('Dashboard launched successfully! 🚀', 'success');
  },

  renderDashboard() {
    this.updateDashboardStats();
    this.renderDashboardConnections();
  },

  updateDashboardStats() {
    document.getElementById('totalConnections').textContent = state.connections.length;
    document.getElementById('activeConnections').textContent = state.connections.filter(c => c.status === 'connected').length;
    document.getElementById('totalEvents').textContent = state.connections.reduce((sum, c) => sum + c.metrics.eventCount, 0);
    document.getElementById('totalErrors').textContent = state.connections.reduce((sum, c) => sum + c.metrics.errorCount, 0);
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
            <span class="card-icon">${connectionTypeIcons[conn.type]}</span>
            <div>
              <div class="card-title">${conn.name}</div>
              <div class="card-type">${this.getTypeLabel(conn.type)}</div>
            </div>
          </div>
          <div class="status-indicator ${conn.status}">
            ${this.getStatusIcon(conn.status)}
          </div>
        </div>
        
        <div class="card-metrics">
          <div class="metric-item">
            <div class="metric-label">Events</div>
            <div class="metric-value success">${conn.metrics.eventCount}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Errors</div>
            <div class="metric-value error">${conn.metrics.errorCount}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Uptime</div>
            <div class="metric-value">${conn.metrics.uptime}%</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Last Active</div>
            <div class="metric-value" style="font-size: 12px;">${conn.metrics.lastActivity ? this.formatTime(conn.metrics.lastActivity) : 'Never'}</div>
          </div>
        </div>
        
        <div class="status-text">
          Status: <strong>${this.getStatusText(conn.status)}</strong>
        </div>
        
        <div class="card-actions">
          <button class="btn ${conn.status === 'connected' ? 'btn--danger' : 'btn--primary'}" 
            onclick="app.toggleConnection('${conn.id}')">
            ${conn.status === 'connected' ? 'Disconnect' : 'Connect'}
          </button>
          <button class="btn btn--secondary" onclick="app.viewLogs('${conn.id}')">View Logs</button>
          <button class="btn btn--secondary" onclick="app.editConnectionFromDashboard('${conn.id}')">Edit</button>
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
      if (state.isRealMode) {
        this.showToast('REAL mode requires backend connection to toggle status.', 'info');
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
    }

    this.renderDashboard();
    this.saveToStorage();
  },

  viewLogs(id) {
    const connection = state.connections.find(c => c.id === id);
    if (!connection) return;

    document.getElementById('logsModalTitle').textContent = `${connection.name} - Logs`;
    
    const logs = this.generateMockLogs(connection);
    const logsContent = document.getElementById('logsContent');
    logsContent.innerHTML = logs.map(log => `
      <div class="log-entry ${log.type}">
        <span class="log-timestamp">${log.timestamp}</span>
        <span class="log-message">${log.message}</span>
      </div>
    `).join('');

    document.getElementById('logsModal').classList.remove('hidden');
  },

  hideLogsModal() {
    document.getElementById('logsModal').classList.add('hidden');
  },

  generateMockLogs(connection) {
    const logs = [];
    const now = new Date();
    
    for (let i = 0; i < 20; i++) {
      const time = new Date(now - i * 30000);
      const isError = Math.random() < 0.15;
      logs.push({
        timestamp: time.toLocaleTimeString(),
        type: isError ? 'error' : 'success',
        message: isError 
          ? `Error: Connection timeout (attempt ${Math.floor(Math.random() * 3) + 1}/3)`
          : `Event received: ${Math.floor(Math.random() * 1000)} bytes`
      });
    }
    
    return logs;
  },

  editConnectionFromDashboard(id) {
    this.editConnection(id);
  },

  returnToWizard() {
    state.currentStep = 2;
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('step2').classList.add('active');
    document.getElementById('progressBar').classList.remove('hidden');
    this.updateProgressBar();
    this.stopSimulation();
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

  startSimulation() {
    if (state.simulationInterval) {
      clearInterval(state.simulationInterval);
    }

    if (state.isRealMode) return; // no simulation in REAL mode

    state.simulationInterval = setInterval(() => {
      state.connections.forEach(conn => {
        if (conn.status === 'connected') {
          // Simulate events
          if (Math.random() > 0.3) {
            conn.metrics.eventCount += Math.floor(Math.random() * 5) + 1;
            conn.metrics.lastActivity = new Date();
          }
          
          // Simulate occasional errors
          if (Math.random() > 0.9) {
            conn.metrics.errorCount++;
          }
          
          // Update uptime
          conn.metrics.uptime = Math.min(99.9, conn.metrics.uptime + Math.random() * 0.1);
          if (conn.metrics.uptime === 0) {
            conn.metrics.uptime = Math.floor(Math.random() * 30) + 95;
          }
          
          // Random disconnection
          if (Math.random() > 0.98) {
            conn.status = 'error';
            setTimeout(() => {
              conn.status = 'connected';
              this.renderDashboard();
            }, 3000);
          }
        }
      });
      
      this.renderDashboard();
      this.saveToStorage();
    }, state.monitoring.refreshInterval);
  },

  stopSimulation() {
    if (state.simulationInterval) {
      clearInterval(state.simulationInterval);
      state.simulationInterval = null;
    }
  },

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}