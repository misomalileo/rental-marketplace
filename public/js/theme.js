// Theme definitions
const themes = ['light', 'dark', 'aquatic'];
let currentTheme = localStorage.getItem('theme') || 'light';

function setTheme(theme) {
  if (themes.includes(theme)) {
    currentTheme = theme;
    localStorage.setItem('theme', theme);
    document.body.className = '';
    document.body.classList.add(`theme-${theme}`);
  }
}

// Expose globally
window.setTheme = setTheme;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setTheme(currentTheme);
});