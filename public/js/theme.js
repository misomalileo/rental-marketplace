function setTheme(theme) {
  if (!theme) theme = localStorage.getItem('theme') || 'light';
  document.body.classList.remove('theme-light', 'theme-dark', 'theme-aquatic', 'theme-minimal', 'theme-luxury');
  document.body.classList.add(`theme-${theme}`);
  localStorage.setItem('theme', theme);
}

function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);
  const themeSelect = document.querySelector('.theme-select');
  if (themeSelect) themeSelect.value = savedTheme;
}

window.setTheme = setTheme;
loadTheme();