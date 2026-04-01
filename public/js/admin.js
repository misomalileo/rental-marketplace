const token = localStorage.getItem("token");
if (!token) {
  alert("Please login first");
  window.location.href = "login.html";
}

// ========== GLOBAL STATE ==========
let housesChart, verificationChart;
let currentLogsPage = 1;
let currentLandlordsPage = 1;
let currentHousesPage = 1;
let currentPremiumPage = 1;
const perPage = 10;

// ========== HELPER: SHOW/HIDE LOADING ==========
function showLoading(tableId, show = true) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  if (show) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;"><i class="fas fa-spinner fa-pulse"></i> Loading...</td></tr>';
  }
}

// ========== LOAD STATS (Dashboard) ==========
async function loadStats() {
  try {
    const res = await fetch("/api/admin/stats", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stats = await res.json();

    document.getElementById("totalLandlords").innerText = stats.totalLandlords || 0;
    document.getElementById("totalHouses").innerText = stats.totalHouses || 0;
    document.getElementById("totalViews").innerText = stats.totalViews || 0;
    document.getElementById("pendingVerifications").innerText = stats.pendingVerifications || 0;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = new Array(12).fill(0);
    if (stats.housesPerMonth && Array.isArray(stats.housesPerMonth)) {
      stats.housesPerMonth.forEach(item => {
        if (item._id >= 1 && item._id <= 12) chartData[item._id - 1] = item.count;
      });
    }

    // Fix chart container size: ensure canvas has a parent with height
    const chartContainer = document.getElementById('housesChart').parentElement;
    if (chartContainer) chartContainer.style.height = '300px';

    const ctx1 = document.getElementById('housesChart').getContext('2d');
    if (housesChart) housesChart.destroy();
    housesChart = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{
          label: 'Houses Posted',
          data: chartData,
          backgroundColor: 'rgba(52, 152, 219, 0.7)',
          borderColor: 'rgba(52, 152, 219, 1)',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, grid: { color: '#ecf0f1' } } },
        plugins: { legend: { display: false } }
      }
    });

    const ctx2 = document.getElementById('verificationChart').getContext('2d');
    if (verificationChart) verificationChart.destroy();
    verificationChart = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['None', 'Official', 'Premium'],
        datasets: [{
          data: [
            (stats.totalLandlords || 0) - (stats.officialLandlords || 0) - (stats.premiumLandlords || 0),
            stats.officialLandlords || 0,
            stats.premiumLandlords || 0
          ],
          backgroundColor: ['#bdc3c7', '#2ecc71', '#f1c40f'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        cutout: '70%'
      }
    });
  } catch (err) {
    console.error("Failed to load stats:", err);
    // Don't alert – just show fallback
  }
}

// ========== REAL-TIME STATS ==========
async function loadRealTimeStats() {
  try {
    const res = await fetch("/api/admin/real-time", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    document.getElementById('activeUsers').innerText = data.activeUsers || 0;
    document.getElementById('newListings').innerText = data.newListingsToday || 0;
    document.getElementById('revenueToday').innerText = data.revenue || 'MWK 0';
    document.getElementById('totalHousesAdmin').innerText = data.totalHouses || 0;
  } catch (err) {
    console.error("Failed to load real-time stats:", err);
    // silent fail
  }
}

// ========== LOAD PREMIUM USERS (with pagination) ==========
async function loadPremiumUsers(page = 1) {
  currentPremiumPage = page;
  const tableId = 'premiumUsersTable';
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  showLoading(tableId, true);
  try {
    const res = await fetch(`/api/admin/premium-users?page=${page}&limit=${perPage}`, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    tbody.innerHTML = "";
    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No premium users found.</td></tr>';
    } else {
      data.users.forEach(user => {
        const row = tbody.insertRow();
        row.insertCell(0).innerHTML = `<i class="fas fa-crown" style="color:#f59e0b;"></i> ${escapeHtml(user.name)}`;
        row.insertCell(1).innerText = user.email;
        row.insertCell(2).innerHTML = `<span class="badge premium">Premium User</span>`;
        row.insertCell(3).innerText = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).toLocaleDateString() : 'N/A';
        row.insertCell(4).innerHTML = `
          <button class="action-btn ban" onclick="revokePremium('${user._id}')">
            <i class="fas fa-ban"></i> Revoke
          </button>
        `;
      });
    }
    renderPagination('premiumUsersPagination', data.totalPages, data.page, loadPremiumUsers);
  } catch (err) {
    console.error("Failed to load premium users:", err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Error loading premium users. Make sure the endpoint exists.</td></tr>';
  }
}

// ========== REVOKE PREMIUM ==========
async function revokePremium(userId) {
  if (!confirm("Revoke premium status for this user? They will become a free user.")) return;
  try {
    const res = await fetch(`/api/admin/revoke-premium/${userId}`, {
      method: "PUT",
      headers: { Authorization: "Bearer " + token }
    });
    const data = await res.json();
    if (res.ok) {
      alert("Premium status revoked.");
      loadPremiumUsers(currentPremiumPage);
      loadStats();
    } else {
      alert("Failed: " + (data.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Revoke error:", err);
    alert("Network error: " + err.message);
  }
}

// ========== LOAD LANDLORDS (with pagination) ==========
async function loadLandlords(page = 1) {
  currentLandlordsPage = page;
  const tableId = 'landlordsTable';
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  showLoading(tableId, true);
  try {
    const res = await fetch(`/api/admin/landlords?page=${page}&limit=${perPage}`, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    tbody.innerHTML = "";
    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No landlords found.</td></tr>';
    } else {
      data.users.forEach(user => {
        const row = tbody.insertRow();
        const badgeClass = user.verificationType || 'none';
        row.innerHTML = `
          <td>${escapeHtml(user.name)}</td>
          <td>${escapeHtml(user.email)}</td>
          <td><span class="badge ${badgeClass}">${user.verificationType || 'none'}</span></td>
          <td>
            <button class="action-btn verify" onclick="verifyUser('${user._id}', 'official')">✔ Official</button>
            <button class="action-btn premium" onclick="verifyUser('${user._id}', 'premium')">⭐ Premium</button>
            <button class="action-btn ban" onclick="banUser('${user._id}')">🚫 Ban</button>
          </td>
        `;
      });
    }
    renderPagination('landlordsPagination', data.totalPages, data.page, loadLandlords);
  } catch (err) {
    console.error("Failed to load landlords:", err);
    tbody.innerHTML = '<tr><td colspan="4">Error loading landlords. Check console.</td></tr>';
  }
}

// ========== VERIFY LANDLORD ==========
async function verifyUser(id, type) {
  try {
    const res = await fetch(`/api/admin/verify/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ type })
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      loadLandlords(currentLandlordsPage);
      loadStats();
    } else {
      alert("Verification failed: " + (data.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Verify error:", err);
    alert("Network error: " + err.message);
  }
}

// ========== BAN LANDLORD ==========
async function banUser(id) {
  if (!confirm("Ban landlord? This will delete all their houses.")) return;
  try {
    const res = await fetch(`/api/admin/ban/${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token }
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      loadLandlords(currentLandlordsPage);
      loadHouses(currentHousesPage);
      loadStats();
    } else {
      alert("Ban failed: " + (data.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Ban error:", err);
    alert("Network error: " + err.message);
  }
}

// ========== LOAD HOUSES (with pagination) ==========
async function loadHouses(page = 1) {
  currentHousesPage = page;
  const tableId = 'housesTable';
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  showLoading(tableId, true);
  try {
    const res = await fetch(`/api/admin/houses?page=${page}&limit=${perPage}`, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    tbody.innerHTML = "";
    if (!data.houses || data.houses.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No houses found.</td></tr>';
    } else {
      data.houses.forEach(house => {
        const row = tbody.insertRow();
        row.innerHTML = `
          <td>${escapeHtml(house.name)}</td>
          <td>${escapeHtml(house.location || 'N/A')}</td>
          <td>MWK ${house.price?.toLocaleString()}</td>
          <td>${escapeHtml(house.owner?.name || 'Unknown')}</td>
          <td><span class="badge ${house.featured ? 'premium' : 'none'}">${house.featured ? '⭐ Yes' : 'No'}</span></td>
          <td>
            <button class="action-btn ${house.featured ? 'verify' : 'premium'}" onclick="toggleFeatured('${house._id}')">
              ${house.featured ? '❌ Remove' : '⭐ Make Featured'}
            </button>
            <button class="action-btn delete" onclick="deleteHouse('${house._id}')">🗑 Delete</button>
          </td>
        `;
      });
    }
    renderPagination('housesPagination', data.totalPages, data.page, loadHouses);
  } catch (err) {
    console.error("Failed to load houses:", err);
    tbody.innerHTML = '<tr><td colspan="6">Error loading houses.</td></tr>';
  }
}

// ========== TOGGLE FEATURED ==========
async function toggleFeatured(id) {
  try {
    const res = await fetch(`/api/admin/house/${id}/toggle-featured`, {
      method: "PUT",
      headers: { Authorization: "Bearer " + token }
    });
    if (res.ok) {
      loadHouses(currentHousesPage);
    } else {
      const data = await res.json();
      alert("Failed to toggle featured: " + (data.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Toggle featured error:", err);
    alert("Network error: " + err.message);
  }
}

// ========== DELETE HOUSE ==========
async function deleteHouse(id) {
  if (!confirm("Delete this house?")) return;
  try {
    const res = await fetch(`/api/admin/house/${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token }
    });
    if (res.ok) {
      loadHouses(currentHousesPage);
      loadStats();
    } else {
      const data = await res.json();
      alert("Delete failed: " + (data.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Delete error:", err);
    alert("Network error: " + err.message);
  }
}

// ========== LOAD REPORTS ==========
async function loadReports() {
  const tbody = document.querySelector("#reportsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7"><i class="fas fa-spinner fa-pulse"></i> Loading...</td></tr>';
  try {
    const res = await fetch("/api/admin/reports", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reports = await res.json();
    tbody.innerHTML = "";
    if (!reports || reports.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No reports found.</td></tr>';
    } else {
      reports.forEach(r => {
        const row = tbody.insertRow();
        row.innerHTML = `
          <td>${escapeHtml(r.reporter?.name || 'Unknown')}</td>
          <td>${escapeHtml(r.landlord?.name || 'N/A')}</td>
          <td>${escapeHtml(r.house?.name || 'N/A')}</td>
          <td>${escapeHtml(r.reason)}</td>
          <td>${new Date(r.createdAt).toLocaleDateString()}</td>
          <td><span class="badge ${r.status === 'pending' ? 'none' : 'official'}">${r.status}</span></td>
          <td>${r.status === 'pending' ? `<button class="action-btn verify" onclick="resolveReport('${r._id}')">✔ Resolve</button>` : 'Resolved'}</td>
        `;
      });
    }
  } catch (err) {
    console.error("Failed to load reports:", err);
    tbody.innerHTML = '<tr><td colspan="7">Error loading reports.</td></tr>';
  }
}

// ========== RESOLVE REPORT ==========
async function resolveReport(id) {
  try {
    const res = await fetch(`/api/admin/report/${id}/resolve`, {
      method: "PUT",
      headers: { Authorization: "Bearer " + token }
    });
    if (res.ok) {
      loadReports();
    } else {
      const data = await res.json();
      alert("Failed to resolve report: " + data.message);
    }
  } catch (err) {
    console.error("Resolve error:", err);
    alert("Network error: " + err.message);
  }
}

// ========== ACTIVITY LOGS (with pagination) ==========
async function loadActivityLogs(page = 1) {
  currentLogsPage = page;
  const tbody = document.querySelector("#activityLogsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5"><i class="fas fa-spinner fa-pulse"></i> Loading...</td></tr>';
  try {
    const res = await fetch(`/api/admin/activity-logs?page=${page}&limit=20`, {
      headers: { Authorization: "Bearer " + token }
    });
    const data = await res.json();
    tbody.innerHTML = "";
    if (!data.logs || data.logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">No logs found.</td></tr>';
    } else {
      data.logs.forEach(log => {
        const row = tbody.insertRow();
        row.insertCell(0).innerText = log.user?.name || 'System';
        row.insertCell(1).innerText = log.action;
        row.insertCell(2).innerText = JSON.stringify(log.details);
        row.insertCell(3).innerText = log.ip || '';
        row.insertCell(4).innerText = new Date(log.createdAt).toLocaleString();
      });
    }
    renderLogsPagination(data);
  } catch (err) {
    console.error("Failed to load activity logs:", err);
    tbody.innerHTML = '<tr><td colspan="5">Error loading logs.</td></tr>';
  }
}

function renderLogsPagination(data) {
  const paginationDiv = document.getElementById('logsPagination');
  if (!paginationDiv) return;
  if (!data.pages || data.pages <= 1) {
    paginationDiv.innerHTML = '';
    return;
  }
  let html = '';
  for (let i = 1; i <= data.pages; i++) {
    html += `<button class="page-btn ${i === data.page ? 'active' : ''}" onclick="loadActivityLogs(${i})">${i}</button>`;
  }
  paginationDiv.innerHTML = html;
}

// ========== GENERAL PAGINATION RENDERER ==========
function renderPagination(containerId, totalPages, currentPage, callback) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!totalPages || totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="(${callback.name})(${i})">${i}</button>`;
  }
  container.innerHTML = html;
}

// ========== CSV EXPORT ==========
const exportBtn = document.getElementById('exportCsvBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    window.location.href = '/api/admin/export/csv?token=' + token;
  });
}

// ========== ESCAPE HTML ==========
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ========== INIT ==========
loadStats();
loadLandlords();
loadHouses();
loadReports();
loadPremiumUsers();
loadRealTimeStats();
loadActivityLogs();
setInterval(loadRealTimeStats, 30000);

// Make functions globally available
window.verifyUser = verifyUser;
window.banUser = banUser;
window.toggleFeatured = toggleFeatured;
window.deleteHouse = deleteHouse;
window.resolveReport = resolveReport;
window.loadActivityLogs = loadActivityLogs;
window.revokePremium = revokePremium;
window.loadPremiumUsers = loadPremiumUsers;
window.loadLandlords = loadLandlords;
window.loadHouses = loadHouses;