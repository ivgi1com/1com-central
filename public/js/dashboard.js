let chart = null;
let _refreshInterval = null;
const API       = (window.BASE_PATH || '') + '/api';
const ADMIN_API = (window.BASE_PATH || '') + '/api/admin';

// ── NOC Summary Cards ─────────────────────────────────────────────────────────

function countUp(el, target, duration) {
  if (!el) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { el.textContent = target.toLocaleString(); return; }
  const d = duration || 900;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / d, 1);
    // ease-out-quart
    const ease = 1 - Math.pow(1 - t, 4);
    el.textContent = Math.round(ease * target).toLocaleString();
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderSummaryCards(nodes) {
  const el = document.getElementById('noc-summary');
  if (!el) return;

  const online     = nodes.filter(n => n.status === 'ok').length;
  const total      = nodes.length;
  const totalCalls = nodes.reduce((s, n) => s + (n.active_calls ?? 0), 0);
  const totalPeers = nodes.reduce((s, n) => s + (n.sip_peers ?? 0), 0);

  const healthLabel = online === total && total > 0 ? 'Cluster: Healthy'
    : online === 0 && total > 0 ? 'Cluster: All Down'
    : `${total - online} node${total - online !== 1 ? 's' : ''} offline`;

  el.innerHTML = `
    <div class="noc-summary-wrapper">
      <div class="noc-cards-grid">

        <div class="noc-card noc-card--nodes">
          <div class="noc-card__header">
            <span class="noc-card__label">Online Nodes</span>
            <span class="noc-card__icon">
              <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            </span>
          </div>
          <div class="noc-card__value">
            <span id="noc-val-nodes">${online.toLocaleString()}</span><span style="font-size:1.1rem;font-weight:400;opacity:0.45"> / ${total}</span>
          </div>
          <div class="noc-card__footer">
            <span class="noc-card__sub">${healthLabel}</span>
            <span class="noc-badge"><span class="noc-badge__dot"></span>Live</span>
          </div>
        </div>

        <div class="noc-card noc-card--calls">
          <div class="noc-card__header">
            <span class="noc-card__label">Active Calls</span>
            <span class="noc-card__icon">
              <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.42 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.83a16 16 0 0 0 6.06 6.06l.94-.94a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/></svg>
            </span>
          </div>
          <div class="noc-card__value" id="noc-val-calls">${totalCalls.toLocaleString()}</div>
          <div class="noc-card__footer">
            <span class="noc-card__sub">Across all PBX nodes</span>
            <span class="noc-badge"><span class="noc-badge__dot"></span>Real-time</span>
          </div>
        </div>

        <div class="noc-card noc-card--peers">
          <div class="noc-card__header">
            <span class="noc-card__label">Registered SIP Peers</span>
            <span class="noc-card__icon">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/><circle cx="19" cy="8" r="3"/><path d="M22 12h-3"/><circle cx="5" cy="8" r="3"/><path d="M2 12h3"/></svg>
            </span>
          </div>
          <div class="noc-card__value" id="noc-val-peers">${totalPeers.toLocaleString()}</div>
          <div class="noc-card__footer">
            <span class="noc-card__sub">Connected endpoints</span>
            <span class="noc-badge"><span class="noc-badge__dot"></span>Registered</span>
          </div>
        </div>

      </div>
    </div>`;

  countUp(document.getElementById('noc-val-nodes'), online);
  countUp(document.getElementById('noc-val-calls'), totalCalls);
  countUp(document.getElementById('noc-val-peers'), totalPeers);
}

function renderClusterOverview(nodes) {
  const el = document.getElementById('cluster-overview');
  if (!el) return;

  const online   = nodes.filter(n => n.status === 'ok').length;
  const total    = nodes.length;
  const warnings = nodes.filter(n => n.status === 'asterisk_down').length;
  const down     = nodes.filter(n => n.status === 'unreachable').length;

  const lastTs = nodes.reduce((mx, n) => {
    if (!n.last_updated) return mx;
    const t = new Date(n.last_updated).getTime();
    return t > mx ? t : mx;
  }, 0);
  const syncAgo   = lastTs ? Math.round((Date.now() - lastTs) / 1000) : null;
  const syncLabel = syncAgo === null ? '—'
    : syncAgo < 5  ? 'Just now'
    : syncAgo < 60 ? `${syncAgo}s ago`
    : `${Math.round(syncAgo / 60)}m ago`;

  const healthColor = down > 0 ? 'var(--nt-red)'
    : warnings > 0 ? 'var(--nt-amber)'
    : total > 0    ? 'var(--nt-emerald)'
    : 'var(--nt-muted)';
  const healthLabel = down > 0
    ? `${down} Node${down > 1 ? 's' : ''} Unreachable`
    : warnings > 0
    ? `${warnings} Node${warnings > 1 ? 's' : ''} Degraded`
    : total > 0 ? 'All Systems Operational' : 'No Nodes Configured';

  el.innerHTML = `
    <div class="noc-cluster-overview">
      <div class="nco-header">
        <div class="nco-brand">
          <svg class="nco-logo" viewBox="0 0 24 24">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.42 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.83a16 16 0 0 0 6.06 6.06l.94-.94a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/>
          </svg>
          <div>
            <div class="nco-title">1COM Central</div>
            <div class="nco-sub">Asterisk Cluster Monitor &mdash; ${total} node${total !== 1 ? 's' : ''} configured &bull; 30s poll</div>
          </div>
        </div>
        <div class="nco-health" style="--health-color:${healthColor}">
          <span class="nco-health-dot"></span>
          <span class="nco-health-label">${esc(healthLabel)}</span>
        </div>
      </div>
      <div class="nco-stats">
        <div class="nco-stat">
          <span class="nco-stat-value">${online}<span class="nco-stat-total"> / ${total}</span></span>
          <span class="nco-stat-label">Online</span>
        </div>
        ${warnings > 0 ? `<div class="nco-stat nco-stat--warn">
          <span class="nco-stat-value">${warnings}</span>
          <span class="nco-stat-label">Degraded</span>
        </div>` : ''}
        ${down > 0 ? `<div class="nco-stat nco-stat--crit">
          <span class="nco-stat-value">${down}</span>
          <span class="nco-stat-label">Unreachable</span>
        </div>` : ''}
        <div class="nco-stat">
          <span class="nco-stat-value">${esc(syncLabel)}</span>
          <span class="nco-stat-label">Last Sync</span>
        </div>
      </div>
      <div class="nco-actions">
        <a href="#nodes" class="nco-btn nco-btn--primary">
          <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
          Manage Nodes
        </a>
      </div>
    </div>`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isStale(lastUpdated) {
  return lastUpdated && Date.now() - new Date(lastUpdated).getTime() > 90_000;
}

function statusPill(status, lastUpdated) {
  const stale = isStale(lastUpdated) ? ' <span class="noc-pill noc-pill--stale">stale</span>' : '';
  if (status === 'ok')            return `<span class="noc-pill noc-pill--ok">Online</span>${stale}`;
  if (status === 'asterisk_down') return `<span class="noc-pill noc-pill--warn">Degraded</span>${stale}`;
  return `<span class="noc-pill noc-pill--crit">Unreachable</span>${stale}`;
}

function statusBadge(status, lastUpdated) { return statusPill(status, lastUpdated); }

function progressBarColor(pct) {
  if (pct == null) return 'bg-secondary';
  if (pct >= 90) return 'bg-danger';
  if (pct >= 70) return 'bg-warning';
  return 'bg-success';
}

function progressBar(pct) {
  if (pct == null) return '<span style="color:var(--nt-muted)">—</span>';
  const cls = pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : 'ok';
  return `<div class="noc-progress-wrap">
    <div class="noc-progress-pct">${pct}%</div>
    <div class="noc-progress-bar-track">
      <div class="noc-progress-bar-fill noc-progress-bar-fill--${cls}"
           style="width:${Math.min(pct, 100)}%"></div>
    </div>
  </div>`;
}

function metricCard(label, value, sub) {
  return `<div class="noc-metric-card">
    <div class="nmc-label">${label}</div>
    <div class="nmc-value">${value}</div>
    ${sub ? `<div class="nmc-sub">${sub}</div>` : ''}
  </div>`;
}

function spinner() {
  return '<div class="spinner-border spinner-border-sm me-2" role="status"></div>';
}

// ── Router ────────────────────────────────────────────────────────────────────

const VIEWS = [
  'view-dashboard',
  'view-nodes',
  'view-node-detail',
  'view-tenants',
  'view-tenant-dashboard',
];

function showView(id) {
  VIEWS.forEach(v => {
    document.getElementById(v).style.display = v === id ? '' : 'none';
  });
  const onDash  = id === 'view-dashboard';
  const onNodes = ['view-nodes','view-node-detail','view-tenants','view-tenant-dashboard'].includes(id);
  document.getElementById('menu-dashboard').classList.toggle('active', onDash);
  document.getElementById('menu-nodes').classList.toggle('active', onNodes);
  clearInterval(_refreshInterval);
  _refreshInterval = null;
}

function router() {
  const hash = location.hash || '#dashboard';

  if (hash.startsWith('#tenant/')) {
    // #tenant/{nodeId}/{tenantName}
    const rest  = hash.slice(8);
    const slash = rest.indexOf('/');
    const nodeId = parseInt(slash >= 0 ? rest.slice(0, slash) : rest, 10);
    const tenant = slash >= 0 ? decodeURIComponent(rest.slice(slash + 1)) : '';
    showView('view-tenant-dashboard');
    loadTenantDashboard(nodeId, tenant);
  } else if (hash.startsWith('#tenants/')) {
    const nodeId = parseInt(hash.slice(9), 10);
    showView('view-tenants');
    loadTenants(nodeId);
  } else if (hash.startsWith('#node-')) {
    const id = parseInt(hash.slice(6), 10);
    showView('view-node-detail');
    loadNodeDetail(id);
    _refreshInterval = setInterval(() => loadNodeDetail(id), 30_000);
  } else if (hash === '#nodes') {
    showView('view-nodes');
    loadNodesList();
    _refreshInterval = setInterval(loadNodesList, 30_000);
  } else {
    showView('view-dashboard');
    refreshDashboard();
    _refreshInterval = setInterval(refreshDashboard, 30_000);
  }
}

window.addEventListener('hashchange', router);

// ── Dashboard view ─────────────────────────────────────────────────────────────

async function refreshDashboard() {
  let nodes;
  try {
    const res = await fetch(`${API}/nodes`);
    if (!res.ok) return;
    nodes = await res.json();
  } catch (_) { return; }
  renderSummaryCards(nodes);
  renderClusterOverview(nodes);
  renderTable(nodes);
  renderChart(nodes);
}

function renderTable(nodes) {
  const container = document.getElementById('nodes-table-container');
  if (!container) return;
  if (nodes.length === 0) {
    container.innerHTML = `
      <div class="noc-empty-panel">
        <i class="bx bx-server"></i>
        <p>No nodes configured.</p>
      </div>`;
    return;
  }
  const rows = nodes.map(n => `
    <tr style="cursor:pointer" onclick="location.hash='#tenants/${n.id}'">
      <td><span class="noc-node-name">${esc(n.name)}</span></td>
      <td><span class="noc-host">${esc(n.host)}</span></td>
      <td>${statusPill(n.status, n.last_updated)}</td>
      <td><span class="noc-metric">${n.active_calls ?? '—'}</span></td>
      <td><span class="noc-metric">${n.sip_peers ?? '—'}</span></td>
      <td><span class="noc-metric-mono">${n.load_avg ?? '—'}</span></td>
      <td><span class="noc-uptime">${n.uptime ? esc(n.uptime) : '—'}</span></td>
      <td><span class="noc-version">${n.asterisk_version ? esc(n.asterisk_version) : '—'}</span></td>
    </tr>`).join('');
  container.innerHTML = `
    <table class="noc-data-grid">
      <thead>
        <tr>
          <th>Node</th><th>Host</th><th>Status</th>
          <th>Calls</th><th>SIP Peers</th>
          <th>Load</th><th>Uptime</th><th>Version</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderChart(nodes) {
  const el = document.getElementById('calls-chart');
  if (!el) return;
  const series     = [{ name: 'Active Calls', data: nodes.map(n => n.active_calls ?? 0) }];
  const categories = nodes.map(n => n.name);
  if (chart) {
    chart.updateOptions({ xaxis: { categories } });
    chart.updateSeries(series);
    return;
  }
  chart = new ApexCharts(el, {
    chart: {
      type: 'bar',
      height: 280,
      toolbar: { show: false },
      background: 'transparent',
      foreColor: '#64748b',
    },
    theme: { mode: 'light' },
    series,
    xaxis: {
      categories,
      labels: { style: { colors: '#64748b', fontSize: '11px' } },
      axisBorder: { color: '#e2e8f0' },
      axisTicks: { color: '#e2e8f0' },
    },
    yaxis: { labels: { style: { colors: '#64748b' } } },
    grid: { borderColor: '#e2e8f0', strokeDashArray: 4 },
    colors: ['#3b82f6'],
    plotOptions: { bar: { borderRadius: 5, columnWidth: '45%' } },
    dataLabels: { enabled: false },
    tooltip: {
      theme: 'light',
      style: { fontSize: '12px' },
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'light',
        type: 'vertical',
        shadeIntensity: 0.2,
        gradientToColors: ['#6366f1'],
        stops: [0, 100],
      },
    },
  });
  chart.render();
}

// ── Nodes list view ───────────────────────────────────────────────────────────

async function loadNodesList() {
  const container = document.getElementById('nodes-view-container');
  if (!container) return;
  let nodes;
  try {
    const res = await fetch(`${API}/nodes`);
    if (!res.ok) throw new Error();
    nodes = await res.json();
  } catch (_) {
    container.innerHTML = `<div class="noc-empty-panel"><i class="bx bx-error-circle" style="color:var(--nt-red)"></i><p>Failed to load nodes.</p></div>`;
    return;
  }
  if (nodes.length === 0) {
    container.innerHTML = `<div class="noc-empty-panel"><i class="bx bx-server"></i><p>No nodes configured yet.</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="card">
      <div class="card-header d-flex align-items-center justify-content-between">
        <h5 class="card-title m-0">Nodes</h5>
        <small style="color:var(--nt-muted);font-size:0.72rem">Click row → tenants</small>
      </div>
      <div class="card-body p-0">
        <table class="noc-data-grid">
          <thead>
            <tr>
              <th>Node</th><th>Host</th><th>Status</th>
              <th>Calls</th><th>Tenants / Peers</th>
              <th>Load</th><th>Uptime</th>
            </tr>
          </thead>
          <tbody>
            ${nodes.map(n => `
            <tr style="cursor:pointer" onclick="location.hash='#tenants/${n.id}'">
              <td><span class="noc-node-name">${esc(n.name)}</span></td>
              <td><span class="noc-host">${esc(n.host)}</span></td>
              <td>${statusPill(n.status, n.last_updated)}</td>
              <td><span class="noc-metric">${n.active_calls ?? '—'}</span></td>
              <td>${(n.tenants || []).length > 0
                ? (n.tenants || []).slice(0, 5).map(t =>
                    \`<span class="badge bg-label-primary me-1" style="font-size:.65rem">\${esc(t)}</span>\`
                  ).join('') + ((n.tenants || []).length > 5
                    ? \`<span style="color:var(--nt-muted);font-size:.72rem">+\${n.tenants.length - 5}</span>\`
                    : '')
                : \`<span style="color:var(--nt-muted);font-size:.78rem">\${n.sip_peers ?? '—'} peers</span>\`
              }</td>
              <td><span class="noc-metric-mono">${n.load_avg ?? '—'}</span></td>
              <td><span class="noc-uptime">${n.uptime ? esc(n.uptime) : '—'}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── Node detail view ──────────────────────────────────────────────────────────

async function loadNodeDetail(id) {
  const container = document.getElementById('node-detail-container');
  if (!container) return;
  let n;
  try {
    const res = await fetch(`${API}/nodes/${id}`);
    if (!res.ok) throw new Error();
    n = await res.json();
  } catch (_) {
    container.innerHTML = `<div class="noc-empty-panel"><i class="bx bx-error-circle" style="color:var(--nt-red)"></i><p>Failed to load node.</p></div>`;
    return;
  }
  const memPct    = n.mem_total_mb && n.mem_used_mb ? Math.round((n.mem_used_mb / n.mem_total_mb) * 100) : null;
  const memLabel  = n.mem_total_mb != null ? `${n.mem_used_mb} / ${n.mem_total_mb} MB` : '-';
  const lastSeen  = n.last_updated ? new Date(n.last_updated).toLocaleTimeString() : '-';

  container.innerHTML = `
    <div class="noc-page-header">
      <a href="#nodes" class="btn btn-sm btn-outline-secondary">
        <i class="bx bx-arrow-back me-1"></i>Nodes
      </a>
      <span class="noc-breadcrumb-sep">›</span>
      <span class="noc-page-title">${esc(n.name)}</span>
      ${statusPill(n.status, n.last_updated)}
      <a href="#tenants/${id}" class="btn btn-sm btn-primary ms-auto">
        <i class="bx bx-building me-1"></i>Tenants
      </a>
      <small style="color:var(--nt-muted);font-size:0.72rem">Updated ${lastSeen}</small>
    </div>

    <div class="noc-section-title">Asterisk</div>
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-4 col-lg-3">
        ${metricCard('Active Calls', `<span style="color:var(--nt-cyan)">${n.active_calls ?? '—'}</span>`)}
      </div>
      <div class="col-6 col-md-4 col-lg-3">
        <div class="noc-metric-card">
          <div class="nmc-label">SIP Peers</div>
          <div class="nmc-value" style="color:var(--nt-violet)">${n.sip_peers ?? '—'}</div>
          <div class="d-flex flex-wrap gap-1 mt-2">
            ${(n.tenants || []).map(t => `<span class="badge bg-label-primary" style="cursor:pointer;font-size:.65rem"
              onclick="location.hash='#tenant/${id}/${encodeURIComponent(t)}'">${esc(t)}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="col-6 col-md-4 col-lg-3">
        ${metricCard('Version', n.asterisk_version ? `<span style="font-size:1rem;font-family:monospace">${esc(n.asterisk_version)}</span>` : '—')}
      </div>
    </div>

    <div class="noc-section-title">System</div>
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-4 col-lg-3">
        <div class="noc-metric-card">
          <div class="nmc-label">CPU</div>
          ${progressBar(n.cpu_pct)}
        </div>
      </div>
      <div class="col-6 col-md-4 col-lg-3">
        <div class="noc-metric-card">
          <div class="nmc-label">Memory</div>
          ${progressBar(memPct)}
          <div class="nmc-sub">${memLabel}</div>
        </div>
      </div>
      <div class="col-6 col-md-4 col-lg-3">
        <div class="noc-metric-card">
          <div class="nmc-label">Disk /</div>
          ${progressBar(n.disk_use_pct)}
          ${n.disk_avail ? `<div class="nmc-sub">${esc(n.disk_avail)} free</div>` : ''}
        </div>
      </div>
      <div class="col-6 col-md-4 col-lg-3">
        ${metricCard('Load Avg', n.load_avg ? `<span style="font-family:monospace;font-size:1.1rem">${esc(n.load_avg)}</span>` : '—')}
      </div>
    </div>
    <div class="row g-3">
      <div class="col-12 col-md-6">
        ${metricCard('Uptime', n.uptime ? `<span style="font-size:0.95rem">${esc(n.uptime)}</span>` : '—')}
      </div>
      <div class="col-12 col-md-6">
        ${metricCard('Host', `<span style="font-family:monospace;font-size:0.95rem">${esc(n.host)}</span>`)}
      </div>
    </div>`;
}

// ── Tenants list view ─────────────────────────────────────────────────────────

async function loadTenants(nodeId) {
  const container = document.getElementById('tenants-container');
  if (!container) return;
  container.innerHTML = `<div class="noc-empty-panel"><div class="spinner-border" role="status"></div><p>Loading tenants…</p></div>`;

  let data;
  try {
    const res = await fetch(`${ADMIN_API}/nodes/${nodeId}/tenants`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || res.statusText);
    }
    data = await res.json();
  } catch (err) {
    container.innerHTML = `<div class="noc-empty-panel"><i class="bx bx-error-circle" style="color:var(--nt-red)"></i><p>Failed to load tenants: ${esc(String(err.message || err))}</p></div>`;
    return;
  }

  const { node, tenants } = data;
  const header = `
    <div class="noc-page-header">
      <a href="#nodes" class="btn btn-sm btn-outline-secondary"><i class="bx bx-arrow-back me-1"></i>Nodes</a>
      <span class="noc-breadcrumb-sep">›</span>
      <span class="noc-page-title">${esc(node)}</span>
      <a href="#node-${nodeId}" class="btn btn-sm btn-outline-secondary ms-auto">
        <i class="bx bx-server me-1"></i>System Info
      </a>
    </div>`;

  if (!tenants || tenants.length === 0) {
    container.innerHTML = header + `<div class="noc-empty-panel"><i class="bx bx-building" style="opacity:0.3"></i><p>No tenants found on this node.</p></div>`;
    return;
  }

  container.innerHTML = `
    ${header}
    <div class="d-flex align-items-center gap-3 mb-4 flex-wrap">
      <div style="position:relative;flex:0 0 260px">
        <i class="bx bx-search" style="position:absolute;left:.7rem;top:50%;transform:translateY(-50%);color:var(--nt-muted);pointer-events:none"></i>
        <input type="text" class="form-control" style="padding-left:2.2rem"
               placeholder="Search tenants…" id="tenant-search" autocomplete="off">
      </div>
      <small id="tenant-count" style="color:var(--nt-muted);font-size:0.75rem"></small>
    </div>
    <div class="row g-3" id="tenants-grid"></div>`;

  const grid     = document.getElementById('tenants-grid');
  const searchEl = document.getElementById('tenant-search');
  const countEl  = document.getElementById('tenant-count');

  function renderGrid(filter) {
    const filtered = filter
      ? tenants.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))
      : tenants;
    countEl.textContent = filter
      ? `${filtered.length} of ${tenants.length} tenants`
      : `${tenants.length} tenants`;
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="col-12 text-muted">No tenants match your search.</div>';
      return;
    }
    grid.innerHTML = filtered.map(t => `
      <div class="col-12 col-sm-6 col-md-4 col-lg-3">
        <div class="noc-tenant-card"
             onclick="location.hash='#tenant/${nodeId}/${encodeURIComponent(t.name)}'">
          <div class="noc-tenant-icon">
            <i class="bx bx-building"></i>
          </div>
          <div style="min-width:0;flex:1">
            <div class="noc-tenant-name">${esc(t.name)}</div>
            <div class="noc-tenant-sub">Tenant</div>
          </div>
          <i class="bx bx-chevron-right" style="color:var(--nt-dim);flex-shrink:0"></i>
        </div>
      </div>`).join('');
  }

  searchEl.addEventListener('input', () => renderGrid(searchEl.value.trim()));
  renderGrid('');
}

// ── Tenant dashboard view ─────────────────────────────────────────────────────

const CATEGORY_ICONS = {
  'SIP & Extensions': 'bx-phone',
  'Unreachable':      'bx-error-circle',
  'Queues':           'bx-list-ul',
  'Logs':             'bx-file-blank',
  'Server':           'bx-server',
  'Email':            'bx-envelope',
  'Kamailio':         'bx-wifi',
  'Recordings':       'bx-microphone',
  'Admin Actions':    'bx-shield-alt-2',
};

async function loadTenantDashboard(nodeId, tenant) {
  const container = document.getElementById('tenant-dashboard-container');
  if (!container) return;
  container.innerHTML = `<div class="noc-empty-panel"><div class="spinner-border" role="status"></div><p>Loading dashboard…</p></div>`;

  let data;
  try {
    const res = await fetch(`${ADMIN_API}/nodes/${nodeId}/tenants/${encodeURIComponent(tenant)}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || res.statusText);
    }
    data = await res.json();
  } catch (err) {
    container.innerHTML = `<div class="noc-empty-panel"><i class="bx bx-error-circle" style="color:var(--nt-red)"></i><p>Failed: ${esc(String(err.message || err))}</p></div>`;
    return;
  }

  const { node, actions } = data;

  // Group by category (preserve order)
  const cats = {};
  for (const a of actions) {
    (cats[a.category] = cats[a.category] || []).push(a);
  }

  const sections = Object.entries(cats).map(([cat, acts]) => {
    const icon  = CATEGORY_ICONS[cat] || 'bx-cog';
    const cards = acts.map(a => buildActionCard(a, nodeId, tenant)).join('');
    return `
      <div class="col-12 mt-2 mb-0">
        <div class="noc-category-heading">
          <i class="bx ${esc(icon)}"></i>${esc(cat)}
        </div>
      </div>
      ${cards}`;
  }).join('');

  container.innerHTML = `
    <div class="noc-page-header">
      <a href="#tenants/${nodeId}" class="btn btn-sm btn-outline-secondary">
        <i class="bx bx-arrow-back me-1"></i>${esc(node)}
      </a>
      <span class="noc-breadcrumb-sep">›</span>
      <span class="noc-tenant-badge">${esc(tenant)}</span>
      <span style="color:var(--nt-muted);font-size:0.82rem">on ${esc(node)}</span>
    </div>
    <div class="row g-3">${sections}</div>`;
}

function buildActionCard(action, nodeId, tenant) {
  const cid    = `ac-${action.name}`;
  const nid    = parseInt(nodeId, 10);
  const tEnc   = encodeURIComponent(tenant);
  const isDest = action.destructive;

  const paramHtml = (action.params || []).map(p => `
    <div class="mb-2">
      <label class="form-label small mb-1" style="font-size:.72rem;color:var(--nt-muted)">${esc(p.label)}</label>
      <input type="text" class="form-control form-control-sm"
             id="${cid}-p-${p.name}"
             placeholder="${esc(p.placeholder || '')}"
             autocomplete="off">
    </div>`).join('');

  const clickFn = isDest
    ? `confirmAction('${action.name}',${nid},'${tEnc}')`
    : `runAction('${action.name}',${nid},'${tEnc}')`;

  const btnCls  = isDest ? 'noc-run-btn--danger' : 'noc-run-btn--primary';
  const btnIcon = isDest ? 'bx-error-alt' : 'bx-play';

  return `
    <div class="col-12 col-md-6 col-xl-4">
      <div class="noc-action-card">
        <div class="noc-action-card__header">
          <div style="flex:1;min-width:0">
            <div class="noc-action-card__title">${esc(action.label)}</div>
            <div class="noc-action-card__desc">${esc(action.description)}</div>
          </div>
          <button class="noc-run-btn ${btnCls}" onclick="${clickFn}">
            <i class="bx ${btnIcon}"></i>Run
          </button>
        </div>
        <div class="noc-action-card__body" id="${cid}-body">
          ${paramHtml}
        </div>
        <div class="noc-action-card__out d-none" id="${cid}-out"></div>
      </div>
    </div>`;
}

async function runAction(actionName, nodeId, tenantEncoded) {
  const tenant = decodeURIComponent(tenantEncoded);
  const cid    = `ac-${actionName}`;
  const outEl  = document.getElementById(`${cid}-out`);
  if (!outEl) return;

  // Collect + validate params
  const params = {};
  let valid = true;
  document.querySelectorAll(`[id^="${cid}-p-"]`).forEach(inp => {
    const pName = inp.id.slice(`${cid}-p-`.length);
    inp.classList.remove('is-invalid');
    if (!inp.value.trim()) { inp.classList.add('is-invalid'); valid = false; }
    else params[pName] = inp.value.trim();
  });
  if (!valid) return;

  outEl.classList.remove('d-none');
  outEl.innerHTML = `<div class="text-muted small">${spinner()}Running…</div>`;

  try {
    const res = await fetch(
      `${ADMIN_API}/nodes/${nodeId}/tenants/${encodeURIComponent(tenant)}/actions/${actionName}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ params }) }
    );
    const data = await res.json();
    renderActionResult(outEl, data);
  } catch (err) {
    outEl.innerHTML = `<div style="padding:.5rem .75rem;background:var(--nt-red-g);border:1px solid rgba(248,113,113,.25);border-radius:8px;color:var(--nt-red);font-size:.76rem"><i class="bx bx-error me-1"></i>Error: ${esc(err.message)}</div>`;
  }
}

function renderActionResult(el, data) {
  if (!data.success && data.error && !data.stdout) {
    el.innerHTML = `<div class="alert alert-warning py-2 small mb-0"><i class="bx bx-error me-1"></i>${esc(data.error)}</div>`;
    return;
  }

  // Route to structured renderer when available
  const renderer = STRUCTURED_RENDERERS[data.action];
  if (renderer && (data.stdout || '').trim()) {
    renderer(el, data);
    return;
  }

  // Fallback: styled output panel
  const stdout    = (data.stdout || '').trim();
  const exitBadge = data.exitCode === 0
    ? '<span class="badge bg-success">ok</span>'
    : `<span class="badge bg-warning text-dark">exit ${data.exitCode}</span>`;

  const copyBtn = stdout
    ? `<button class="btn py-0 px-1 btn-outline-secondary btn-sm ms-auto"
               title="Copy output"
               onclick="copyText(this,${JSON.stringify(stdout)})">
         <i class="bx bx-copy"></i>
       </button>`
    : '';

  el.innerHTML = `
    <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
      ${exitBadge}
      <small class="text-muted">${data.durationMs}ms</small>
      ${copyBtn}
    </div>
    ${stdout
      ? `<pre class="noc-raw-output">${esc(stdout)}</pre>`
      : '<p class="text-muted small mb-0"><i class="bx bx-check me-1"></i>Command completed — no output.</p>'
    }`;

  if (data.stderr && data.exitCode !== 0 && data.exitCode !== 1) {
    el.innerHTML += `<div class="text-danger small mt-1"><i class="bx bx-error me-1"></i>${esc(data.stderr.slice(0, 200))}</div>`;
  }
}

function copyText(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML = '<i class="bx bx-check"></i>';
    setTimeout(() => { btn.innerHTML = '<i class="bx bx-copy"></i>'; }, 2000);
  }).catch(() => {});
}

function confirmAction(actionName, nodeId, tenantEncoded) {
  const cid   = `ac-${actionName}`;
  const outEl = document.getElementById(`${cid}-out`);
  if (!outEl) return;
  outEl.classList.remove('d-none');
  outEl.innerHTML = `
    <div style="padding:.75rem 1rem;background:var(--nt-red-g);border:1px solid rgba(248,113,113,.25);border-radius:8px">
      <div style="font-weight:600;font-size:.8rem;color:var(--nt-red);margin-bottom:.6rem"><i class="bx bx-error me-1"></i>Destructive action — confirm?</div>
      <div class="d-flex gap-2">
        <button class="noc-run-btn noc-run-btn--danger"
                onclick="runAction('${actionName}',${nodeId},'${tenantEncoded}')">
          <i class="bx bx-check"></i>Confirm
        </button>
        <button class="noc-run-btn" style="background:rgba(88,120,170,.10);border:1px solid var(--nt-border-md)!important;color:var(--nt-muted)"
                onclick="document.getElementById('${cid}-out').classList.add('d-none')">
          Cancel
        </button>
      </div>
    </div>`;
}

// ── NOC Structured Output Parsers & Renderers ─────────────────────────────────

const STATE_CSS = {
  NOT_INUSE:   'available',
  INUSE:       'inuse',
  BUSY:        'busy',
  RINGING:     'ringing',
  UNAVAILABLE: 'unavailable',
};

let _blfUid = 0;

function buildRawToggle(stdout, exitCode, durationMs) {
  if (!stdout || !stdout.trim()) return '';
  const s = stdout.trim();
  const exitBadge = exitCode === 0
    ? '<span class="badge bg-success">ok</span>'
    : `<span class="badge bg-warning text-dark">exit ${exitCode}</span>`;
  const copyBtn = `<button class="btn py-0 px-1 btn-outline-secondary btn-sm ms-auto"
      title="Copy output" onclick="copyText(this,${JSON.stringify(s)})">
    <i class="bx bx-copy"></i></button>`;
  return `<div class="raw-output-toggle mt-2">
    <button class="btn btn-outline-secondary raw-toggle-btn"
            onclick="this.nextElementSibling.classList.toggle('d-none')">
      <i class="bx bx-code-alt me-1"></i>Show Raw Output
    </button>
    <div class="d-none mt-1">
      <div class="d-flex align-items-center gap-2 mb-1">${exitBadge}<small class="text-muted">${durationMs}ms</small>${copyBtn}</div>
      <pre class="raw-pre">${esc(s)}</pre>
    </div>
  </div>`;
}

// ── SIP Peers ──────────────────────────────────────────────────────────────────

function parsePeers(stdout) {
  const peers = [];
  for (const line of stdout.split('\n')) {
    const t = line.trim();
    if (!t || /^Name\/username/i.test(t) || /^\d+ sip peer/i.test(t) || t.startsWith('---')) continue;
    const cols = t.split(/\s{2,}/);
    if (cols.length < 2) continue;
    const name    = cols[0].split('/')[0];
    const rawHost = cols[1] || '';
    let host = '—', port = '—';
    if (rawHost !== '(Unspecified)' && rawHost.includes(':')) {
      [host, port] = rawHost.split(':');
    } else if (rawHost && rawHost !== '(Unspecified)') {
      host = rawHost;
    }
    const rest   = cols.slice(2).join(' ');
    const sm     = /\b(OK|UNREACHABLE|UNKNOWN)\b/i.exec(rest);
    const status = sm ? sm[1].toUpperCase() : (rawHost === '(Unspecified)' ? 'UNREACHABLE' : 'UNKNOWN');
    const lm     = /\((\d+)ms\)/.exec(rest);
    const latencyMs = lm ? parseInt(lm[1], 10) : null;
    peers.push({ name, host, port, status, latencyMs });
  }
  const online      = peers.filter(p => p.status === 'OK').length;
  const unreachable = peers.filter(p => p.status === 'UNREACHABLE').length;
  const lats        = peers.filter(p => p.latencyMs != null).map(p => p.latencyMs);
  const avgMs       = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null;
  return { peers, summary: { total: peers.length, online, unreachable, avgMs } };
}

function renderPeers(el, data) {
  const { peers, summary } = parsePeers(data.stdout);
  const sc = (val, cls, lbl) =>
    `<div class="summary-item ${cls}"><span class="sc-value">${val ?? '—'}</span><span class="sc-label">${lbl}</span></div>`;
  const summaryHtml = `<div class="summary-counters">
    ${sc(summary.total, '', 'Total')}
    ${sc(summary.online, 'ok', 'Online')}
    ${sc(summary.unreachable, 'unreachable', 'Down')}
    ${sc(summary.avgMs != null ? summary.avgMs + 'ms' : '—', 'warn', 'Avg Latency')}
  </div>`;

  let tableHtml;
  if (peers.length === 0) {
    tableHtml = `<div class="empty-state"><i class="bx bx-phone-off"></i><div class="empty-state-text">No SIP peers found for this tenant</div></div>`;
  } else {
    const rows = peers.map(p => {
      const cls    = p.status === 'OK' ? 'ok' : p.status === 'UNREACHABLE' ? 'unreachable' : 'unknown';
      const latHtml = p.latencyMs != null
        ? `<span class="latency-badge${p.latencyMs > 100 ? ' latency-badge--warn' : ''}">${p.latencyMs}ms</span>`
        : '<span class="text-muted small">—</span>';
      return `<tr class="peer-row peer-row--${cls}">
        <td class="peer-name">${esc(p.name)}</td>
        <td class="peer-host">${esc(p.host)}${p.port !== '—' ? `<span class="text-muted">:${esc(p.port)}</span>` : ''}</td>
        <td><span class="status-chip status-chip--${cls}">${esc(p.status)}</span></td>
        <td>${latHtml}</td>
      </tr>`;
    }).join('');
    tableHtml = `<table class="peer-table">
      <thead><tr><th>Peer</th><th>Host</th><th>Status</th><th>Latency</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
  el.innerHTML = `<div class="noc-output">${summaryHtml}${tableHtml}${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
}

// ── BLF State ──────────────────────────────────────────────────────────────────

function parseBlf(stdout) {
  const subscriptions = [];
  const counts = {};
  for (const line of stdout.split('\n')) {
    const m = /^\|\s*EXT:(\S+)\s*\|\s*BLF state\s+(\S+)\s*\|\s*Subscribe\s+(\d+)/i.exec(line.trim());
    if (!m) continue;
    const peer = m[1], state = m[2].toUpperCase(), subCount = parseInt(m[3], 10);
    const extM = /^(\d+)/.exec(peer);
    const ext  = extM ? extM[1] : peer;
    subscriptions.push({ peer, ext, state, subCount });
    counts[state] = (counts[state] || 0) + 1;
  }
  return { subscriptions, counts };
}

function renderBlf(el, data) {
  const { subscriptions, counts } = parseBlf(data.stdout);
  if (subscriptions.length === 0) {
    el.innerHTML = `<div class="noc-output"><div class="empty-state"><i class="bx bx-radio-circle-marked"></i><div class="empty-state-text">No BLF subscriptions found</div></div>${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
    return;
  }
  const uid  = ++_blfUid;
  const FLTS = [
    ['all',         'All',         subscriptions.length],
    ['NOT_INUSE',   'Available',   counts.NOT_INUSE   || 0],
    ['INUSE',       'In Use',      counts.INUSE       || 0],
    ['BUSY',        'Busy',        counts.BUSY        || 0],
    ['RINGING',     'Ringing',     counts.RINGING     || 0],
    ['UNAVAILABLE', 'Unavailable', counts.UNAVAILABLE || 0],
  ];
  const filterBtns = FLTS.map(([f, lbl, n]) =>
    `<button class="filter-btn${f === 'all' ? ' active' : ''}" data-filter="${f}">${esc(lbl)}<span class="filter-count">${n}</span></button>`
  ).join('');
  const items = subscriptions.map(s => {
    const css = STATE_CSS[s.state] || 'unknown';
    return `<div class="blf-item" data-state="${esc(s.state)}">
      <span class="state-badge state-badge--${css}"><span class="state-dot"></span></span>
      <div style="min-width:0;flex:1">
        <div class="blf-ext">${esc(s.ext)}</div>
        <div class="blf-peer">${esc(s.peer)}</div>
      </div>
      <span class="blf-subs">${s.subCount} sub</span>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="noc-output">
    <div class="blf-filter-bar" id="blf-fb-${uid}">${filterBtns}</div>
    <div class="blf-grid" id="blf-grid-${uid}">${items}</div>
    ${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}
  </div>`;
  const fb   = el.querySelector(`#blf-fb-${uid}`);
  const grid = el.querySelector(`#blf-grid-${uid}`);
  fb.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    fb.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.filter;
    grid.querySelectorAll('.blf-item').forEach(item => {
      item.style.display = (f === 'all' || item.dataset.state === f) ? '' : 'none';
    });
  });
}

// ── Device State ───────────────────────────────────────────────────────────────

function parseDevstate(stdout) {
  const devices = [];
  for (const line of stdout.split('\n')) {
    const m = /^\|\s*(\S+)\s*\|\s*Extension Is\s+(\S+)/i.exec(line.trim());
    if (!m) continue;
    devices.push({ id: m[1], state: m[2].toUpperCase() });
  }
  return { devices };
}

function renderDevstate(el, data) {
  const { devices } = parseDevstate(data.stdout);
  let inner;
  if (devices.length === 0) {
    inner = `<div class="empty-state"><i class="bx bx-devices"></i><div class="empty-state-text">No device state data</div></div>`;
  } else {
    inner = `<div class="devstate-list">${devices.map(d => {
      const css = STATE_CSS[d.state] || 'unknown';
      return `<div class="devstate-item">
        <span class="state-badge state-badge--${css}"><span class="state-dot"></span></span>
        <div class="devstate-id">${esc(d.id)}</div>
        <span class="state-label">${esc(d.state)}</span>
      </div>`;
    }).join('')}</div>`;
  }
  el.innerHTML = `<div class="noc-output">${inner}${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
}

// ── Active Channels ────────────────────────────────────────────────────────────

function parseChannels(stdout) {
  const sections = stdout.split(/\n?---\n?/);
  let count = 0, activeCalls = 0;
  const channels = [];
  if (sections[0]) {
    const m = /(\d+)/.exec(sections[0]);
    count = m ? parseInt(m[1], 10) : 0;
  }
  if (sections[1]) {
    for (const line of sections[1].split('\n')) {
      const t = line.trim();
      if (!t) continue;
      const parts = t.split('!');
      if (parts.length < 5) continue;
      channels.push({ name: parts[0], context: parts[1], exten: parts[2], state: parts[4], app: parts[5], appData: parts[6], callerId: parts[7], duration: parts[9] });
    }
  }
  if (sections[2]) {
    const m = /(\d+)\s+active call/i.exec(sections[2]);
    if (m) activeCalls = parseInt(m[1], 10);
  }
  return { count, channels, activeCalls };
}

function renderChannels(el, data) {
  const { count, channels, activeCalls } = parseChannels(data.stdout);
  let inner;
  if (count === 0 && channels.length === 0) {
    inner = `<div class="empty-state">
      <i class="bx bx-phone-off"></i>
      <div class="empty-state-text">No Active Calls</div>
      <div class="empty-state-sub">This tenant currently has no live channels</div>
    </div>`;
  } else {
    inner = `<div class="channels-banner">
      <span class="live-indicator"></span>
      <span class="channels-count">${count}</span>
      <span class="channels-label">active channel${count !== 1 ? 's' : ''} · ${activeCalls} active call${activeCalls !== 1 ? 's' : ''}</span>
    </div>`;
    if (channels.length > 0) {
      inner += `<div class="channel-list">${channels.map(c => `<div class="channel-item">
        <div class="channel-name">${esc(c.name)}</div>
        <div class="channel-meta">
          ${c.app ? `<span class="badge bg-label-secondary" style="font-size:.62rem">${esc(c.app)}</span>` : ''}
          ${c.callerId ? `<span class="text-muted small">${esc(c.callerId)}</span>` : ''}
          ${c.context ? `<span class="text-muted small">${esc(c.context)}</span>` : ''}
          ${c.duration ? `<span class="text-muted small"><i class="bx bx-time-five me-1"></i>${esc(c.duration)}</span>` : ''}
        </div>
      </div>`).join('')}</div>`;
    }
  }
  el.innerHTML = `<div class="noc-output">${inner}${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
}

// ── Unreachable Events ─────────────────────────────────────────────────────────

function parseUnreachableLines(lines) {
  const events = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // Format after sed: "| 2024-01-15 14:32:15 | 43-optinice' UNREACHABLE!"
    // or with 3 parts: "| ts | peer | event"
    const parts = t.split(/\s*\|\s*/).filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.length === 1) {
      events.push({ ts: '—', peer: parts[0], event: '—' });
      continue;
    }
    const ts   = parts[0].trim();
    const rest = parts.slice(1).join(' | ').trim();
    // rest may be "43-optinice' UNREACHABLE!" — split peer from event
    let peer = rest, event = '—';
    const apoIdx = rest.lastIndexOf("' ");
    if (apoIdx >= 0) {
      peer  = rest.slice(0, apoIdx).replace(/^'/, '');
      event = rest.slice(apoIdx + 2).replace(/!$/, '').trim();
    } else {
      const words = rest.split(/\s+/);
      if (words.length > 1) {
        event = words.pop().replace(/!$/, '');
        peer  = words.join(' ').replace(/^'|'$/g, '');
      }
    }
    events.push({ ts, peer, event });
  }
  return events;
}

function unreachableTable(events) {
  if (events.length === 0) return `<div class="text-muted small ps-2 mb-1">No events</div>`;
  const rows = events.map(e => {
    const bad = /unreachable|unregistered/i.test(e.event);
    return `<tr>
      <td class="ts">${esc(e.ts)}</td>
      <td>${esc(e.peer)}</td>
      <td><span class="status-chip status-chip--${bad ? 'unreachable' : 'ok'}">${esc(e.event)}</span></td>
    </tr>`;
  }).join('');
  return `<table class="noc-table"><thead><tr><th>Timestamp</th><th>Peer</th><th>Event</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderUnreachable(el, data) {
  const events = parseUnreachableLines(data.stdout.split('\n'));
  const inner = events.length === 0
    ? `<div class="empty-state"><i class="bx bx-check-circle" style="color:var(--noc-ok)"></i><div class="empty-state-text">No unreachable events found</div></div>`
    : unreachableTable(events);
  el.innerHTML = `<div class="noc-output">${inner}${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
}

function renderUnreachableHistory(el, data) {
  const fileBlocks = [];
  let current = null;
  for (const line of data.stdout.split('\n')) {
    const m = /^===\s*(.+?)\s*===$/.exec(line.trim());
    if (m) { current = { file: m[1], lines: [] }; fileBlocks.push(current); }
    else if (current) current.lines.push(line);
  }
  if (fileBlocks.length === 0) { renderUnreachable(el, data); return; }
  let html = '<div class="noc-output">';
  for (const blk of fileBlocks) {
    const shortFile = blk.file.replace('/var/log/asterisk/', '');
    html += `<div class="noc-section-header"><i class="bx bx-file me-1"></i>${esc(shortFile)}</div>`;
    html += unreachableTable(parseUnreachableLines(blk.lines));
  }
  html += buildRawToggle(data.stdout, data.exitCode, data.durationMs) + '</div>';
  el.innerHTML = html;
}

function renderUnreachableSummary(el, data) {
  const items = [];
  for (const line of data.stdout.split('\n')) {
    const m = /^\|\s*ext\s+(\S+)\s+was\s+(\S+)\s+(\d+)\s+times/i.exec(line.trim());
    if (m) items.push({ peer: m[1], event: m[2], count: parseInt(m[3], 10) });
  }
  let inner;
  if (items.length === 0) {
    inner = `<div class="empty-state"><i class="bx bx-check-circle" style="color:var(--noc-ok)"></i><div class="empty-state-text">No unreachable events in log</div></div>`;
  } else {
    const rows = items.map(it => `<tr>
      <td class="peer-name">${esc(it.peer)}</td>
      <td><span class="status-chip status-chip--${/unreachable/i.test(it.event) ? 'unreachable' : 'warn'}">${esc(it.event)}</span></td>
      <td><span class="count-badge">${it.count}</span></td>
    </tr>`).join('');
    inner = `<table class="noc-table"><thead><tr><th>Peer</th><th>Event</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  el.innerHTML = `<div class="noc-output">${inner}${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
}

// ── Queue Status ───────────────────────────────────────────────────────────────

function renderQueue(el, data) {
  const lines = data.stdout.split('\n');
  // Parse header line, members, callers
  let headerHtml = '', membersHtml = '', callersHtml = '';
  let inMembers = false, inCallers = false;
  const members = [], callers = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const hm = /^(\S+)\s+has\s+(\d+)\s+calls?(?:.*?in\s+'?([^'\s,]+)'?)?(?:.*?W:(\d+))?(?:.*?C:(\d+))?(?:.*?A:(\d+))?/.exec(t);
    if (hm && !headerHtml) {
      const wm = /W:(\d+)/.exec(t), cm = /C:(\d+)/.exec(t), am = /A:(\d+)/.exec(t);
      headerHtml = `<div class="summary-counters">
        <div class="summary-item"><span class="sc-value">${hm[2]}</span><span class="sc-label">Active</span></div>
        ${wm ? `<div class="summary-item warn"><span class="sc-value">${wm[1]}</span><span class="sc-label">Waiting</span></div>` : ''}
        ${cm ? `<div class="summary-item ok"><span class="sc-value">${cm[1]}</span><span class="sc-label">Completed</span></div>` : ''}
        ${am ? `<div class="summary-item unreachable"><span class="sc-value">${am[1]}</span><span class="sc-label">Abandoned</span></div>` : ''}
        ${hm[3] ? `<div class="summary-item"><span class="sc-value" style="font-size:.75rem">${esc(hm[3])}</span><span class="sc-label">Strategy</span></div>` : ''}
      </div>`;
      continue;
    }
    if (/Members:/i.test(t)) { inMembers = true; inCallers = false; continue; }
    if (/Callers:/i.test(t)) { inCallers = true; inMembers = false; continue; }
    if (inMembers && /^\s/.test(line)) {
      const stm = /\(([^)]+in use[^)]*|Not in use|[^)]+)\)\s+has taken (\d+)/i.exec(t);
      const nameM = /^([^\s(]+)/.exec(t);
      if (nameM) members.push({ name: nameM[1], state: stm ? stm[1] : '—', calls: stm ? stm[2] : '—' });
    }
    if (inCallers && /^\s/.test(line)) {
      const cm2 = /^\d+\.\s+(\S+)\s+\(wait:\s*([^,)]+)/.exec(t);
      if (cm2) callers.push({ channel: cm2[1], wait: cm2[2] });
    }
  }

  if (members.length > 0) {
    const rows = members.map(m => {
      const isInUse = /in use/i.test(m.state);
      return `<div class="queue-member">
        <span class="state-badge state-badge--${isInUse ? 'inuse' : 'available'}"><span class="state-dot"></span></span>
        <span class="queue-member-name">${esc(m.name)}</span>
        <span class="state-label">${esc(m.state)}</span>
        <span class="count-badge count-badge--ok ms-auto">${esc(m.calls)}</span>
      </div>`;
    }).join('');
    membersHtml = `<div class="noc-section-header">Members</div><div class="queue-members">${rows}</div>`;
  }
  if (callers.length > 0) {
    const rows = callers.map((c, i) => `<div class="queue-caller">
      <span class="text-muted small">${i + 1}.</span>
      <span style="font-size:.72rem;flex:1">${esc(c.channel)}</span>
      <span class="text-muted small"><i class="bx bx-time-five me-1"></i>${esc(c.wait)}</span>
    </div>`).join('');
    callersHtml = `<div class="noc-section-header">Waiting Callers</div>${rows}`;
  }

  const inner = headerHtml || membersHtml || callersHtml
    ? headerHtml + membersHtml + callersHtml
    : `<div class="empty-state"><i class="bx bx-list-ul"></i><div class="empty-state-text">No queue data</div></div>`;
  el.innerHTML = `<div class="noc-output">${inner}${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
}

// ── All Queues ─────────────────────────────────────────────────────────────────

function renderAllQueues(el, data) {
  const queues = [];
  for (const line of data.stdout.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const m = /^(\S+)\s+has\s+(\d+)\s+calls?(?:.*?in\s+'?([^'\s,]+)'?)?/.exec(t);
    if (!m) continue;
    const wm = /W:(\d+)/.exec(t), cm = /C:(\d+)/.exec(t), am = /A:(\d+)/.exec(t);
    queues.push({ name: m[1], calls: parseInt(m[2], 10), strategy: m[3] || '—', waiting: wm ? +wm[1] : 0, completed: cm ? +cm[1] : 0, abandoned: am ? +am[1] : 0 });
  }
  let inner;
  if (queues.length === 0) {
    inner = `<div class="empty-state"><i class="bx bx-list-ul"></i><div class="empty-state-text">No queues found</div></div>`;
  } else {
    const rows = queues.map(q => `<tr>
      <td><div class="queue-name">${esc(q.name)}</div><div class="queue-strategy">${esc(q.strategy)}</div></td>
      <td class="text-center">${q.calls > 0 ? `<span class="count-badge">${q.calls}</span>` : '<span class="text-muted small">0</span>'}</td>
      <td class="text-center">${q.waiting > 0 ? `<span class="count-badge">${q.waiting}</span>` : '<span class="text-muted small">0</span>'}</td>
      <td class="text-center"><span class="count-badge count-badge--ok">${q.completed}</span></td>
      <td class="text-center">${q.abandoned > 0 ? `<span class="count-badge">${q.abandoned}</span>` : '<span class="text-muted small">0</span>'}</td>
    </tr>`).join('');
    inner = `<table class="noc-table"><thead><tr><th>Queue</th><th>Active</th><th>Waiting</th><th>Done</th><th>Abandoned</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  el.innerHTML = `<div class="noc-output">${inner}${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
}

// ── Channel Stats ──────────────────────────────────────────────────────────────

function renderChannelStats(el, data) {
  const rows = data.stdout.split('\n')
    .map(l => l.trim())
    .filter(l => l && !/^Peer\s/i.test(l))
    .map(l => {
      const c = l.split(/\s+/);
      return `<tr>
        <td class="peer-name">${esc(c[0] || '—')}</td>
        <td class="ts">${esc(c[2] || '—')}</td>
        <td class="text-center">${esc(c[3] || '—')}</td>
        <td class="text-center text-danger">${esc(c[4] || '0')}</td>
        <td class="text-center">${esc(c[7] || '—')}</td>
        <td class="text-center text-danger">${esc(c[8] || '0')}</td>
      </tr>`;
    }).join('');
  let inner = rows
    ? `<table class="noc-table"><thead><tr><th>Peer</th><th>Duration</th><th>Recv Pkts</th><th>Recv Lost</th><th>Send Pkts</th><th>Send Lost</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty-state"><i class="bx bx-stats"></i><div class="empty-state-text">No channel stats</div></div>`;
  el.innerHTML = `<div class="noc-output">${inner}${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
}

// ── Verbose Channels ───────────────────────────────────────────────────────────

function renderVerbose(el, data) {
  const lines = data.stdout.split('\n');
  const summary = lines.find(l => /active channel/i.test(l));
  const chLines = lines.filter(l => /^(SIP|PJSIP|Local|DAHDI|IAX)\//i.test(l.trim()));
  if (chLines.length === 0) {
    el.innerHTML = `<div class="noc-output"><div class="empty-state"><i class="bx bx-phone-off"></i><div class="empty-state-text">No active channels</div></div>${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
    return;
  }
  const sumMatch  = summary && /(\d+)\s+active channel/i.exec(summary);
  const callMatch = summary && /(\d+)\s+active call/i.exec(summary);
  const banner = sumMatch ? `<div class="channels-banner">
    <span class="live-indicator"></span>
    <span class="channels-count">${sumMatch[1]}</span>
    <span class="channels-label">channels · ${callMatch ? callMatch[1] : '?'} calls</span>
  </div>` : '';
  const rows = chLines.map(l => {
    const cols = l.trim().split(/\s{2,}/);
    return `<tr>
      <td class="ts" style="max-width:160px;overflow:hidden;text-overflow:ellipsis">${esc(cols[0] || '—')}</td>
      <td>${esc(cols[1] || '—')}</td>
      <td>${esc(cols[4] || cols[3] || '—')}</td>
      <td>${esc(cols[5] || cols[6] || '—')}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div class="noc-output">${banner}<table class="noc-table"><thead><tr><th>Channel</th><th>Location</th><th>State</th><th>Application</th></tr></thead><tbody>${rows}</tbody></table>${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
}

// ── Server Status ──────────────────────────────────────────────────────────────

function renderServerStatus(el, data) {
  const sections  = data.stdout.split(/\n---\n/);
  const LABELS    = ['Asterisk Version', 'System Uptime', 'Asterisk Uptime', 'Active Channels', 'Inter-node Peers'];
  let html = '<div class="noc-output">';
  sections.forEach((sec, i) => {
    const t = sec.trim();
    if (!t) return;
    html += `<div class="noc-section-header">${esc(LABELS[i] || `Section ${i + 1}`)}</div>`;
    if (i === 3) {
      const chM   = /(\d+)\s+active channel/i.exec(t);
      const callM = /(\d+)\s+active call/i.exec(t);
      if (chM) {
        html += `<div class="summary-counters">
          <div class="summary-item ok"><span class="sc-value">${chM[1]}</span><span class="sc-label">Channels</span></div>
          <div class="summary-item ok"><span class="sc-value">${callM ? callM[1] : '—'}</span><span class="sc-label">Calls</span></div>
        </div>`;
      } else { html += `<pre class="raw-pre mb-2">${esc(t)}</pre>`; }
    } else if (i === 4) {
      const rows = t.split('\n').filter(l => l.trim()).map(l =>
        `<tr>${l.trim().split(/\s+/).map(c => `<td class="ts">${esc(c)}</td>`).join('')}</tr>`
      ).join('');
      if (rows) html += `<table class="noc-table mb-1"><tbody>${rows}</tbody></table>`;
    } else {
      html += `<pre class="raw-pre mb-2">${esc(t)}</pre>`;
    }
  });
  html += buildRawToggle(data.stdout, data.exitCode, data.durationMs) + '</div>';
  el.innerHTML = html;
}

// ── Email Search ───────────────────────────────────────────────────────────────

function renderEmailSearch(el, data) {
  const lines = data.stdout.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    el.innerHTML = `<div class="noc-output"><div class="empty-state"><i class="bx bx-mail-send"></i><div class="empty-state-text">No email log entries found</div></div>${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
    return;
  }
  const rows = lines.map(l => {
    const parts  = l.split(/\s+/);
    const ts     = parts.slice(0, 3).join(' ');
    const toM    = /to=<([^>]+)>/.exec(l);
    const statM  = /status=(\S+)/.exec(l);
    const delayM = /delay=([^,\s]+)/.exec(l);
    const st     = statM ? statM[1].replace(/,$/, '') : '—';
    return `<tr>
      <td class="ts">${esc(ts)}</td>
      <td>${toM ? esc(toM[1]) : esc(parts.slice(4, 7).join(' '))}</td>
      <td><span class="status-chip status-chip--${st === 'sent' ? 'ok' : 'warn'}">${esc(st)}</span></td>
      <td class="ts">${esc(delayM ? delayM[1].replace(/,$/, '') : '—')}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div class="noc-output"><table class="noc-table">
    <thead><tr><th>Date/Time</th><th>To</th><th>Status</th><th>Delay</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
}

// ── Kamailio Search ────────────────────────────────────────────────────────────

function renderKamailioSearch(el, data) {
  const lines = data.stdout.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    el.innerHTML = `<div class="noc-output"><div class="empty-state"><i class="bx bx-wifi-off"></i><div class="empty-state-text">No Kamailio registrations found</div></div>${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
    return;
  }
  const rows = lines.map(l => {
    const parts = l.split(/\s*\|\s*/).filter(Boolean);
    if (parts.length >= 2) return `<tr><td class="ts">${esc(parts[0])}</td><td class="ts">${esc(parts[1])}</td></tr>`;
    return `<tr><td colspan="2" class="ts">${esc(l)}</td></tr>`;
  }).join('');
  el.innerHTML = `<div class="noc-output"><table class="noc-table">
    <thead><tr><th>SIP URI</th><th>Registered IP</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
}

// ── Recordings Search ──────────────────────────────────────────────────────────

function renderRecordingsSearch(el, data) {
  const lines = data.stdout.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    el.innerHTML = `<div class="noc-output"><div class="empty-state"><i class="bx bx-microphone-off"></i><div class="empty-state-text">No recordings found</div></div>${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}</div>`;
    return;
  }
  const items = lines.map(l =>
    `<div class="recording-item"><i class="bx bx-microphone"></i><span class="recording-name">${esc(l)}</span></div>`
  ).join('');
  el.innerHTML = `<div class="noc-output">
    <div class="d-flex align-items-center gap-2 mb-2">
      <span class="count-badge count-badge--ok">${lines.length}</span>
      <span class="text-muted small">recording${lines.length !== 1 ? 's' : ''} found</span>
    </div>
    <div class="recordings-list">${items}</div>
    ${buildRawToggle(data.stdout, data.exitCode, data.durationMs)}
  </div>`;
}

// ── Dispatch Table ─────────────────────────────────────────────────────────────

const STRUCTURED_RENDERERS = {
  peers:                renderPeers,
  blf:                  renderBlf,
  devstate:             renderDevstate,
  channels:             renderChannels,
  unreachable:          renderUnreachable,
  unreachable_history:  renderUnreachableHistory,
  unreachable_summary:  renderUnreachableSummary,
  queue:                renderQueue,
  all_queues:           renderAllQueues,
  channel_stats:        renderChannelStats,
  verbose:              renderVerbose,
  server_status:        renderServerStatus,
  email_search:         renderEmailSearch,
  email_search_history: renderEmailSearch,
  kamailio_search:      renderKamailioSearch,
  recordings_search:    renderRecordingsSearch,
};

// ── Init ──────────────────────────────────────────────────────────────────────

fetch(`${API}/version`)
  .then(r => r.json())
  .then(({ version }) => {
    const el = document.getElementById('app-version');
    if (el) el.textContent = `v${version}`;
  })
  .catch(() => {});

router();
