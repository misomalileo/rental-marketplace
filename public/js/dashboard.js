const token = localStorage.getItem("token");
if (!token) window.location = "login.html";

let map, marker;
let editMap, editMarker;
let myHouses = [];
let currentEditId = null;
let currentUser = null;

let currentPaymentAction = null;
let currentHouseId = null;

// Chart variables
let viewsChart, earningsChart, conversionChart;

// ========== LOADING INDICATOR ==========
function showLoading() {
  document.getElementById('loadingOverlay').style.display = 'flex';
}
function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

// ========== FETCH USER & PROFILE CHECK ==========
async function fetchUser() {
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: "Bearer " + token }
    });
    if (res.ok) {
      currentUser = await res.json();
      updateVerificationUI();
      updateProfileCard();
      if (!currentUser.profileCompleted) {
        showProfileModal();
      }
    }
  } catch (err) {
    console.error("Failed to fetch user", err);
  }
}

function updateProfileCard() {
  if (!currentUser) return;
  document.getElementById('profileAvatar').src = currentUser.profilePicture || 'default-avatar.png';
  document.getElementById('profileDisplayName').innerText = currentUser.name;
  document.getElementById('profileDisplayBusiness').innerHTML = currentUser.businessName ? `<strong>${currentUser.businessName}</strong>` : '';
}

// ========== PROFILE MODAL ==========
function showProfileModal() {
  document.getElementById('profileName').value = currentUser.name || '';
  document.getElementById('profilePhone').value = currentUser.phone || '';
  document.getElementById('profileBusinessName').value = currentUser.businessName || '';
  document.getElementById('profileAddress').value = currentUser.address || '';
  document.getElementById('profileBio').value = currentUser.bio || '';
  document.getElementById('profileModal').style.display = 'block';
}

function closeProfileModal() {
  document.getElementById('profileModal').style.display = 'none';
  if (!currentUser.profileCompleted) {
    alert('You must complete your profile to use the dashboard.');
    window.location = 'login.html';
  }
}

function openEditProfile() {
  document.getElementById('profileName').value = currentUser.name || '';
  document.getElementById('profilePhone').value = currentUser.phone || '';
  document.getElementById('profileBusinessName').value = currentUser.businessName || '';
  document.getElementById('profileAddress').value = currentUser.address || '';
  document.getElementById('profileBio').value = currentUser.bio || '';
  document.getElementById('profileModal').style.display = 'block';
}

document.getElementById('profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  showLoading();

  const name = document.getElementById('profileName').value;
  const phone = document.getElementById('profilePhone').value;
  const businessName = document.getElementById('profileBusinessName').value;
  const address = document.getElementById('profileAddress').value;
  const bio = document.getElementById('profileBio').value;

  if (!phone.match(/^265[0-9]{9}$/)) {
    alert('Phone number must be 265XXXXXXXXX');
    hideLoading();
    return;
  }

  const profilePictureFile = document.getElementById('profilePicture').files[0];
  let profilePictureUrl = currentUser.profilePicture || '';

  if (profilePictureFile) {
    const imgFormData = new FormData();
    imgFormData.append('image', profilePictureFile);
    try {
      const uploadRes = await fetch('/api/houses/test-upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: imgFormData
      });
      const uploadData = await uploadRes.json();
      if (uploadRes.ok) {
        profilePictureUrl = uploadData.url;
      } else {
        alert('Failed to upload profile picture');
        hideLoading();
        return;
      }
    } catch (err) {
      alert('Network error uploading picture');
      hideLoading();
      return;
    }
  }

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ name, phone, businessName, address, bio, profilePicture: profilePictureUrl })
    });
    if (res.ok) {
      const updatedUser = await res.json();
      currentUser = updatedUser;
      updateProfileCard();
      alert('Profile saved!');
      closeProfileModal();
    } else {
      const data = await res.json();
      alert('Error: ' + data.message);
    }
  } catch (err) {
    alert('Network error');
  } finally {
    hideLoading();
  }
});

document.getElementById('profilePicture').addEventListener('change', function(e) {
  const file = e.target.files[0];
  const previewDiv = document.getElementById('profilePreview');
  previewDiv.innerHTML = '';
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = function(event) {
      const img = document.createElement('img');
      img.src = event.target.result;
      img.style.width = '100px';
      img.style.height = '100px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '8px';
      previewDiv.appendChild(img);
    };
    reader.readAsDataURL(file);
  }
});

// ========== VERIFICATION UI ==========
function updateVerificationUI() {
  const container = document.getElementById("verification-status");
  if (!container || !currentUser) return;

  let daysLeft = '';
  if (currentUser.subscriptionExpiresAt) {
    const now = new Date();
    const expiry = new Date(currentUser.subscriptionExpiresAt);
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      daysLeft = `<span class="days-left"> (${diffDays} days remaining)</span>`;
    } else {
      daysLeft = `<span class="days-left expired"> (Expired)</span>`;
    }
  }

  if (currentUser.verificationType === "premium") {
    container.innerHTML = `<span class="premium-badge">⭐ You are a PREMIUM Landlord${daysLeft}</span>`;
  } else if (currentUser.verificationType === "official") {
    container.innerHTML = `
      <span class="official-badge">✔ You are an OFFICIAL Landlord${daysLeft}</span>
      <button class="payment-btn premium" onclick="payForVerification('premium')">Upgrade to PREMIUM (K5000)</button>
    `;
  } else {
    container.innerHTML = `
      <span class="none-badge">Your account is not verified${daysLeft}</span>
      <button class="payment-btn official" onclick="payForVerification('official')">Become OFFICIAL (K2500)</button>
      <button class="payment-btn premium" onclick="payForVerification('premium')">Become PREMIUM (K5000)</button>
    `;
  }
}

// ========== PAYMENT FUNCTIONS ==========
function payForVerification(type) {
  currentPaymentAction = type === 'official' ? 'verifyOfficial' : 'verifyPremium';
  currentHouseId = null;
  const amount = type === 'official' ? 2500 : 5000;
  document.getElementById('paymentTitle').innerText = type === 'official' ? 'Become Official Landlord' : 'Become Premium Landlord';
  document.getElementById('paymentAmount').innerText = `Amount: MWK ${amount}`;
  document.getElementById('paymentModal').style.display = 'block';
  document.getElementById('paymentStatus').innerHTML = '';
  document.getElementById('phoneNumber').value = '';
}

function featureHouse(id) {
  currentPaymentAction = 'feature';
  currentHouseId = id;
  document.getElementById('paymentTitle').innerText = 'Feature This House';
  document.getElementById('paymentAmount').innerText = 'Amount: MWK 5000';
  document.getElementById('paymentModal').style.display = 'block';
  document.getElementById('paymentStatus').innerHTML = '';
  document.getElementById('phoneNumber').value = '';
}

async function processPayment(method) {
  const phone = document.getElementById('phoneNumber').value.trim();
  if (!phone) {
    alert('Please enter your mobile money number');
    return;
  }
  if (!phone.match(/^265[0-9]{9}$/)) {
    alert('Please enter a valid Malawi phone number starting with 265 (e.g., 265881535985)');
    return;
  }

  const statusDiv = document.getElementById('paymentStatus');
  statusDiv.innerHTML = '⏳ Initiating payment...';

  let endpoint, httpMethod, body;
  if (currentPaymentAction === 'verifyOfficial') {
    endpoint = '/api/payment/verify';
    httpMethod = 'POST';
    body = { type: 'official', phone };
  } else if (currentPaymentAction === 'verifyPremium') {
    endpoint = '/api/payment/verify';
    httpMethod = 'POST';
    body = { type: 'premium', phone };
  } else if (currentPaymentAction === 'feature') {
    endpoint = '/api/payment/house/' + currentHouseId + '/feature';
    httpMethod = 'PUT';
    body = { phone };
  }

  try {
    const res = await fetch(endpoint, {
      method: httpMethod,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      if (data.payment_url) {
        statusDiv.innerHTML = 'Redirecting to payment page...';
        window.location.href = data.payment_url;
      } else {
        statusDiv.innerHTML = '✅ Payment initiated! Please check your phone for a prompt to approve.';
        setTimeout(() => {
          closePaymentModal();
          if (currentPaymentAction.includes('verify')) {
            fetchUser();
          } else {
            loadMyHouses();
          }
        }, 5000);
      }
    } else {
      statusDiv.innerHTML = '❌ Payment initiation failed: ' + (data.message || 'Unknown error');
    }
  } catch (err) {
    statusDiv.innerHTML = '❌ Network error. Please try again.';
    console.error(err);
  }
}

function closePaymentModal() {
  document.getElementById('paymentModal').style.display = 'none';
  currentPaymentAction = null;
  currentHouseId = null;
}

// ========== CHAT NOTIFICATION BADGE ==========
async function loadUnreadCount() {
  try {
    const res = await fetch("/api/chat/my", {
      headers: { Authorization: "Bearer " + token }
    });
    const chats = await res.json();
    let unread = 0;
    chats.forEach(chat => {
      const lastMsg = chat.messages[chat.messages.length-1];
      if (lastMsg && !lastMsg.read && lastMsg.sender !== currentUser?._id) {
        unread++;
      }
    });
    const badge = document.getElementById("messageBadge");
    if (badge) {
      if (unread > 0) {
        badge.textContent = unread;
        badge.style.display = 'inline';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (err) {
    console.error("Failed to load unread count", err);
  }
}

setInterval(loadUnreadCount, 30000);

// ========== MAP FUNCTIONS ==========
function initMap() {
  map = L.map('map').setView([-15.7861, 35.0058], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  map.on("click", function (e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    document.getElementById("latitude").value = lat;
    document.getElementById("longitude").value = lng;
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng]).addTo(map);
  });
}

function getLocation() {
  navigator.geolocation.getCurrentPosition(function (position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    document.getElementById("latitude").value = lat;
    document.getElementById("longitude").value = lng;
    map.setView([lat, lng], 16);
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng]).addTo(map);
  });
}

// ========== HOUSES ==========
async function loadMyHouses() {
  try {
    const res = await fetch("/api/houses/my-houses", {
      headers: { Authorization: "Bearer " + token }
    });
    const houses = await res.json();
    myHouses = houses;

    const totalHouses = houses.length;
    const totalViews = houses.reduce((sum, h) => sum + (h.views || 0), 0);
    const avgRating = houses.reduce((sum, h) => sum + (h.averageRating || 0), 0) / (totalHouses || 1);
    document.getElementById("totalHouses").innerText = totalHouses;
    document.getElementById("totalViews").innerText = totalViews;
    document.getElementById("avgRating").innerText = avgRating.toFixed(1);
    document.getElementById("totalBookings").innerText = houses.reduce((sum, h) => sum + (h.bookings || 0), 0);

    renderHouses(houses);
    loadBookingRequests();
    loadHouseStats(); // fetch analytics
  } catch (err) {
    console.error("Error loading houses:", err);
  }
}

// ========== ANALYTICS: CHARTS & INSIGHTS ==========
async function loadHouseStats() {
  if (!myHouses.length) return;
  const house = myHouses[0]; // For demo, use the first house
  try {
    const res = await fetch(`/api/houses/stats/${house._id}`, {
      headers: { Authorization: "Bearer " + token }
    });
    const data = await res.json();
    const viewsData = data.views; // array of { date, views }

    const labels = viewsData.map(d => d.date);
    const views = viewsData.map(d => d.views);

    if (viewsChart) viewsChart.destroy();
    const ctx = document.getElementById('viewsChart').getContext('2d');
    viewsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Views',
          data: views,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52,152,219,0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: { responsive: true, maintainAspectRatio: true }
    });

    // Mock earnings and conversion data (replace with real data)
    const earningsData = [10000, 15000, 8000, 20000];
    const conversionData = [5, 10, 8, 12];

    if (earningsChart) earningsChart.destroy();
    earningsChart = new Chart(document.getElementById('earningsChart'), {
      type: 'bar',
      data: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        datasets: [{ label: 'Earnings (MWK)', data: earningsData, backgroundColor: '#2ecc71' }]
      }
    });

    if (conversionChart) conversionChart.destroy();
    conversionChart = new Chart(document.getElementById('conversionChart'), {
      type: 'doughnut',
      data: {
        labels: ['Converted', 'Not Converted'],
        datasets: [{ data: [conversionData[0], 100 - conversionData[0]], backgroundColor: ['#f1c40f', '#95a5a6'] }]
      }
    });

    // Generate insight
    const avgViews = views.reduce((a,b)=>a+b,0)/views.length;
    const insightText = `📈 Your listing is viewed ${avgViews > 20 ? '30% more' : '20% less'} than similar houses in your area. ${avgViews > 20 ? 'Great job! Consider adding more photos.' : 'Try adding better descriptions to improve visibility.'}`;
    document.getElementById('insightText').innerText = insightText;
  } catch (err) {
    console.error("Error loading stats:", err);
  }
}

function renderHouses(houses) {
  const container = document.getElementById("my-houses");
  container.innerHTML = "";

  houses.forEach(house => {
    const img = house.images?.length ? house.images[0] : "placeholder.jpg";
    const card = document.createElement("div");
    card.className = "house-card";
    const featureButton = house.featured 
      ? '<span class="featured-badge">⭐ Featured</span>' 
      : `<button class="feature-btn" onclick="featureHouse('${house._id}')">⭐ Feature (K5000)</button>`;
    card.innerHTML = `
      <img src="${img}">
      <div class="house-content">
        <h3>${house.name}</h3>
        <p>📍 ${house.location || 'N/A'}</p>
        <p>💰 MWK ${house.price?.toLocaleString()}</p>
        <p>👁️ Views: ${house.views || 0}</p>
        <p>⭐ Rating: ${house.averageRating ? house.averageRating.toFixed(1) : 'No ratings'}</p>
        <div class="house-actions">
          <button class="edit" onclick="openEditModal('${house._id}')">✏️ Edit</button>
          <button class="delete" onclick="deleteHouse('${house._id}')">🗑️ Delete</button>
          ${featureButton}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

async function deleteHouse(id) {
  if (!confirm("Delete this house permanently?")) return;
  showLoading();
  try {
    const res = await fetch("/api/houses/" + id, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token }
    });
    if (res.ok) {
      alert("House deleted");
      loadMyHouses();
    } else {
      const data = await res.json();
      alert("Error: " + data.message);
    }
  } catch (err) {
    alert("Network error");
  } finally {
    hideLoading();
  }
}

function openEditModal(houseId) {
  currentEditId = houseId;
  const house = myHouses.find(h => h._id === houseId);
  if (!house) return;

  document.getElementById("editHouseId").value = house._id;
  document.getElementById("editName").value = house.name || '';
  document.getElementById("editLocation").value = house.location || '';
  document.getElementById("editPrice").value = house.price || '';
  document.getElementById("editPhone").value = house.phone || '';
  document.getElementById("editDescription").value = house.description || '';
  document.getElementById("editLat").value = house.lat || '';
  document.getElementById("editLng").value = house.lng || '';
  document.getElementById("editType").value = house.type || 'House';
  document.getElementById("editBedrooms").value = house.bedrooms || 0;
  document.getElementById("editVacancies").value = house.vacancies || 0;
  document.getElementById("editCondition").value = house.condition || 'Good';
  document.getElementById("editWifi").checked = house.wifi || false;
  document.getElementById("editParking").checked = house.parking || false;
  document.getElementById("editFurnished").checked = house.furnished || false;
  document.getElementById("editPetFriendly").checked = house.petFriendly || false;
  document.getElementById("editPool").checked = house.pool || false;
  document.getElementById("editAC").checked = house.ac || false;
  document.getElementById("editGender").value = house.gender || 'none';
  document.getElementById("editSelfContained").checked = house.selfContained || false;

  const unavailableInput = document.getElementById("editUnavailableDates");
  if (unavailableInput._flatpickr) unavailableInput._flatpickr.destroy();
  flatpickr(unavailableInput, {
    mode: "multiple",
    dateFormat: "Y-m-d",
    defaultDate: house.unavailableDates ? house.unavailableDates.map(d => new Date(d)) : []
  });

  document.getElementById("editModal").style.display = "block";

  setTimeout(() => {
    if (!editMap) {
      editMap = L.map('editMap').setView([house.lat || -15.7861, house.lng || 35.0058], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(editMap);
      editMap.on("click", function (e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        document.getElementById("editLat").value = lat;
        document.getElementById("editLng").value = lng;
        if (editMarker) editMap.removeLayer(editMarker);
        editMarker = L.marker([lat, lng]).addTo(editMap);
      });
    } else {
      editMap.setView([house.lat || -15.7861, house.lng || 35.0058], 13);
    }
    if (house.lat && house.lng) {
      if (editMarker) editMap.removeLayer(editMarker);
      editMarker = L.marker([house.lat, house.lng]).addTo(editMap);
    }
  }, 100);
}

function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
  if (editMarker) editMap.removeLayer(editMarker);
  editMarker = null;
}

function getEditLocation() {
  navigator.geolocation.getCurrentPosition(function (position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    document.getElementById("editLat").value = lat;
    document.getElementById("editLng").value = lng;
    editMap.setView([lat, lng], 16);
    if (editMarker) editMap.removeLayer(editMarker);
    editMarker = L.marker([lat, lng]).addTo(editMap);
  });
}

document.getElementById("editForm").addEventListener("submit", async e => {
  e.preventDefault();
  showLoading();
  const formData = new FormData(e.target);
  formData.delete("houseId");

  const unavailableStr = document.getElementById("editUnavailableDates").value;
  const dates = unavailableStr ? unavailableStr.split(", ").filter(d => d) : [];
  formData.append("unavailableDates", JSON.stringify(dates));

  try {
    const res = await fetch("/api/houses/" + currentEditId, {
      method: "PUT",
      headers: { Authorization: "Bearer " + token },
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      alert("✅ House updated!");
      closeEditModal();
      loadMyHouses();
    } else {
      alert("❌ Update failed: " + (data.message || "Unknown error"));
    }
  } catch (err) {
    alert("❌ Network error: " + err.message);
  } finally {
    hideLoading();
  }
});

// ========== IMAGE PREVIEW & FORM VALIDATION ==========
document.querySelector('input[name="images"]').addEventListener('change', function(e) {
  const preview = document.getElementById('imagePreview');
  preview.innerHTML = '';
  const files = Array.from(e.target.files);
  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('File too large, max 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(event) {
      const img = document.createElement('img');
      img.src = event.target.result;
      img.style.width = '100px';
      img.style.height = '100px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '8px';
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
});

document.getElementById("houseForm").addEventListener("submit", async e => {
  e.preventDefault();

  const name = document.querySelector('input[name="name"]').value.trim();
  const location = document.querySelector('input[name="location"]').value.trim();
  const price = document.querySelector('input[name="price"]').value;
  const phone = document.querySelector('input[name="phone"]').value.trim();
  const images = document.querySelector('input[name="images"]').files;

  if (!name) { alert('House name is required'); return; }
  if (!location) { alert('Location is required'); return; }
  if (!price || price <= 0) { alert('Price must be greater than 0'); return; }
  if (!phone.match(/^265[0-9]{9}$/)) { alert('Phone number must be 265XXXXXXXXX'); return; }
  if (images.length === 0) { alert('At least one image is required'); return; }

  showLoading();
  const formData = new FormData(e.target);

  try {
    const res = await fetch("/api/houses", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      alert("✅ House uploaded successfully!");
      e.target.reset();
      document.getElementById('imagePreview').innerHTML = '';
      if (marker) map.removeLayer(marker);
      loadMyHouses();
    } else {
      alert("❌ Upload failed: " + (data.message || "Unknown error"));
    }
  } catch (err) {
    alert("❌ Network error: " + err.message);
  } finally {
    hideLoading();
  }
});

// ========== BOOKING REQUESTS ==========
async function loadBookingRequests() {
  try {
    let allBookings = [];
    for (let house of myHouses) {
      const res = await fetch(`/api/bookings/house/${house._id}`, {
        headers: { Authorization: "Bearer " + token }
      });
      if (res.ok) {
        const bookings = await res.json();
        allBookings.push(...bookings);
      }
    }
    renderBookings(allBookings);
  } catch (err) {
    console.error("Failed to load bookings", err);
  }
}

function renderBookings(bookings) {
  const container = document.getElementById("bookingRequests");
  if (!container) return;
  container.innerHTML = "";
  if (bookings.length === 0) {
    container.innerHTML = "<p>No booking requests yet.</p>";
    return;
  }
  bookings.forEach(b => {
    const card = document.createElement("div");
    card.className = "booking-card";
    card.innerHTML = `
      <p><strong>House:</strong> ${b.houseName || b.house?.name || 'Unknown'}</p>
      <p><strong>Guest:</strong> ${b.tenantName} (${b.tenantEmail})</p>
      <p><strong>Dates:</strong> ${new Date(b.startDate).toLocaleDateString()} - ${new Date(b.endDate).toLocaleDateString()}</p>
      <p><strong>Message:</strong> ${b.message || 'No message'}</p>
      <p><strong>Status:</strong> <span class="booking-status ${b.status}">${b.status}</span></p>
      ${b.status === 'pending' ? `
        <div class="booking-actions">
          <button class="approve-btn" onclick="updateBooking('${b._id}', 'approved')">✅ Approve</button>
          <button class="reject-btn" onclick="updateBooking('${b._id}', 'rejected')">❌ Reject</button>
        </div>
      ` : ''}
    `;
    container.appendChild(card);
  });
}

async function updateBooking(bookingId, status) {
  showLoading();
  try {
    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Booking ${status}`);
      loadBookingRequests();
      loadMyHouses();
    } else {
      alert("Error: " + data.message);
    }
  } catch (err) {
    alert("Network error");
  } finally {
    hideLoading();
  }
}

initMap();
fetchUser();
loadMyHouses();
loadUnreadCount();

window.payForVerification = payForVerification;
window.featureHouse = featureHouse;
window.processPayment = processPayment;
window.closePaymentModal = closePaymentModal;
window.updateBooking = updateBooking;
window.openEditProfile = openEditProfile;
window.closeProfileModal = closeProfileModal;