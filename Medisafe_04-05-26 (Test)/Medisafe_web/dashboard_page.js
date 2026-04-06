import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://elhshkzfiqmyisxavnsh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const TABLE_NAME = "sensors";
const VISIBLE_POINTS = 20;

let labelCounter = 1;
let lastRowId = 0;

function isTempCritical(value){
  return value < 24 || value > 30;
}

function isHumidCritical(value){
  return value > 60;
}

function isUVCritical(value){
  return value >= 6 && value <= 7;
}

const alert = "#A4161A";

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 0 },
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { font: { size: 14 }, color: "#000" }, grid: { display: false } },
    y: { beginAtZero: true, ticks: { font: { size: 14 }, color: "#000" } }
  }
};

const tempChart = new Chart(document.getElementById("tempChart").getContext("2d"), {
  type: "line",
  data: { labels: [], 
    datasets: [{ 
      data: [], 
      borderColor: "red", 
      backgroundColor: "rgba(255,0,0,0.15)", 
      tension: 0.3, 
      pointBackgroundColor: (context) => { //pag na cross yung threshold magiging white siya
        const value = context.raw;
        return isTempCritical(value) ? "#F77F00" : "white";
      },
      pointBorderColor: (context) => {
        const value = context.raw;
        return isTempCritical(value) ? "#F77F00" : "#fff"
      },
      pointBorderWidth: 2,
      pointRadius: 5,
      segment: { //nag dagdag na rin ako ng dynamic line segment coloring
        borderColor: (context) => {
          const value = context.p1.parsed.y;
          return isTempCritical(value) ? alert : "red";
        }
      },
    }] 
  },
  options: baseOptions,
});

const humidityChart = new Chart(document.getElementById("humidityChart").getContext("2d"), {
  type: "line",
  data: { 
    labels: [], 
    datasets: [{ 
      data: [], 
      borderColor: "blue", 
      backgroundColor: "rgba(0,0,255,0.15)", 
      tension: 0.3,
      pointBackgroundColor: (context) => {
        const value = context.raw;
        return isHumidCritical(value) ? "blue" : "blue";
      },
      pointBorderColor: (context) => {
        const value = context.raw;
        return isHumidCritical(value) ? "blue" : "blue";
      },
      pointBorderWidth: 2,
      pointRadius: 5,
      segment: {
        borderColor: (context) => {
          const value = context.p1.parsed.y;
          return isHumidCritical(value) ? alert : "blue";
        }
      }
    }] 
  },
  options: baseOptions
});

const uvChart = new Chart(document.getElementById("uvChart").getContext("2d"), {
  type: "line",
  data: { 
    labels: [], 
    datasets: [{ 
      data: [], 
      borderColor: "yellow", 
      backgroundColor: "rgba(219, 231, 43, 0.34)", 
      tension: 0.3,
      pointBackgroundColor: (context) => {
        const value = context.raw;
        return isUVCritical(value) ? "yellow" : "yellow";
      },
      pointBorderColor: (context) => {
        const value = context.raw;
        return isUVCritical(value)? "yellow" : "fff";
      },
      pointBorderWidth: 2,
      pointRadius: 5,
      segment:{
        borderColor: (context) => {
          const value = context.p1.parsed.y;
          return isUVCritical(value) ? alert : "yellow";
        }
      }
    }] 
  },
  options: baseOptions
});

function updateMetricCards(row) {
  const tempCard = document.querySelector(".metric-card.temperature .metric-value");
  const humidityCard = document.querySelector(".metric-card.humidity .metric-value");
  const uvCard = document.querySelector(".metric-card.uv .metric-value");
  const uvRawCard = document.querySelector(".metric-card.uvRaw .metric-value");

  if (tempCard) tempCard.textContent = `${row.temperature}°C`;
  if (humidityCard) humidityCard.textContent = `${row.humidity}%`;
  if (uvCard) uvCard.textContent = `${(row.uv_index).toFixed(2)}`;//Current Value card, dito babaguhin if gusto niyo ibahin from uv_index to uv_raw
  if (uvRawCard) uvRawCard.textContent = `${row.uv_raw}`;
}

function addRow(row) {
  const label = labelCounter++;
  
  tempChart.data.labels.push(label);
  tempChart.data.datasets[0].data.push(Number(row.temperature));

  humidityChart.data.labels.push(label);
  humidityChart.data.datasets[0].data.push(Number(row.humidity));

  uvChart.data.labels.push(label);
  uvChart.data.datasets[0].data.push(Number(row.uv_index)); //baguhin to doon sa column name sa Supabase

  while (tempChart.data.labels.length > VISIBLE_POINTS) {
    tempChart.data.labels.shift();
    tempChart.data.datasets[0].data.shift();
    humidityChart.data.labels.shift();
    humidityChart.data.datasets[0].data.shift();
    uvChart.data.labels.shift();
    uvChart.data.datasets[0].data.shift();
  }

  tempChart.update();
  humidityChart.update();
  uvChart.update();

  updateMetricCards(row);

  lastRowId = row.id;
}

async function loadInitialData() {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("id, temperature, humidity, uv_index, uv_raw")//pati rin dito para gumana ng maayos para sa metric card
      .order("id", { ascending: false })
      .limit(VISIBLE_POINTS);

    if (error) throw error;
    if (!data || data.length === 0) return;

    const rows = data.reverse();
    rows.forEach(addRow);

    lastRowId = rows[rows.length - 1].id;
  } catch (err) {
    console.error("Error loading initial data:", err);
  }
}

function subscribeRealtime() {
  supabase
    .channel("sensors-realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: TABLE_NAME },
      payload => {
        const newRow = payload.new;
        if (newRow.id > lastRowId) addRow(newRow);
      }
    )
    .subscribe();
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

    // Update DOM Elements with the fetched numbers
    document.getElementById('ai-temp').textContent = `${pred.predicted_temp}°C`;
    document.getElementById('ai-hum').textContent = `${pred.predicted_hum}%`;
    document.getElementById('ai-uv').textContent = `${pred.predicted_uv}`;

    // Update Trends & Apply the correct CSS color class
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
  
  // Clear old color classes
  el.classList.remove('trend-rising', 'trend-falling', 'trend-stable');
  
  // Apply new color class based on the text from Python
  if (trendText.includes("RISING")) {
    el.classList.add('trend-rising');
  } else if (trendText.includes("FALLING")) {
    el.classList.add('trend-falling');
  } else {
    el.classList.add('trend-stable');
  }
}

async function initDashboard() {
  await loadInitialData();
  subscribeRealtime();
  
  // Fetch AI Prediction immediately on load
  await fetchLatestPrediction();
  
  // Refresh the AI Prediction every 15 seconds to match the Python script
  setInterval(fetchLatestPrediction, 15000); 
}

initDashboard();

// Expose logout helper for the inline script in dashboard_page.html
window.mediaSafeLogout = async function() {
    try {
        await supabase.auth.signOut();
    } catch (err) {
        console.error('Logout error:', err);
    }
    window.location.href = 'login_page.html';
};
