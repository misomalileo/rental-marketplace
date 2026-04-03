// public/js/admin.js (working version with existing endpoints)
const token = localStorage.getItem("token");
if (!token) {
  alert("Please login first");
  window.location.href = "login.html";
}

let housesChart, verificationChart;
let currentLogsPage = 1;

// ========== LOAD STATS ==========
async function loadStats() {
  try {
    const res = await fetch("/api/admin/stats", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stats = await res.json();

    document.getElementById("totalLandlords").innerText = stats.totalLandlords;
    document.getElementById("totalHouses").innerText = stats.totalHouses;
    document.getElementById("totalViews").innerText = stats.totalViews;
    document.getElementById("pendingVerifications").innerText = stats.pendingVerifications;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = new Array(12).fill(0);
    if (stats.housesPerMonth) {
      stats.housesPerMonth.forEach(item => {
        chartData[item._id - 1] = item.count;
      });
    }

    // Fix chart container height
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
            stats.totalLandlords - stats.officialLandlords - stats.premiumLandlords,
            stats.officialLandlords,
            stats.premiumLandlords
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
    alert("Failed to load stats: " + err.message);
  }
}

// ========== REAL-TIME STATS ==========
async function loadRealTimeStats() {
  try {
    const res = await fetch("/api/admin/real-time", {
      headers: { Authorization: "Bearer " + token }
    });
    const data = await res.json();
    document.getElementById('activeUsers').innerText = data.activeUsers;
    document.getElementById('newListings').innerText = data.newListingsToday;
    document.getElementById('revenueToday').innerText = data.revenue;
    document.getElementById('totalHousesAdmin').innerText = data.totalHouses;
  } catch (err) {
    console.error("Failed to load real-time stats:", err);
  }
}

// ========== LOAD LANDLORDS ==========
async function loadLandlords() {
  try {
    const res = await fetch("/api/admin/landlords", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const users = await res.json();
    const tbody = document.getElementById("landlordsTable");
    tbody.innerHTML = "";
    users.forEach(user => {
      const row = document.createElement("tr");
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
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to load landlords:", err);
    alert("Failed to load landlords: " + err.message);
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
      loadLandlords();
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
      loadLandlords();
      loadHouses();
      loadStats();
    } else {
      alert("Ban failed: " + (data.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Ban error:", err);
    alert("Network error: " + err.message);
  }
}

// ========== LOAD HOUSES ==========
async function loadHouses() {
  try {
    const res = await fetch("/api/admin/houses", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const houses = await res.json();
    const tbody = document.getElementById("housesTable");
    tbody.innerHTML = "";
    houses.forEach(house => {
      const row = document.createElement("tr");
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
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to load houses:", err);
    alert("Failed to load houses: " + err.message);
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
      loadHouses();
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
      loadHouses();
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
  try {
    const res = await fetch("/api/admin/reports", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reports = await res.json();
    const tbody = document.getElementById("reportsTable");
    tbody.innerHTML = "";
    reports.forEach(r => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(r.reporter?.name || 'Unknown')}</td>
        <td>${escapeHtml(r.landlord?.name || 'N/A')}</td>
        <td>${escapeHtml(r.house?.name || 'N/A')}</td>
        <td>${escapeHtml(r.reason)}</td>
        <td>${new Date(r.createdAt).toLocaleDateString()}</td>
        <td><span class="badge ${r.status === 'pending' ? 'none' : 'official'}">${r.status}</span></td>
        <td>${r.status === 'pending' ? `<button class="action-btn verify" onclick="resolveReport('${r._id}')">✔ Resolve</button>` : 'Resolved'}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to load reports:", err);
    alert("Failed to load reports: " + err.message);
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

// ========== ACTIVITY LOGS ==========
async function loadActivityLogs(page = 1) {
  try {
    const res = await fetch(`/api/admin/activity-logs?page=${page}&limit=20`, {
      headers: { Authorization: "Bearer " + token }
    });
    const data = await res.json();
    const tbody = document.querySelector("#activityLogsTable tbody");
    tbody.innerHTML = "";
    data.logs.forEach(log => {
      const row = tbody.insertRow();
      row.insertCell(0).innerText = log.user?.name || 'System';
      row.insertCell(1).innerText = log.action;
      row.insertCell(2).innerText = JSON.stringify(log.details);
      row.insertCell(3).innerText = log.ip || '';
      row.insertCell(4).innerText = new Date(log.createdAt).toLocaleString();
    });
    renderLogsPagination(data);
  } catch (err) {
    console.error("Failed to load activity logs:", err);
    document.querySelector("#activityLogsTable tbody").innerHTML = '}<td colspan="5">Error loading logs</td>';
  }
}

function renderLogsPagination(data) {
  const paginationDiv = document.getElementById('logsPagination');
  if (data.pages <= 1) {
    paginationDiv.innerHTML = '';
    return;
  }
  let html = '';
  for (let i = 1; i <= data.pages; i++) {
    html += `<button class="page-btn ${i === data.page ? 'active' : ''}" onclick="loadActivityLogs(${i})">${i}</button>`;
  }
  paginationDiv.innerHTML = html;
}

// ========== CSV EXPORT ==========
document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
  window.location.href = '/api/admin/export/csv?token=' + token;
});

// ========== PREMIUM USERS SECTION (client-side filter from landlords) ==========
async function loadPremiumUsers() {
  const tbody = document.querySelector("#premiumUsersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;"><i class="fas fa-spinner fa-pulse"></i> Loading...</td></tr>';
  try {
    const res = await fetch("/api/admin/landlords", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const users = await res.json();
    // Filter only users with role premium_user (if your User model has role field)
    const premiumUsers = users.filter(user => user.role === 'premium_user');
    tbody.innerHTML = "";
    if (premiumUsers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No premium users found.</td></tr>';
    } else {
      premiumUsers.forEach(user => {
        const row = tbody.insertRow();
        row.insertCell(0).innerHTML = `<i class="fas fa-crown" style="color:#f59e0b;"></i> ${escapeHtml(user.name)}`;
        row.insertCell(1).innerText = user.email;
        row.insertCell(2).innerHTML = `<span class="badge premium">Premium User</span>`;
        row.insertCell(3).innerText = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).toLocaleDateString() : 'N/A';
        row.insertCell(4).innerHTML = `<button class="action-btn ban" onclick="revokePremium('${user._id}')">🚫 Revoke</button>`;
      });
    }
  } catch (err) {
    console.error("Failed to load premium users:", err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Error loading premium users. Check console.</td></tr>';
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
      loadPremiumUsers();
      loadLandlords(); // refresh landlord list
    } else {
      alert("Failed: " + (data.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Revoke error:", err);
    alert("Network error: " + err.message);
  }
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

// Expose globally
window.verifyUser = verifyUser;
window.banUser = banUser;
window.toggleFeatured = toggleFeatured;
window.deleteHouse = deleteHouse;
window.resolveReport = resolveReport;
window.loadActivityLogs = loadActivityLogs;
window.revokePremium = revokePremium;
window.loadPremiumUsers = loadPremiumUsers;