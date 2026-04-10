import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://elhshkzfiqmyisxavnsh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
window.supabase = supabase;

const TABLE_NAME = "sensors";

const THRESHOLDS = {
  temperature: 30,
  humidity:    60,
  light:        6   // UV threshold updated to 6
};

// ── Colours matching Weekly Sensor Trends ────────────────────────────────────
const COLOR_TEMP = "#FF0531";
const COLOR_HUM  = "#3b82f6";
const COLOR_UV   = "#f59e0b";

let analyticsData  = [];
let filteredData   = [];
let analyticsChart = null;
let currentFilter  = "all";

// Chart instances for the 6 new containers
let doughnutChart = null;
let peakBarChart  = null;
let gaugeTempChart = null;
let gaugeHumChart  = null;
let gaugeUVChart   = null;

// ── Timestamp helper ─────────────────────────────────────────────────────────
function getRowTimestamp(row) {
  const candidates = [row.recorded_id, row.recorded_at, row.created_at, row.inserted_at, row.timestamp];
  for (const v of candidates) {
    if (!v) continue;
    const d = new Date(v);
    if (!isNaN(d)) return d;
  }
  return null;
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  return ts.toLocaleString('en-US', { month:'2-digit', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ── Safe numeric getters ──────────────────────────────────────────────────────
function getSensorValue(row, keys) {
  for (const k of keys) {
    if (row[k] !== null && row[k] !== undefined && row[k] !== '') {
      const n = Number(row[k]);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}
const getTemperature = r => getSensorValue(r, ['temperature','temp']);
const getHumidity    = r => getSensorValue(r, ['humidity','hum']);
const getUV          = r => getSensorValue(r, ['uv_index','uv','light']);

function safeValue(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function createStatusSpan(isAlert) {
  const s = isAlert ? 'Alert' : 'Normal';
  return `<span class="${isAlert ? 'alert' : 'normal'}">${s}</span>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  WEEKLY SENSOR TRENDS (unchanged)
// ═══════════════════════════════════════════════════════════════════════════
function initializeChart() {
  const canvas = document.getElementById("analyticsChart");
  if (!canvas) return;

  analyticsChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label:"Temperature (°C)", data:[], borderColor:COLOR_TEMP, backgroundColor:"rgba(255,5,49,0.1)",
          tension:0.4, fill:true, borderWidth:3,
          pointBackgroundColor:COLOR_TEMP, pointBorderColor:"#fff", pointBorderWidth:2, pointRadius:4, pointHoverRadius:6 },
        { label:"Humidity (%)", data:[], borderColor:COLOR_HUM, backgroundColor:"rgba(59,130,246,0.1)",
          tension:0.4, fill:true, borderWidth:3,
          pointBackgroundColor:COLOR_HUM, pointBorderColor:"#fff", pointBorderWidth:2, pointRadius:4, pointHoverRadius:6 },
        { label:"UV Index", data:[], borderColor:COLOR_UV, backgroundColor:"rgba(245,158,11,0.1)",
          tension:0.4, fill:true, borderWidth:3,
          pointBackgroundColor:COLOR_UV, pointBorderColor:"#fff", pointBorderWidth:2, pointRadius:4, pointHoverRadius:6 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend: { display:true, position:"top", labels:{ padding:20, font:{size:13,weight:600}, usePointStyle:true, pointStyle:'circle' } },
        tooltip: { backgroundColor:'rgba(0,0,0,0.8)', padding:12, titleFont:{size:14,weight:600}, bodyFont:{size:13}, borderColor:'#e5e7eb', borderWidth:1 }
      },
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:12}} },
        y: { grid:{color:"#f3f4f6"}, ticks:{font:{size:12}}, beginAtZero:true }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOAD ALL SENSOR DATA
// ═══════════════════════════════════════════════════════════════════════════
async function loadAnalyticsData() {
  try {
    const PAGE_SIZE = 1000;
    let allRows = [], from = 0, keepGoing = true;
    while (keepGoing) {
      const { data, error } = await supabase.from(TABLE_NAME).select("*").range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const batch = data || [];
      allRows = allRows.concat(batch);
      keepGoing = batch.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }
    analyticsData = allRows;

    if (!analyticsData.length) {
      analyticsData = [
        { temperature:26.2, humidity:54.1, uv_index:4.1, recorded_at: new Date().toISOString() },
        { temperature:28.5, humidity:58.0, uv_index:5.8, recorded_at: new Date(Date.now()-86400000).toISOString() },
        { temperature:24.7, humidity:50.4, uv_index:3.3, recorded_at: new Date(Date.now()-172800000).toISOString() }
      ];
    }

    analyticsData.sort((a,b) => {
      const da = getRowTimestamp(a), db = getRowTimestamp(b);
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
      return db - da;
    });

    applyFilters();
  } catch (err) {
    console.error("Error loading analytics data:", err);
    filteredData = [];
    updateStats(); updateWeeklyChart();
  }
}

function applyFilters() {
  const now = new Date();
  const startDate = new Date(now); startDate.setDate(startDate.getDate() - 30); startDate.setHours(0,0,0,0);
  const endDate   = new Date(now); endDate.setHours(23,59,59,999);

  filteredData = analyticsData.filter(r => { const d = getRowTimestamp(r); return d && d >= startDate && d <= endDate; });
  if (!filteredData.length && analyticsData.length) filteredData = analyticsData.slice(0, 10);

  updateStats();
  updateWeeklyChart();
  // Refresh all 6 insight containers
  updateDoughnut();
  updatePeakBar();
  updateHeatmap();
}

// ═══════════════════════════════════════════════════════════════════════════
//  STAT CARDS
// ═══════════════════════════════════════════════════════════════════════════
function updateStats() {
  const tempA = filteredData.filter(r => getTemperature(r) > THRESHOLDS.temperature).length;
  const humA  = filteredData.filter(r => getHumidity(r)    > THRESHOLDS.humidity).length;
  const uvA   = filteredData.filter(r => getUV(r)          > THRESHOLDS.light).length;
  const total = filteredData.filter(r =>
    getTemperature(r) > THRESHOLDS.temperature ||
    getHumidity(r)    > THRESHOLDS.humidity    ||
    getUV(r)          > THRESHOLDS.light
  ).length;

  const sv = document.querySelectorAll(".stat-value");
  if (sv.length >= 4) { sv[0].textContent=total; sv[1].textContent=tempA; sv[2].textContent=humA; sv[3].textContent=uvA; }
}

async function loadUserCount() {
  const userStatEl = document.querySelectorAll(".stat-value")[4];
  if (!userStatEl) return;
  userStatEl.textContent = "…";
  for (const table of ['users','profiles']) {
    const { data, error } = await supabase.from(table).select('id');
    if (!error && data) { userStatEl.textContent = data.length; return; }
  }
  userStatEl.textContent = new Set(analyticsData.map(r => r.user).filter(Boolean)).size || 0;
}

// ═══════════════════════════════════════════════════════════════════════════
//  WEEKLY TRENDS CHART (line chart — filters)
// ═══════════════════════════════════════════════════════════════════════════
function updateWeeklyChart() {
  if (!analyticsChart) return;
  if (!filteredData.length) {
    analyticsChart.data.labels = [];
    analyticsChart.data.datasets.forEach(ds => ds.data = []);
    analyticsChart.update(); return;
  }
  const chartData = filteredData.slice(0, 10);
  analyticsChart.data.labels = chartData.map(r => {
    const ts = getRowTimestamp(r);
    return ts ? ts.toLocaleString('en-US',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
  });
  if (currentFilter === "all") {
    analyticsChart.data.datasets[0].data = chartData.map(r => getTemperature(r) || 0);
    analyticsChart.data.datasets[1].data = chartData.map(r => getHumidity(r)    || 0);
    analyticsChart.data.datasets[2].data = chartData.map(r => getUV(r)          || 0);
  } else if (currentFilter === "temperature") {
    analyticsChart.data.datasets[0].data = chartData.map(r => getTemperature(r) || 0);
    analyticsChart.data.datasets[1].data = []; analyticsChart.data.datasets[2].data = [];
  } else if (currentFilter === "humidity") {
    analyticsChart.data.datasets[1].data = chartData.map(r => getHumidity(r) || 0);
    analyticsChart.data.datasets[0].data = []; analyticsChart.data.datasets[2].data = [];
  } else if (currentFilter === "light") {
    analyticsChart.data.datasets[2].data = chartData.map(r => getUV(r) || 0);
    analyticsChart.data.datasets[0].data = []; analyticsChart.data.datasets[1].data = [];
  }
  analyticsChart.update();
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOP-LEFT: DOUGHNUT — Alert Breakdown by Type
// ═══════════════════════════════════════════════════════════════════════════
function updateDoughnut() {
  const tempA = filteredData.filter(r => getTemperature(r) > THRESHOLDS.temperature).length;
  const humA  = filteredData.filter(r => getHumidity(r)    > THRESHOLDS.humidity).length;
  const uvA   = filteredData.filter(r => getUV(r)          > THRESHOLDS.light).length;
  const total = tempA + humA + uvA;

  const pct = n => total > 0 ? Math.round((n/total)*100) + '%' : '0%';
  const el = id => document.getElementById(id);
  if (el('doughnut-total')) el('doughnut-total').textContent = total;
  if (el('pct-temp'))       el('pct-temp').textContent       = pct(tempA);
  if (el('pct-hum'))        el('pct-hum').textContent        = pct(humA);
  if (el('pct-uv'))         el('pct-uv').textContent         = pct(uvA);

  const canvas = document.getElementById('alertDoughnut');
  if (!canvas) return;

  const data    = total > 0 ? [tempA, humA, uvA] : [1, 1, 1];
  const isEmpty = total === 0;

  if (doughnutChart) {
    doughnutChart.data.datasets[0].data = data;
    doughnutChart.data.datasets[0].backgroundColor = isEmpty
      ? ['#e5e7eb','#e5e7eb','#e5e7eb']
      : [COLOR_TEMP, COLOR_HUM, COLOR_UV];
    doughnutChart.update();
    return;
  }

  doughnutChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Temperature', 'Humidity', 'UV Index'],
      datasets: [{
        data,
        backgroundColor: isEmpty ? ['#e5e7eb','#e5e7eb','#e5e7eb'] : [COLOR_TEMP, COLOR_HUM, COLOR_UV],
        borderWidth: 3,
        borderColor: 'var(--card-bg, #ffffff)',
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (isEmpty) return 'No alerts';
              const val = ctx.parsed;
              return ` ${ctx.label}: ${val} (${pct(val)})`;
            }
          }
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOP-MIDDLE: System Counts (locations, audit, monitoring)
// ═══════════════════════════════════════════════════════════════════════════
async function loadSystemCounts() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  // Locations — from 'location' table
  const { data: locs } = await supabase.from('location').select('id');
  set('sys-locations', locs ? locs.length : '—');

  // Audit Trail — combines notification_acknowledgements + status_logs (same as audit_trail_local.js)
  const [{ data: notifData, error: notifErr }, { data: statusDataAudit, error: statusAuditErr }] = await Promise.all([
    supabase.from('notification_acknowledgements').select('id'),
    supabase.from('status_logs').select('id')
  ]);
  const notifCount  = (!notifErr  && notifData)       ? notifData.length       : 0;
  const statusCount = (!statusAuditErr && statusDataAudit) ? statusDataAudit.length : 0;
  const auditTotal  = notifCount + statusCount;
  set('sys-audit', auditTotal > 0 ? auditTotal : '—');

  // Monitoring Log — from 'status_logs' table (same table used in monitoring_log.js)
  set('sys-monitoring', (!statusAuditErr && statusDataAudit) ? statusDataAudit.length : '—');
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOP-RIGHT: Peak Readings Bar Chart
// ═══════════════════════════════════════════════════════════════════════════
function updatePeakBar() {
  // Find peak row for each type
  let peakTempRow = null, peakHumRow = null, peakUVRow = null;
  let peakTemp = -Infinity, peakHum = -Infinity, peakUV = -Infinity;

  analyticsData.forEach(r => {
    const t = getTemperature(r), h = getHumidity(r), u = getUV(r);
    if (t !== null && t > peakTemp) { peakTemp = t; peakTempRow = r; }
    if (h !== null && h > peakHum)  { peakHum  = h; peakHumRow  = r; }
    if (u !== null && u > peakUV)   { peakUV   = u; peakUVRow   = r; }
  });

  const safeVal = (v, unit) => v === -Infinity ? '—' : `${Number(v).toFixed(1)}${unit}`;
  const safeTime = row => row ? fmtDateTime(getRowTimestamp(row)) : '—';

  const el = id => document.getElementById(id);
  if (el('peak-temp-val'))  el('peak-temp-val').textContent  = safeVal(peakTemp, '°C');
  if (el('peak-temp-time')) el('peak-temp-time').textContent = safeTime(peakTempRow);
  if (el('peak-hum-val'))   el('peak-hum-val').textContent   = safeVal(peakHum, '%');
  if (el('peak-hum-time'))  el('peak-hum-time').textContent  = safeTime(peakHumRow);
  if (el('peak-uv-val'))    el('peak-uv-val').textContent    = safeVal(peakUV, ' UVI');
  if (el('peak-uv-time'))   el('peak-uv-time').textContent   = safeTime(peakUVRow);

  const canvas = document.getElementById('peakBar');
  if (!canvas) return;

  const tempVal = peakTemp === -Infinity ? 0 : peakTemp;
  const humVal  = peakHum  === -Infinity ? 0 : peakHum;
  const uvVal   = peakUV   === -Infinity ? 0 : peakUV;

  if (peakBarChart) {
    peakBarChart.data.datasets[0].data = [tempVal, humVal, uvVal];
    peakBarChart.update(); return;
  }

  peakBarChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Temperature (°C)', 'Humidity (%)', 'UV Index'],
      datasets: [{
        data: [tempVal, humVal, uvVal],
        backgroundColor: [
          'rgba(255,5,49,0.8)', 'rgba(59,130,246,0.8)', 'rgba(245,158,11,0.8)'
        ],
        borderColor: [COLOR_TEMP, COLOR_HUM, COLOR_UV],
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const units = ['°C', '%', ' UVI'];
              return ` Peak: ${ctx.parsed.y.toFixed(1)}${units[ctx.dataIndex]}`;
            }
          }
        }
      },
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:11}} },
        y: { beginAtZero:true, grid:{color:'#f3f4f6'}, ticks:{font:{size:11}} }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  BOTTOM-LEFT: Heatmap — Alerts by Day × Hour
// ═══════════════════════════════════════════════════════════════════════════
function updateHeatmap() {
  const DAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const HOURS = [0,3,6,9,12,15,18,21]; // 3-hr buckets for readability

  // Build a day[0-6] × hourBucket[0-7] count grid
  const grid = Array.from({length:7}, () => new Array(HOURS.length).fill(0));

  filteredData.forEach(row => {
    const ts = getRowTimestamp(row);
    if (!ts) return;
    const isAlert =
      getTemperature(row) > THRESHOLDS.temperature ||
      getHumidity(row)    > THRESHOLDS.humidity    ||
      getUV(row)          > THRESHOLDS.light;
    if (!isAlert) return;

    const day    = ts.getDay();                        // 0-6
    const hour   = ts.getHours();                      // 0-23
    const bucket = HOURS.findIndex((h,i) => hour >= h && (i === HOURS.length-1 || hour < HOURS[i+1]));
    if (bucket >= 0) grid[day][bucket]++;
  });

  const maxVal = Math.max(1, ...grid.flat());

  // Heatmap colour stops: white → light blue → deep red
  function heatColor(count) {
    if (count === 0) return 'transparent';
    const t = count / maxVal;
    if (t < 0.4) {
      // white → light blue
      const u = t / 0.4;
      const r = Math.round(255 - u*100);
      const g = Math.round(255 - u*80);
      const b = 255;
      return `rgb(${r},${g},${b})`;
    } else {
      // light blue → deep red/orange
      const u = (t - 0.4) / 0.6;
      const r = Math.round(155 + u*100);
      const g = Math.round(175 - u*140);
      const b = Math.round(255 - u*255);
      return `rgb(${r},${g},${b})`;
    }
  }

  const head = document.getElementById('heatmapHead');
  const body = document.getElementById('heatmapBody');
  const legend = document.getElementById('heatmapLegend');
  if (!head || !body) return;

  // Header row
  head.innerHTML = `<tr>
    <th class="heatmap-row-label">Day</th>
    ${HOURS.map(h => `<th>${h}:00</th>`).join('')}
  </tr>`;

  // Body rows
  body.innerHTML = DAYS.map((day, di) =>
    `<tr>
      <td class="heatmap-row-label">${day}</td>
      ${HOURS.map((_, hi) => {
        const count = grid[di][hi];
        const bg    = heatColor(count);
        const style = count > 0
          ? `background:${bg};color:${count/maxVal > 0.5 ? '#fff' : '#374151'};`
          : 'background:transparent;color:var(--border-color,#e5e7eb);';
        return `<td style="${style}" title="${day} ${HOURS[hi]}:00 — ${count} alert(s)">${count || ''}</td>`;
      }).join('')}
    </tr>`
  ).join('');

  // Legend swatches
  if (legend) {
    legend.innerHTML = [0, 0.2, 0.4, 0.6, 0.8, 1].map(t => {
      const fakeCount = Math.round(t * maxVal);
      return `<div class="heatmap-legend-swatch" style="background:${heatColor(fakeCount)};border:1px solid #e5e7eb;"></div>`;
    }).join('');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BOTTOM-RIGHT: Gauge Charts (speedometer-style half-donut)
// ═══════════════════════════════════════════════════════════════════════════

// Draws a half-donut gauge using Chart.js doughnut with rotation trick
function createGauge(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const { max, threshold, value, colorNormal, colorAlert } = config;
  const isAlert  = value !== null && value > threshold;
  const fillColor = value === null ? '#e5e7eb' : (isAlert ? colorAlert : colorNormal);
  const emptyColor = 'rgba(0,0,0,0.06)';

  const pct   = value === null ? 0 : Math.min(value / max, 1);
  const used  = pct;
  const empty = 1 - used;

  const chart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [used, empty],
        backgroundColor: [fillColor, emptyColor],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '72%',
      plugins: { legend:{display:false}, tooltip:{enabled:false} },
      animation: { duration: 600, easing: 'easeInOutQuart' }
    }
  });

  return chart;
}

function updateGaugeChart(chart, canvasId, config) {
  if (!chart) return createGauge(canvasId, config);
  const { max, threshold, value, colorNormal, colorAlert } = config;
  const isAlert   = value !== null && value > threshold;
  const fillColor = value === null ? '#e5e7eb' : (isAlert ? colorAlert : colorNormal);
  const pct   = value === null ? 0 : Math.min(value / max, 1);
  chart.data.datasets[0].data = [pct, 1 - pct];
  chart.data.datasets[0].backgroundColor = [fillColor, 'rgba(0,0,0,0.06)'];
  chart.update('active');
  return chart;
}

function setGaugeUI(prefix, value, unit, threshold) {
  const el = id => document.getElementById(id);
  const isAlert = value !== null && value > threshold;

  if (el(`gauge-${prefix}-val`)) {
    el(`gauge-${prefix}-val`).textContent = value !== null ? Number(value).toFixed(1) : '—';
  }
  const statusEl = el(`gauge-${prefix}-status`);
  if (statusEl) {
    statusEl.textContent = value === null ? '—' : (isAlert ? 'ALERT ⚠️' : 'Normal');
    statusEl.className   = `gauge-status ${isAlert ? 'alert' : 'normal'}`;
  }
}

// Initial gauge creation
function initGauges() {
  gaugeTempChart = createGauge('gaugeTemp', { max:50,  threshold:THRESHOLDS.temperature, value:null, colorNormal:'#10b981', colorAlert:COLOR_TEMP });
  gaugeHumChart  = createGauge('gaugeHum',  { max:100, threshold:THRESHOLDS.humidity,    value:null, colorNormal:'#10b981', colorAlert:COLOR_HUM  });
  gaugeUVChart   = createGauge('gaugeUV',   { max:12,  threshold:THRESHOLDS.light,       value:null, colorNormal:'#10b981', colorAlert:COLOR_UV   });
}

async function refreshGauges() {
  const locId   = localStorage.getItem('activeLocationId');
  const locName = localStorage.getItem('activeLocationName') || '—';

  const nameEl = document.getElementById('gauge-loc-name');
  if (nameEl) nameEl.textContent = locName;

  let query = supabase.from(TABLE_NAME).select('temperature, humidity, uv_index').order('recorded_id', { ascending:false }).limit(1);
  if (locId) query = query.eq('location_id', locId);

  const { data, error } = await query;
  if (error || !data || !data.length) return;

  const row = data[0];
  const t = safeValue(row.temperature);
  const h = safeValue(row.humidity);
  const u = safeValue(row.uv_index);

  gaugeTempChart = updateGaugeChart(gaugeTempChart, 'gaugeTemp', { max:50,  threshold:THRESHOLDS.temperature, value:t, colorNormal:'#10b981', colorAlert:COLOR_TEMP });
  gaugeHumChart  = updateGaugeChart(gaugeHumChart,  'gaugeHum',  { max:100, threshold:THRESHOLDS.humidity,    value:h, colorNormal:'#10b981', colorAlert:COLOR_HUM  });
  gaugeUVChart   = updateGaugeChart(gaugeUVChart,   'gaugeUV',   { max:12,  threshold:THRESHOLDS.light,       value:u, colorNormal:'#10b981', colorAlert:COLOR_UV   });

  setGaugeUI('temp', t, '°C',  THRESHOLDS.temperature);
  setGaugeUI('hum',  h, '%',   THRESHOLDS.humidity);
  setGaugeUI('uv',   u, ' UVI',THRESHOLDS.light);
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORT (CSV) — kept from original
// ═══════════════════════════════════════════════════════════════════════════
function buildCSV(mode = 'all') {
  const rows = filteredData.flatMap(row => {
    const ts   = getRowTimestamp(row);
    const date = ts ? ts.toLocaleDateString() : '—';
    const tVal = getTemperature(row), hVal = getHumidity(row), uvVal = getUV(row);
    const readings = [
      { type:'Temperature', value:tVal, unit:'°C',  threshold:THRESHOLDS.temperature },
      { type:'Humidity',    value:hVal, unit:'%',   threshold:THRESHOLDS.humidity },
      { type:'UV Index',    value:uvVal,unit:' UVI',threshold:THRESHOLDS.light }
    ];
    return readings
      .filter(r => r.value !== null && !isNaN(Number(r.value)))
      .filter(r => mode === 'all' || Number(r.value) > r.threshold)
      .map(r => [date, row.user||'Admin', r.type, `${r.value}${r.unit}`, Number(r.value)>r.threshold?'Alert':'Normal']);
  });
  const csv = [['Date','User','Sensor Type','Value','Status'],...rows].map(r=>r.join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: mode==='alerts'?'analytics_alerts.csv':'analytics_all.csv' });
  a.click();
}

function buildReportsTableCSV(rangeData, rangeLabel='Full Export') {
  const escape = v => `"${String(v).replace(/"/g,'""')}"`;
  const rows = rangeData.map(row => {
    const ts = getRowTimestamp(row);
    const date = ts ? fmtDateTime(ts) : '—';
    const t = getTemperature(row), h = getHumidity(row), u = getUV(row);
    return [
      escape(date),
      escape(t===null?'—':`${t.toFixed(1)}°C`),  escape(t===null?'—':(t>THRESHOLDS.temperature?'Alert':'Normal')),
      escape(h===null?'—':`${h.toFixed(1)}%`),   escape(h===null?'—':(h>THRESHOLDS.humidity?'Alert':'Normal')),
      escape(u===null?'—':`${u.toFixed(2)} UVI`),escape(u===null?'—':(u>THRESHOLDS.light?'Alert':'Normal'))
    ].join(',');
  });
  const csv = ['"Date","Temperature","Temp Status","Humidity","Hum Status","UV","UV Status"',...rows].join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download:`analytics_report_${rangeLabel.replace(/\s+/g,'_').toLowerCase()}.csv` });
  a.click();
}

function buildReportsPDF(rangeData, rangeLabel='Full Export') {
  const location = localStorage.getItem('activeLocationName') || 'All Locations';
  const now = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const badge = s => s==='Alert'
    ? `<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">Alert</span>`
    : `<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">Normal</span>`;
  const tableRows = rangeData.map(row => {
    const ts = getRowTimestamp(row);
    const date = ts ? fmtDateTime(ts) : '—';
    const t = getTemperature(row), h = getHumidity(row), u = getUV(row);
    const ts_ = (v, thr) => v===null?'—':(v>thr?'Alert':'Normal');
    return `<tr>
      <td>${date}</td>
      <td>${t===null?'—':`${t.toFixed(1)}°C`}</td><td>${badge(ts_(t,THRESHOLDS.temperature))}</td>
      <td>${h===null?'—':`${h.toFixed(1)}%`}</td><td>${badge(ts_(h,THRESHOLDS.humidity))}</td>
      <td>${u===null?'—':`${u.toFixed(2)} UVI`}</td><td>${badge(ts_(u,THRESHOLDS.light))}</td>
    </tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>MediSafe Analytics</title>
    <style>@page{size:A4 landscape;margin:18mm 14mm;}*{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;}
    .hdr{display:flex;justify-content:space-between;border-bottom:3px solid #2563eb;padding-bottom:14px;margin-bottom:20px;}
    table{width:100%;border-collapse:collapse;}thead{background:#2563eb;color:#fff;}
    th,td{padding:8px 10px;text-align:left;}tr:nth-child(even)td{background:#f8fafc;}
    .ftr{margin-top:20px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:10px;}
    </style></head><body>
    <div class="hdr"><div><div style="font-size:20px;font-weight:700;">🏥 MediSafe Analytics Report</div>
    <div style="color:#6b7280;font-size:12px;">${rangeLabel}</div></div>
    <div style="text-align:right;font-size:11px;">Report Date: <b>${now}</b><br>Location: <b>${location}</b><br>Records: <b>${rangeData.length}</b></div></div>
    <table><thead><tr><th>Date</th><th>Temp</th><th>Temp Status</th><th>Humidity</th><th>Hum Status</th><th>UV</th><th>UV Status</th></tr></thead>
    <tbody>${tableRows||'<tr><td colspan="7" style="text-align:center">No data</td></tr>'}</tbody></table>
    <div class="ftr">MediSafe — Confidential — ${now}</div>
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();};<\/script></body></html>`;
  const win = window.open(URL.createObjectURL(new Blob([html],{type:'text/html'})),'_blank');
  if (!win) alert('Pop-up blocked. Please allow pop-ups.');
}

// ═══════════════════════════════════════════════════════════════════════════
//  FILTER BUTTONS + EXPORT BUTTONS
// ═══════════════════════════════════════════════════════════════════════════
function setupFilterButtons() {
  document.querySelectorAll(".chart-filters .filter-btn").forEach(btn => {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".chart-filters .filter-btn").forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      currentFilter = this.dataset.filter;
      updateWeeklyChart();
    });
  });
}

function setupExportButton() {
  // ── Export CSV (Triggered Alerts / All Data) ─────────────────────────────
  const openModal  = () => { const m=document.getElementById('exportModal'); if(m) m.style.display='flex'; };
  const closeModal = () => { const m=document.getElementById('exportModal'); if(m) m.style.display='none'; };

  document.getElementById('exportBtn')?.addEventListener('click', openModal);
  document.getElementById('exportAllBtn')?.addEventListener('click',    () => { buildCSV('all');    closeModal(); });
  document.getElementById('exportAlertsBtn')?.addEventListener('click', () => { buildCSV('alerts'); closeModal(); });
  document.getElementById('cancelExportBtn')?.addEventListener('click', closeModal);

  // ── Export Report (2-step: range → CSV or PDF) ────────────────────────────
  const reportModal = document.getElementById('reportExportModal');
  const step1 = document.getElementById('reportExportStep1');
  const step2 = document.getElementById('reportExportStep2');
  const rangeLabel = document.getElementById('reportExportRangeLabel');
  const RANGE_LABELS = {7:'Last 7 Days',30:'Last 1 Month',60:'Last 2 Months',90:'Last 3 Months',0:'All Time'};
  let selData=[], selLabel='';

  const closeReport = () => {
    if (reportModal) reportModal.style.display='none';
    setTimeout(()=>{ if(step1) step1.style.display='block'; if(step2) step2.style.display='none'; },200);
  };

  document.getElementById('exportTableBtn')?.addEventListener('click', () => {
    if(step1) step1.style.display='block'; if(step2) step2.style.display='none';
    if(reportModal) reportModal.style.display='flex';
  });

  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = Number(btn.dataset.days);
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-days); cutoff.setHours(0,0,0,0);
      const all = analyticsData.length ? analyticsData : filteredData;
      selData  = days ? all.filter(r=>{ const ts=getRowTimestamp(r); return ts&&ts>=cutoff; }) : all;
      if (!selData.length) selData = all;
      selLabel = RANGE_LABELS[days]||'All Time';
      if (rangeLabel) rangeLabel.textContent = `${selData.length} record(s) · ${selLabel}`;
      if(step1) step1.style.display='none'; if(step2) step2.style.display='block';
    });
  });

  document.getElementById('reportExportBackBtn')?.addEventListener('click', () => { if(step2) step2.style.display='none'; if(step1) step1.style.display='block'; });
  document.getElementById('reportExportCsvBtn')?.addEventListener('click', () => { buildReportsTableCSV(selData,selLabel); closeReport(); });
  document.getElementById('reportExportPdfBtn')?.addEventListener('click', () => { buildReportsPDF(selData,selLabel);      closeReport(); });
  document.getElementById('cancelReportExportBtn')?.addEventListener('click', closeReport);
}

// ═══════════════════════════════════════════════════════════════════════════
//  REAL-TIME SUBSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════
function subscribeToSensorUpdates() {
  supabase
    .channel('analytics-sensor-changes')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:TABLE_NAME }, payload => {
      console.log('New sensor data — refreshing analytics', payload.new);
      // Prepend the new row to analyticsData and re-run everything
      analyticsData.unshift(payload.new);
      applyFilters();
      refreshGauges();   // immediately update live gauges
    })
    .subscribe();
}

// ═══════════════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async function() {
  initializeChart();
  initGauges();
  setupFilterButtons();
  setupExportButton();

  await loadAnalyticsData();   // loads data → triggers applyFilters → updates all 6 containers
  await loadUserCount();
  await loadSystemCounts();
  await refreshGauges();

  // Gauge auto-refresh every 10 seconds for live feel
  setInterval(refreshGauges, 10000);

  subscribeToSensorUpdates();   // real-time new inserts
});
