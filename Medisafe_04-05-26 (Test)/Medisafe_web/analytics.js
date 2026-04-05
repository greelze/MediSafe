import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://elhshkzfiqmyisxavnsh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
window.supabase = supabase; // expose for onclick handlers
const TABLE_NAME = "sensors";

const THRESHOLDS = {
  temperature: 30, 
  humidity: 60,    
  light: 7      // UV index threshold
};

let analyticsData = [];
let filteredData = [];
let analyticsChart = null;
let currentFilter = "all";

function getRowTimestamp(row) {
  const candidates = [
    row.recorded_id,
    row.recorded_at,
    row.created_at,
    row.inserted_at,
    row.timestamp
  ];

  for (const value of candidates) {
    if (value === null || value === undefined || value === "") continue;
    const date = new Date(value);
    if (!isNaN(date)) return date;
  }
  return null;
}

function getSensorValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== null && row[key] !== undefined && row[key] !== '') {
      const n = Number(row[key]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function getTemperature(row) {
  return getSensorValue(row, ['temperature', 'temp']);
}

function getHumidity(row) {
  return getSensorValue(row, ['humidity', 'hum']);
}

function getUV(row) {
  return getSensorValue(row, ['uv_index', 'uv', 'light']);
}

// Returns the numeric value of a field, or null if missing/NaN
function safeValue(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

function getStatus(value, threshold) {
  if (value === null || value === undefined || value === "") return '-';
  return Number(value) > threshold ? 'Alert' : 'Normal';
}

function getStatusClass(status) {
  if (status === 'Alert') return 'alert';
  if (status === 'Normal') return 'normal';
  return 'normal';
}

function createStatusSpan(alert) {
  const status = alert ? 'Alert' : 'Normal';
  const className = alert ? 'alert' : 'normal';
  return `<span class="${className}">${status}</span>`;
}

function createTableRow(row) {
  const timestamp = getRowTimestamp(row);
  const date = timestamp ? timestamp.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

  const tempNum = getTemperature(row);
  const humNum = getHumidity(row);
  const uvNum = getUV(row);

  const tempAlert = tempNum !== null && tempNum > THRESHOLDS.temperature;
  const humAlert = humNum !== null && humNum > THRESHOLDS.humidity;
  const uvAlert = uvNum !== null && uvNum > THRESHOLDS.light;

  const tempValue = tempNum === null ? '-' : `${tempNum.toFixed(1)}°C`;
  const tempStatus = tempNum === null ? '-' : createStatusSpan(tempAlert);
  const humValue = humNum === null ? '-' : `${humNum.toFixed(1)}%`;
  const humStatus = humNum === null ? '-' : createStatusSpan(humAlert);
  const uvValue = uvNum === null ? '-' : `${uvNum.toFixed(2)} UVI`;
  const uvStatus = uvNum === null ? '-' : createStatusSpan(uvAlert);

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${date}</td>
    <td>${tempValue}</td>
    <td>${tempStatus}</td>
    <td>${humValue}</td>
    <td>${humStatus}</td>
    <td>${uvValue}</td>
    <td>${uvStatus}</td>
  `;

  return tr;
}

function initializeChart() {
  const canvas = document.getElementById("analyticsChart");
  if (!canvas) {
    console.error("Canvas element not found!");
    return;
  }
  
  analyticsChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
         { 
           label: "Temperature (°C)", 
           data: [], 
           borderColor: "#FF0531", 
           backgroundColor: "rgba(255, 5, 49, 0.1)", 
           tension: 0.4, 
           fill: true, 
           borderWidth: 3,
           pointBackgroundColor: "#FF0531",
           pointBorderColor: "#fff",
           pointBorderWidth: 2,
           pointRadius: 4,
           pointHoverRadius: 6
         },
         { 
           label: "Humidity (%)", 
           data: [], 
           borderColor: "#3b82f6", 
           backgroundColor: "rgba(59, 130, 246, 0.1)", 
           tension: 0.4, 
           fill: true, 
           borderWidth: 3,
           pointBackgroundColor: "#3b82f6",
           pointBorderColor: "#fff",
           pointBorderWidth: 2,
           pointRadius: 4,
           pointHoverRadius: 6
         },
         { 
           label: "UV Index", 
           data: [], 
           borderColor: "#f59e0b", 
           backgroundColor: "rgba(245, 158, 11, 0.1)", 
           tension: 0.4, 
           fill: true, 
           borderWidth: 3,
           pointBackgroundColor: "#f59e0b",
           pointBorderColor: "#fff",
           pointBorderWidth: 2,
           pointRadius: 4,
           pointHoverRadius: 6
         }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { 
          display: true, 
          position: "top",
          labels: {
            padding: 20,
            font: {
              size: 13,
              weight: 600
            },
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          titleFont: {
            size: 14,
            weight: 600
          },
          bodyFont: {
            size: 13
          },
          borderColor: '#e5e7eb',
          borderWidth: 1
        }
      },
      scales: { 
        x: { 
          grid: { 
            display: false 
          },
          ticks: {
            font: {
              size: 12
            }
          }
        }, 
        y: { 
          grid: { 
            color: "#f3f4f6" 
          },
          ticks: {
            font: {
              size: 12
            }
          },
          beginAtZero: true
        } 
      }
    }
  });
}

async function loadAnalyticsData() {
  try {
    // Always load ALL sensor data regardless of active location
    // Stats, charts, and reports show totals across ALL locations
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("*");

    if (error) throw error;

    analyticsData = (data || []).slice();
    console.log("Loaded analytics data:", analyticsData.length, analyticsData);

    if (analyticsData.length === 0) {
      console.warn("No analytics data found; using sample fallback data.");
      analyticsData = [
        { temperature: 26.2, humidity: 54.1, uv_index: 4.1, user: 'Admin', recorded_at: new Date().toISOString() },
        { temperature: 28.5, humidity: 58.0, uv_index: 5.8, user: 'Admin', recorded_at: new Date(Date.now() - 86400000).toISOString() },
        { temperature: 24.7, humidity: 50.4, uv_index: 3.3, user: 'Admin', recorded_at: new Date(Date.now() - 172800000).toISOString() }
      ];
    }

    analyticsData.sort((a, b) => {
      const aDate = getRowTimestamp(a);
      const bDate = getRowTimestamp(b);
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return bDate - aDate;
    });

    applyFilters();
  } catch (err) {
    console.error("Error loading analytics data:", err);
    filteredData = [];
    updateStats();
    updateCharts();
    updateTable();
  }
}

function applyFilters() {
  const now = new Date();
  const days = 30;
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  filteredData = analyticsData.filter(row => {
    const date = getRowTimestamp(row);
    if (!date) return false;
    return date >= startDate && date <= endDate;
  });

  if (!filteredData.length && analyticsData.length) {
    filteredData = analyticsData.slice(0, 10);
    console.warn("No records in last 30 days; falling back to latest rows.");
  }

  if (!filteredData.length && analyticsData.length) {
    filteredData = analyticsData.slice();
    console.warn("No valid timestamps found; using all loaded data.");
  }

  console.log(`Filtered data (last ${days} days):`, filteredData.length, filteredData);
  updateStats();
  updateCharts();
  updateTable();
}

function updateStats() {
  const totalAlerts = filteredData.filter(row =>
    (row.temperature > THRESHOLDS.temperature) ||
    (row.humidity > THRESHOLDS.humidity) ||
    (row.uv_index > THRESHOLDS.light)
  ).length;
  
  const tempAlerts = filteredData.filter(row => getTemperature(row) !== null && getTemperature(row) > THRESHOLDS.temperature).length;
  const humidityAlerts = filteredData.filter(row => getHumidity(row) !== null && getHumidity(row) > THRESHOLDS.humidity).length;
  const lightAlerts = filteredData.filter(row => getUV(row) !== null && getUV(row) > THRESHOLDS.light).length;

  const statValues = document.querySelectorAll(".stat-value");
  if (statValues.length >= 5) {
    statValues[0].textContent = totalAlerts;
    statValues[1].textContent = tempAlerts;
    statValues[2].textContent = humidityAlerts;
    statValues[3].textContent = lightAlerts;
    // statValues[4] (Total Users) is updated separately by loadUserCount()
  }
}

async function loadUserCount() {
  const userStatEl = document.querySelectorAll(".stat-value")[4];
  if (!userStatEl) return;

  userStatEl.textContent = "…";

  // Strategy 1: Try fetching rows directly from known table names.
  // Using select('id') (just one column) is lightweight.
  // head:true is avoided because RLS silently returns 0 instead of an error.
  const TABLES_TO_TRY = ['users', 'profiles'];

  for (const table of TABLES_TO_TRY) {
    const { data, error } = await supabase
      .from(table)
      .select('id');

    if (!error && data) {
      userStatEl.textContent = data.length;
      console.log(`Total users fetched from '${table}':`, data.length);
      return;
    }

    console.warn(`Could not query '${table}':`, error?.message);
  }

  // Strategy 2: Use Supabase REST API directly with count header
  // (works when JS client count is blocked but REST is accessible)
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'count=exact'
      }
    });
    const countHeader = res.headers.get('content-range'); // e.g. "0-11/12"
    if (countHeader) {
      const total = parseInt(countHeader.split('/')[1], 10);
      if (!isNaN(total)) {
        userStatEl.textContent = total;
        console.log('Total users via REST count header:', total);
        return;
      }
    }
    // If header not present, count from response body
    const rows = await res.json();
    if (Array.isArray(rows)) {
      userStatEl.textContent = rows.length;
      console.log('Total users via REST body length:', rows.length);
      return;
    }
  } catch (e) {
    console.warn('REST user count failed:', e);
  }

  // Strategy 3: Last resort — count unique users referenced in sensor data
  console.warn("All user count strategies failed. Falling back to sensor data.");
  const fallback = new Set(analyticsData.map(row => row.user).filter(Boolean)).size;
  userStatEl.textContent = fallback || 0;
}

function getSensorType(row) {
  if (row.temperature) return "Temperature";
  if (row.humidity) return "Humidity";
  if (row.uv_index) return "UV Index";
  return "Unknown";
}

function updateCharts() {
  if (filteredData.length === 0) {
    // Clear stale data so old readings don't remain visible
    analyticsChart.data.labels = [];
    analyticsChart.data.datasets.forEach(ds => { ds.data = []; });
    analyticsChart.update();
    return;
  }

  const chartData = filteredData.slice(0, 10);  // 👈 add this line
  console.log("Chart data:", chartData);

  const labels = chartData.map(row => {
  const timestamp = getRowTimestamp(row);
  return timestamp
    ? timestamp.toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '-';
});

  analyticsChart.data.labels = labels;
  if (currentFilter === "all") {
    analyticsChart.data.datasets[0].data = chartData.map(row => getTemperature(row) || 0);
    analyticsChart.data.datasets[1].data = chartData.map(row => getHumidity(row) || 0);
    analyticsChart.data.datasets[2].data = chartData.map(row => getUV(row) || 0);
  } else if (currentFilter === "temperature") {
    analyticsChart.data.datasets[0].data = chartData.map(row => getTemperature(row) || 0);
    analyticsChart.data.datasets[1].data = [];
    analyticsChart.data.datasets[2].data = [];
  } else if (currentFilter === "humidity") {
    analyticsChart.data.datasets[0].data = [];
    analyticsChart.data.datasets[1].data = chartData.map(row => row.humidity || 0);
    analyticsChart.data.datasets[2].data = [];
  } else if (currentFilter === "light") {
    analyticsChart.data.datasets[0].data = [];
    analyticsChart.data.datasets[1].data = [];
    analyticsChart.data.datasets[2].data = chartData.map(row => row.uv_index || 0);
  }
  
  analyticsChart.update();
}

function updateTable() {
  const tbody = document.querySelector(".reports-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  let tableData = filteredData.slice(0, 10);
  console.log("Table data:", tableData);
  if (currentFilter !== "all") {
    tableData = tableData.filter(row => {
      if (currentFilter === "temperature") return safeValue(row.temperature) !== null;
      if (currentFilter === "humidity") return safeValue(row.humidity) !== null;
      if (currentFilter === "light") return safeValue(row.uv_index) !== null;
      return true;
    });
  }

  if (tableData.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="8" style="text-align:center;">No analytics data available</td>
    `;
    tbody.appendChild(tr);
    return;
  }

  tableData.forEach(row => {
    const tr = createTableRow(row);
    tbody.appendChild(tr);
  });
}

function buildCSV(mode = 'all') {
  // This is the existing top-level export (triggered alerts / all data via header Export CSV btn)
  const rows = filteredData.flatMap(row => {
    const timestamp = getRowTimestamp(row);
    const date = timestamp ? timestamp.toLocaleDateString() : '-';
    const user = row.user || 'Admin';

    const tVal = getTemperature(row);
    const hVal = getHumidity(row);
    const uvVal = getUV(row);

    const readings = [
      { type: 'Temperature', value: tVal, unit: '°C', threshold: THRESHOLDS.temperature },
      { type: 'Humidity', value: hVal, unit: '%', threshold: THRESHOLDS.humidity },
      { type: 'UV Index', value: uvVal, unit: ' UVI', threshold: THRESHOLDS.light }
    ];

    return readings
      .filter(r => r.value !== null && r.value !== undefined && r.value !== '' && !Number.isNaN(Number(r.value)))
      .filter(r => mode === 'all' || (mode === 'alerts' && Number(r.value) > r.threshold))
      .map(r => {
        const status = Number(r.value) > r.threshold ? 'Alert' : 'Normal';
        return [date, user, r.type, `${r.value}${r.unit}`, status];
      });
  });

  const csv = [
    ['Date', 'User', 'Sensor Type', 'Value', 'Status'],
    ...rows
  ].map(r => r.join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = mode === 'alerts' ? 'analytics_triggered_alerts.csv' : 'analytics_report.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Reports Table: export rangeData as CSV ───────────────────────────────────
function buildReportsTableCSV(rangeData, rangeLabel = 'Full Export') {
  const sourceData = rangeData;

  const rows = sourceData.map(row => {
    const timestamp = getRowTimestamp(row);
    const date = timestamp
      ? timestamp.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '-';
    const user = row.user || 'Admin';

    const tempNum = getTemperature(row);
    const humNum  = getHumidity(row);
    const uvNum   = getUV(row);

    const tempValue  = tempNum  === null ? '-' : `${tempNum.toFixed(1)}°C`;
    const tempStatus = tempNum  === null ? '-' : (tempNum  > THRESHOLDS.temperature ? 'Alert' : 'Normal');
    const humValue   = humNum   === null ? '-' : `${humNum.toFixed(1)}%`;
    const humStatus  = humNum   === null ? '-' : (humNum   > THRESHOLDS.humidity    ? 'Alert' : 'Normal');
    const uvValue    = uvNum    === null ? '-' : `${uvNum.toFixed(2)} UVI`;
    const uvStatus   = uvNum    === null ? '-' : (uvNum    > THRESHOLDS.light       ? 'Alert' : 'Normal');

    // Wrap values that may contain commas in quotes
    const escape = v => `"${String(v).replace(/"/g, '""')}"`;
    return [escape(date), escape(tempValue), escape(tempStatus),
            escape(humValue), escape(humStatus), escape(uvValue), escape(uvStatus)].join(',');
  });

  const header = '"Date","Temperature","Temp Status","Humidity","Hum Status","UV","UV Status"';
  const csv = [header, ...rows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `analytics_report_${rangeLabel.replace(/\s+/g, '_').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Reports Table: export rangeData as PDF (print-based) ─────────────────────
function buildReportsPDF(rangeData, rangeLabel = 'Full Export') {
  const sourceData = rangeData;
  const location   = localStorage.getItem('activeLocationName') || 'All Locations';
  const now        = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const tableRows = sourceData.map(row => {
    const timestamp = getRowTimestamp(row);
    const date = timestamp
      ? timestamp.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '-';
    const user = row.user || 'Admin';

    const tempNum = getTemperature(row);
    const humNum  = getHumidity(row);
    const uvNum   = getUV(row);

    const tempValue  = tempNum  === null ? '-' : `${tempNum.toFixed(1)}°C`;
    const tempStatus = tempNum  === null ? '-' : (tempNum  > THRESHOLDS.temperature ? 'Alert' : 'Normal');
    const humValue   = humNum   === null ? '-' : `${humNum.toFixed(1)}%`;
    const humStatus  = humNum   === null ? '-' : (humNum   > THRESHOLDS.humidity    ? 'Alert' : 'Normal');
    const uvValue    = uvNum    === null ? '-' : `${uvNum.toFixed(2)} UVI`;
    const uvStatus   = uvNum    === null ? '-' : (uvNum    > THRESHOLDS.light       ? 'Alert' : 'Normal');

    const statusBadge = (s) =>
      s === '-' ? '-'
      : s === 'Alert'
        ? `<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">Alert</span>`
        : `<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">Normal</span>`;

    return `
      <tr>
        <td>${date}</td>
        <td>${tempValue}</td>
        <td>${statusBadge(tempStatus)}</td>
        <td>${humValue}</td>
        <td>${statusBadge(humStatus)}</td>
        <td>${uvValue}</td>
        <td>${statusBadge(uvStatus)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>MediSafe Analytics Report</title>
  <style>
    @page { size: A4 landscape; margin: 18mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }

    /* Header */
    .pdf-header { display: flex; justify-content: space-between; align-items: flex-start;
                  border-bottom: 3px solid #2563eb; padding-bottom: 14px; margin-bottom: 20px; }
    .pdf-brand  { display: flex; align-items: center; gap: 12px; }
    .pdf-logo   { font-size: 36px; }
    .pdf-title  { font-size: 20px; font-weight: 700; color: #111; }
    .pdf-sub    { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .pdf-meta   { text-align: right; font-size: 11px; color: #374151; line-height: 1.8; }
    .pdf-meta span { font-weight: 600; color: #111; }

    /* Table */
    table  { width: 100%; border-collapse: collapse; margin-top: 10px; }
    thead  { background: #2563eb; color: #fff; }
    th     { padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; white-space: nowrap; }
    td     { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
    tr:nth-child(even) td { background: #f8fafc; }
    tr:last-child td { border-bottom: none; }

    /* Footer */
    .pdf-footer { margin-top: 20px; text-align: center; font-size: 10px; color: #9ca3af;
                  border-top: 1px solid #e5e7eb; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="pdf-header">
    <div class="pdf-brand">
      <div class="pdf-logo">🏥</div>
      <div>
        <div class="pdf-title">MediSafe Analytics Report</div>
        <div class="pdf-sub">Casimiro A. Ynares Sr. Memorial Hospital — ${rangeLabel}</div>
      </div>
    </div>
    <div class="pdf-meta">
      <div>Report Date: <span>${now}</span></div>
      <div>Location: <span>${location}</span></div>
      <div>Total Records: <span>${sourceData.length}</span></div>
      <div>Generated By: <span>MediSafe System</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Temperature</th>
        <th>Temp Status</th>
        <th>Humidity</th>
        <th>Hum Status</th>
        <th>UV</th>
        <th>UV Status</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || '<tr><td colspan="7" style="text-align:center;padding:20px;">No data available</td></tr>'}
    </tbody>
  </table>

  <div class="pdf-footer">
    MediSafe &mdash; Confidential Sensor Report &mdash; Generated on ${now}
  </div>

  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };<\/script>
</body>
</html>`;

  const blob   = new Blob([html], { type: 'text/html' });
  const url    = URL.createObjectURL(blob);
  const win    = window.open(url, '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function openExportModal() {
  const modal = document.getElementById('exportModal');
  if (!modal) return;
  modal.style.display = 'flex';
}

function closeExportModal() {
  const modal = document.getElementById('exportModal');
  if (!modal) return;
  modal.style.display = 'none';
}

function setupFilterButtons() {
  document.querySelectorAll(".chart-filters .filter-btn").forEach(btn => {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".chart-filters .filter-btn").forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      currentFilter = this.dataset.filter;
      updateCharts();
    });
  });
}

function setupExportButton() {
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', openExportModal);
  }

  const exportAllBtn = document.getElementById('exportAllBtn');
  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', () => {
      buildCSV('all');
      closeExportModal();
    });
  }

  const exportAlertsBtn = document.getElementById('exportAlertsBtn');
  if (exportAlertsBtn) {
    exportAlertsBtn.addEventListener('click', () => {
      buildCSV('alerts');
      closeExportModal();
    });
  }

  const cancelExportBtn = document.getElementById('cancelExportBtn');
  if (cancelExportBtn) {
    cancelExportBtn.addEventListener('click', closeExportModal);
  }

  // ── Reports Table export modal (2-step: range → format) ────────────────────
  const exportTableBtn = document.getElementById('exportTableBtn');
  const reportExportModal = document.getElementById('reportExportModal');
  const step1 = document.getElementById('reportExportStep1');
  const step2 = document.getElementById('reportExportStep2');
  const rangeLabel = document.getElementById('reportExportRangeLabel');

  // Helper: filter analyticsData by number of days (0 = all time)
  function getDataForRange(days) {
    const all = analyticsData.length > 0 ? analyticsData : filteredData;
    if (!days) return all;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);
    const sliced = all.filter(row => {
      const ts = getRowTimestamp(row);
      return ts && ts >= cutoff;
    });
    return sliced.length > 0 ? sliced : all; // fallback to all if empty
  }

  const RANGE_LABELS = { 7: 'Last 7 Days', 30: 'Last 1 Month', 60: 'Last 2 Months', 90: 'Last 3 Months', 0: 'All Time' };

  let selectedRangeData = [];
  let selectedRangeLabel = '';

  function closeReportModal() {
    if (reportExportModal) reportExportModal.style.display = 'none';
    // Reset to step 1 after a moment so re-open feels fresh
    setTimeout(() => {
      if (step1) step1.style.display = 'block';
      if (step2) step2.style.display = 'none';
    }, 200);
  }

  if (exportTableBtn) {
    exportTableBtn.addEventListener('click', () => {
      if (step1) step1.style.display = 'block';
      if (step2) step2.style.display = 'none';
      if (reportExportModal) reportExportModal.style.display = 'flex';
    });
  }

  // Range buttons (Step 1)
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = Number(btn.dataset.days);
      selectedRangeData  = getDataForRange(days);
      selectedRangeLabel = RANGE_LABELS[days] || 'All Time';
      if (rangeLabel) rangeLabel.textContent = `${selectedRangeData.length} record(s) · ${selectedRangeLabel}`;
      if (step1) step1.style.display = 'none';
      if (step2) step2.style.display = 'block';
    });
  });

  // Back button (Step 2 → Step 1)
  const backBtn = document.getElementById('reportExportBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (step2) step2.style.display = 'none';
      if (step1) step1.style.display = 'block';
    });
  }

  // CSV (Step 2)
  const reportExportCsvBtn = document.getElementById('reportExportCsvBtn');
  if (reportExportCsvBtn) {
    reportExportCsvBtn.addEventListener('click', () => {
      buildReportsTableCSV(selectedRangeData, selectedRangeLabel);
      closeReportModal();
    });
  }

  // PDF (Step 2)
  const reportExportPdfBtn = document.getElementById('reportExportPdfBtn');
  if (reportExportPdfBtn) {
    reportExportPdfBtn.addEventListener('click', () => {
      buildReportsPDF(selectedRangeData, selectedRangeLabel);
      closeReportModal();
    });
  }

  // Cancel (Step 1)
  const cancelReportExportBtn = document.getElementById('cancelReportExportBtn');
  if (cancelReportExportBtn) {
    cancelReportExportBtn.addEventListener('click', closeReportModal);
  }
}

function setupPrintButton() {
  const printBtn = document.getElementById("printBtn");
  if (printBtn) {
    printBtn.addEventListener("click", printReport);
  }
}

function printReport() {
  // Populate stats exactly from dashboard cards (print template layout)
  const printStats = document.getElementById("printStats");
  if (printStats) {
    const statValues = document.querySelectorAll(".stat-card .stat-value");
    printStats.innerHTML = `
      <div class="print-summary-row">
        <div class="print-summary-item">
          <div class="summary-label">Total Alerts</div>
          <div class="summary-value">${statValues[0]?.textContent || 0}</div>
        </div>
        <div class="print-summary-item">
          <div class="summary-label">Temperature Alerts</div>
          <div class="summary-value">${statValues[1]?.textContent || 0}</div>
        </div>
        <div class="print-summary-item">
          <div class="summary-label">Humidity Alerts</div>
          <div class="summary-value">${statValues[2]?.textContent || 0}</div>
        </div>
        <div class="print-summary-item">
          <div class="summary-label">Light Alerts</div>
          <div class="summary-value">${statValues[3]?.textContent || 0}</div>
        </div>
      </div>
      <div style="height: 60px;"></div> <!-- Spacer for space below summary stats -->
    `;
  }


  // Populate dates
  const printDate = document.getElementById("printDate");
  if (printDate) {
    printDate.textContent = new Date().toLocaleDateString();
  }

  const printPeriod = document.getElementById("printPeriod");
  if (printPeriod) {
    printPeriod.textContent = "Last 30 Days";
  }

  const printLocation = document.getElementById("printLocation");
  if (printLocation) {
    printLocation.textContent = localStorage.getItem('activeLocationName') || "All Locations";
  }

  const printGeneratedBy = document.getElementById("printGeneratedBy");
  if (printGeneratedBy) {
    printGeneratedBy.textContent = "MediSafe System";
  }

  // Copy chart as image - now positioned below stats with space
  const printChart = document.getElementById("printChart");
  const canvas = document.getElementById("analyticsChart");
  if (printChart && canvas) {
    printChart.style.marginTop = "20px";
    printChart.style.padding = "20px";
    printChart.style.border = "1px solid #e5e7eb";
    printChart.style.borderRadius = "8px";
    printChart.style.background = "#f8fafc";
    const img = document.createElement("img");
    img.src = canvas.toDataURL();
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    printChart.innerHTML = "";
    printChart.appendChild(img);
  }


  // Create horizontal table for print directly from filteredData
  const printTable = document.getElementById("printTable");
  if (printTable) {
    const tableRows = filteredData
      .slice(0, 10)
      .filter(row => {
        if (currentFilter === "temperature") return row.temperature !== null;
        if (currentFilter === "humidity") return row.humidity !== null;
        if (currentFilter === "light") return row.uv_index !== null;
        return true;
      })
      .map(row => {
        const date = row.recorded_id
          ? new Date(row.recorded_id).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '-';

        const tempVal = row.temperature !== null && !Number.isNaN(Number(row.temperature)) ? Number(row.temperature).toFixed(1) : null;
        const humVal = row.humidity !== null && !Number.isNaN(Number(row.humidity)) ? Number(row.humidity).toFixed(1) : null;
        const uvVal = row.uv_index !== null && !Number.isNaN(Number(row.uv_index)) ? Number(row.uv_index).toFixed(2) : null;

        const tempStatus = getStatus(tempVal, THRESHOLDS.temperature);
        const humStatus = getStatus(humVal, THRESHOLDS.humidity);
        const uvStatus = getStatus(uvVal, THRESHOLDS.light);

        return `
          <tr>
            <td>${date}</td>
            <td>${tempVal !== null ? `${tempVal}°C` : '-'}</td>
            <td>${tempVal !== null ? `<span class="${getStatusClass(tempStatus)}">${tempStatus}</span>` : '-'}</td>
            <td>${humVal !== null ? `${humVal}%` : '-'}</td>
            <td>${humVal !== null ? `<span class="${getStatusClass(humStatus)}">${humStatus}</span>` : '-'}</td>
            <td>${uvVal !== null ? `${uvVal} UVI` : '-'}</td>
            <td>${uvVal !== null ? `<span class="${getStatusClass(uvStatus)}">${uvStatus}</span>` : '-'}</td>
          </tr>
        `;
      })
      .join('');

    const table = document.createElement("table");
    table.classList.add("print-table");
    table.innerHTML = `
      <thead>
        <tr>
          <th>Date</th>
          <th>Temperature</th>
          <th>Temp Status</th>
          <th>Humidity</th>
          <th>Hum Status</th>
          <th>UV</th>
          <th>UV Status</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="7">No data available</td></tr>'}
      </tbody>
    `;

    printTable.innerHTML = "";
    printTable.appendChild(table);
  }

  // Hide main content and show print template
  const appContainer = document.querySelector(".app-container");
  if (appContainer) appContainer.style.display = "none";

  const printTemplate = document.getElementById("printTemplate");
  if (printTemplate) {
    printTemplate.style.display = "block";
    printTemplate.classList.add("print-ready");
  }

  const restoreView = () => {
    if (appContainer) appContainer.style.display = "block";
    if (printTemplate) {
      printTemplate.style.display = "none";
      printTemplate.classList.remove("print-ready");
    }
    window.onafterprint = null;
  };

  window.onafterprint = restoreView;

  // Fallback restore in case onafterprint is unsupported
  setTimeout(() => {
    if (printTemplate && printTemplate.style.display === "block") {
      restoreView();
    }
  }, 5000);

  // Print
  window.print();
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", function() {
  initializeChart();
  setupFilterButtons();
  setupExportButton();
  setupPrintButton();
  loadAnalyticsData();
  loadDashboardData();
  loadUserCount();        // ← fetch real user count from Supabase
  subscribeToSensorUpdates();
});


const LOCATIONS_PER_PAGE = 5;
let currentPage = 1;
let allLocations = [];

async function loadDashboardData() {
  const { data: locations, error: locError } = await supabase
    .from('location')
    .select('*');

  if (locError) return;

  allLocations = locations;
  renderLocationPage(currentPage);
}

async function renderLocationPage(page) {
  const tableBody = document.getElementById('data-table');
  if (!tableBody) return;

  const activeLocId = localStorage.getItem('activeLocationId');
  const start = (page - 1) * LOCATIONS_PER_PAGE;
  const pageLocations = allLocations.slice(start, start + LOCATIONS_PER_PAGE);

  // Fetch all sensor readings in parallel before touching the DOM
  const readings = await Promise.all(
    pageLocations.map(loc =>
      supabase
        .from('sensors')
        .select('temperature, humidity, uv_index')
        .eq('location_id', loc.id)
        .order('recorded_id', { ascending: false })
        .limit(1)
        .then(({ data }) =>
          data && data.length > 0
            ? data[0]
            : { temperature: '--', humidity: '--', uv_index: '--' }
        )
    )
  );

  // Build all rows in a fragment — no repaints until the swap below
  const fragment = document.createDocumentFragment();
  pageLocations.forEach((loc, i) => {
    const reading = readings[i];
    const isChecked = activeLocId == loc.id ? 'checked' : '';
    const tr = document.createElement('tr');
    tr.dataset.id = loc.id;
    tr.innerHTML = `
      <td><input type="radio" name="activeLocation" data-loc-id="${loc.id}" data-loc-name="${loc.locations}" ${isChecked}></td>
      <td><strong>${loc.locations}</strong></td>
      <td>${new Date(loc.created_at).toLocaleDateString()}</td>
      <td>${reading.temperature}°C</td>
      <td>${reading.humidity}%</td>
      <td>${reading.uv_index === '--' ? '--' : Number.parseFloat(reading.uv_index).toFixed(2)} UV</td>
      <td><button class="action-btn delete-btn" onclick="deleteLocation(${loc.id}, '${loc.locations}')">DELETE</button></td>
    `;
    fragment.appendChild(tr);
  });

  // Single DOM swap — replaces old rows all at once with no flash
  tableBody.innerHTML = "";
  tableBody.appendChild(fragment);

  renderPaginationControls();
}

function renderPaginationControls() {
  const totalPages = Math.ceil(allLocations.length / LOCATIONS_PER_PAGE);

  // Remove old controls if any
  const existing = document.getElementById('loc-pagination');
  if (existing) existing.remove();

  if (totalPages <= 1) return; // No pagination needed

  const container = document.createElement('div');
  container.id = 'loc-pagination';
  container.style.cssText = 'display:flex; justify-content:flex-end; align-items:center; gap:8px; padding:12px 20px;';

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = 'filter-btn' + (i === currentPage ? ' active' : '');
    btn.onclick = () => {
      currentPage = i;
      renderLocationPage(currentPage);
    };
    container.appendChild(btn);
  }

  // Append below the table
  document.querySelector('.sensor-card').appendChild(container);
}


window.setActiveLocation = async function(id, name) {
    // 1. Update current_config via direct fetch (Supabase JS client has auth issues in module scope)
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/current_config?id=eq.1`,
        {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            },
            body: JSON.stringify({ active_location_id: id })
        }
    );

    if (!res.ok) {
        const errText = await res.text();
        console.error("Error syncing to DB:", res.status, errText);
        alert("Failed to sync location to database.");
        return;
    }

    // 2. Keep the local UI updated
    localStorage.setItem('activeLocationId', id);
    localStorage.setItem('activeLocationName', name);
    
    const gModal = document.getElementById('gatheringModal');
    const gName = document.getElementById('gatheringLocName');
    if (gModal && gName) {
    gName.textContent = name;
    gModal.style.display = 'flex';
    loadDashboardData();
    loadAnalyticsData(); // refresh charts/table for new location
    }
};

// --- Modal Logic ---
const modal = document.getElementById('locationModal');
const addLocBtn = document.getElementById('addLocBtn'); // Targets your "Add Location" button
const closeBtn = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');
const locationForm = document.getElementById('locationForm');

// Open Modal
if (addLocBtn){
  addLocBtn.addEventListener('click', () => {
    console.log("Modal Opening");
    modal.style.display = 'flex';
});
} else {
  console.error("Could not find the Add Location");
}


// Close Modal functions
const hideModal = () => {
    modal.style.display = 'none';
    locationForm.reset();
};

closeBtn.onclick = hideModal;
cancelBtn.onclick = hideModal;

// --- Save to Supabase ---
locationForm.addEventListener('submit', async (e) => {
    e.preventDefault();

  const locations = document.getElementById('locName').value;

  const { error } = await supabase
    .from('location')
    .insert([
      { 
        locations: locations, 
        is_active: true 
      }
    ]);

    if (error){
      console.error('Error saving location:', error.message);
      return;
    }
    hideModal();

    const sModal = document.getElementById('successModal');
    if (sModal) {
      sModal.style.display = 'flex';
    }
    // Reload location list so the new entry appears immediately
    const { data: updatedLocs } = await supabase.from('location').select('*');
    if (updatedLocs) {
      allLocations = updatedLocs;
      currentPage = Math.ceil(allLocations.length / LOCATIONS_PER_PAGE);
      renderLocationPage(currentPage);
    }
});

document.getElementById('closeSuccessBtn').onclick = () => {
  document.getElementById('successModal').style.display = 'none';
};

const subscribeToSensorUpdates = () => {
  supabase
    .channel('sensor-changes')
    .on(
      'postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'sensors' }, 
      (payload) => {
        console.log('New data received!', payload.new);
        
        // Refresh the dashboard table (the row with the active ID)
        loadDashboardData();
        
        // Refresh the analytics charts and stats
        loadAnalyticsData();
      }
    )
    .subscribe();
};


// FORCE the function into the global scope so HTML onclick can find it
// Single, clean global delete handler
window.deleteLocation = function(id, name) {
  const dModal = document.getElementById('deleteModal');
  const dName = document.getElementById('deleteLocName');

  if (dModal && dName) {
    dName.textContent = name;
    dModal.style.setProperty('display', 'flex', 'important');
  }

  const confirmBtn = document.getElementById('confirmDelete');
  const cancelBtn  = document.getElementById('cancelDelete');

  const closeDelete = () => dModal.style.setProperty('display', 'none', 'important');

  confirmBtn.addEventListener('click', async () => {
    const { error } = await supabase.from('location').delete().eq('id', id);
    if (!error) {
      closeDelete();
      allLocations = allLocations.filter(loc => loc.id !== id);
      if (currentPage > Math.ceil(allLocations.length / LOCATIONS_PER_PAGE)) {
        currentPage = Math.max(1, currentPage - 1);
      }
      renderLocationPage(currentPage);
    } else {
      console.error('Delete error:', error.message);
    }
  }, { once: true });

  cancelBtn.addEventListener('click', closeDelete, { once: true });
};

// Success modal close button
document.addEventListener("DOMContentLoaded", () => {
  const closeSuccessBtn = document.getElementById('closeSuccessBtn');
  if (closeSuccessBtn) {
    closeSuccessBtn.onclick = () => {
      document.getElementById('successModal').style.display = 'none';
    };
  }

  // ✅ Add this:
  const closeGatheringBtn = document.getElementById('closeGatheringBtn');
  if (closeGatheringBtn) {
    closeGatheringBtn.onclick = () => {
      document.getElementById('gatheringModal').style.display = 'none';
    };
  }
});

// Delegated listener for location radio buttons
// Needed because analytics.js is a module — inline onclick can't reach module scope
document.addEventListener("DOMContentLoaded", () => {
  const dataTable = document.getElementById('data-table');
  if (dataTable) {
    dataTable.addEventListener('change', (e) => {
      const radio = e.target;
      if (radio.type === 'radio' && radio.name === 'activeLocation') {
        const id = Number(radio.dataset.locId);
        const name = radio.dataset.locName;
        if (id && name) {
          window.setActiveLocation(id, name);
        }
      }
    });
  }
});