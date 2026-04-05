/**
 * MediSafe Universal Theme Manager
 * Drop this file in your project root and link it on every page.
 * It reads/writes the user's theme choice to localStorage so it
 * persists across all pages automatically.
 */

(function () {
    const THEME_KEY = 'medisafe-theme';

    // Apply theme immediately (before paint) to prevent flash
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.body.classList.add('dark-mode');
        } else {
            document.documentElement.removeAttribute('data-theme');
            document.body.classList.remove('dark-mode');
        }
    }

    // Persist and broadcast theme change
    function setTheme(theme) {
        localStorage.setItem(THEME_KEY, theme);
        applyTheme(theme);
        updateSettingsUI(theme);
    }

    // Sync the Settings page UI buttons if they exist on the current page
    function updateSettingsUI(theme) {
        const lightBtn = document.getElementById('light-theme');
        const darkBtn  = document.getElementById('dark-theme');
        if (!lightBtn || !darkBtn) return;

        if (theme === 'dark') {
            darkBtn.classList.add('active');
            lightBtn.classList.remove('active');
        } else {
            lightBtn.classList.add('active');
            darkBtn.classList.remove('active');
        }
    }

    // Read saved theme (default = light)
    function getSavedTheme() {
        return localStorage.getItem(THEME_KEY) || 'light';
    }

    // Run on every page load
    function init() {
        const saved = getSavedTheme();
        applyTheme(saved);          // instant — no flicker

        // Wire up theme buttons if they exist (Settings page)
        document.addEventListener('DOMContentLoaded', function () {
            updateSettingsUI(saved);

            const lightBtn = document.getElementById('light-theme');
            const darkBtn  = document.getElementById('dark-theme');

            if (lightBtn) lightBtn.addEventListener('click', function () { setTheme('light'); });
            if (darkBtn)  darkBtn.addEventListener('click',  function () { setTheme('dark');  });
        });
    }

    // Expose setTheme globally so inline onclick= calls still work
    window.MediSafeTheme = { setTheme, getSavedTheme };

    init();
})();