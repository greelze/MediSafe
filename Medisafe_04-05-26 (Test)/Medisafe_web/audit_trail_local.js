// MediSafe Audit Trail - Supabase (alert resolutions + status logs)

let supabaseData       = [];
let supabaseStatusData = [];
let combinedData       = [];
let filteredData       = [];
let currentPage        = 1;
const PER_PAGE         = 10;

// ── Date-range filter state (History-style) ──
let _activeFilterFrom = null; // 'YYYY-MM-DD' or null
let _activeFilterTo   = null;

const TEMP_MIN  = 25.0, TEMP_MAX  = 30.0;
const HUMID_MIN = 50.0, HUMID_MAX = 60.0;
const UV_MAX    = 500.0;

const { createClient } = supabase;
const client = createClient(
  'https://elhshkzfiqmyisxavnsh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k'
);

const _userCache = {};

async function getUserNameByUserId(userIdBigint) {
  if (!userIdBigint || userIdBigint === '—') return '—';
  const key = `uid_${userIdBigint}`;
  if (_userCache[key]) return _userCache[key];
  try {
    const { data } = await client.from('users').select('first_name, last_name, user_id').eq('user_id', userIdBigint).maybeSingle();
    const name = data ? `${data.first_name || ''} ${data.last_name || ''}`.trim() : '—';
    _userCache[key] = name;
    return name;
  } catch { return '—'; }
}

async function getUserDetailsByAnyId(idValue) {
  if (!idValue) return { name: 'Unknown User', userId: '—' };
  const cacheKey = `any_${idValue}`;
  if (_userCache[cacheKey]) return _userCache[cacheKey];
  try {
    const { data: byUUID } = await client.from('users').select('first_name, last_name, user_id').eq('id', idValue).maybeSingle();
    if (byUUID) {
      const result = { name: `${byUUID.first_name || ''} ${byUUID.last_name || ''}`.trim() || 'Unknown User', userId: byUUID.user_id ?? '—' };
      _userCache[cacheKey] = result;
      return result;
    }
    const { data: byNumericId } = await client.from('users').select('first_name, last_name, user_id').eq('user_id', idValue).maybeSingle();
    if (byNumericId) {
      const result = { name: `${byNumericId.first_name || ''} ${byNumericId.last_name || ''}`.trim() || 'Unknown User', userId: byNumericId.user_id ?? '—' };
      _userCache[cacheKey] = result;
      return result;
    }
    const fallback = { name: 'Unknown User', userId: '—' };
    _userCache[cacheKey] = fallback;
    return fallback;
  } catch (err) {
    console.warn('getUserDetailsByAnyId error for', idValue, err);
    return { name: 'Unknown User', userId: '—' };
  }
}

async function loadSupabaseResolutions() {
  try {
    const { data, error } = await client
      .from('notification_acknowledgements')
      .select('id, acknowledged_at, acknowledged_by, notifications(id, sensor_type, category, reading_value, threshold_value, triggered_at)')
      .order('acknowledged_at', { ascending: false });
    if (error) { console.error('Resolutions fetch error:', error); return; }
    const rows = data || [];
    const nameMap = {};
    const uniqueIds = [...new Set(rows.map(r => r.acknowledged_by).filter(Boolean))];
    await Promise.all(uniqueIds.map(async uid => { nameMap[uid] = await getUserNameByUserId(uid); }));
    supabaseData = rows.map(row => {
      const dt = new Date(row.acknowledged_at);
      const dateStr = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
      const n = row.notifications || {};
      const rawSensor = n.sensor_type || '—';
      const sensorLabel = rawSensor !== '—' ? rawSensor.charAt(0).toUpperCase() + rawSensor.slice(1) : '—';
      return { id: `supa_${row.id}`, source: 'supabase', date: dateStr, time: timeStr, name: nameMap[row.acknowledged_by] || '—', userId: row.acknowledged_by || '—', action: 'Resolved Alert', category: capitalise(n.category || '—'), sensorType: sensorLabel };
    });
    mergeAndRender();
  } catch (err) { console.error('Unexpected error loading resolutions:', err); }
}

async function loadSupabaseStatusLogs() {
  try {
    const { data, error } = await client.from('status_logs').select('id, logged_at, logged_by, temperature, humidity, uv_index, notes').order('logged_at', { ascending: false });
    if (error) { console.error('Status logs fetch error:', error); return; }
    const rows = data || [];
    const detailsMap = {};
    const uniqueIds = [...new Set(rows.map(r => r.logged_by).filter(Boolean))];
    await Promise.all(uniqueIds.map(async idVal => { detailsMap[idVal] = await getUserDetailsByAnyId(idVal); }));
    supabaseStatusData = rows.map(row => {
      const dt = new Date(row.logged_at);
      const dateStr = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
      const t = row.temperature != null ? parseFloat(row.temperature) : null;
      const hum = row.humidity != null ? parseFloat(row.humidity) : null;
      const uv = row.uv_index != null ? parseFloat(row.uv_index) : null;
      const alerts = [];
      if (t != null && (t < TEMP_MIN || t > TEMP_MAX)) alerts.push('Temperature');
      if (hum != null && (hum < HUMID_MIN || hum > HUMID_MAX)) alerts.push('Humidity');
      if (uv != null && uv > UV_MAX) alerts.push('UV Index');
      const isAlert = alerts.length > 0;
      const details = detailsMap[row.logged_by] || { name: 'Unknown User', userId: '—' };
      return { id: `supa_status_${row.id}`, source: 'supabase_status', date: dateStr, time: timeStr, name: details.name, userId: details.userId, action: 'Manually Logged Readings', category: isAlert ? 'Alert' : 'Normal', sensorType: isAlert ? alerts.join(', ') : '—' };
    });
    mergeAndRender();
  } catch (err) { console.error('Unexpected error loading status logs:', err); }
}

function capitalise(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function mergeAndRender() {
  combinedData = [...supabaseData, ...supabaseStatusData].sort((a, b) =>
    new Date(b.date + 'T' + to24h(b.time)) - new Date(a.date + 'T' + to24h(a.time))
  );
  filteredData = [...combinedData];
  renderTable();
}

function to24h(timeStr) {
  if (!timeStr || !timeStr.includes(':')) return '00:00';
  const parts = timeStr.split(' ');
  let [h, m] = parts[0].split(':').map(Number);
  const ampm = parts[1] || '';
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function formatDate(s) {
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = type === 'error' ? '❌ ' + message : '✅ ' + message;
  toast.classList.remove('error');
  if (type === 'error') toast.classList.add('error');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function categoryBadge(category) {
  const map = { 'Advisory': { bg: '#dbeafe', color: '#1d4ed8' }, 'Warning': { bg: '#fef3c7', color: '#d97706' }, 'Critical': { bg: '#fee2e2', color: '#dc2626' }, 'Normal': { bg: '#d1fae5', color: '#065f46' }, 'Alert': { bg: '#fee2e2', color: '#dc2626' } };
  const style = map[category];
  if (!style) return `<span style="color:var(--text-secondary)">—</span>`;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:${style.bg};color:${style.color};">${category}</span>`;
}

function actionBadge(action) {
  if (action === 'Resolved Alert') return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:#d1fae5;color:#065f46;">Resolved Alert</span>`;
  if (action === 'Manually Logged Readings') return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:#e0f2fe;color:#0369a1;">Manually Logged Readings</span>`;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:#ede9fe;color:#5b21b6;">${action}</span>`;
}

function renderTable() {
  const tbody = document.getElementById('audit-table-body');
  const emptyState = document.getElementById('empty-state');
  const start = (currentPage - 1) * PER_PAGE;
  const pageData = filteredData.slice(start, start + PER_PAGE);
  tbody.innerHTML = '';
  if (filteredData.length === 0) {
    tbody.style.display = 'none';
    emptyState.style.display = 'block';
  } else {
    tbody.style.display = '';
    emptyState.style.display = 'none';
    pageData.forEach(rec => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="user-cell">${rec.userId}</td>
        <td class="date-cell">${formatDate(rec.date)}</td>
        <td class="time-cell">${rec.time}</td>
        <td class="name-cell">${rec.name}</td>
        <td>${actionBadge(rec.action)}</td>
        <td>${categoryBadge(rec.category)}</td>
        <td><span style="font-weight:600;color:var(--text-secondary);">${rec.sensorType || '—'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }
  document.getElementById('record-count').textContent = `${filteredData.length} Record${filteredData.length !== 1 ? 's' : ''}`;
  renderPagination();
}

function renderPagination() {
  const pg = document.getElementById('pagination');
  const total = Math.ceil(filteredData.length / PER_PAGE);
  pg.innerHTML = '';
  if (total <= 1) return;
  const prev = document.createElement('button');
  prev.className = 'page-btn'; prev.textContent = '← Prev'; prev.disabled = currentPage === 1;
  prev.onclick = () => { if (currentPage > 1) { currentPage--; renderTable(); } };
  pg.appendChild(prev);
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - currentPage) <= 1) {
      const b = document.createElement('button');
      b.className = `page-btn ${i === currentPage ? 'active' : ''}`; b.textContent = i;
      b.onclick = () => { currentPage = i; renderTable(); };
      pg.appendChild(b);
    } else if (Math.abs(i - currentPage) === 2) {
      const d = document.createElement('span');
      d.textContent = '…'; d.style.cssText = 'padding:8px;color:var(--text-muted)';
      pg.appendChild(d);
    }
  }
  const next = document.createElement('button');
  next.className = 'page-btn'; next.textContent = 'Next →'; next.disabled = currentPage === total;
  next.onclick = () => { if (currentPage < total) { currentPage++; renderTable(); } };
  pg.appendChild(next);
}

document.addEventListener('click', () => {
  document.querySelectorAll('.action-dropdown').forEach(d => d.classList.remove('show'));
});

function applyFilter() {
  const mf = document.getElementById('month-filter')?.value ?? 'all';
  const yf = document.getElementById('year-filter')?.value ?? 'all';

  // Date-range bounds (if active)
  let fromDate = null, toDate = null;
  if (_activeFilterFrom && _activeFilterTo) {
    const [fy, fm, fd] = _activeFilterFrom.split('-').map(Number);
    const [ty, tm, td] = _activeFilterTo.split('-').map(Number);
    fromDate = new Date(fy, fm - 1, fd, 0,  0,  0,   0);
    toDate   = new Date(ty, tm - 1, td, 23, 59, 59, 999);
  }

  filteredData = combinedData.filter(r => {
    const d = new Date(r.date + 'T00:00:00');
    if (mf !== 'all' && d.getMonth()    !== parseInt(mf)) return false;
    if (yf !== 'all' && d.getFullYear() !== parseInt(yf)) return false;
    if (fromDate && (d < fromDate || d > toDate))         return false;
    return true;
  });
  currentPage = 1;
  renderTable();
}

function resetFilter() {
  const mfEl = document.getElementById('month-filter');
  const yfEl = document.getElementById('year-filter');
  if (mfEl) mfEl.value = 'all';
  if (yfEl) yfEl.value = 'all';
  _activeFilterFrom = null;
  _activeFilterTo   = null;
  updateDateFilterUI();
  filteredData = [...combinedData];
  currentPage = 1;
  renderTable();
}

/* ═══════════════════════════════════════════════════════════
   DATE-RANGE FILTER (History / Monitoring style)
   ═══════════════════════════════════════════════════════════ */
function _formatDisplayDate(isoStr) {
  if (!isoStr) return '—';
  const [y, m, d] = isoStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m - 1]} ${+d}, ${y}`;
}

function updateDateFilterUI() {
  const banner       = document.getElementById('filterActiveBanner');
  const summary      = document.getElementById('filterActiveSummary');
  const filterBtn    = document.getElementById('openFilterBtn');
  const bannerIn     = document.getElementById('filterBannerInside');
  const bannerInText = document.getElementById('filterBannerInsideText');

  if (_activeFilterFrom || _activeFilterTo) {
    const text = `${_formatDisplayDate(_activeFilterFrom)}  →  ${_formatDisplayDate(_activeFilterTo)}`;
    if (banner)       banner.style.display     = 'flex';
    if (summary)      summary.textContent      = text;
    if (bannerIn)     bannerIn.style.display   = 'flex';
    if (bannerInText) bannerInText.textContent = `Active: ${text}`;
    filterBtn?.classList.add('filter-active');
  } else {
    if (banner)   banner.style.display   = 'none';
    if (bannerIn) bannerIn.style.display = 'none';
    filterBtn?.classList.remove('filter-active');
  }
}

function setAuditPresetDates(preset) {
  const today    = new Date();
  const pad      = n => String(n).padStart(2, '0');
  const toISO    = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const todayISO = toISO(today);

  ['fg-filter-from','fg-filter-to'].forEach(id =>
    document.getElementById(id)?.classList.remove('has-error')
  );
  document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-preset="${preset}"]`)?.classList.add('active');

  if (preset === 'today') {
    document.getElementById('filterFromDate').value = todayISO;
    document.getElementById('filterToDate').value   = todayISO;
  } else if (preset === '7days') {
    const from = new Date(today); from.setDate(today.getDate() - 6);
    document.getElementById('filterFromDate').value = toISO(from);
    document.getElementById('filterToDate').value   = todayISO;
  } else if (preset === '30days') {
    const from = new Date(today); from.setDate(today.getDate() - 29);
    document.getElementById('filterFromDate').value = toISO(from);
    document.getElementById('filterToDate').value   = todayISO;
  } else if (preset === 'custom') {
    document.getElementById('filterFromDate').value = '';
    document.getElementById('filterToDate').value   = '';
  }
}

function openAuditDateFilterModal() {
  const modal = document.getElementById('filterModal');
  if (!modal) return;
  if (_activeFilterFrom) document.getElementById('filterFromDate').value = _activeFilterFrom;
  if (_activeFilterTo)   document.getElementById('filterToDate').value   = _activeFilterTo;
  updateDateFilterUI();
  modal.classList.add('active');
}

function closeAuditDateFilterModal() {
  document.getElementById('filterModal')?.classList.remove('active');
}

function applyAuditDateFilter() {
  const fromVal = document.getElementById('filterFromDate').value;
  const toVal   = document.getElementById('filterToDate').value;
  let valid     = true;

  ['fg-filter-from','fg-filter-to'].forEach(id =>
    document.getElementById(id)?.classList.remove('has-error')
  );
  if (!fromVal) { document.getElementById('fg-filter-from')?.classList.add('has-error'); valid = false; }
  if (!toVal)   { document.getElementById('fg-filter-to')?.classList.add('has-error');   valid = false; }
  if (!valid) return;

  const [fy,fm,fd] = fromVal.split('-').map(Number);
  const [ty,tm,td] = toVal.split('-').map(Number);
  if (new Date(fy,fm-1,fd) > new Date(ty,tm-1,td)) {
    document.getElementById('fg-filter-from')?.classList.add('has-error');
    document.getElementById('fg-filter-to')?.classList.add('has-error');
    return;
  }

  _activeFilterFrom = fromVal;
  _activeFilterTo   = toVal;
  applyFilter();              // re-runs combined month/year + date-range filter
  updateDateFilterUI();
  closeAuditDateFilterModal();
}

function resetAuditDateFilter() {
  _activeFilterFrom = null;
  _activeFilterTo   = null;
  const fromEl = document.getElementById('filterFromDate');
  const toEl   = document.getElementById('filterToDate');
  if (fromEl) fromEl.value = '';
  if (toEl)   toEl.value   = '';
  document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('active'));
  ['fg-filter-from','fg-filter-to'].forEach(id =>
    document.getElementById(id)?.classList.remove('has-error')
  );
  applyFilter();
  updateDateFilterUI();
  closeAuditDateFilterModal();
}

function getAuditExportRows(range = 'current') {
  let source = combinedData;
  if (range === 'current') {
    const start = (currentPage - 1) * PER_PAGE;
    source = filteredData.slice(start, start + PER_PAGE);
  } else if (range === '1month' || range === '2months' || range === '3months') {
    const days = range === '1month' ? 30 : range === '2months' ? 60 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);
    source = combinedData.filter(r => {
      const d = new Date(r.date + 'T00:00:00');
      return !isNaN(d) && d >= cutoff;
    });
  }
  return source.map(r => ({
    userId: r.userId, date: formatDate(r.date), time: r.time,
    name: r.name, action: r.action, category: r.category, sensorType: r.sensorType || '—',
  }));
}

function exportCSV(range = 'current') {
  const rows = getAuditExportRows(range);
  let csv = 'User ID,Date,Time,Name,Action Made,Category,Sensor Type\n';
  rows.forEach(r => { csv += `"${r.userId}","${r.date}","${r.time}","${r.name}","${r.action}","${r.category}","${r.sensorType}"\n`; });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `audit_trail_${range}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

// FIX: Use hidden iframe instead of window.open to prevent JS bleeding into page
function exportPDF(range = 'current') {
  const rows = getAuditExportRows(range);
  const now = new Date();
  const reportDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const reportTime = now.toLocaleTimeString('en-US', { hour12: true });
  const rangeLabels = { current: 'Current Page', '1month': 'Last 1 Month', '2months': 'Last 2 Months', '3months': 'Last 3 Months (Recommended)', alltime: 'All Time' };

  const tableRowsHTML = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td>${r.userId}</td><td>${r.date}</td><td>${r.time}</td><td>${r.name}</td>
      <td>${r.action}</td><td>${r.category}</td><td>${r.sensorType}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>MediSafe Audit Trail Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,sans-serif;font-size:12px;color:#222;background:#fff;padding:32px;}
  .rpt-header{display:flex;align-items:center;gap:16px;margin-bottom:6px;}
  .rpt-logo{width:48px;height:48px;background:#FF0531;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;flex-shrink:0;}
  .rpt-title{font-size:22px;font-weight:700;color:#111;}
  .rpt-sub{font-size:13px;color:#666;margin-top:2px;}
  .rpt-divider{border:none;border-top:2px solid #FF0531;margin:14px 0 18px;}
  .rpt-meta{background:#f9f9f9;border-left:4px solid #FF0531;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;font-size:12px;line-height:2;}
  .rpt-meta strong{display:inline-block;width:130px;color:#444;}
  .rpt-sec{font-size:15px;font-weight:700;color:#111;margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:6px;}
  table{width:100%;border-collapse:collapse;font-size:11px;}
  thead tr{background:#FF0531;color:#fff;}
  thead th{padding:9px 10px;text-align:left;font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;}
  tbody td{padding:8px 10px;border-bottom:1px solid #f0f0f0;color:#333;}
  .rpt-footer{margin-top:32px;text-align:center;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:12px;}
</style></head><body>
  <div class="rpt-header">
    <div class="rpt-logo">🏥</div>
    <div><div class="rpt-title">MediSafe Analytics Report</div><div class="rpt-sub">Your Hospital Name</div></div>
  </div>
  <hr class="rpt-divider"/>
  <div class="rpt-meta">
    <div><strong>Report Date:</strong> ${reportDate}</div>
    <div><strong>Time Generated:</strong> ${reportTime}</div>
    <div><strong>Period:</strong> ${rangeLabels[range] || range}</div>
    <div><strong>Generated By:</strong> MediSafe System</div>
  </div>
  <div class="rpt-sec">Audit Trail Report</div>
  <table>
    <thead><tr><th>User ID</th><th>Date</th><th>Time</th><th>Name</th><th>Action Made</th><th>Category</th><th>Sensor Type</th></tr></thead>
    <tbody>${tableRowsHTML}</tbody>
  </table>
  <div class="rpt-footer">MediSafe System — Audit Trail Report — ${reportDate} at ${reportTime}</div>
</body></html>`;

  // Use hidden iframe to avoid popup blockers and prevent code bleeding into page
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);
  const iframeDoc = iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 1000);
  }, 500);
}

function openAuditExportModal() {
  const modal = document.getElementById('exportModal');
  if (!modal) { console.error('exportModal element not found'); return; }
  const dateEl = document.getElementById('exportDateDisplay');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const refreshCount = () => {
    const range = document.querySelector('input[name="exportRange"]:checked')?.value || 'current';
    const rows = getAuditExportRows(range);
    const el = document.getElementById('exportRecordCount');
    if (el) el.textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;
  };

  document.querySelectorAll('input[name="exportRange"]').forEach(r => {
    r.removeEventListener('change', refreshCount);
    r.addEventListener('change', refreshCount);
  });
  refreshCount();
  modal.classList.add('active');
}

function closeAuditExportModal() {
  document.getElementById('exportModal')?.classList.remove('active');
}

let deleteRecordId = null;

function openDeleteConfirm(id) {
  deleteRecordId = id;
  const confirmModal = document.getElementById('confirm-modal');
  if (confirmModal) { confirmModal.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function closeDeleteConfirm() {
  const confirmModal = document.getElementById('confirm-modal');
  if (confirmModal) { confirmModal.classList.remove('open'); document.body.style.overflow = ''; }
  deleteRecordId = null;
}

function initRealtime() {
  client.channel('audit-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'status_logs' }, () => { loadSupabaseStatusLogs(); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notification_acknowledgements' }, () => { loadSupabaseResolutions(); })
    .subscribe((status) => { console.log('Realtime status:', status); });
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('apply-filter')?.addEventListener('click', applyFilter);
  document.getElementById('reset-filter')?.addEventListener('click', resetFilter);

  // ── Date-range filter (History style) ─────────────────────
  document.getElementById('openFilterBtn')?.addEventListener('click', openAuditDateFilterModal);
  document.getElementById('closeFilterModal')?.addEventListener('click', closeAuditDateFilterModal);
  document.getElementById('filterModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('filterModal')) closeAuditDateFilterModal();
  });
  document.querySelectorAll('.filter-preset-btn').forEach(btn =>
    btn.addEventListener('click', () => setAuditPresetDates(btn.dataset.preset))
  );
  ['filterFromDate','filterToDate'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-preset="custom"]')?.classList.add('active');
    });
  });
  document.getElementById('applyDateFilterBtn')?.addEventListener('click', applyAuditDateFilter);
  document.getElementById('resetDateFilterBtn')?.addEventListener('click', resetAuditDateFilter);
  document.getElementById('clearFilterInlineBanner')?.addEventListener('click', resetAuditDateFilter);

  // Export button
  document.getElementById('export-btn')?.addEventListener('click', openAuditExportModal);

  // Export modal controls
  document.getElementById('closeExportModal')?.addEventListener('click', closeAuditExportModal);
  document.getElementById('cancelExportBtn')?.addEventListener('click', closeAuditExportModal);
  document.getElementById('exportModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('exportModal')) closeAuditExportModal();
  });
  document.getElementById('confirmExportBtn')?.addEventListener('click', () => {
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'pdf';
    const range  = document.querySelector('input[name="exportRange"]:checked')?.value  || 'current';
    closeAuditExportModal();
    if (format === 'pdf') exportPDF(range); else exportCSV(range);
  });

  // Delete modal controls
  document.getElementById('confirm-cancel')?.addEventListener('click', closeDeleteConfirm);
  document.getElementById('confirm-delete')?.addEventListener('click', () => { if (deleteRecordId) closeDeleteConfirm(); });
  const confirmModal = document.getElementById('confirm-modal');
  confirmModal?.addEventListener('click', e => { if (e.target === confirmModal) closeDeleteConfirm(); });

  await loadSupabaseResolutions();
  await loadSupabaseStatusLogs();
  initRealtime();
});
