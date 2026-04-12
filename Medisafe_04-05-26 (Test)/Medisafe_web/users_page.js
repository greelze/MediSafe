/* ═══════════════════════════════════════════════════════════
   users_page.js  —  MediSafe User Management
   ═══════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://elhshkzfiqmyisxavnsh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k';
const EDGE_FN_URL  = `${SUPABASE_URL}/functions/v1/send-user-email`;

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── State ─────────────────────────────────────────────── */
let allUsers    = [];
let activeTab   = 'all';
let searchQuery = '';
let currentPage = 1;
const PAGE_SIZE = 6;

/* ── Helpers ────────────────────────────────────────────── */
function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

function getInitials(first, last) {
  return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || '?';
}

function shortId(id) {
  if (!id) return '—';
  const s = String(id);
  return s.length > 16 ? s.slice(0, 8) + '…' + s.slice(-4) : s;
}

/* ── Send email via Edge Function ───────────────────────── */
async function sendEmail(type, user) {
  const email = user.email;
  const name  = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
  if (!email) {
    showToast('No email address on file for this user.', 'warning');
    return false;
  }
  try {
    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ type, to: email, name }),
    });
    const data = await res.json();
    if (!res.ok) { console.error('Email failed:', data); showToast('Email could not be sent — action still completed.', 'warning'); return false; }
    return true;
  } catch (err) {
    console.error('Email error:', err);
    showToast('Email could not be sent — action still completed.', 'warning');
    return false;
  }
}

/* ── Toast ──────────────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3500);
}

/* ── Confirm Modal ──────────────────────────────────────── */
function showConfirm(icon, title, msg, dangerLabel = 'Confirm') {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirmOverlay');
    document.getElementById('confirmIcon').textContent  = icon;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent   = msg;
    document.getElementById('confirmOk').textContent    = dangerLabel;
    overlay.classList.add('active');
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    function cleanup() {
      overlay.classList.remove('active');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
    }
    function onOk()     { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', e => { if (e.target === overlay) onCancel(); }, { once: true });
  });
}

/* ── Notification Preview Modal ─────────────────────────── */
function showNotifPreview(user) {
  return new Promise(resolve => {
    const overlay = document.getElementById('notifOverlay');
    const preview = document.getElementById('notifPreview');
    const name  = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
    const email = user.email || '(no email on file)';
    preview.innerHTML = `
      <strong>To:</strong> ${name} &lt;${email}&gt;<br>
      <strong>Subject:</strong> ✅ Your MediSafe account has been approved!<br><br>
      Dear <strong>${name}</strong>,<br><br>
      We're pleased to inform you that your MediSafe account has been reviewed and
      <strong style="color:#10b981;">approved</strong> by an administrator.<br><br>
      You can now log in and access all features of the MediSafe platform.<br><br>
      — <em>The MediSafe Admin Team</em>
    `;
    overlay.classList.add('active');
    const confirm = document.getElementById('notifConfirm');
    const cancel  = document.getElementById('notifCancel');
    const close   = document.getElementById('notifClose');
    function cleanup() {
      overlay.classList.remove('active');
      confirm.removeEventListener('click', onConfirm);
      cancel.removeEventListener('click', onCancel);
      close.removeEventListener('click', onCancel);
    }
    function onConfirm() { cleanup(); resolve(true); }
    function onCancel()  { cleanup(); resolve(false); }
    confirm.addEventListener('click', onConfirm);
    cancel.addEventListener('click', onCancel);
    close.addEventListener('click', onCancel);
  });
}

/* ── Shimmer loader ─────────────────────────────────────── */
function showShimmer() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = Array.from({ length: PAGE_SIZE }, () => `
    <tr class="shimmer-row">
      <td><div class="shimmer" style="width:110px"></div></td>
      <td>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="shimmer" style="width:36px;height:36px;border-radius:50%;flex-shrink:0;"></div>
          <div class="shimmer" style="width:130px"></div>
        </div>
      </td>
      <td><div class="shimmer" style="width:170px"></div></td>
      <td><div class="shimmer" style="width:80px;height:22px;border-radius:12px;"></div></td>
      <td><div class="shimmer" style="width:110px"></div></td>
      <td>
        <div style="display:flex;gap:8px;">
          <div class="shimmer" style="width:76px;height:28px;border-radius:8px;"></div>
          <div class="shimmer" style="width:64px;height:28px;border-radius:8px;"></div>
        </div>
      </td>
    </tr>
  `).join('');
  document.getElementById('paginationWrap').style.display = 'none';
}

/* ── Load users ─────────────────────────────────────────── */
async function loadUsers() {
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.classList.add('spinning');
  showShimmer();
  document.getElementById('recordCount').textContent = 'Loading…';

  const { data, error } = await sb
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  refreshBtn.classList.remove('spinning');

  if (error) {
    showToast('Failed to load users: ' + error.message, 'error');
    document.getElementById('usersTableBody').innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Could not load users</div>
          <div class="empty-sub">${error.message}</div>
        </div>
      </td></tr>`;
    document.getElementById('recordCount').textContent = 'Error';
    return;
  }

  allUsers = data || [];
  updateStats();
  currentPage = 1;   // reset to page 1 on every fresh load
  renderTable();
}

/* ── Stats ──────────────────────────────────────────────── */
function updateStats() {
  const total    = allUsers.length;
  const approved = allUsers.filter(u => u.is_approved).length;
  const pending  = allUsers.filter(u => !u.is_approved).length;
  const weekAgo  = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const recent   = allUsers.filter(u => u.created_at && new Date(u.created_at) >= weekAgo).length;

  document.getElementById('stat-total').textContent    = total;
  document.getElementById('stat-approved').textContent = approved;
  document.getElementById('stat-pending').textContent  = pending;
  document.getElementById('stat-recent').textContent   = recent;
  document.getElementById('badge-pending').textContent  = pending;
  document.getElementById('badge-approved').textContent = approved;
}

/* ── Filter + search ────────────────────────────────────── */
function getVisibleUsers() {
  let users = allUsers;
  if (activeTab === 'pending')  users = users.filter(u => !u.is_approved);
  if (activeTab === 'approved') users = users.filter(u =>  u.is_approved);
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    users = users.filter(u => {
      const name  = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      const id    = String(u.user_id || '').toLowerCase();
      const email = String(u.email   || '').toLowerCase();
      return name.includes(q) || id.includes(q) || email.includes(q);
    });
  }
  return users;
}

/* ── Pagination renderer ────────────────────────────────── */
function renderPagination(totalItems) {
  const wrap     = document.getElementById('paginationWrap');
  const info     = document.getElementById('paginationInfo');
  const controls = document.getElementById('paginationControls');
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);

  // Hide pagination when only 1 page
  if (totalPages <= 1) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';

  const from = (currentPage - 1) * PAGE_SIZE + 1;
  const to   = Math.min(currentPage * PAGE_SIZE, totalItems);
  info.textContent = `Showing ${from}–${to} of ${totalItems} users`;

  // Build page number buttons with ellipsis
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3)              pages.push('…');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  controls.innerHTML = `
    <button class="page-btn page-btn-prev" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹ Prev</button>
    ${pages.map(p =>
      p === '…'
        ? `<span class="page-ellipsis">…</span>`
        : `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`
    ).join('')}
    <button class="page-btn page-btn-next" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next ›</button>
  `;

  controls.querySelectorAll('.page-btn:not(:disabled):not(.active)').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = Number(btn.dataset.page);
      renderTable();
      // Scroll table back into view smoothly
      document.querySelector('.users-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

/* ── Render table (with pagination) ────────────────────── */
function renderTable() {
  const allVisible = getVisibleUsers();
  const titles = { all: 'All Users', pending: 'Pending Approval', approved: 'Approved Users' };
  document.getElementById('tableTitle').textContent  = titles[activeTab];
  document.getElementById('recordCount').textContent =
    `${allVisible.length} record${allVisible.length !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('usersTableBody');

  if (!allVisible.length) {
    const msgs = {
      all:      ['👤', 'No users found',       'No users match your search.'],
      pending:  ['⏳', 'No pending approvals',  'All users have been reviewed.'],
      approved: ['✅', 'No approved users yet', 'Approve a pending user to see them here.'],
    };
    const [icon, title, sub] = msgs[activeTab];
    tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-icon">${icon}</div>
          <div class="empty-title">${title}</div>
          <div class="empty-sub">${sub}</div>
        </div>
      </td></tr>`;
    document.getElementById('paginationWrap').style.display = 'none';
    return;
  }

  // Clamp currentPage in case filtered results shrank
  const totalPages = Math.ceil(allVisible.length / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = totalPages;

  // Slice the page
  const pageUsers = allVisible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  tbody.innerHTML = pageUsers.map(user => {
    const name       = `${user.first_name || ''} ${user.last_name || ''}`.trim() || '—';
    const initials   = getInitials(user.first_name, user.last_name);
    const isApproved = !!user.is_approved;
    const email      = user.email || '—';

    const badge = isApproved
      ? `<span class="badge badge-approved"><span class="badge-dot"></span>Approved</span>`
      : `<span class="badge badge-pending"><span class="badge-dot"></span>Pending</span>`;

    const actions = isApproved
      ? `<div class="action-btns">
           <button class="action-delete" onclick="handleDelete('${user.user_id}')">✕ Delete</button>
         </div>`
      : `<div class="action-btns">
           <button class="action-approve" onclick="handleApprove('${user.user_id}')">✓ Approve</button>
           <button class="action-reject"  onclick="handleReject('${user.user_id}')">✕ Reject</button>
         </div>`;

    const emailCell = email !== '—'
      ? `<span class="cell-email-text">${email}</span>`
      : `<span style="color:var(--text-secondary)">—</span>`;

    return `
      <tr data-id="${user.user_id}">
        <td class="cell-id" title="${user.user_id}">${shortId(user.user_id)}</td>
        <td>
          <div class="user-name-cell">
            <div class="user-avatar ${isApproved ? '' : 'pending'}">${initials}</div>
            <span class="user-full-name">${name}</span>
          </div>
        </td>
        <td class="cell-email">${emailCell}</td>
        <td>${badge}</td>
        <td class="cell-date">${formatDate(user.created_at)}</td>
        <td>${actions}</td>
      </tr>`;
  }).join('');

  renderPagination(allVisible.length);
}

/* ── Row busy state ─────────────────────────────────────── */
function setRowBusy(userId, busy) {
  const row = document.querySelector(`tr[data-id="${userId}"]`);
  if (!row) return;
  row.querySelectorAll('button').forEach(b => { b.disabled = busy; });
}

/* ── Actions ────────────────────────────────────────────── */
async function handleApprove(userId) {
  const user = allUsers.find(u => String(u.user_id) === String(userId));
  if (!user) return;

  const goAhead = await showNotifPreview(user);
  if (!goAhead) return;

  setRowBusy(userId, true);

  const { error } = await sb.from('users').update({ is_approved: true }).eq('user_id', userId);

  if (error) {
    setRowBusy(userId, false);
    showToast('Failed to approve user: ' + error.message, 'error');
    return;
  }

  const emailSent = await sendEmail('approved', user);
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  showToast(
    emailSent
      ? `${name} approved — confirmation email sent to ${user.email}.`
      : `${name} approved. (Email could not be sent.)`,
    emailSent ? 'success' : 'info'
  );
  await loadUsers();
}

async function handleReject(userId) {
  const user = allUsers.find(u => String(u.user_id) === String(userId));
  const name = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'this user';

  const ok = await showConfirm(
    '🚫', 'Reject Account',
    `Reject and permanently remove ${name}'s account? A rejection notification email will be sent to them.`,
    '✕ Reject & Remove'
  );
  if (!ok) return;

  setRowBusy(userId, true);
  if (user) await sendEmail('rejected', user);

  const { error } = await sb.from('users').delete().eq('user_id', userId);
  if (error) {
    setRowBusy(userId, false);
    showToast('Failed to reject user: ' + error.message, 'error');
  } else {
    showToast(`Account rejected — notification sent to ${user?.email || 'user'}.`, 'info');
    await loadUsers();
  }
}

async function handleDelete(userId) {
  const user = allUsers.find(u => String(u.user_id) === String(userId));
  const name = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'this user';

  const ok = await showConfirm(
    '⚠️', 'Delete Account',
    `Permanently delete ${name}'s account? This action cannot be undone.`,
    '🗑 Delete'
  );
  if (!ok) return;

  setRowBusy(userId, true);
  const { error } = await sb.from('users').delete().eq('user_id', userId);
  if (error) {
    setRowBusy(userId, false);
    showToast('Failed to delete user: ' + error.message, 'error');
  } else {
    showToast('User account deleted.', 'info');
    await loadUsers();
  }
}

/* ── Export CSV ─────────────────────────────────────────── */
function exportCSV() {
  const users = getVisibleUsers();   // export ALL visible, not just current page
  const rows = [
    ['User ID', 'First Name', 'Last Name', 'Email', 'Status', 'Joined Date'],
    ...users.map(u => [
      u.user_id    || '',
      u.first_name || '',
      u.last_name  || '',
      u.email      || '',
      u.is_approved ? 'Approved' : 'Pending',
      formatDate(u.created_at)
    ])
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `medisafe_users_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`
  });
  a.click();
  showToast('CSV exported successfully!', 'success');
}

/* ── Event listeners ────────────────────────────────────── */
document.querySelectorAll('.users-tab').forEach(tab => {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.users-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    activeTab = this.dataset.tab;
    currentPage = 1;   // reset page on tab switch
    renderTable();
  });
});

document.getElementById('searchInput').addEventListener('input', function () {
  searchQuery = this.value;
  currentPage = 1;   // reset page on new search
  renderTable();
});

document.getElementById('refreshBtn').addEventListener('click', loadUsers);
document.getElementById('exportUsersBtn').addEventListener('click', exportCSV);

/* ── Real-time subscription ─────────────────────────────── */
sb.channel('users-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => { loadUsers(); })
  .subscribe();

/* ── Init ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', loadUsers);
if (document.readyState !== 'loading') loadUsers();