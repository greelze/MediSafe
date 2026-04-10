const MONITORING_SUPABASE_URL = 'https://elhshkzfiqmyisxavnsh.supabase.co';
const MONITORING_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k';
const TABLE_NAME = 'status_logs';

const { createClient } = supabase;
const monitoringClient = createClient(MONITORING_SUPABASE_URL, MONITORING_SUPABASE_KEY);

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

async function loadMonitoringStatusLogs() {
    const tbody = document.getElementById('monitoring-table-body');
    const emptyState = document.getElementById('empty-state');
    const countSpan = document.getElementById('record-count');

    tbody.innerHTML = '';
    emptyState.style.display = 'none';
    countSpan.textContent = 'Loading...';

    try {
        // Step 1: Fetch status logs
        const { data: logs, error: logsError } = await monitoringClient
            .from(TABLE_NAME)
            .select('id, logged_at, temperature, humidity, uv_index, notes, logged_by')
            .order('logged_at', { ascending: false });

        if (logsError) {
            console.error('Supabase fetch error:', logsError);
            showToast(`Failed to load status logs: ${logsError.message || logsError.details || logsError}`, 'error');
            countSpan.textContent = 'Error';
            return;
        }

        if (!logs || logs.length === 0) {
            emptyState.style.display = 'block';
            countSpan.textContent = '0 entries';
            return;
        }

        // Step 2: Fetch all users and build a lookup map { id -> full name }
        const { data: users, error: usersError } = await monitoringClient
            .from('users')
            .select('id, first_name, last_name');

        const userMap = {};
        if (!usersError && users) {
            users.forEach(u => {
                userMap[u.id] = `${u.first_name} ${u.last_name}`;
            });
        }

        // Step 3: Render rows
        logs.forEach(row => {
            const user = userMap[row.logged_by] || 'Unknown';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user}</td>
                <td>${formatDateToLocal(row.logged_at)}</td>
                <td>${formatTimeToLocal(row.logged_at)}</td>
                <td>${(row.temperature !== null && row.temperature !== undefined) ? `${row.temperature.toFixed(1)} °C` : '—'}</td>
                <td>${(row.humidity !== null && row.humidity !== undefined) ? `${row.humidity.toFixed(1)} %` : '—'}</td>
                <td>${(row.uv_index !== null && row.uv_index !== undefined) ? row.uv_index.toFixed(0) : '—'}</td>
                <td>${row.notes ? row.notes : '—'}</td>
            `;
            tbody.appendChild(tr);
        });

        countSpan.textContent = `${logs.length} entr${logs.length === 1 ? 'y' : 'ies'}`;
    } catch (err) {
        console.error('Unexpected error loading logs:', err);
        showToast('Error loading monitoring logs.', 'error');
        countSpan.textContent = 'Error';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadMonitoringStatusLogs();
    document.getElementById('refresh-btn').addEventListener('click', loadMonitoringStatusLogs);
});
