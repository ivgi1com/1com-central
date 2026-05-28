let chart = null;
let _refreshInterval = null;
const API       = (window.BASE_PATH || '') + '/api';
const ADMIN_API = (window.BASE_PATH || '') + '/api/admin';

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
  return `<div class="fw-bold mb-1">${pct}%</div>
    <div class="progress" style="height:6px">
      <div class="progress-bar ${color}" style="width:${Math.min(pct, 100)}%"></div>
    </div>`;
}

function metricCard(label, value, sub) {
  return `<div class="card h-100">
    <div class="card-body text-center">
      <div class="text-muted small mb-1">${label}</div>
      <div class="fs-4 fw-bold">${value}</div>
      ${sub ? `<div class="text-muted small mt-1">${sub}</div>` : ''}
    </div>
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
  const rows = nodes.map(n => `
    <tr style="cursor:pointer" onclick="location.hash='#tenants/${n.id}'">
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
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light">
        <tr>
          <th>Name</th><th>Host</th><th>Status</th>
          <th>Active Calls</th><th>SIP Peers</th>
          <th>Load Avg</th><th>Uptime</th><th>Version</th>
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
    chart: { type: 'bar', height: 300, toolbar: { show: false } },
    series, xaxis: { categories },
    colors: ['#696cff'],
    plotOptions: { bar: { borderRadius: 4 } },
    dataLabels: { enabled: false },
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
    container.innerHTML = '<p class="text-danger">Failed to load nodes.</p>';
    return;
  }
  if (nodes.length === 0) {
    container.innerHTML = '<p class="text-muted">No nodes configured.</p>';
    return;
  }
  const rows = nodes.map(n => `
    <tr style="cursor:pointer" onclick="location.hash='#tenants/${n.id}'">
      <td><strong>${esc(n.name)}</strong></td>
      <td>${esc(n.host)}</td>
      <td>${statusBadge(n.status, n.last_updated)}</td>
      <td>${n.active_calls ?? '-'}</td>
      <td>${(n.tenants || []).length > 0
        ? (n.tenants || []).slice(0, 6).map(t => `<span class="badge bg-label-primary me-1">${esc(t)}</span>`).join('') + ((n.tenants || []).length > 6 ? `<span class="text-muted small">+${n.tenants.length - 6} more</span>` : '')
        : `<span class="text-muted">${n.sip_peers ?? '-'} peers</span>`}</td>
      <td>${n.load_avg ?? '-'}</td>
      <td>${n.uptime ? esc(n.uptime) : '-'}</td>
    </tr>`).join('');
  container.innerHTML = `
    <div class="card">
      <div class="card-header d-flex align-items-center justify-content-between">
        <h5 class="card-title m-0">Nodes</h5>
        <small class="text-muted">Click a row to view tenants</small>
      </div>
      <div class="card-body p-0">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Name</th><th>Host</th><th>Status</th>
              <th>Active Calls</th><th>Tenants</th>
              <th>Load Avg</th><th>Uptime</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
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
    container.innerHTML = '<p class="text-danger">Failed to load node.</p>';
    return;
  }
  const memPct    = n.mem_total_mb && n.mem_used_mb ? Math.round((n.mem_used_mb / n.mem_total_mb) * 100) : null;
  const memLabel  = n.mem_total_mb != null ? `${n.mem_used_mb} / ${n.mem_total_mb} MB` : '-';
  const lastSeen  = n.last_updated ? new Date(n.last_updated).toLocaleTimeString() : '-';

  container.innerHTML = `
    <div class="d-flex align-items-center mb-4 gap-3 flex-wrap">
      <a href="#nodes" class="btn btn-sm btn-outline-secondary"><i class="bx bx-arrow-back me-1"></i>Nodes</a>
      <h4 class="mb-0">${esc(n.name)}</h4>
      ${statusBadge(n.status, n.last_updated)}
      <a href="#tenants/${id}" class="btn btn-sm btn-primary ms-auto">
        <i class="bx bx-building me-1"></i>Tenants
      </a>
      <small class="text-muted">Last updated: ${lastSeen}</small>
    </div>

    <h6 class="text-muted text-uppercase small mb-2">Asterisk</h6>
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-4 col-lg-3">${metricCard('Active Calls', n.active_calls ?? '-')}</div>
      <div class="col-6 col-md-4 col-lg-3">
        <div class="card h-100">
          <div class="card-body text-center">
            <div class="text-muted small mb-1">SIP Peers</div>
            <div class="fs-4 fw-bold mb-2">${n.sip_peers ?? '-'}</div>
            <div class="d-flex flex-wrap gap-1 justify-content-center">
              ${(n.tenants || []).map(t => `<span class="badge bg-label-primary" style="cursor:pointer" onclick="location.hash='#tenant/${id}/${encodeURIComponent(t)}'">${esc(t)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-4 col-lg-3">${metricCard('Version', n.asterisk_version ? esc(n.asterisk_version) : '-')}</div>
    </div>

    <h6 class="text-muted text-uppercase small mb-2">System</h6>
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-4 col-lg-3">
        <div class="card h-100"><div class="card-body text-center">
          <div class="text-muted small mb-1">CPU</div>${progressBar(n.cpu_pct)}
        </div></div>
      </div>
      <div class="col-6 col-md-4 col-lg-3">
        <div class="card h-100"><div class="card-body text-center">
          <div class="text-muted small mb-1">Memory</div>${progressBar(memPct)}
          <div class="text-muted small mt-1">${memLabel}</div>
        </div></div>
      </div>
      <div class="col-6 col-md-4 col-lg-3">
        <div class="card h-100"><div class="card-body text-center">
          <div class="text-muted small mb-1">Disk /</div>${progressBar(n.disk_use_pct)}
          ${n.disk_avail ? `<div class="text-muted small mt-1">${esc(n.disk_avail)} free</div>` : ''}
        </div></div>
      </div>
      <div class="col-6 col-md-4 col-lg-3">${metricCard('Load Avg', n.load_avg ?? '-')}</div>
    </div>
    <div class="row g-3">
      <div class="col-12 col-md-6">${metricCard('Uptime', n.uptime ? esc(n.uptime) : '-')}</div>
      <div class="col-12 col-md-6">${metricCard('Host', esc(n.host))}</div>
    </div>`;
}

// ── Tenants list view ─────────────────────────────────────────────────────────

async function loadTenants(nodeId) {
  const container = document.getElementById('tenants-container');
  if (!container) return;
  container.innerHTML = `<div class="text-muted p-3">${spinner()}Loading tenants...</div>`;

  let data;
  try {
    const res = await fetch(`${ADMIN_API}/nodes/${nodeId}/tenants`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || res.statusText);
    }
    data = await res.json();
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">Failed to load tenants: ${esc(String(err.message || err))}</div>`;
    return;
  }

  const { node, tenants } = data;
  const header = `
    <div class="d-flex align-items-center mb-4 gap-3 flex-wrap">
      <a href="#nodes" class="btn btn-sm btn-outline-secondary"><i class="bx bx-arrow-back me-1"></i>Nodes</a>
      <h4 class="mb-0">${esc(node)}</h4>
      <a href="#node-${nodeId}" class="btn btn-sm btn-outline-secondary ms-auto">
        <i class="bx bx-server me-1"></i>System Info
      </a>
    </div>`;

  if (!tenants || tenants.length === 0) {
    container.innerHTML = header + '<div class="alert alert-info">No tenants found on this node.</div>';
    return;
  }

  container.innerHTML = `
    ${header}
    <div class="row mb-4">
      <div class="col-md-4">
        <input type="text" class="form-control" placeholder="Search tenants…" id="tenant-search" autocomplete="off">
      </div>
      <div class="col d-flex align-items-center">
        <small class="text-muted ms-2" id="tenant-count"></small>
      </div>
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
        <div class="card h-100" style="cursor:pointer"
             onclick="location.hash='#tenant/${nodeId}/${encodeURIComponent(t.name)}'">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="avatar flex-shrink-0">
              <span class="avatar-initial rounded bg-label-primary">
                <i class="bx bx-building"></i>
              </span>
            </div>
            <div class="overflow-hidden">
              <h6 class="mb-0 text-truncate">${esc(t.name)}</h6>
              <small class="text-muted">Tenant</small>
            </div>
          </div>
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
  container.innerHTML = `<div class="text-muted p-3">${spinner()}Loading dashboard…</div>`;

  let data;
  try {
    const res = await fetch(`${ADMIN_API}/nodes/${nodeId}/tenants/${encodeURIComponent(tenant)}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || res.statusText);
    }
    data = await res.json();
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">Failed: ${esc(String(err.message || err))}</div>`;
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
      <div class="col-12 mt-2 mb-1">
        <h6 class="text-muted text-uppercase small d-flex align-items-center gap-2">
          <i class="bx ${esc(icon)}"></i>${esc(cat)}
        </h6>
      </div>
      ${cards}`;
  }).join('');

  container.innerHTML = `
    <div class="d-flex align-items-center mb-4 gap-2 flex-wrap">
      <a href="#tenants/${nodeId}" class="btn btn-sm btn-outline-secondary">
        <i class="bx bx-arrow-back me-1"></i>${esc(node)}
      </a>
      <i class="bx bx-chevron-right text-muted"></i>
      <h4 class="mb-0 d-flex align-items-center gap-2">
        <span class="badge bg-label-primary" style="font-size:.9rem;font-weight:500">${esc(tenant)}</span>
        <span class="text-muted fw-normal" style="font-size:.95rem">on ${esc(node)}</span>
      </h4>
    </div>
    <div class="row g-3">${sections}</div>`;
}

function buildActionCard(action, nodeId, tenant) {
  const cid    = `ac-${action.name}`;
  const btnCls = action.destructive ? 'btn-danger' : 'btn-primary';
  const btnIco = action.destructive ? 'bx-error-alt' : 'bx-play';
  const nid    = parseInt(nodeId, 10);
  const tEnc   = encodeURIComponent(tenant);

  const paramHtml = (action.params || []).map(p => `
    <div class="mb-2">
      <label class="form-label small mb-1">${esc(p.label)}</label>
      <input type="text" class="form-control form-control-sm"
             id="${cid}-p-${p.name}"
             placeholder="${esc(p.placeholder || '')}"
             autocomplete="off">
    </div>`).join('');

  const clickFn = action.destructive
    ? `confirmAction('${action.name}',${nid},'${tEnc}')`
    : `runAction('${action.name}',${nid},'${tEnc}')`;

  return `
    <div class="col-12 col-md-6 col-xl-4">
      <div class="card h-100">
        <div class="card-header d-flex align-items-start justify-content-between py-2 gap-2">
          <div class="flex-grow-1 overflow-hidden">
            <h6 class="mb-0">${esc(action.label)}</h6>
            <small class="text-muted">${esc(action.description)}</small>
          </div>
          <button class="btn btn-sm ${btnCls} flex-shrink-0" onclick="${clickFn}">
            <i class="bx ${btnIco} me-1"></i>Run
          </button>
        </div>
        <div class="card-body py-2" id="${cid}-body">
          ${paramHtml}
          <div id="${cid}-out" class="d-none mt-2"></div>
        </div>
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
    outEl.innerHTML = `<div class="alert alert-danger py-2 small mb-0">Error: ${esc(err.message)}</div>`;
  }
}

function renderActionResult(el, data) {
  if (!data.success && data.error && !data.stdout) {
    el.innerHTML = `<div class="alert alert-warning py-2 small mb-0"><i class="bx bx-error me-1"></i>${esc(data.error)}</div>`;
    return;
  }
  const stdout   = (data.stdout || '').trim();
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
      ? `<pre class="bg-dark text-light p-2 rounded mb-0"
              style="max-height:300px;overflow-y:auto;white-space:pre-wrap;font-size:.72rem">${esc(stdout)}</pre>`
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
    <div class="alert alert-danger py-2 mb-0">
      <div class="fw-bold mb-2"><i class="bx bx-error me-1"></i>Destructive action — confirm?</div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-danger"
                onclick="runAction('${actionName}',${nodeId},'${tenantEncoded}')">
          Confirm
        </button>
        <button class="btn btn-sm btn-outline-secondary"
                onclick="document.getElementById('${cid}-out').classList.add('d-none')">
          Cancel
        </button>
      </div>
    </div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

fetch(`${API}/version`)
  .then(r => r.json())
  .then(({ version }) => {
    const el = document.getElementById('app-version');
    if (el) el.textContent = `v${version}`;
  })
  .catch(() => {});

router();
