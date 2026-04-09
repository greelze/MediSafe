const MONITORING_SUPABASE_URL = 'https://elhshkzfiqmyisxavnsh.supabase.co';
const MONITORING_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k';
const TABLE_NAME = 'status_logs';

const { createClient } = supabase;
const monitoringClient = createClient(MONITORING_SUPABASE_URL, MONITORING_SUPABASE_KEY, {
    realtime: { params: { eventsPerSecond: 10 } }
});

let userMap = {};
let realtimeChannel = null;

function formatDateToLocal(dateString) {
    if (!dateString) return '—';
    const dt = new Date(dateString);
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTimeToLocal(dateString) {
    if (!dateString) return '—';
    const dt = new Date(dateString);
    return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.backgroundColor = type === 'error' ? 'rgba(220,38,38,0.85)' : 'rgba(16,185,129,0.9)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2600);
}

function buildRow(row) {
    const user = userMap[row.logged_by] || 'Unknown';
    const tr = document.createElement('tr');
    tr.dataset.id = row.id;
    tr.innerHTML = `
        <td>${user}</td>
        <td>${formatDateToLocal(row.logged_at)}</td>
        <td>${formatTimeToLocal(row.logged_at)}</td>
        <td>${(row.temperature !== null && row.temperature !== undefined) ? `${row.temperature.toFixed(1)} °C` : '—'}</td>
        <td>${(row.humidity !== null && row.humidity !== undefined) ? `${row.humidity.toFixed(1)} %` : '—'}</td>
        <td>${(row.uv_index !== null && row.uv_index !== undefined) ? row.uv_index.toFixed(0) : '—'}</td>
        <td>${row.notes ? row.notes : '—'}</td>
    `;
    return tr;
}

function updateCount() {
    const tbody = document.getElementById('monitoring-table-body');
    const countSpan = document.getElementById('record-count');
    const emptyState = document.getElementById('empty-state');
    const count = tbody.querySelectorAll('tr').length;
    countSpan.textContent = `${count} entr${count === 1 ? 'y' : 'ies'}`;
    emptyState.style.display = count === 0 ? 'block' : 'none';
}

async function fetchUsers() {
    const { data: users, error } = await monitoringClient
        .from('users')
        .select('id, first_name, last_name');
    if (!error && users) {
        users.forEach(u => { userMap[u.id] = `${u.first_name} ${u.last_name}`; });
    }
}

async function loadMonitoringStatusLogs() {
    const tbody = document.getElementById('monitoring-table-body');
    const countSpan = document.getElementById('record-count');

    tbody.innerHTML = '';
    countSpan.textContent = 'Loading...';

    try {
        await fetchUsers();

        const { data: logs, error: logsError } = await monitoringClient
            .from(TABLE_NAME)
            .select('id, logged_at, temperature, humidity, uv_index, notes, logged_by')
            .order('logged_at', { ascending: false });

        if (logsError) {
            showToast(`Failed to load status logs: ${logsError.message}`, 'error');
            countSpan.textContent = 'Error';
            return;
        }

        logs?.forEach(row => tbody.appendChild(buildRow(row)));
        updateCount();

    } catch (err) {
        console.error('Load error:', err);
        showToast('Error loading monitoring logs.', 'error');
        countSpan.textContent = 'Error';
    }
}

function subscribeRealtime() {
    if (realtimeChannel) {
        monitoringClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }

    realtimeChannel = monitoringClient
        .channel('status_logs_realtime')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: TABLE_NAME },
            async (payload) => {
                const eventType = payload.eventType || payload.event;
                const tbody = document.getElementById('monitoring-table-body');

                if (eventType === 'INSERT') {
                    const newRow = payload.new;
                    if (newRow.logged_by && !userMap[newRow.logged_by]) await fetchUsers();

                    const tr = buildRow(newRow);
                    tbody.insertBefore(tr, tbody.firstChild);

                    tr.style.transition = 'background-color 1.5s ease';
                    tr.style.backgroundColor = 'rgba(16,185,129,0.15)';
                    setTimeout(() => tr.style.backgroundColor = '', 2000);

                    updateCount();
                    showToast('New status log entry received.');

                } else if (eventType === 'UPDATE') {
                    const existing = tbody.querySelector(`tr[data-id="${payload.new.id}"]`);
                    if (existing) {
                        const newTr = buildRow(payload.new);
                        tbody.replaceChild(newTr, existing);
                        newTr.style.transition = 'background-color 1.5s ease';
                        newTr.style.backgroundColor = 'rgba(59,130,246,0.15)';
                        setTimeout(() => newTr.style.backgroundColor = '', 2000);
                    }
                    updateCount();

                } else if (eventType === 'DELETE') {
                    const deleted = tbody.querySelector(`tr[data-id="${payload.old.id}"]`);
                    if (deleted) deleted.remove();
                    updateCount();
                }
            }
        )
        .subscribe((status, err) => {
            if (status === 'CHANNEL_ERROR') {
                console.error('[Realtime] Channel error:', err);
                showToast('Real-time error. Retrying...', 'error');
                setTimeout(subscribeRealtime, 3000);
            } else if (status === 'TIMED_OUT') {
                console.warn('[Realtime] Timed out. Retrying...');
                setTimeout(subscribeRealtime, 3000);
            }
        });
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadMonitoringStatusLogs();
    subscribeRealtime();

    window.addEventListener('beforeunload', () => {
        if (realtimeChannel) monitoringClient.removeChannel(realtimeChannel);
    });
});
