import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://elhshkzfiqmyisxavnsh.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k";
const supabase = createClient(supabaseUrl, supabaseKey);

const TABLE_NAME = "sensors";

// Pagination state
const ROWS_PER_PAGE = 7;
let allData     = [];
let currentPage = 1;

// ── UV Index helpers ─────────────────────────────────────────

function getUVClass(uv) {
  if (uv == null || isNaN(uv)) return '';
  if (uv <= 2)  return 'low';
  if (uv <= 5)  return 'moderate';
  if (uv <= 7)  return 'high';
  if (uv <= 10) return 'very-high';
  return 'extreme';
}

function getUVLabel(uv) {
  if (uv == null || isNaN(uv)) return '—';
  return parseFloat(uv).toFixed(1);
}

// UV is considered an "alert" when it exceeds moderate (>5)
function isUVAlert(uv) {
  return uv != null && !isNaN(uv) && parseFloat(uv) > 5;
}

// ── Render one page of allData into the table ────────────────

function renderPage(page) {
  const tableBody = document.getElementById('historyTableBody');
  if (!tableBody) return;

  currentPage = page;

  const start    = (page - 1) * ROWS_PER_PAGE;
  const end      = start + ROWS_PER_PAGE;
  const pageData = allData.slice(start, end);

  tableBody.innerHTML = '';

  if (pageData.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary);">📭 No records found</td></tr>`;
    updateFooter();
    return;
  }

  pageData.forEach(entry => {
    let date = '—', time = '—';
    if (entry.recorded_id) {
      const dateObj = new Date(entry.recorded_id);
      if (!isNaN(dateObj)) {
        date = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        time = dateObj.toLocaleTimeString('en-US', { hour12: false });
      }
    }

    const temp     = entry.temperature != null ? parseFloat(entry.temperature).toFixed(1) : '0.0';
    const humidity = entry.humidity     != null ? parseFloat(entry.humidity).toFixed(1)    : '0.0';
    const uv       = entry.uv_index     != null ? parseFloat(entry.uv_index)               : null;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><span class="date-badge">${date}</span></td>
      <td>${time}</td>
      <td><span class="temp-value ${getTempClass(parseFloat(temp))}">${temp}°C</span></td>
      <td><span class="humidity-value ${getHumidityClass(parseFloat(humidity))}">${humidity}%</span></td>
      <td><span class="uv-value ${getUVClass(uv)}">${getUVLabel(uv)}</span></td>
      <td><span class="status-badge ${getStatusClass(parseFloat(temp), parseFloat(humidity))}">${getStatusLabel(parseFloat(temp), parseFloat(humidity))}</span></td>
    `;
    tableBody.appendChild(row);
  });

  updateFooter();
}

// ── Update rows-info text and pagination buttons ─────────────

function updateFooter() {
  const total    = allData.length;
  const rowsInfo = document.querySelector('.rows-info');
  if (rowsInfo) {
    if (total === 0) {
      rowsInfo.textContent = 'No entries found';
    } else {
      const start = (currentPage - 1) * ROWS_PER_PAGE + 1;
      const end   = Math.min(currentPage * ROWS_PER_PAGE, total);
      rowsInfo.textContent = `Showing ${start}–${end} of ${total} entries`;
    }
  }

  const pagination = document.querySelector('.pagination');
  if (!pagination) return;
  const totalPages = Math.ceil(total / ROWS_PER_PAGE);
  pagination.innerHTML = '';

  // Previous
  const prevBtn = document.createElement('button');
  prevBtn.className   = 'page-btn';
  prevBtn.textContent = 'Previous';
  prevBtn.disabled    = currentPage === 1;
  prevBtn.addEventListener('click', () => { if (currentPage > 1) renderPage(currentPage - 1); });
  pagination.appendChild(prevBtn);

  // Page numbers (show up to 5)
  const maxVis  = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVis / 2));
  let endPage   = Math.min(totalPages, startPage + maxVis - 1);
  if (endPage - startPage < maxVis - 1) startPage = Math.max(1, endPage - maxVis + 1);

  for (let i = startPage; i <= endPage; i++) {
    const pgBtn = document.createElement('button');
    pgBtn.className   = 'page-btn' + (i === currentPage ? ' active' : '');
    pgBtn.textContent = i;
    const p = i;
    pgBtn.addEventListener('click', () => renderPage(p));
    pagination.appendChild(pgBtn);
  }

  // Next
  const nextBtn = document.createElement('button');
  nextBtn.className   = 'page-btn';
  nextBtn.textContent = 'Next';
  nextBtn.disabled    = currentPage === totalPages || totalPages === 0;
  nextBtn.addEventListener('click', () => { if (currentPage < totalPages) renderPage(currentPage + 1); });
  pagination.appendChild(nextBtn);
}

// ── Load history from Supabase ───────────────────────────────

export async function loadHistory() {
  const container = document.getElementById("historyTableBody");
  if (!container) return console.error("Container not found!");

  container.innerHTML = `<tr><td colspan="6" style="padding:20px;color:gray;">Loading...</td></tr>`;

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("*")
      .order("recorded_id", { ascending: false });

    if (error) throw error;

    allData = data || [];
    renderPage(1);
    updateStatBoxes(allData);

  } catch (err) {
    console.error("Error fetching data:", err);
    container.innerHTML = `<tr><td colspan="6" style="padding:20px;color:red;">Error loading data</td></tr>`;
  }
}

// ── Update stat boxes from full Supabase dataset ─────────────

function updateStatBoxes(data) {
  let tempAlerts   = 0;
  let humidAlerts  = 0;
  let uvAlerts     = 0;
  let normals      = 0;

  data.forEach(entry => {
    const temp  = entry.temperature != null ? parseFloat(entry.temperature) : null;
    const humid = entry.humidity     != null ? parseFloat(entry.humidity)    : null;
    const uv    = entry.uv_index     != null ? parseFloat(entry.uv_index)    : null;

    const hasTempAlert  = temp  != null && (temp  > 25 || temp  < 20);
    const hasHumidAlert = humid != null && (humid > 60 || humid < 40);
    const hasUVAlert    = isUVAlert(uv);

    if (hasTempAlert)  tempAlerts++;
    if (hasHumidAlert) humidAlerts++;
    if (hasUVAlert)    uvAlerts++;

    // Normal = no alerts in ANY environment
    if (!hasTempAlert && !hasHumidAlert && !hasUVAlert) normals++;
  });

  const el = id => document.getElementById(id);
  if (el('statTempAlerts'))    el('statTempAlerts').textContent    = tempAlerts;
  if (el('statHumidAlerts'))   el('statHumidAlerts').textContent   = humidAlerts;
  if (el('statUVAlerts'))      el('statUVAlerts').textContent      = uvAlerts;
  if (el('statNormalReadings'))el('statNormalReadings').textContent = normals;
}

// ── Helpers ──────────────────────────────────────────────────

function getTempClass(temp) {
  if (temp > 25) return 'high';
  if (temp < 20) return 'low';
  return '';
}

function getHumidityClass(humidity) {
  if (humidity > 60) return 'high';
  if (humidity < 40) return 'low';
  return '';
}

function getStatusClass(temp, humidity) {
  if (temp > 25 || temp < 20 || humidity > 60 || humidity < 40) {
    if ((temp > 25 || temp < 20) && (humidity > 60 || humidity < 40)) return 'alert';
    return 'warning';
  }
  return 'normal';
}

function getStatusLabel(temp, humidity) {
  const highTemp  = temp > 25;
  const lowTemp   = temp < 20;
  const highHumid = humidity > 60;
  const lowHumid  = humidity < 40;
  if (highTemp  && highHumid) return 'High Temp / High Humidity';
  if (lowTemp   && highHumid) return 'Low Temp / High Humidity';
  if (highTemp  && lowHumid)  return 'High Temp / Low Humidity';
  if (lowTemp   && lowHumid)  return 'Low Temp / Low Humidity';
  if (highTemp)  return 'High Temp';
  if (lowTemp)   return 'Low Temp';
  if (highHumid) return 'High Humidity';
  if (lowHumid)  return 'Low Humidity';
  return 'Normal';
}

// ── Search functionality ─────────────────────────────────────

const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('.modern-table tbody tr');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
  });
}

// ── Filter button ────────────────────────────────────────────

const filterBtn = document.querySelector('.filter-btn');
if (filterBtn) {
  filterBtn.addEventListener('click', () => {
    openFilterModal();
  });
}

// ── Filter Modal logic ────────────────────────────────────────

let _activeFilterFrom = null;
let _activeFilterTo   = null;

function openFilterModal() {
  const modal = document.getElementById('filterModal');
  if (!modal) return;

  // Restore previously selected dates if any
  if (_activeFilterFrom) document.getElementById('filterFromDate').value = _activeFilterFrom;
  if (_activeFilterTo)   document.getElementById('filterToDate').value   = _activeFilterTo;

  // Show active banner if filter is set
  updateActiveBanner();
  modal.classList.add('active');
}

function closeFilterModal() {
  const modal = document.getElementById('filterModal');
  if (modal) modal.classList.remove('active');
}

function updateActiveBanner() {
  const banner  = document.getElementById('filterActiveBanner');
  const summary = document.getElementById('filterActiveSummary');
  if (!banner || !summary) return;
  if (_activeFilterFrom || _activeFilterTo) {
    const from = _activeFilterFrom ? formatDisplayDate(_activeFilterFrom) : '—';
    const to   = _activeFilterTo   ? formatDisplayDate(_activeFilterTo)   : '—';
    summary.textContent = `Active filter: ${from}  →  ${to}`;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function formatDisplayDate(isoStr) {
  if (!isoStr) return '—';
  const [y, m, d] = isoStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m - 1]} ${+d}, ${y}`;
}

function setPresetDates(preset) {
  const today  = new Date();
  const pad    = n => String(n).padStart(2, '0');
  const toISO  = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const todayISO = toISO(today);

  // Clear errors
  ['fg-filter-from','fg-filter-to'].forEach(id => {
    document.getElementById(id)?.classList.remove('has-error');
  });

  // Highlight active preset btn
  document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-preset="${preset}"]`)?.classList.add('active');

  if (preset === 'today') {
    document.getElementById('filterFromDate').value = todayISO;
    document.getElementById('filterToDate').value   = todayISO;
  } else if (preset === '7days') {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    document.getElementById('filterFromDate').value = toISO(from);
    document.getElementById('filterToDate').value   = todayISO;
  } else if (preset === '30days') {
    const from = new Date(today);
    from.setDate(today.getDate() - 29);
    document.getElementById('filterFromDate').value = toISO(from);
    document.getElementById('filterToDate').value   = todayISO;
  } else if (preset === 'custom') {
    document.getElementById('filterFromDate').value = '';
    document.getElementById('filterToDate').value   = '';
  }
}

// Wire preset buttons
document.querySelectorAll('.filter-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => setPresetDates(btn.dataset.preset));
});

// Clear preset highlight when user manually picks a date
['filterFromDate','filterToDate'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => {
    document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-preset="custom"]')?.classList.add('active');
  });
});

// Close handlers
document.getElementById('closeFilterModal')?.addEventListener('click', closeFilterModal);
document.getElementById('filterModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('filterModal')) closeFilterModal();
});

// Reset filter
document.getElementById('resetFilterBtn')?.addEventListener('click', () => {
  _activeFilterFrom = null;
  _activeFilterTo   = null;
  document.getElementById('filterFromDate').value = '';
  document.getElementById('filterToDate').value   = '';
  document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('active'));
  ['fg-filter-from','fg-filter-to'].forEach(id => {
    document.getElementById(id)?.classList.remove('has-error');
  });
  updateActiveBanner();

  // Show all rows
  document.querySelectorAll('#historyTableBody tr').forEach(r => r.style.display = '');
  closeFilterModal();

  // Update filter button appearance
  const fb = document.querySelector('.filter-btn');
  if (fb) fb.classList.remove('filter-active');
});

// Apply filter
document.getElementById('applyFilterBtn')?.addEventListener('click', () => {
  const fromVal = document.getElementById('filterFromDate').value;
  const toVal   = document.getElementById('filterToDate').value;
  let valid     = true;

  ['fg-filter-from','fg-filter-to'].forEach(id => {
    document.getElementById(id)?.classList.remove('has-error');
  });

  if (!fromVal) {
    document.getElementById('fg-filter-from')?.classList.add('has-error');
    valid = false;
  }
  if (!toVal) {
    document.getElementById('fg-filter-to')?.classList.add('has-error');
    valid = false;
  }
  if (!valid) return;

  // Ensure from <= to
  if (new Date(fromVal) > new Date(toVal)) {
    document.getElementById('fg-filter-from')?.classList.add('has-error');
    document.getElementById('fg-filter-to')?.classList.add('has-error');
    return;
  }

  _activeFilterFrom = fromVal;
  _activeFilterTo   = toVal;

  const fromDate = new Date(fromVal);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(toVal);
  toDate.setHours(23, 59, 59, 999);

  // Filter visible rows in the table
  document.querySelectorAll('#historyTableBody tr').forEach(row => {
    if (row.cells.length <= 1) { row.style.display = ''; return; }
    const dateText = row.cells[0]?.querySelector('.date-badge')?.textContent.trim() || '';
    const timeText = row.cells[1]?.textContent.trim() || '';
    const rowDate  = new Date(`${dateText} ${timeText}`);
    if (isNaN(rowDate)) { row.style.display = ''; return; }
    row.style.display = (rowDate >= fromDate && rowDate <= toDate) ? '' : 'none';
  });

  updateActiveBanner();

  // Mark filter button as active
  const fb = document.querySelector('.filter-btn');
  if (fb) fb.classList.add('filter-active');

  closeFilterModal();
});

// ── Export button ────────────────────────────────────────────

const exportBtn = document.querySelector('.export-btn');
if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    openExportModal();
  });
}

// ── Export Modal logic ────────────────────────────────────────

function openExportModal() {
  const modal = document.getElementById('exportModal');
  if (!modal) return;

  const now = new Date();
  document.getElementById('exportDateDisplay').textContent =
    now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Update record count preview whenever range changes
  function refreshCount() {
    const range = document.querySelector('input[name="exportRange"]:checked')?.value || 'current';
    const rows  = getExportData(range);
    document.getElementById('exportRecordCount').textContent =
      `${rows.length} record${rows.length !== 1 ? 's' : ''}`;
  }

  document.querySelectorAll('input[name="exportRange"]').forEach(r => {
    r.removeEventListener('change', refreshCount);
    r.addEventListener('change', refreshCount);
  });

  refreshCount();
  modal.classList.add('active');
}

function closeExportModal() {
  const modal = document.getElementById('exportModal');
  if (modal) modal.classList.remove('active');
}

document.getElementById('closeExportModal')?.addEventListener('click', closeExportModal);
document.getElementById('cancelExportBtn')?.addEventListener('click', closeExportModal);
document.getElementById('exportModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('exportModal')) closeExportModal();
});

document.getElementById('confirmExportBtn')?.addEventListener('click', () => {
  const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'pdf';
  const range  = document.querySelector('input[name="exportRange"]:checked')?.value  || 'current';
  closeExportModal();
  if (format === 'pdf') exportPDF(range);
  else exportCSV(range);
});

// ── Collect export data by range from allData ─────────────────

function getExportData(range) {
  let source = allData;

  if (range === '1month' || range === '2months' || range === '3months') {
    const days  = range === '1month' ? 30 : range === '2months' ? 60 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);
    source = allData.filter(entry => {
      if (!entry.recorded_id) return false;
      return new Date(entry.recorded_id) >= cutoff;
    });
  }
  // 'alltime' → use full allData
  // 'current' → use only the currently rendered page rows

  if (range === 'current') {
    return Array.from(document.querySelectorAll('#historyTableBody tr'))
      .filter(r => r.cells.length > 1)
      .map(r => ({
        date:     r.cells[0]?.querySelector('.date-badge')?.textContent.trim() || '—',
        time:     r.cells[1]?.textContent.trim() || '—',
        temp:     r.cells[2]?.textContent.trim() || '—',
        humidity: r.cells[3]?.textContent.trim() || '—',
        uv:       r.cells[4]?.textContent.trim() || '—',
        status:   r.cells[5]?.querySelector('.status-badge')?.textContent.trim() || '—',
      }));
  }

  // Convert allData rows to same flat format
  return source.map(entry => {
    let date = '—', time = '—';
    if (entry.recorded_id) {
      const dateObj = new Date(entry.recorded_id);
      if (!isNaN(dateObj)) {
        date = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        time = dateObj.toLocaleTimeString('en-US', { hour12: false });
      }
    }
    const temp  = entry.temperature != null ? parseFloat(entry.temperature).toFixed(1) + '°C' : '—';
    const humid = entry.humidity     != null ? parseFloat(entry.humidity).toFixed(1)    + '%'  : '—';
    const uv    = entry.uv_index     != null ? parseFloat(entry.uv_index).toFixed(1)           : '—';
    const t     = entry.temperature != null ? parseFloat(entry.temperature) : 0;
    const h     = entry.humidity     != null ? parseFloat(entry.humidity)    : 0;
    const uvRaw = entry.uv_index     != null ? parseFloat(entry.uv_index)    : null;
    const status = getStatusLabel(t, h);
    return { date, time, temp, humidity: humid, uv, status };
  });
}

// ── CSV Export ────────────────────────────────────────────────

function exportCSV(range = 'current') {
  const data    = getExportData(range);
  const headers = ['Date', 'Time', 'Temperature', 'Humidity', 'UV Index', 'Status'];
  const csvRows = [
    headers.join(','),
    ...data.map(r =>
      [r.date, r.time, r.temp, r.humidity, r.uv, `"${r.status}"`].join(',')
    )
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `medisafe_threshold_history_${range}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PDF Export ────────────────────────────────────────────────

function exportPDF(range = 'current') {
  const data       = getExportData(range);
  const now        = new Date();
  const reportDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const reportTime = now.toLocaleTimeString('en-US', { hour12: true });

  const rangeLabelMap = {
    current:   'Current Page',
    '1month':  'Last 1 Month',
    '2months': 'Last 2 Months',
    '3months': 'Last 3 Months (Recommended)',
    alltime:   'All Time',
  };
  const periodLabel = rangeLabelMap[range] || 'Current Page';

  const tempAlerts  = data.filter(r => r.status.toLowerCase().includes('temp')  && r.status.toLowerCase() !== 'normal').length;
  const humidAlerts = data.filter(r => r.status.toLowerCase().includes('humid') && r.status.toLowerCase() !== 'normal').length;
  // UV alerts: uv value > 5  (stored as plain number string like "7.8")
  const uvAlerts    = data.filter(r => {
    const v = parseFloat(r.uv);
    return !isNaN(v) && v > 5;
  }).length;
  // Normal = rows with no temp, humid OR uv alert
  const normals = data.filter(r => {
    const sl = r.status.toLowerCase();
    const hasTempHumid = sl !== 'normal' && (sl.includes('temp') || sl.includes('humid'));
    const uvVal = parseFloat(r.uv);
    const hasUV = !isNaN(uvVal) && uvVal > 5;
    return !hasTempHumid && !hasUV;
  }).length;

  const tableRowsHTML = data.map((r, i) => {
    const sl = r.status.toLowerCase();
    const statusCls = sl === 'normal'             ? 'status-normal'
                    : sl.includes('alert') || (sl.includes('temp') && sl.includes('humid')) ? 'status-alert'
                    : 'status-warning';
    const uvVal = parseFloat(r.uv);
    const uvCls = !isNaN(uvVal) && uvVal > 5 ? 'status-warning' : '';
    return `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
        <td>${r.date}, ${r.time}</td>
        <td>Admin</td>
        <td>Sensor</td>
        <td>${r.temp}</td>
        <td>${r.humidity}</td>
        <td class="${uvCls}">${r.uv}</td>
        <td class="${statusCls}">${r.status}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>MediSafe Threshold History Report</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #222; background: #fff; padding: 32px; }
    .rpt-header  { display:flex; align-items:center; gap:16px; margin-bottom:6px; }
    .rpt-logo    { width:48px; height:48px; background:#FF0531; border-radius:10px;
                   display:flex; align-items:center; justify-content:center; font-size:24px; color:#fff; flex-shrink:0; }
    .rpt-title   { font-size:22px; font-weight:700; color:#111; }
    .rpt-sub     { font-size:13px; color:#666; margin-top:2px; }
    .rpt-divider { border:none; border-top:2px solid #FF0531; margin:14px 0 18px; }
    .rpt-meta    { background:#f9f9f9; border-left:4px solid #FF0531; padding:12px 16px;
                   border-radius:0 8px 8px 0; margin-bottom:24px; font-size:12px; line-height:2; }
    .rpt-meta strong { display:inline-block; width:130px; color:#444; }
    .rpt-sec     { font-size:15px; font-weight:700; color:#111; margin-bottom:12px;
                   border-bottom:1px solid #eee; padding-bottom:6px; }
    .rpt-stats   { width:100%; border-collapse:separate; border-spacing:10px 0; margin-bottom:28px; table-layout:fixed; }
    .rpt-stat    { width:20%; height:90px; background:#f9f9f9; border:1px solid #eee;
                   border-radius:8px; padding:14px 16px; vertical-align:bottom; }
    .rpt-stat-lbl { font-size:10px; color:#888; text-transform:uppercase; letter-spacing:.4px;
                    line-height:1.4; display:block; margin-bottom:8px; }
    .rpt-stat-val { font-size:26px; font-weight:700; line-height:1; display:block; }
    .red    { color:#FF0531; }
    .amber  { color:#f59e0b; }
    .orange { color:#f97316; }
    .green  { color:#059669; }
    table  { width:100%; border-collapse:collapse; font-size:11px; }
    thead tr { background:#FF0531; color:#fff; }
    thead th { padding:9px 10px; text-align:left; font-weight:600; font-size:10.5px;
               text-transform:uppercase; letter-spacing:.4px; }
    tbody td { padding:8px 10px; border-bottom:1px solid #f0f0f0; color:#333; }
    .status-normal  { color:#059669; font-weight:600; }
    .status-warning { color:#d97706; font-weight:600; }
    .status-alert   { color:#FF0531; font-weight:600; }
    .rpt-footer { margin-top:32px; text-align:center; font-size:10px; color:#aaa;
                  border-top:1px solid #eee; padding-top:12px; }
  </style>
</head>
<body>
  <div class="rpt-header">
    <div class="rpt-logo">🏥</div>
    <div>
      <div class="rpt-title">MediSafe Analytics Report</div>
      <div class="rpt-sub">Your Hospital Name</div>
    </div>
  </div>
  <hr class="rpt-divider"/>
  <div class="rpt-meta">
    <div><strong>Report Date:</strong> ${reportDate}</div>
    <div><strong>Time Generated:</strong> ${reportTime}</div>
    <div><strong>Period:</strong> ${periodLabel}</div>
    <div><strong>Generated By:</strong> MediSafe System</div>
  </div>
  <div class="rpt-sec">Summary Statistics</div>
  <table class="rpt-stats">
    <tr>
      <td class="rpt-stat"><span class="rpt-stat-lbl">Total Records</span><span class="rpt-stat-val red">${data.length}</span></td>
      <td class="rpt-stat"><span class="rpt-stat-lbl">Temperature<br/>Alerts</span><span class="rpt-stat-val red">${tempAlerts}</span></td>
      <td class="rpt-stat"><span class="rpt-stat-lbl">Humidity Alerts</span><span class="rpt-stat-val amber">${humidAlerts}</span></td>
      <td class="rpt-stat"><span class="rpt-stat-lbl">UV Alerts</span><span class="rpt-stat-val orange">${uvAlerts}</span></td>
      <td class="rpt-stat"><span class="rpt-stat-lbl">Normal Readings</span><span class="rpt-stat-val green">${normals}</span></td>
    </tr>
  </table>
  <div class="rpt-sec">Detailed History Report</div>
  <table>
    <thead>
      <tr>
        <th>Date &amp; Time</th><th>User</th><th>Sensor</th>
        <th>Temperature</th><th>Humidity</th><th>UV Index</th><th>Status</th>
      </tr>
    </thead>
    <tbody>${tableRowsHTML}</tbody>
  </table>
  <div class="rpt-footer">MediSafe System — Threshold History Report — ${reportDate} at ${reportTime}</div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 300);
  };
}

// ── Auto-load on page load ───────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadHistory);
} else {
  loadHistory();
}