// MediSafe Audit Trail - Supabase (alert resolutions + status logs)

let supabaseData       = [];
let supabaseStatusData = [];
let combinedData       = [];
let filteredData       = [];
let currentPage        = 1;
const PER_PAGE         = 7;

// Thresholds (must match Flutter app)
const TEMP_MIN  = 25.0, TEMP_MAX  = 30.0;
const HUMID_MIN = 50.0, HUMID_MAX = 60.0;
const UV_MAX    = 500.0;

// ── Supabase client ────────────────────────────────────────────────
const { createClient } = supabase;
const client = createClient(
  'https://elhshkzfiqmyisxavnsh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k'
);

/* ═══════════════════════════════════════════════
   USER LOOKUP HELPERS
═══════════════════════════════════════════════ */

const _userCache = {};

async function getUserNameByUserId(userIdBigint) {
  if (!userIdBigint || userIdBigint === '—') return '—';
  const key = `uid_${userIdBigint}`;
  if (_userCache[key]) return _userCache[key];
  try {
    const { data } = await client
      .from('users')
      .select('first_name, last_name, user_id')
      .eq('user_id', userIdBigint)
      .maybeSingle();
    const name = data ? `${data.first_name || ''} ${data.last_name || ''}`.trim() : '—';
    _userCache[key] = name;
    return name;
  } catch { return '—'; }
}

/* ═══════════════════════════════════════════════
   SUPABASE — fetch alert resolutions
═══════════════════════════════════════════════ */

async function loadSupabaseResolutions() {
  try {
    const { data, error } = await client
      .from('notification_acknowledgements')
      .select(`
        id,
        acknowledged_at,
        acknowledged_by,
        notifications (
          id,
          sensor_type,
          category,
          reading_value,
          threshold_value,
          triggered_at
        )
      `)
      .order('acknowledged_at', { ascending: false });

    if (error) { console.error('Resolutions fetch error:', error); return; }

    // acknowledged_by is a bigint (users.user_id)
    const rows = data || [];
    const nameMap = {};
    const uniqueIds = [...new Set(rows.map(r => r.acknowledged_by).filter(Boolean))];
    await Promise.all(uniqueIds.map(async uid => {
      nameMap[uid] = await getUserNameByUserId(uid);
    }));

    supabaseData = rows.map(row => {
      const dt      = new Date(row.acknowledged_at);
      const dateStr = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });

      const n         = row.notifications || {};
      const rawSensor = n.sensor_type || '—';
      const sensorLabel = rawSensor !== '—'
        ? rawSensor.charAt(0).toUpperCase() + rawSensor.slice(1)
        : '—';

      return {
        id:         `supa_${row.id}`,
        source:     'supabase',
        date:       dateStr,
        time:       timeStr,
        name:       nameMap[row.acknowledged_by] || '—',
        userId:     row.acknowledged_by || '—',
        action:     'Resolved Alert',
        category:   capitalise(n.category || '—'),
        sensorType: sensorLabel,
      };
    });

    mergeAndRender();
  } catch (err) {
    console.error('Unexpected error loading resolutions:', err);
  }
}

/* ═══════════════════════════════════════════════
   SUPABASE — fetch status logs
═══════════════════════════════════════════════ */

async function loadSupabaseStatusLogs() {
  try {
    const { data, error } = await client
      .from('status_logs')
      .select('id, logged_at, logged_by, temperature, humidity, uv_index, notes')
      .order('logged_at', { ascending: false });

    if (error) { console.error('Status logs fetch error:', error); return; }

    const rows = data || [];
    const detailsMap = {};
    const uniqueIds = [...new Set(rows.map(r => r.logged_by).filter(Boolean))];

    await Promise.all(uniqueIds.map(async uuid => {
      try {
        // Match auth UUID to users.id
        const { data: u } = await client
          .from('users')
          .select('first_name, last_name, user_id')
          .eq('id', uuid)
          .maybeSingle();

        if (u) {
          const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown User';
          detailsMap[uuid] = { name, userId: u.user_id ?? '—' };
        } else {
          detailsMap[uuid] = { name: 'Unknown User', userId: '—' };
        }
      } catch {
        detailsMap[uuid] = { name: 'Unknown User', userId: '—' };
      }
    }));

    supabaseStatusData = rows.map(row => {
      const dt      = new Date(row.logged_at);
      const dateStr = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });

      const t   = row.temperature != null ? parseFloat(row.temperature) : null;
      const hum = row.humidity    != null ? parseFloat(row.humidity)    : null;
      const uv  = row.uv_index    != null ? parseFloat(row.uv_index)    : null;

      const alerts = [];
      if (t   != null && (t   < TEMP_MIN  || t   > TEMP_MAX))  alerts.push('Temperature');
      if (hum != null && (hum < HUMID_MIN || hum > HUMID_MAX)) alerts.push('Humidity');
      if (uv  != null &&  uv  > UV_MAX)                        alerts.push('UV Index');

      const isAlert    = alerts.length > 0;
      const category   = isAlert ? 'Alert' : 'Normal';
      const sensorType = isAlert ? alerts.join(', ') : '—';

      const details = detailsMap[row.logged_by] || { name: 'Unknown User', userId: '—' };

      return {
        id:         `supa_${row.id}`,
        source:     'supabase_status',
        date:       dateStr,
        time:       timeStr,
        name:       details.name,
        userId:     details.userId,
        action:     'Manually Logged Readings',
        category,
        sensorType,
      };
    });

    mergeAndRender();
  } catch (err) {
    console.error('Unexpected error loading status logs:', err);
  }
}

function capitalise(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/* ═══════════════════════════════════════════════
   MERGE
═══════════════════════════════════════════════ */

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
  let [h, m]  = parts[0].split(':').map(Number);
  const ampm  = parts[1] || '';
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h  = 0;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════
   TABLE RENDERING
═══════════════════════════════════════════════ */

function categoryBadge(category) {
  const map = {
    'Advisory': { bg: '#dbeafe', color: '#1d4ed8' },
    'Warning':  { bg: '#fef3c7', color: '#d97706' },
    'Critical': { bg: '#fee2e2', color: '#dc2626' },
    'Normal':   { bg: '#d1fae5', color: '#065f46' },
    'Alert':    { bg: '#fee2e2', color: '#dc2626' },
  };
  const style = map[category];
  if (!style) return `<span style="color:var(--text-secondary)">—</span>`;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:${style.bg};color:${style.color};">${category}</span>`;
}

function actionBadge(action) {
  if (action === 'Resolved Alert') {
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:#d1fae5;color:#065f46;">Resolved Alert</span>`;
  } else if (action === 'Manually Logged Readings') {
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:#e0f2fe;color:#0369a1;">Manually Logged Readings</span>`;
  } else {
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:#ede9fe;color:#5b21b6;">${action}</span>`;
  }
}

function renderTable() {
  const tbody      = document.getElementById('audit-table-body');
  const emptyState = document.getElementById('empty-state');
  const start      = (currentPage - 1) * PER_PAGE;
  const pageData   = filteredData.slice(start, start + PER_PAGE);

  tbody.innerHTML = '';

  if (filteredData.length === 0) {
    tbody.style.display      = 'none';
    emptyState.style.display = 'block';
  } else {
    tbody.style.display      = '';
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

  document.getElementById('record-count').textContent =
    `${filteredData.length} Record${filteredData.length !== 1 ? 's' : ''}`;
  renderPagination();
}

function renderPagination() {
  const pg    = document.getElementById('pagination');
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

/* ═══════════════════════════════════════════════
   FILTERING
═══════════════════════════════════════════════ */

function applyFilter() {
  const mf = document.getElementById('month-filter').value;
  const yf = document.getElementById('year-filter').value;
  filteredData = combinedData.filter(r => {
    const d = new Date(r.date);
    return (mf === 'all' || d.getMonth()    === parseInt(mf)) &&
           (yf === 'all' || d.getFullYear() === parseInt(yf));
  });
  currentPage = 1;
  renderTable();
}

function resetFilter() {
  document.getElementById('month-filter').value = 'all';
  document.getElementById('year-filter').value  = 'all';
  filteredData = [...combinedData];
  currentPage  = 1;
  renderTable();
}

document.getElementById('apply-filter').onclick = applyFilter;
document.getElementById('reset-filter').onclick  = resetFilter;

/* ═══════════════════════════════════════════════
   EXPORT CSV
═══════════════════════════════════════════════ */

function exportCSV() {
  let csv = 'User ID,Date,Time,Name,Action Made,Category,Sensor Type\n';
  filteredData.forEach(r => {
    csv += `"${r.userId}","${formatDate(r.date)}","${r.time}","${r.name}","${r.action}","${r.category}","${r.sensorType || '—'}"\n`;
  });
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `audit_trail_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

document.getElementById('export-btn').onclick = exportCSV;

/* ═══════════════════════════════════════════════
   DELETE CONFIRMATION
═══════════════════════════════════════════════ */

const confirmModal = document.getElementById('confirm-modal');
let deleteRecordId = null;

function openDeleteConfirm(id) {
  deleteRecordId = id;
  confirmModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDeleteConfirm() {
  confirmModal.classList.remove('open');
  document.body.style.overflow = '';
  deleteRecordId = null;
}

document.getElementById('confirm-cancel').onclick = closeDeleteConfirm;
confirmModal.addEventListener('click', e => { if (e.target === confirmModal) closeDeleteConfirm(); });
document.getElementById('confirm-delete').onclick = async function () {
  if (deleteRecordId) closeDeleteConfirm();
};

/* ═══════════════════════════════════════════════
   REALTIME
═══════════════════════════════════════════════ */

function initRealtime() {
  client
    .channel('audit-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'status_logs' }, () => {
      loadSupabaseStatusLogs();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notification_acknowledgements' }, () => {
      loadSupabaseResolutions();
    })
    .subscribe((status) => {
      console.log('Realtime status:', status);
    });
}

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  await loadSupabaseResolutions();
  await loadSupabaseStatusLogs();
  initRealtime();
});
