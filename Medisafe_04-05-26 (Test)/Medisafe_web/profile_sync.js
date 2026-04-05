/**
 * MediSafe — profile_sync.js
 * Fetches the real logged-in user's name + photo from Supabase
 * and syncs them to the sidebar on every page automatically.
 *
 * How it works:
 *   login_page.html saves → localStorage.setItem('currentUserEmail', email)
 *   profile_sync.js reads → currentUserEmail
 *   profile_sync.js queries → users table WHERE email = currentUserEmail
 *   profile_sync.js updates → #sidebarProfileImage and #sidebarUserName
 */

(function () {

    // ================================
    // SUPABASE CONFIGURATION
    // ================================
    const SUPABASE_URL      = "https://elhshkzfiqmyisxavnsh.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k";

    let _client = null;

    function getClient() {
        if (!_client && window.supabase && typeof window.supabase.createClient === "function") {
            _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        return _client;
    }

    // ================================
    // SESSION HELPERS
    // ================================
    function getCurrentUserEmail() {
        return localStorage.getItem("currentUserEmail");
    }

    function getCurrentUserId() {
        return localStorage.getItem("currentUserId");
    }

    function getProfileKey() {
        const id = getCurrentUserId();
        return id ? "userProfile_" + id : "userProfile_guest";
    }

    // ================================
    // THEME COLOR FOR SIDEBAR NAME
    // ================================
    function getSidebarNameColor() {
        const isDark = document.body.classList.contains("dark-mode") ||
                       document.documentElement.getAttribute("data-theme") === "dark";
        return isDark ? "#ffffff" : "navy";
    }

    // ================================
    // UPDATE SIDEBAR — NAME + PHOTO
    // This is the core function that makes the sidebar
    // show the real logged-in user's info on every page.
    // ================================
    function updateSidebar(profileData) {
        if (!profileData) return;

        // ── Sidebar photo ──
        const sidebarImg = document.getElementById("sidebarProfileImage");
        if (sidebarImg) {
            sidebarImg.src = profileData.image ||
                             profileData.profile_image ||
                             "default-profile.png";
        }

        // ── Sidebar name ──
        const sidebarName = document.getElementById("sidebarUserName");
        if (sidebarName) {
            const fullName = (
                (profileData.firstName || profileData.first_name || "") +
                " " +
                (profileData.lastName  || profileData.last_name  || "")
            ).trim();
            sidebarName.textContent = fullName;
            sidebarName.style.color = getSidebarNameColor();
        }
    }

    // ================================
    // STEP 1 — SHOW CACHED DATA INSTANTLY
    // No waiting — sidebar updates immediately from localStorage
    // so there's no flash of empty/wrong data
    // ================================
    function applyCache() {
        const raw = localStorage.getItem(getProfileKey());
        if (raw) {
            try { updateSidebar(JSON.parse(raw)); } catch (_) {}
        }
    }

    // ================================
    // STEP 2 — FETCH FRESH DATA FROM SUPABASE
    // Queries the users table using currentUserEmail.
    // Updates sidebar with real data and refreshes the cache.
    // ================================
    async function fetchFromSupabase() {
        const email = getCurrentUserEmail();
        if (!email) return;   // Not logged in — nothing to fetch

        const client = getClient();
        if (!client) return;  // Supabase library not loaded yet

        try {
            const { data, error } = await client
                .from("users")
                .select("id, first_name, last_name, email, phone_number, profile_image")
                .eq("email", email)
                .single();

            if (error || !data) {
                console.warn("profile_sync: no user row found for", email);
                return;
            }

            // ✅ Keep currentUserId in sync with the integer id from your table
            localStorage.setItem("currentUserId", String(data.id));

            // ✅ Build normalized profile and cache it
            const normalized = {
                firstName  : data.first_name    || "",
                lastName   : data.last_name     || "",
                email      : data.email         || email,
                contact    : data.phone_number  || "",
                image      : data.profile_image || "default-profile.png",
                lastUpdated: new Date().toISOString()
            };

            const profileKey = "userProfile_" + String(data.id);
            localStorage.setItem(profileKey, JSON.stringify(normalized));

            // ✅ Update sidebar with real data from DB
            updateSidebar(normalized);

        } catch (err) {
            console.warn("profile_sync: fetch error:", err.message);
        }
    }

    // ================================
    // LISTEN FOR CHANGES FROM OTHER TABS
    // If profile is updated in profile_page, sidebar updates here too
    // ================================
    function listenForChanges() {
        window.addEventListener("storage", function (e) {
            if (e.key === getProfileKey() && e.newValue) {
                try { updateSidebar(JSON.parse(e.newValue)); } catch (_) {}
            }
        });
    }

    // ================================
    // LISTEN FOR THEME CHANGES
    // Keeps sidebar name color correct when dark/light mode toggles
    // ================================
    function listenForThemeChanges() {
        const update = () => {
            const el = document.getElementById("sidebarUserName");
            if (el) el.style.color = getSidebarNameColor();
        };
        const obs = new MutationObserver(update);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        obs.observe(document.body,            { attributes: true, attributeFilter: ["class"] });
    }

    // ================================
    // INITIALIZE
    // ================================
    function init() {
        applyCache();           // ✅ instant — no flash
        fetchFromSupabase();    // ✅ background fetch — shows real data
        listenForChanges();     // ✅ cross-tab sync
        listenForThemeChanges();// ✅ dark/light mode name color
    }

    // ================================
    // EXPOSE GLOBALLY (for compatibility)
    // ================================
    window.MediSafeProfile = {
        init,
        updateSidebar,
        fetchFromSupabase
    };

    // ================================
    // AUTO-RUN
    // ================================
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
