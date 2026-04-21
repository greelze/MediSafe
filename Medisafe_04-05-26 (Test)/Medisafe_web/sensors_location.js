import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://elhshkzfiqmyisxavnsh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
window.supabase = supabase; // expose for onclick handlers

// ── Pagination State ──────────────────────────────────────────────────────────
const LOCATIONS_PER_PAGE = 7;
let currentPage = 1;
let allLocations = [];          // currently displayed (may be filtered)
let _unfilteredLocations = [];  // pristine full dataset — never overwritten after load

// ── Date-range filter state (History style) ──
let _activeFilterFrom = null;
let _activeFilterTo   = null;

// ── Load All Locations from Supabase ─────────────────────────────────────────
async function loadDashboardData() {
  const { data: locations, error: locError } = await supabase
    .from('location')
    .select('*');

  if (locError) return;

  _unfilteredLocations = locations || [];
  allLocations = _activeFilterFrom && _activeFilterTo
    ? applyDateRangeToLocations(_unfilteredLocations)
    : [..._unfilteredLocations];
  renderLocationPage(currentPage);
}

// ── Render a Single Page of Locations ────────────────────────────────────────
async function renderLocationPage(page) {
  const tableBody = document.getElementById('data-table');
  if (!tableBody) return;

  const activeLocId = localStorage.getItem('activeLocationId');
  const start = (page - 1) * LOCATIONS_PER_PAGE;
  const pageLocations = allLocations.slice(start, start + LOCATIONS_PER_PAGE);

  // Fetch latest sensor readings for each location in parallel
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

  // Single DOM swap — no flash
  tableBody.innerHTML = "";
  tableBody.appendChild(fragment);

  renderPaginationControls();
}

// ── Pagination Controls ───────────────────────────────────────────────────────
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

// ── Set Active Location ───────────────────────────────────────────────────────
window.setActiveLocation = async function(id, name) {
  // Update current_config in Supabase
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

  // Update local UI
  localStorage.setItem('activeLocationId', id);
  localStorage.setItem('activeLocationName', name);

  const gModal = document.getElementById('gatheringModal');
  const gName = document.getElementById('gatheringLocName');
  if (gModal && gName) {
    gName.textContent = name;
    gModal.style.display = 'flex';
    loadDashboardData(); // refresh the location table
  }
};

// ── Delete Location ───────────────────────────────────────────────────────────
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
      _unfilteredLocations = _unfilteredLocations.filter(loc => loc.id !== id);
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

// ── Add Location Modal ────────────────────────────────────────────────────────
const modal = document.getElementById('locationModal');
const addLocBtn = document.getElementById('addLocBtn');
const closeBtn = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');
const locationForm = document.getElementById('locationForm');

const hideModal = () => {
  modal.style.display = 'none';
  locationForm.reset();
};

if (addLocBtn) {
  addLocBtn.addEventListener('click', () => {
    console.log("Modal Opening");
    modal.style.display = 'flex';
  });
} else {
  console.error("Could not find the Add Location button");
}

closeBtn.onclick = hideModal;
cancelBtn.onclick = hideModal;

// ── Save New Location to Supabase ─────────────────────────────────────────────
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

  if (error) {
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
    _unfilteredLocations = updatedLocs;
    allLocations = _activeFilterFrom && _activeFilterTo
      ? applyDateRangeToLocations(_unfilteredLocations)
      : [..._unfilteredLocations];
    currentPage = Math.max(1, Math.ceil(allLocations.length / LOCATIONS_PER_PAGE));
    renderLocationPage(currentPage);
  }
});

// ── Real-time Sensor Updates (Supabase Subscription) ─────────────────────────
const subscribeToSensorUpdates = () => {
  supabase
    .channel('sensor-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sensors' },
      (payload) => {
        console.log('New sensor data received!', payload.new);
        loadDashboardData(); // refresh the location table with latest readings
      }
    )
    .subscribe();
};

// ── Export Modal Logic (Threshold-style) ─────────────────────────────────────
async function getSensorExportRows(range = 'current') {
  let source = allLocations || [];

  if (range === 'current') {
    const start = (currentPage - 1) * LOCATIONS_PER_PAGE;
    source = source.slice(start, start + LOCATIONS_PER_PAGE);
  } else if (range === '1month' || range === '2months' || range === '3months') {
    const days = range === '1month' ? 30 : range === '2months' ? 60 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);
    source = source.filter(loc => {
      const d = new Date(loc.created_at);
      return !isNaN(d) && d >= cutoff;
    });
  }

  const readings = await Promise.all(
    source.map(loc =>
      supabase
        .from('sensors')
        .select('temperature, humidity, uv_index')
        .eq('location_id', loc.id)
        .order('recorded_id', { ascending: false })
        .limit(1)
        .then(({ data }) => (data && data.length ? data[0] : null))
    )
  );

  return source.map((loc, i) => {
    const reading = readings[i] || {};
    return {
      location: loc.locations || '—',
      createdAt: loc.created_at
        ? new Date(loc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—',
      temperature: reading.temperature != null ? `${Number(reading.temperature).toFixed(1)} °C` : '—',
      humidity: reading.humidity != null ? `${Number(reading.humidity).toFixed(1)} %` : '—',
      uv: reading.uv_index != null ? `${Number(reading.uv_index).toFixed(2)}` : '—',
      active: loc.is_active ? 'Yes' : 'No',
    };
  });
}

function initSensorsExportModal() {
  const modal = document.getElementById('exportModal');
  const openBtn = document.getElementById('exportSensorsBtn');
  const closeBtn = document.getElementById('closeExportModal');
  const cancelBtn = document.getElementById('cancelExportBtn');
  const confirmBtn = document.getElementById('confirmExportBtn');
  const dateEl = document.getElementById('exportDateDisplay');
  const countEl = document.getElementById('exportRecordCount');
  if (!modal || !openBtn || !confirmBtn) return;

  const refreshCount = async () => {
    const range = document.querySelector('input[name="exportRange"]:checked')?.value || 'current';
    const rows = await getSensorExportRows(range);
    if (countEl) countEl.textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;
  };

  const openModal = async () => {
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
      });
    }
    document.querySelectorAll('input[name="exportRange"]').forEach(r => {
      r.removeEventListener('change', refreshCount);
      r.addEventListener('change', refreshCount);
    });
    await refreshCount();
    modal.classList.add('active');
  };

  const closeModal = () => modal.classList.remove('active');

  const exportCSV = async (range) => {
    const rows = await getSensorExportRows(range);
    const headers = ['Location', 'Created At', 'Temperature', 'Humidity', 'UV Index', 'Active'];
    const csvRows = [
      headers.join(','),
      ...rows.map(r => [`"${r.location}"`, r.createdAt, r.temperature, r.humidity, r.uv, r.active].join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medisafe_sensor_locations_${range}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async (range) => {
    const rows = await getSensorExportRows(range);
    const now = new Date();
    const reportDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const reportTime = now.toLocaleTimeString('en-US', { hour12: true });
    const tableRowsHTML = rows.map((r, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
        <td>${r.location}</td><td>${r.createdAt}</td><td>${r.temperature}</td><td>${r.humidity}</td><td>${r.uv}</td><td>${r.active}</td>
      </tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>MediSafe Sensor Locations Report</title><style>*{box-sizing:border-box}body{font-family:Arial;padding:32px}table{width:100%;border-collapse:collapse;font-size:11px}thead tr{background:#FF0531;color:#fff}th,td{padding:8px 10px;border-bottom:1px solid #eee}</style></head><body><h2>MediSafe Sensor Locations Report</h2><p><strong>Report Date:</strong> ${reportDate}<br><strong>Time Generated:</strong> ${reportTime}</p><table><thead><tr><th>Location</th><th>Created At</th><th>Temperature</th><th>Humidity</th><th>UV Index</th><th>Active</th></tr></thead><tbody>${tableRowsHTML}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) return;
    win.onload = () => {
      win.focus();
      win.print();
      win.onafterprint = () => { win.close(); URL.revokeObjectURL(url); };
    };
  };

  openBtn.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  confirmBtn.addEventListener('click', async () => {
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'pdf';
    const range = document.querySelector('input[name="exportRange"]:checked')?.value || 'current';
    closeModal();
    if (format === 'pdf') await exportPDF(range);
    else await exportCSV(range);
  });
}

// ── DOMContentLoaded: Wire up modals and delegated listeners ──────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Load location data and subscribe to live updates
  loadDashboardData();
  subscribeToSensorUpdates();
  initSensorsExportModal();

  // Success modal close button
  const closeSuccessBtn = document.getElementById('closeSuccessBtn');
  if (closeSuccessBtn) {
    closeSuccessBtn.onclick = () => {
      document.getElementById('successModal').style.display = 'none';
    };
  }

  // Gathering modal close button
  const closeGatheringBtn = document.getElementById('closeGatheringBtn');
  if (closeGatheringBtn) {
    closeGatheringBtn.onclick = () => {
      document.getElementById('gatheringModal').style.display = 'none';
    };
  }

  // Delegated listener for location radio buttons
  // Needed because this is a module — inline onclick can't reach module scope
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

  // ── Date-range filter (History style) ───────────────────────
  document.getElementById('openFilterBtn')?.addEventListener('click', openSensorsFilterModal);
  document.getElementById('closeFilterModal')?.addEventListener('click', closeSensorsFilterModal);
  document.getElementById('filterModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('filterModal')) closeSensorsFilterModal();
  });
  document.querySelectorAll('.filter-preset-btn').forEach(btn =>
    btn.addEventListener('click', () => setSensorsPresetDates(btn.dataset.preset))
  );
  ['filterFromDate','filterToDate'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-preset="custom"]')?.classList.add('active');
    });
  });
  document.getElementById('applyFilterBtn')?.addEventListener('click', applySensorsFilter);
  document.getElementById('resetFilterBtn')?.addEventListener('click', resetSensorsFilter);
  document.getElementById('clearFilterInlineBanner')?.addEventListener('click', resetSensorsFilter);
});

/* ═══════════════════════════════════════════════════════════
   DATE-RANGE FILTER  (filters location.created_at)
   ═══════════════════════════════════════════════════════════ */
function applyDateRangeToLocations(list) {
  if (!_activeFilterFrom || !_activeFilterTo) return [...list];
  const [fy, fm, fd] = _activeFilterFrom.split('-').map(Number);
  const [ty, tm, td] = _activeFilterTo.split('-').map(Number);
  const fromDate = new Date(fy, fm - 1, fd, 0,  0,  0,   0);
  const toDate   = new Date(ty, tm - 1, td, 23, 59, 59, 999);
  return list.filter(loc => {
    if (!loc.created_at) return false;
    const d = new Date(loc.created_at);
    return !isNaN(d) && d >= fromDate && d <= toDate;
  });
}

function _formatDisplayDate(isoStr) {
  if (!isoStr) return '—';
  const [y, m, d] = isoStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m - 1]} ${+d}, ${y}`;
}

function updateSensorsFilterUI() {
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

function setSensorsPresetDates(preset) {
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

function openSensorsFilterModal() {
  const modal = document.getElementById('filterModal');
  if (!modal) return;
  if (_activeFilterFrom) document.getElementById('filterFromDate').value = _activeFilterFrom;
  if (_activeFilterTo)   document.getElementById('filterToDate').value   = _activeFilterTo;
  updateSensorsFilterUI();
  modal.classList.add('active');
}

function closeSensorsFilterModal() {
  document.getElementById('filterModal')?.classList.remove('active');
}

function applySensorsFilter() {
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
  allLocations = applyDateRangeToLocations(_unfilteredLocations);
  currentPage = 1;
  renderLocationPage(currentPage);
  updateSensorsFilterUI();
  closeSensorsFilterModal();
}

function resetSensorsFilter() {
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
  allLocations = [..._unfilteredLocations];
  currentPage = 1;
  renderLocationPage(currentPage);
  updateSensorsFilterUI();
  closeSensorsFilterModal();
}
