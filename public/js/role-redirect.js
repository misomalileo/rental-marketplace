// public/js/role-redirect.js
// ONE shared place that decides which page each role lands on.
// Used by login.html, oauth-redirect.html, become-landlord.html and dashboard.html
(function (global) {
  var DASHBOARDS = {
    admin: 'admin.html',
    premium_user: 'premium-dashboard.html',
    premium_landlord: 'premium-dashboard.html',
    landlord: 'dashboard.html',
    free: 'index.html'
  };

  // Which page belongs to this role? (unknown role = home page)
  function dashboardForRole(role) {
    return DASHBOARDS[role] || 'index.html';
  }

  // Save the login details in the browser
  function saveSession(token, role) {
    if (token) localStorage.setItem('token', token);
    if (role) localStorage.setItem('role', role);
  }

  // Remove the login details from the browser
  function clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('user');
  }

  // Go to the role's own page. replace() keeps the Back button from bouncing the user around.
  function goToDashboard(role) {
    window.location.replace(dashboardForRole(role));
  }

  global.KL = {
    DASHBOARDS: DASHBOARDS,
    dashboardForRole: dashboardForRole,
    saveSession: saveSession,
    clearSession: clearSession,
    goToDashboard: goToDashboard
  };
})(window);
