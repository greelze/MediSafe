import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://elhshkzfiqmyisxavnsh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
window.supabase = supabase; // expose for onclick handlers

// ── Pagination State ──────────────────────────────────────────────────────────
const LOCATIONS_PER_PAGE = 7;
let currentPage = 1;
let allLocations = [];

// ── Load All Locations from Supabase ─────────────────────────────────────────
async function loadDashboardData() {
  const { data: locations, error: locError } = await supabase
    .from('location')
    .select('*');

  if (locError) return;

  allLocations = locations;
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
    allLocations = updatedLocs;
    currentPage = Math.ceil(allLocations.length / LOCATIONS_PER_PAGE);
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

// ── DOMContentLoaded: Wire up modals and delegated listeners ──────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Load location data and subscribe to live updates
  loadDashboardData();
  subscribeToSensorUpdates();

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
});
