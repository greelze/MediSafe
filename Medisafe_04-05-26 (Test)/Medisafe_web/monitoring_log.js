const MONITORING_SUPABASE_URL = 'https://elhshkzfiqmyisxavnsh.supabase.co';
const MONITORING_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k';
const TABLE_NAME = 'status_logs';

const { createClient } = supabase;
const monitoringClient = createClient(MONITORING_SUPABASE_URL, MONITORING_SUPABASE_KEY);

let allLogs = [];
let userMap = {};
let currentPage = 1;
const PER_PAGE = 10;

async function loadInitialData() {
    try {
        // 1. Fetch Users first for the lookup
        const { data: users } = await monitoringClient.from('users').select('id, first_name, last_name');
        if (users) {
            users.forEach(u => userMap[u.id] = `${u.first_name} ${u.last_name}`);
        }

        // 2. Fetch Logs
        const { data: logs, error } = await monitoringClient
            .from(TABLE_NAME)
            .select('*')
            .order('logged_at', { ascending: false });

        if (error) throw error;

        allLogs = logs || [];
        renderTable();
    } catch (err) {
        console.error("Error loading data:", err);
    }
}

function renderTable() {
    const tbody = document.getElementById('monitoring-table-body');
    const countSpan = document.getElementById('record-count');
    const emptyState = document.getElementById('empty-state');
    const paginationContainer = document.getElementById('pagination');
    
    tbody.innerHTML = '';

    if (!allLogs || allLogs.length === 0) {
        emptyState.style.display = 'block';
        countSpan.textContent = '0 entries';
        paginationContainer.innerHTML = '';
        return;
    }

    emptyState.style.display = 'none';
    countSpan.textContent = `${allLogs.length} total entries`;

    // Pagination Calculation
    const start = (currentPage - 1) * PER_PAGE;
    const end = start + PER_PAGE;
    const paginatedItems = allLogs.slice(start, end);

    paginatedItems.forEach(row => {
        const userName = userMap[row.logged_by] || 'Unknown User';
        const tr = document.createElement('tr');
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
    const container = document.getElementById('pagination');
    const totalPages = Math.ceil(allLogs.length / PER_PAGE);
    container.innerHTML = '';

    if (totalPages <= 1) return;

    // Previous Button
    const prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.innerHTML = '←';
    prev.disabled = currentPage === 1;
    prev.onclick = () => { currentPage--; renderTable(); };
    container.appendChild(prev);

    // Page Buttons
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
            btn.textContent = i;
            btn.onclick = () => { currentPage = i; renderTable(); };
            container.appendChild(btn);
        } else if (Math.abs(i - currentPage) === 2) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            dots.style.padding = '0 8px';
            container.appendChild(dots);
        }
    }

    // Next Button
    const next = document.createElement('button');
    next.className = 'page-btn';
    next.innerHTML = '→';
    next.disabled = currentPage === totalPages;
    next.onclick = () => { currentPage++; renderTable(); };
    container.appendChild(next);
}

document.addEventListener('DOMContentLoaded', loadInitialData);
