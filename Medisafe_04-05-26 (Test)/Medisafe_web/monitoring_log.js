const MONITORING_SUPABASE_URL = 'https://elhshkzfiqmyisxavnsh.supabase.co';
const MONITORING_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k';
const TABLE_NAME = 'status_logs';

const { createClient } = supabase;
const monitoringClient = createClient(MONITORING_SUPABASE_URL, MONITORING_SUPABASE_KEY);

let allLogs      = [];   // currently displayed (may be filtered)
let _allLogsRaw  = [];   // pristine full dataset — never mutated
let userMap      = {};
let currentPage  = 1;
const PER_PAGE   = 10;
let dataReady    = false;

// ── Filter state ──────────────────────────────────────────────────
let _activeFilterFrom = null;
let _activeFilterTo   = null;

// Export bridge for the inline export script
window.monitoringExportBridge = {
  getAllLogs:      () => allLogs,
  getAllLogsRaw:   () => _allLogsRaw,
  getUserMap:      () => userMap,
  getCurrentPage:  () => currentPage,
  getPerPage:      () => PER_PAGE,
  isReady:         () => dataReady,
  getExportData: (range) => {
    const allLogsRaw = window.monitoringExportBridge.getAllLogsRaw();
    const userMapData = window.monitoringExportBridge.getUserMap();
    let source = allLogsRaw;

    if (range === 'current') {
      source = window.monitoringExportBridge.getAllLogs();
    } else if (range !== 'alltime') {
      const days = { '1month': 30, '2months': 60, '3months': 90 }[range] || 90;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      cutoff.setHours(0,0,0,0);
      source = source.filter(row => {
        const d = new Date(row.logged_at);
        return !isNaN(d) && d >= cutoff;
      });
    }
    // else alltime: full raw

    return source.map(row => {
      const d = new Date(row.logged_at);
      return {
        user:        userMapData[row.logged_by] || 'Unknown User',
        date:        isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time:        isNaN(d) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        temperature: row.temperature != null ? parseFloat(row.temperature).toFixed(1) + ' °C' : '—',
        humidity:    row.humidity    != null ? parseFloat(row.humidity).toFixed(1)    + ' %'  : '—',
        uv:          row.uv_index    != null ? parseFloat(row.uv_index).toFixed(0)             : '—',
        notes:       row.notes || '—',
      };
    });
  },
};

/* ══════════════════════════════════════════
   DATA LOADING
══════════════════════════════════════════ */
async function loadInitialData() {
  try {
    const { data: users } = await monitoringClient.from('users').select('id, first_name, last_name');
    if (users) users.forEach(u => userMap[u.id] = `${u.first_name} ${u.last_name}`);

    const { data: logs, error } = await monitoringClient
      .from(TABLE_NAME)
      .select('*')
      .order('logged_at', { ascending: false });

    if (error) throw error;

    _allLogsRaw = logs || [];
    allLogs     = [..._allLogsRaw];
    renderTable();
    dataReady = true;
  } catch (err) {
    console.error('Error loading data:', err);
    dataReady = false;
  }
}

/* ══════════════════════════════════════════
   TABLE RENDERING
══════════════════════════════════════════ */
function renderTable() {
  const tbody      = document.getElementById('monitoring-table-body');
  const countSpan  = document.getElementById('record-count');
  const emptyState = document.getElementById('empty-state');
  const pagination = document.getElementById('pagination');

  tbody.innerHTML = '';

  if (!allLogs || allLogs.length === 0) {
    emptyState.style.display = 'block';
    countSpan.textContent    = '0 entries';
    pagination.innerHTML     = '';
    return;
  }

  emptyState.style.display = 'none';
  countSpan.textContent    = `${allLogs.length} ${allLogs.length === _allLogsRaw.length ? 'total ' : ''}entries`;

  const start          = (currentPage - 1) * PER_PAGE;
  const paginatedItems = allLogs.slice(start, start + PER_PAGE);

  paginatedItems.forEach(row => {
    const userName = userMap[row.logged_by] || 'Unknown User';
    const tr       = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="user-badge">${userName}</div></td>
      <td>${new Date(row.logged_at).toLocaleDateString()}</td>
      <td>${new Date(row.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
      <td><span class="value-tag temp">${row.temperature?.toFixed(1) || '—'} °C</span></td>
      <td><span class="value-tag humid">${row.humidity?.toFixed(1) || '—'} %</span></td>
      <td><span class="value-tag uv">${row.uv_index?.toFixed(0) || '—'}</span></td>
      <td>${row.notes || '—'}</td>
    `;
    tbody.appendChild(tr);
  });

  renderPaginationControls();
}

function renderPaginationControls() {
  const container  = document.getElementById('pagination');
  const totalPages = Math.ceil(allLogs.length / PER_PAGE);
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const prev = document.createElement('button');
  prev.className = 'page-btn'; prev.innerHTML = '←'; prev.disabled = currentPage === 1;
  prev.onclick = () => { currentPage--; renderTable(); };
  container.appendChild(prev);

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      const btn = document.createElement('button');
      btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
      btn.textContent = i;
      btn.onclick = () => { currentPage = i; renderTable(); };
      container.appendChild(btn);
    } else if (Math.abs(i - currentPage) === 2) {
      const dots = document.createElement('span');
      dots.textContent = '...'; dots.style.padding = '0 8px';
      container.appendChild(dots);
    }
  }

  const next = document.createElement('button');
  next.className = 'page-btn'; next.innerHTML = '→'; next.disabled = currentPage === totalPages;
  next.onclick = () => { currentPage++; renderTable(); };
  container.appendChild(next);
}

/* ══════════════════════════════════════════
   FILTER HELPERS
══════════════════════════════════════════ */
function formatDisplayDate(isoStr) {
  if (!isoStr) return '—';
  const [y, m, d] = isoStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m - 1]} ${+d}, ${y}`;
}

function updateFilterUI() {
  const banner    = document.getElementById('filterActiveBanner');
  const summary   = document.getElementById('filterActiveSummary');
  const filterBtn = document.getElementById('openFilterBtn');
  const bannerIn  = document.getElementById('filterBannerInside');
  const bannerInText = document.getElementById('filterBannerInsideText');

  if (_activeFilterFrom || _activeFilterTo) {
    const from = formatDisplayDate(_activeFilterFrom);
    const to   = formatDisplayDate(_activeFilterTo);
    const text = `${from}  →  ${to}`;

    // Banner below header
    if (banner)  { banner.style.display = 'flex'; }
    if (summary) { summary.textContent  = text; }

    // Banner inside modal
    if (bannerIn)     { bannerIn.style.display = 'flex'; }
    if (bannerInText) { bannerInText.textContent = `Active: ${text}`; }

    // Filter button highlight
    filterBtn?.classList.add('filter-active');
  } else {
    if (banner)   banner.style.display = 'none';
    if (bannerIn) bannerIn.style.display = 'none';
    filterBtn?.classList.remove('filter-active');
  }
}

function setPresetDates(preset) {
  const today = new Date();
  const pad   = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
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

function applyMonitoringFilter() {
  const fromVal = document.getElementById('filterFromDate').value;
  const toVal   = document.getElementById('filterToDate').value;
  let valid     = true;

  ['fg-filter-from','fg-filter-to'].forEach(id =>
    document.getElementById(id)?.classList.remove('has-error')
  );

  if (!fromVal) { document.getElementById('fg-filter-from')?.classList.add('has-error'); valid = false; }
  if (!toVal)   { document.getElementById('fg-filter-to')?.classList.add('has-error');   valid = false; }
  if (!valid) return;

  // Validate from <= to
  const [fy,fm,fd] = fromVal.split('-').map(Number);
  const [ty,tm,td] = toVal.split('-').map(Number);
  const fromDate = new Date(fy, fm-1, fd, 0,  0,  0,   0);
  const toDate   = new Date(ty, tm-1, td, 23, 59, 59, 999);

  if (fromDate > toDate) {
    document.getElementById('fg-filter-from')?.classList.add('has-error');
    document.getElementById('fg-filter-to')?.classList.add('has-error');
    return;
  }

  _activeFilterFrom = fromVal;
  _activeFilterTo   = toVal;

  // Filter from pristine data using logged_at
  allLogs = _allLogsRaw.filter(row => {
    const d = new Date(row.logged_at);
    return !isNaN(d) && d >= fromDate && d <= toDate;
  });

  currentPage = 1;
  renderTable();
  updateFilterUI();
  closeFilterModal();
}

function resetMonitoringFilter() {
  _activeFilterFrom = null;
  _activeFilterTo   = null;

  document.getElementById('filterFromDate').value = '';
  document.getElementById('filterToDate').value   = '';
  document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('active'));
  ['fg-filter-from','fg-filter-to'].forEach(id =>
    document.getElementById(id)?.classList.remove('has-error')
  );

  allLogs     = [..._allLogsRaw];
  currentPage = 1;
  renderTable();
  updateFilterUI();
  closeFilterModal();
}

/* ══════════════════════════════════════════
   FILTER MODAL OPEN / CLOSE
══════════════════════════════════════════ */
function openFilterModal() {
  const modal = document.getElementById('filterModal');
  if (!modal) return;
  // Pre-fill if filter already active
  if (_activeFilterFrom) document.getElementById('filterFromDate').value = _activeFilterFrom;
  if (_activeFilterTo)   document.getElementById('filterToDate').value   = _activeFilterTo;
  updateFilterUI();
  modal.classList.add('active');
}

function closeFilterModal() {
  document.getElementById('filterModal')?.classList.remove('active');
}

/* ══════════════════════════════════════════
   DOM READY — wire all events
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Load data
  loadInitialData();

  // Filter button (header)
  document.getElementById('openFilterBtn')?.addEventListener('click', openFilterModal);

  // Filter modal close
  document.getElementById('closeFilterModal')?.addEventListener('click', closeFilterModal);
  document.getElementById('filterModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('filterModal')) closeFilterModal();
  });

  // Preset buttons
  document.querySelectorAll('.filter-preset-btn').forEach(btn =>
    btn.addEventListener('click', () => setPresetDates(btn.dataset.preset))
  );

  // Clear preset highlight on manual date input
  ['filterFromDate','filterToDate'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-preset="custom"]')?.classList.add('active');
    });
  });

  // Apply / Reset
  document.getElementById('applyFilterBtn')?.addEventListener('click', applyMonitoringFilter);
  document.getElementById('resetFilterBtn')?.addEventListener('click', resetMonitoringFilter);

  // Inline banner clear button
  document.getElementById('clearFilterInlineBanner')?.addEventListener('click', resetMonitoringFilter);

  // Enable export button when data ready
  if (typeof window.addMonitoringReadyCallback === 'function') {
    window.addMonitoringReadyCallback(() => {
      const exportBtn = document.getElementById('exportMonitoringBtn');
      if (exportBtn) {
        exportBtn.disabled = false;
      }
    });
  }
});
