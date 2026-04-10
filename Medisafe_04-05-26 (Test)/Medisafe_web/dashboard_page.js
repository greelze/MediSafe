import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://elhshkzfiqmyisxavnsh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const TABLE_NAME = "sensors";
const VISIBLE_POINTS = 10;

let lastRowId = 0;

// Critical Threshold Logic
const isTempCritical = (v) => v < 24 || v > 30;
const isHumidCritical = (v) => v > 60;
const isUVCritical = (v) => v >= 6 && v <= 7;
const alertColor = "#A4161A";

// Re-optimized Chart Options (Darker, Larger, No Slant)
const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { 
      ticks: { 
        font: { size: 12, weight: '500' }, 
        color: "#000",      // Darker font
        maxRotation: 0, 
        minRotation: 0,
        autoSkip: false,    // Show all 10
        maxTicksLimit: 10,
        padding: 8
      }, 
      grid: { display: false } 
    },
    y: { 
      beginAtZero: true, 
      ticks: { font: { size: 14 }, color: "#000" } 
    }
  }
};

// Bulletproof Segment Coloring (Prevents crash on single data points)
const getSegmentColor = (ctx, defaultCol, checkFn) => {
  if (!ctx.p1 || ctx.p1.parsed === undefined) return defaultCol;
  return checkFn(ctx.p1.parsed.y) ? alertColor : defaultCol;
};

// Formats recorded_id into [Date, Time] array for two-line display
function formatDateTimeLabel(val) {
  const d = new Date(val);
  if (isNaN(d.getTime())) return ["--", "--"];
  const dateStr = d.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return [dateStr, timeStr];
}

const tempChart = new Chart(document.getElementById("tempChart"), {
  type: "line",
  data: { labels: [], datasets: [{ 
    data: [], borderColor: "red", tension: 0.3, pointRadius: 6,
    pointBackgroundColor: (ctx) => isTempCritical(ctx.raw) ? "#F77F00" : "white",
    pointBorderColor: (ctx) => isTempCritical(ctx.raw) ? "#A4161A" : "red",
    pointBorderWidth: 2,
    segment: { borderColor: (ctx) => getSegmentColor(ctx, "red", isTempCritical) }
  }]},
  options: baseOptions
});

const humidityChart = new Chart(document.getElementById("humidityChart"), {
  type: "line",
  data: { labels: [], datasets: [{ 
    data: [], borderColor: "blue", tension: 0.3, pointRadius: 6,
    pointBackgroundColor: (ctx) => isHumidCritical(ctx.raw) ? "#A4161A" : "white",
    pointBorderColor: (ctx) => isHumidCritical(ctx.raw) ? "#A4161A" : "blue",
    pointBorderWidth: 2,
    segment: { borderColor: (ctx) => getSegmentColor(ctx, "blue", isHumidCritical) }
  }]},
  options: baseOptions
});

const uvChart = new Chart(document.getElementById("uvChart"), {
  type: "line",
  data: { labels: [], datasets: [{ 
    data: [], borderColor: "#EAB308", tension: 0.3, pointRadius: 6,
    pointBackgroundColor: (ctx) => isUVCritical(ctx.raw) ? "#A4161A" : "white",
    pointBorderColor: (ctx) => isUVCritical(ctx.raw) ? "#A4161A" : "#EAB308",
    pointBorderWidth: 2,
    segment: { borderColor: (ctx) => getSegmentColor(ctx, "#EAB308", isUVCritical) }
  }]},
  options: baseOptions
});

function updateMetricCards(row) {
  const t = document.querySelector(".metric-card.temperature .metric-value");
  const h = document.querySelector(".metric-card.humidity .metric-value");
  const u = document.querySelector(".metric-card.uv .metric-value");
  
  if (t) t.textContent = `${row.temperature}°C`;
  if (h) h.textContent = `${row.humidity}%`;
  if (u) u.textContent = `${Number(row.uv_index).toFixed(2)}`;
}

function addRow(row) {
  const label = formatDateTimeLabel(row.recorded_id);
  
  [tempChart, humidityChart, uvChart].forEach((chart, index) => {
    chart.data.labels.push(label);
    const val = index === 0 ? row.temperature : (index === 1 ? row.humidity : row.uv_index);
    chart.data.datasets[0].data.push(Number(val));

    if (chart.data.labels.length > VISIBLE_POINTS) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update();
  });

  updateMetricCards(row);
  lastRowId = row.id;
}

async function loadInitialData() {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("id, recorded_id, temperature, humidity, uv_index")
    .order("id", { ascending: false })
    .limit(VISIBLE_POINTS);

  if (!error && data) {
    data.reverse().forEach(addRow);
  }
}

function subscribeRealtime() {
  supabase.channel("sensors-realtime")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE_NAME }, 
    payload => {
      if (payload.new.id > lastRowId) addRow(payload.new);
    }).subscribe();
}

// --- AI PREDICTION LOGIC ---
async function fetchLatestPrediction() {
  try {
    const { data, error } = await supabase
      .from('ai_predictions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!data || data.length === 0) return;

    const pred = data[0];
    document.getElementById('ai-temp').textContent = `${pred.predicted_temp}°C`;
    document.getElementById('ai-hum').textContent = `${pred.predicted_hum}%`;
    document.getElementById('ai-uv').textContent = `${pred.predicted_uv}`;

    updateTrendLabel('ai-temp-trend', pred.temp_trend);
    updateTrendLabel('ai-hum-trend', pred.hum_trend);
    updateTrendLabel('ai-uv-trend', pred.uv_trend);
  } catch (err) {
    console.error("Error fetching AI prediction:", err);
  }
}

function updateTrendLabel(elementId, trendText) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = trendText;
  el.classList.remove('trend-rising', 'trend-falling', 'trend-stable');
  if (trendText.includes("RISING")) el.classList.add('trend-rising');
  else if (trendText.includes("FALLING")) el.classList.add('trend-falling');
  else el.classList.add('trend-stable');
}

async function initDashboard() {
  await loadInitialData();
  subscribeRealtime();
  await fetchLatestPrediction();
  setInterval(fetchLatestPrediction, 15000);
}

initDashboard();

window.mediaSafeLogout = async function() {
  try { await supabase.auth.signOut(); } catch (err) { console.error('Logout error:', err); }
  window.location.href = 'login_page.html';
};
