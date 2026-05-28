let chart = null;

async function refresh() {
  let nodes;
  try {
    const res = await fetch('/api/nodes');
    if (!res.ok) return;
    nodes = await res.json();
  } catch (_) {
    return;
  }
  renderTable(nodes);
  renderChart(nodes);
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

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTable(nodes) {
  const container = document.getElementById('nodes-table-container');
  if (!container) return;

  if (nodes.length === 0) {
    container.innerHTML = '<p class="text-muted p-3">No nodes configured. POST to /api/nodes to add one.</p>';
    return;
  }

  const rows = nodes
    .map(
      (n) => `
    <tr>
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

refresh();
setInterval(refresh, 30_000);
