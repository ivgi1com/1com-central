let chart = null;
let _refreshInterval = null;
const API = (window.BASE_PATH || '') + '/api';

// ── Utilities ────────────────────────────────────────────────────────────────

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

function statusBadge(status, lastUpdated) {
  const stale = isStale(lastUpdated) ? ' <span class="badge bg-secondary ms-1">stale</span>' : '';
  if (status === 'ok') return `<span class="badge bg-success">ok</span>${stale}`;
  if (status === 'asterisk_down') return `<span class="badge bg-warning text-dark">asterisk down</span>${stale}`;
  return `<span class="badge bg-danger">unreachable</span>${stale}`;
}

function progressBarColor(pct) {
  if (pct == null) return 'bg-secondary';
  if (pct >= 90) return 'bg-danger';
  if (pct >= 70) return 'bg-warning';
  return 'bg-success';
}

function progressBar(pct) {
  if (pct == null) return '<span class="text-muted">-</span>';
  const color = progressBarColor(pct);
  return `
    <div class="fw-bold mb-1">${pct}%</div>
    <div class="progress" style="height:6px">
      <div class="progress-bar ${color}" style="width:${Math.min(pct,100)}%"></div>
    </div>`;
}

function metricCard(label, value, sub) {
  return `
    <div class="card h-100">
      <div class="card-body text-center">
        <div class="text-muted small mb-1">${label}</div>
        <div class="fs-4 fw-bold">${value}</div>
        ${sub ? `<div class="text-muted small mt-1">${sub}</div>` : ''}
      </div>
    </div>`;
}

// ── Router ───────────────────────────────────────────────────────────────────

const VIEWS = ['view-dashboard', 'view-nodes', 'view-node-detail'];

function showView(id) {
  VIEWS.forEach(v => {
    document.getElementById(v).style.display = v === id ? '' : 'none';
  });
  const onDash = id === 'view-dashboard';
  const onNodes = id === 'view-nodes' || id === 'view-node-detail';
  document.getElementById('menu-dashboard').classList.toggle('active', onDash);
  document.getElementById('menu-nodes').classList.toggle('active', onNodes);
  clearInterval(_refreshInterval);
  _refreshInterval = null;
}

function router() {
  const hash = location.hash || '#dashboard';
  if (hash.startsWith('#node-')) {
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

// ── Dashboard view ───────────────────────────────────────────────────────────

async function refreshDashboard() {
  let nodes;
  try {
    const res = await fetch(`${API}/nodes`);
    if (!res.ok) return;
    nodes = await res.json();
  } catch (_) {
    return;
  }
  renderTable(nodes);
  renderChart(nodes);
}

function renderTable(nodes) {
  const container = document.getElementById('nodes-table-container');
  if (!container) return;

  if (nodes.length === 0) {
    container.innerHTML = '<p class="text-muted p-3">No nodes configured.</p>';
    return;
  }

  const rows = nodes
    .map(
      (n) => `
    <tr style="cursor:pointer" onclick="location.hash='#node-${n.id}'">
      <td>${esc(n.name)}</td>
      <td>${esc(n.host)}</td>
      <td>${statusBadge(n.status, n.last_updated)}</td>
      <td>${n.active_calls ?? '-'}</td>
      <td>${n.sip_peers ?? '-'}</td>
      <td>${n.load_avg ?? '-'}</td>
      <td>${n.uptime ? esc(n.uptime) : '-'}</td>
      <td>${n.asterisk_version ? esc(n.asterisk_version) : '-'}</td>
    </tr>`
    )
    .join('');

  container.innerHTML = `
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light">
        <tr>
          <th>Name</th>
          <th>Host</th>
          <th>Status</th>
          <th>Active Calls</th>
          <th>SIP Peers</th>
          <th>Load Avg</th>
          <th>Uptime</th>
          <th>Version</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderChart(nodes) {
  const el = document.getElementById('calls-chart');
  if (!el) return;

  const series = [{ name: 'Active Calls', data: nodes.map((n) => n.active_calls ?? 0) }];
  const categories = nodes.map((n) => n.name);

  if (chart) {
    chart.updateOptions({ xaxis: { categories } });
    chart.updateSeries(series);
    return;
  }

  chart = new ApexCharts(el, {
    chart: { type: 'bar', height: 300, toolbar: { show: false } },
    series,
    xaxis: { categories },
    colors: ['#696cff'],
    plotOptions: { bar: { borderRadius: 4 } },
    dataLabels: { enabled: false },
  });
  chart.render();
}

// ── Nodes list view ──────────────────────────────────────────────────────────

async function loadNodesList() {
  const container = document.getElementById('nodes-view-container');
  if (!container) return;

  let nodes;
  try {
    const res = await fetch(`${API}/nodes`);
    if (!res.ok) throw new Error();
    nodes = await res.json();
  } catch (_) {
    container.innerHTML = '<p class="text-danger">Failed to load nodes.</p>';
    return;
  }

  if (nodes.length === 0) {
    container.innerHTML = '<p class="text-muted">No nodes configured.</p>';
    return;
  }

  const rows = nodes.map((n) => `
    <tr style="cursor:pointer" onclick="location.hash='#node-${n.id}'">
      <td><strong>${esc(n.name)}</strong></td>
      <td>${esc(n.host)}</td>
      <td>${statusBadge(n.status, n.last_updated)}</td>
      <td>${n.active_calls ?? '-'}</td>
      <td>${n.sip_peers ?? '-'}</td>
      <td>${n.load_avg ?? '-'}</td>
      <td>${n.uptime ? esc(n.uptime) : '-'}</td>
      <td>${n.asterisk_version ? esc(n.asterisk_version) : '-'}</td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="card">
      <div class="card-header d-flex align-items-center justify-content-between">
        <h5 class="card-title m-0">Nodes</h5>
        <small class="text-muted">Click a row to open node detail</small>
      </div>
      <div class="card-body p-0">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Name</th><th>Host</th><th>Status</th>
              <th>Active Calls</th><th>SIP Peers</th>
              <th>Load Avg</th><th>Uptime</th><th>Version</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Node detail view ─────────────────────────────────────────────────────────

async function loadNodeDetail(id) {
  const container = document.getElementById('node-detail-container');
  if (!container) return;

  let n;
  try {
    const res = await fetch(`${API}/nodes/${id}`);
    if (!res.ok) throw new Error();
    n = await res.json();
  } catch (_) {
    container.innerHTML = '<p class="text-danger">Failed to load node.</p>';
    return;
  }

  const memPct = n.mem_total_mb && n.mem_used_mb
    ? Math.round((n.mem_used_mb / n.mem_total_mb) * 100)
    : null;

  const memLabel = n.mem_total_mb != null
    ? `${n.mem_used_mb} / ${n.mem_total_mb} MB`
    : '-';

  const lastSeen = n.last_updated
    ? new Date(n.last_updated).toLocaleTimeString()
    : '-';

  container.innerHTML = `
    <div class="d-flex align-items-center mb-4 gap-3">
      <a href="#nodes" class="btn btn-sm btn-outline-secondary">
        <i class="bx bx-arrow-back me-1"></i> Nodes
      </a>
      <h4 class="mb-0">${esc(n.name)}</h4>
      ${statusBadge(n.status, n.last_updated)}
      <small class="text-muted ms-auto">Last updated: ${lastSeen}</small>
    </div>

    <h6 class="text-muted text-uppercase small mb-2">Asterisk</h6>
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-4 col-lg-3">
        ${metricCard('Active Calls', n.active_calls ?? '-')}
      </div>
      <div class="col-6 col-md-4 col-lg-3">
        ${metricCard('SIP Peers', n.sip_peers ?? '-')}
      </div>
      <div class="col-6 col-md-4 col-lg-3">
        ${metricCard('Version', n.asterisk_version ? esc(n.asterisk_version) : '-')}
      </div>
    </div>

    <h6 class="text-muted text-uppercase small mb-2">System</h6>
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-4 col-lg-3">
        <div class="card h-100">
          <div class="card-body text-center">
            <div class="text-muted small mb-1">CPU</div>
            ${progressBar(n.cpu_pct)}
          </div>
        </div>
      </div>
      <div class="col-6 col-md-4 col-lg-3">
        <div class="card h-100">
          <div class="card-body text-center">
            <div class="text-muted small mb-1">Memory</div>
            ${progressBar(memPct)}
            <div class="text-muted small mt-1">${memLabel}</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-4 col-lg-3">
        <div class="card h-100">
          <div class="card-body text-center">
            <div class="text-muted small mb-1">Disk /</div>
            ${progressBar(n.disk_use_pct)}
            ${n.disk_avail ? `<div class="text-muted small mt-1">${esc(n.disk_avail)} free</div>` : ''}
          </div>
        </div>
      </div>
      <div class="col-6 col-md-4 col-lg-3">
        ${metricCard('Load Avg', n.load_avg ?? '-')}
      </div>
    </div>

    <div class="row g-3">
      <div class="col-12 col-md-6">
        ${metricCard('Uptime', n.uptime ? esc(n.uptime) : '-')}
      </div>
      <div class="col-12 col-md-6">
        ${metricCard('Host', esc(n.host))}
      </div>
    </div>`;
}

// ── Init ─────────────────────────────────────────────────────────────────────

fetch(`${API}/version`)
  .then((r) => r.json())
  .then(({ version }) => {
    const el = document.getElementById('app-version');
    if (el) el.textContent = `v${version}`;
  })
  .catch(() => {});

router();
