const token = localStorage.getItem("token");
if (!token) window.location = "login.html";

let map, marker;
let editMap, editMarker;
let myHouses = [];
let currentEditId = null;
let currentUser = null;
let currentPaymentAction = null;
let currentHouseId = null;
let viewsChart, earningsChart, conversionChart;
let housesPage = 0;
const housesPerPage = 6;

function animateValue(element, start, end, duration = 1000) {
  if (!element) return;
  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;
  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
      element.innerText = end;
      clearInterval(timer);
    } else element.innerText = Math.round(current);
  }, 16);
}
function showLoading() { document.getElementById('loadingOverlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }

async function fetchUser() {
  try {
    const res = await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + token } });
    if (res.ok) {
      currentUser = await res.json();
      updateVerificationUI();
      updateProfileCard();
      if (!currentUser.profileCompleted) showProfileModal();
    }
  } catch (err) { console.error(err); }
}
function updateProfileCard() {
  if (!currentUser) return;
  document.getElementById('profileAvatar').src = currentUser.profilePicture || 'default-avatar.png';
  document.getElementById('profileDisplayName').innerText = currentUser.name;
  document.getElementById('profileDisplayBusiness').innerHTML = currentUser.businessName ? `<strong>${currentUser.businessName}</strong>` : '';
}
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
  if (!currentUser.profileCompleted) { alert('Complete your profile first'); window.location = 'login.html'; }
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
  e.preventDefault(); showLoading();
  const name = document.getElementById('profileName').value;
  const phone = document.getElementById('profilePhone').value;
  const businessName = document.getElementById('profileBusinessName').value;
  const address = document.getElementById('profileAddress').value;
  const bio = document.getElementById('profileBio').value;
  if (!phone.match(/^265[0-9]{9}$/)) { alert('Phone must be 265XXXXXXXXX'); hideLoading(); return; }
  const profilePictureFile = document.getElementById('profilePicture').files[0];
  let profilePictureUrl = currentUser.profilePicture || '';
  if (profilePictureFile) {
    const imgFormData = new FormData(); imgFormData.append('image', profilePictureFile);
    try {
      const uploadRes = await fetch('/api/houses/test-upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: imgFormData });
      const uploadData = await uploadRes.json();
      if (uploadRes.ok) profilePictureUrl = uploadData.url;
      else { alert('Failed to upload picture'); hideLoading(); return; }
    } catch (err) { alert('Network error uploading'); hideLoading(); return; }
  }
  try {
    const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ name, phone, businessName, address, bio, profilePicture: profilePictureUrl }) });
    if (res.ok) { currentUser = await res.json(); updateProfileCard(); alert('Profile saved!'); closeProfileModal(); }
    else { const data = await res.json(); alert('Error: ' + data.message); }
  } catch (err) { alert('Network error'); } finally { hideLoading(); }
});
document.getElementById('profilePicture').addEventListener('change', function(e) {
  const file = e.target.files[0]; const previewDiv = document.getElementById('profilePreview'); previewDiv.innerHTML = '';
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (event) => { const img = document.createElement('img'); img.src = event.target.result; img.style.width = '100px'; img.style.height = '100px'; img.style.objectFit = 'cover'; img.style.borderRadius = '8px'; previewDiv.appendChild(img); };
    reader.readAsDataURL(file);
  }
});
function updateVerificationUI() {
  const container = document.getElementById("verification-status");
  if (!container || !currentUser) return;
  let daysLeft = '';
  if (currentUser.subscriptionExpiresAt) {
    const now = new Date(), expiry = new Date(currentUser.subscriptionExpiresAt);
    const diffDays = Math.ceil((expiry - now) / (1000*60*60*24));
    if (diffDays > 0) daysLeft = `<span class="days-left"> (${diffDays} days left)</span>`;
    else daysLeft = `<span class="days-left expired"> (Expired)</span>`;
  }
  if (currentUser.verificationType === "premium") container.innerHTML = `<span class="premium-badge"><i class="fas fa-star"></i> Premium Landlord${daysLeft}</span>`;
  else if (currentUser.verificationType === "official") container.innerHTML = `<span class="official-badge"><i class="fas fa-check-circle"></i> Official Landlord${daysLeft}</span><button class="payment-btn premium" onclick="payForVerification('premium')">Upgrade to PREMIUM (K5000)</button>`;
  else container.innerHTML = `<span class="none-badge"><i class="fas fa-lock"></i> Not Verified${daysLeft}</span><button class="payment-btn official" onclick="payForVerification('official')">Become OFFICIAL (K2500)</button><button class="payment-btn premium" onclick="payForVerification('premium')">Become PREMIUM (K5000)</button>`;
}
function payForVerification(type) {
  currentPaymentAction = type === 'official' ? 'verifyOfficial' : 'verifyPremium';
  currentHouseId = null;
  document.getElementById('paymentTitle').innerHTML = type === 'official' ? '<i class="fas fa-check-circle"></i> Official Landlord' : '<i class="fas fa-crown"></i> Premium Landlord';
  document.getElementById('paymentAmount').innerText = `Amount: MWK ${type === 'official' ? 2500 : 5000}`;
  document.getElementById('paymentModal').style.display = 'block';
  document.getElementById('paymentStatus').innerHTML = '';
  document.getElementById('phoneNumber').value = '';
}
function featureHouse(id) {
  currentPaymentAction = 'feature'; currentHouseId = id;
  document.getElementById('paymentTitle').innerHTML = '<i class="fas fa-star"></i> Feature House';
  document.getElementById('paymentAmount').innerText = 'Amount: MWK 5000';
  document.getElementById('paymentModal').style.display = 'block';
  document.getElementById('paymentStatus').innerHTML = '';
  document.getElementById('phoneNumber').value = '';
}
async function processPayment(method) {
  const phone = document.getElementById('phoneNumber').value.trim();
  if (!phone) { alert('Enter mobile money number'); return; }
  if (!phone.match(/^265[0-9]{9}$/)) { alert('Invalid phone number'); return; }
  const statusDiv = document.getElementById('paymentStatus');
  statusDiv.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Initiating...';
  let endpoint, httpMethod, body;
  if (currentPaymentAction === 'verifyOfficial') { endpoint = '/api/payment/verify'; httpMethod = 'POST'; body = { type: 'official', phone }; }
  else if (currentPaymentAction === 'verifyPremium') { endpoint = '/api/payment/verify'; httpMethod = 'POST'; body = { type: 'premium', phone }; }
  else if (currentPaymentAction === 'feature') { endpoint = '/api/payment/house/' + currentHouseId + '/feature'; httpMethod = 'PUT'; body = { phone }; }
  try {
    const res = await fetch(endpoint, { method: httpMethod, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) {
      if (data.payment_url) { statusDiv.innerHTML = 'Redirecting...'; window.location.href = data.payment_url; }
      else { statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> Payment initiated! Check your phone.'; setTimeout(() => { closePaymentModal(); if (currentPaymentAction.includes('verify')) fetchUser(); else loadMyHouses(); }, 5000); }
    } else statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed: ' + (data.message || 'Error');
  } catch (err) { statusDiv.innerHTML = '<i class="fas fa-times-circle"></i> Network error'; }
}
function closePaymentModal() { document.getElementById('paymentModal').style.display = 'none'; currentPaymentAction = null; currentHouseId = null; }
async function loadUnreadCount() {
  try {
    const res = await fetch("/api/chat/my", { headers: { Authorization: "Bearer " + token } });
    const chats = await res.json();
    let unread = 0;
    chats.forEach(chat => { const lastMsg = chat.messages[chat.messages.length-1]; if (lastMsg && !lastMsg.read && lastMsg.sender !== currentUser?._id) unread++; });
    const badge = document.getElementById("messageBadge");
    if (badge) { if (unread > 0) { badge.textContent = unread; badge.style.display = 'inline'; } else badge.style.display = 'none'; }
  } catch (err) { console.error(err); }
}
setInterval(loadUnreadCount, 30000);

function initMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;
  setTimeout(() => {
    map = L.map('map').setView([-15.7861, 35.0058], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    map.on("click", function (e) {
      document.getElementById("latitude").value = e.latlng.lat;
      document.getElementById("longitude").value = e.latlng.lng;
      if (marker) map.removeLayer(marker);
      marker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);
    });
  }, 100);
}
function getLocation() {
  const statusDiv = document.getElementById('gpsStatus');
  if (!statusDiv) return;
  statusDiv.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Getting location...';
  navigator.geolocation.getCurrentPosition(position => {
    const lat = position.coords.latitude, lng = position.coords.longitude;
    document.getElementById("latitude").value = lat;
    document.getElementById("longitude").value = lng;
    map.setView([lat, lng], 16);
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng]).addTo(map);
    statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> Location captured!';
    setTimeout(() => statusDiv.innerHTML = '', 3000);
  }, () => {
    statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Unable to get location. Please allow permissions.';
  });
}
async function loadMyHouses() {
  try {
    const res = await fetch("/api/houses/my-houses", { headers: { Authorization: "Bearer " + token } });
    const houses = await res.json();
    myHouses = houses;
    const totalHouses = houses.length;
    const totalViews = houses.reduce((sum, h) => sum + (h.views || 0), 0);
    const avgRating = houses.reduce((sum, h) => sum + (h.averageRating || 0), 0) / (totalHouses || 1);
    const totalBookings = houses.reduce((sum, h) => sum + (h.bookings || 0), 0);
    animateValue(document.getElementById("totalHouses"), 0, totalHouses, 800);
    animateValue(document.getElementById("totalViews"), 0, totalViews, 800);
    animateValue(document.getElementById("avgRating"), 0, avgRating, 800);
    animateValue(document.getElementById("totalBookings"), 0, totalBookings, 800);
    housesPage = 0;
    renderHousesPage();
    loadBookingRequests();
    loadHouseStats();
    updateExtraSlots(houses);
  } catch (err) { console.error(err); }
}
function renderHousesPage() {
  const start = housesPage * housesPerPage;
  const end = start + housesPerPage;
  const housesToShow = myHouses.slice(start, end);
  renderHouses(housesToShow);
  const loadMoreBtn = document.getElementById('loadMoreHousesBtn');
  if (loadMoreBtn) loadMoreBtn.style.display = (end >= myHouses.length) ? 'none' : 'block';
}
document.getElementById('loadMoreHousesBtn')?.addEventListener('click', () => { housesPage++; renderHousesPage(); });
function updateExtraSlots(houses) {
  const recentDiv = document.getElementById("recentActivity");
  if (recentDiv) recentDiv.innerHTML = `<div class="activity-item"><i class="fas fa-eye"></i> ${Math.floor(Math.random()*50)+10} new views today</div><div class="activity-item"><i class="fas fa-calendar-check"></i> ${Math.floor(Math.random()*3)+1} new bookings</div><div class="activity-item"><i class="fas fa-star"></i> ${Math.floor(Math.random()*5)+1} new reviews</div>`;
  const topListings = [...houses].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,3);
  const topDiv = document.getElementById("topListings");
  if (topDiv) topDiv.innerHTML = topListings.length ? topListings.map(h => `<div class="top-house-item"><span><i class="fas fa-home"></i> ${h.name}</span><span><i class="fas fa-eye"></i> ${h.views||0}</span></div>`).join('') : '<p>No listings yet</p>';
}
async function loadHouseStats() {
  if (!myHouses.length) return;
  const house = myHouses[0];
  try {
    const res = await fetch(`/api/houses/stats/${house._id}`, { headers: { Authorization: "Bearer " + token } });
    const data = await res.json();
    const viewsData = data.views;
    const labels = viewsData.map(d => d.date);
    const views = viewsData.map(d => d.views);
    if (viewsChart) viewsChart.destroy();
    viewsChart = new Chart(document.getElementById('viewsChart'), { type: 'line', data: { labels, datasets: [{ label: 'Views', data: views, borderColor: '#3498db', fill: true, tension: 0.3 }] } });
    if (earningsChart) earningsChart.destroy();
    earningsChart = new Chart(document.getElementById('earningsChart'), { type: 'bar', data: { labels: ['Week 1','Week 2','Week 3','Week 4'], datasets: [{ label: 'MWK', data: [10000,15000,8000,20000], backgroundColor: '#2ecc71', borderRadius: 8 }] } });
    if (conversionChart) conversionChart.destroy();
    conversionChart = new Chart(document.getElementById('conversionChart'), { type: 'doughnut', data: { labels: ['Converted','Not'], datasets: [{ data: [5,95], backgroundColor: ['#f1c40f','#95a5a6'] }] } });
    const avgViews = views.reduce((a,b)=>a+b,0)/views.length;
    document.getElementById('insightText').innerHTML = `<i class="fas fa-chart-line"></i> ${avgViews > 20 ? '30% more views than similar houses. Great!' : '20% fewer views. Improve your photos.'}`;
  } catch (err) { console.error(err); }
}
function renderHouses(houses) {
  const container = document.getElementById("my-houses");
  container.innerHTML = "";
  houses.forEach(house => {
    const img = house.images?.length ? house.images[0] : "placeholder.jpg";
    const card = document.createElement("div"); card.className = "house-card";
    const featureButton = house.featured ? '<span class="featured-badge"><i class="fas fa-star"></i> Featured</span>' : `<button class="feature-btn" onclick="featureHouse('${house._id}')"><i class="fas fa-crown"></i> Feature (K5000)</button>`;
    card.innerHTML = `<img src="${img}"><div class="house-content"><h3>${house.name}</h3><p><i class="fas fa-map-marker-alt"></i> ${house.location || 'N/A'}</p><p><i class="fas fa-money-bill-wave"></i> MWK ${house.price?.toLocaleString()}</p><p><i class="fas fa-eye"></i> ${house.views||0}</p><p><i class="fas fa-star"></i> ${house.averageRating ? house.averageRating.toFixed(1) : 'No ratings'}</p><div class="house-actions"><button class="edit" onclick="openEditModal('${house._id}')"><i class="fas fa-edit"></i> Edit</button><button class="delete" onclick="deleteHouse('${house._id}')"><i class="fas fa-trash-alt"></i> Delete</button>${featureButton}<button class="booking-btn" onclick="openBookingModalFromDashboard('${house._id}', '${house.name}')"><i class="fas fa-calendar-check"></i> Request Booking</button></div></div>`;
    container.appendChild(card);
  });
}
window.openBookingModalFromDashboard = function(houseId, houseName) {
  window.currentBookingHouseId = houseId;
  document.getElementById("bookingHouseInfo").innerHTML = `<p><strong>${houseName}</strong></p>`;
  document.getElementById("bookingStart").value = '';
  document.getElementById("bookingEnd").value = '';
  document.getElementById("bookingMessage").value = '';
  document.getElementById("bookingStatus").innerHTML = '';
  document.getElementById("bookingModal").style.display = "block";
};
async function deleteHouse(id) {
  if (!confirm("Delete permanently?")) return;
  showLoading();
  try {
    const res = await fetch("/api/houses/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
    if (res.ok) { alert("House deleted"); loadMyHouses(); }
    else { const data = await res.json(); alert("Error: " + data.message); }
  } catch (err) { alert("Network error"); } finally { hideLoading(); }
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
  document.getElementById("editCondition").value = house.condition || 'Good';
  document.getElementById("editWifi").checked = house.wifi || false;
  document.getElementById("editParking").checked = house.parking || false;
  document.getElementById("editFurnished").checked = house.furnished || false;
  document.getElementById("editPetFriendly").checked = house.petFriendly || false;
  document.getElementById("editPool").checked = house.pool || false;
  document.getElementById("editAC").checked = house.ac || false;
  document.getElementById("editVirtualTourUrl").value = house.virtualTourUrl || '';
  const unavailableInput = document.getElementById("editUnavailableDates");
  if (unavailableInput._flatpickr) unavailableInput._flatpickr.destroy();
  flatpickr(unavailableInput, { mode: "multiple", dateFormat: "Y-m-d", defaultDate: house.unavailableDates ? house.unavailableDates.map(d => new Date(d)) : [] });
  document.getElementById("editModal").style.display = "block";
  setTimeout(() => {
    if (!editMap) { editMap = L.map('editMap').setView([house.lat || -15.7861, house.lng || 35.0058], 13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(editMap); editMap.on("click", e => { document.getElementById("editLat").value = e.latlng.lat; document.getElementById("editLng").value = e.latlng.lng; if (editMarker) editMap.removeLayer(editMarker); editMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(editMap); }); }
    else editMap.setView([house.lat || -15.7861, house.lng || 35.0058], 13);
    if (house.lat && house.lng) { if (editMarker) editMap.removeLayer(editMarker); editMarker = L.marker([house.lat, house.lng]).addTo(editMap); }
  }, 100);
}
function closeEditModal() { document.getElementById("editModal").style.display = "none"; if (editMarker) editMap.removeLayer(editMarker); editMarker = null; }
function getEditLocation() { navigator.geolocation.getCurrentPosition(pos => { document.getElementById("editLat").value = pos.coords.latitude; document.getElementById("editLng").value = pos.coords.longitude; editMap.setView([pos.coords.latitude, pos.coords.longitude], 16); if (editMarker) editMap.removeLayer(editMarker); editMarker = L.marker([pos.coords.latitude, pos.coords.longitude]).addTo(editMap); }); }
document.getElementById("editForm").addEventListener("submit", async e => {
  e.preventDefault(); showLoading();
  const formData = new FormData(e.target);
  formData.delete("houseId");
  const unavailableStr = document.getElementById("editUnavailableDates").value;
  const dates = unavailableStr ? unavailableStr.split(", ").filter(d => d) : [];
  formData.append("unavailableDates", JSON.stringify(dates));
  try {
    const res = await fetch("/api/houses/" + currentEditId, { method: "PUT", headers: { Authorization: "Bearer " + token }, body: formData });
    if (res.ok) { alert("✅ House updated!"); closeEditModal(); loadMyHouses(); }
    else { const data = await res.json(); alert("❌ Update failed: " + (data.message || "Unknown error")); }
  } catch (err) { alert("❌ Network error"); } finally { hideLoading(); }
});
document.querySelector('input[name="images"]').addEventListener('change', function(e) {
  const preview = document.getElementById('imagePreview'); preview.innerHTML = '';
  Array.from(e.target.files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10*1024*1024) { alert('File too large'); return; }
    const reader = new FileReader();
    reader.onload = (event) => { const img = document.createElement('img'); img.src = event.target.result; img.style.width = '100px'; img.style.height = '100px'; img.style.objectFit = 'cover'; img.style.borderRadius = '8px'; preview.appendChild(img); };
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
  if (!name || !location || !price || price<=0 || !phone.match(/^265[0-9]{9}$/) || images.length===0) { alert('Please fill all fields correctly'); return; }
  showLoading();
  const formData = new FormData(e.target);
  try {
    const res = await fetch("/api/houses", { method: "POST", headers: { Authorization: "Bearer " + token }, body: formData });
    const data = await res.json();
    if (res.ok) { alert("✅ House uploaded!"); e.target.reset(); document.getElementById('imagePreview').innerHTML = ''; if (marker) map.removeLayer(marker); loadMyHouses(); }
    else alert("❌ Upload failed: " + (data.message || "Unknown error"));
  } catch (err) { alert("❌ Network error"); } finally { hideLoading(); }
});
async function loadBookingRequests() {
  try {
    let allBookings = [];
    for (let house of myHouses) {
      const res = await fetch(`/api/bookings/house/${house._id}`, { headers: { Authorization: "Bearer " + token } });
      if (res.ok) { const bookings = await res.json(); allBookings.push(...bookings); }
    }
    renderBookings(allBookings);
  } catch (err) { console.error(err); }
}
function renderBookings(bookings) {
  const container = document.getElementById("bookingRequests");
  if (!container) return;
  container.innerHTML = "";
  if (bookings.length === 0) { container.innerHTML = "<p>No booking requests.</p>"; return; }
  bookings.forEach(b => {
    const card = document.createElement("div"); card.className = "booking-card";
    card.innerHTML = `<p><strong><i class="fas fa-home"></i> ${b.houseName || b.house?.name}</strong></p><p><i class="fas fa-user"></i> ${b.tenantName} (${b.tenantEmail})</p><p><i class="fas fa-calendar-alt"></i> ${new Date(b.startDate).toLocaleDateString()} - ${new Date(b.endDate).toLocaleDateString()}</p><p><i class="fas fa-comment"></i> ${b.message || 'No message'}</p><p>Status: <span class="booking-status ${b.status}">${b.status}</span></p>`;
    if (b.status === 'pending') {
      const actions = document.createElement('div'); actions.className = 'booking-actions';
      actions.innerHTML = `<button class="approve-btn" onclick="updateBooking('${b._id}', 'approved')"><i class="fas fa-check"></i> Approve</button><button class="reject-btn" onclick="updateBooking('${b._id}', 'rejected')"><i class="fas fa-times"></i> Reject</button>`;
      card.appendChild(actions);
    }
    container.appendChild(card);
  });
}
async function updateBooking(bookingId, status) {
  showLoading();
  try {
    const res = await fetch(`/api/bookings/${bookingId}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ status }) });
    if (res.ok) { alert(`Booking ${status}`); loadBookingRequests(); loadMyHouses(); }
    else { const data = await res.json(); alert("Error: " + data.message); }
  } catch (err) { alert("Network error"); } finally { hideLoading(); }
}
async function loadOffers() {
  try {
    const res = await fetch("/api/offers/my-houses", { headers: { Authorization: "Bearer " + token } });
    const offers = await res.json();
    const container = document.getElementById("offersList");
    if (!container) return;
    if (offers.length === 0) { container.innerHTML = "<p>No offers yet.</p>"; return; }
    container.innerHTML = offers.map(offer => `
      <div class="offer-card" data-id="${offer._id}">
        <div class="offer-header"><strong>${offer.houseId?.name || 'Unknown'}</strong><span class="offer-status ${offer.status}">${offer.status}</span></div>
        <div class="offer-details"><p><i class="fas fa-user"></i> ${offer.tenantId?.name || 'Unknown'}</p><p><i class="fas fa-money-bill-wave"></i> MWK ${offer.proposedPrice.toLocaleString()}</p><p><i class="fas fa-calendar-alt"></i> ${new Date(offer.moveInDate).toLocaleDateString()}</p><p><i class="fas fa-comment"></i> ${offer.tenantComment || 'No message'}</p>${offer.counterOfferPrice ? `<p><i class="fas fa-exchange-alt"></i> Counter: MWK ${offer.counterOfferPrice.toLocaleString()}</p>` : ''}</div>
        <div class="offer-actions">
          ${offer.status === 'pending' ? `<button class="accept-offer" data-id="${offer._id}">Accept</button><button class="reject-offer" data-id="${offer._id}">Reject</button><button class="counter-offer" data-id="${offer._id}">Counter</button>` : ''}
          ${offer.status === 'countered' ? `<button class="accept-offer" data-id="${offer._id}">Accept Counter</button><button class="reject-offer" data-id="${offer._id}">Reject Counter</button>` : ''}
          <button class="delete-offer" data-id="${offer._id}"><i class="fas fa-trash-alt"></i> Delete</button>
        </div>
      </div>
    `).join('');
    document.querySelectorAll('.accept-offer').forEach(btn => btn.addEventListener('click', () => updateOffer(btn.dataset.id, 'accept')));
    document.querySelectorAll('.reject-offer').forEach(btn => btn.addEventListener('click', () => updateOffer(btn.dataset.id, 'reject')));
    document.querySelectorAll('.counter-offer').forEach(btn => btn.addEventListener('click', () => showCounterModal(btn.dataset.id)));
    document.querySelectorAll('.delete-offer').forEach(btn => btn.addEventListener('click', () => deleteOffer(btn.dataset.id)));
  } catch (err) { console.error(err); }
}
async function updateOffer(offerId, action) {
  if (!confirm(`Are you sure you want to ${action} this offer?`)) return;
  try {
    const res = await fetch(`/api/offers/${offerId}/${action}`, { method: 'PUT', headers: { Authorization: 'Bearer ' + token } });
    if (res.ok) { alert(`Offer ${action}ed`); loadOffers(); }
    else { const data = await res.json(); alert('Failed: ' + data.message); }
  } catch (err) { alert('Network error'); }
}
async function deleteOffer(offerId) {
  if (!confirm('Delete this offer permanently? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/offers/${offerId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    if (res.ok) { alert('Offer deleted'); loadOffers(); }
    else { const data = await res.json(); alert('Failed: ' + data.message); }
  } catch (err) { alert('Network error'); }
}
function showCounterModal(offerId) {
  const price = prompt('Enter your counter offer price (MWK):');
  if (!price) return;
  const moveInDate = prompt('Proposed move‑in date (YYYY-MM-DD):');
  if (!moveInDate) return;
  const comment = prompt('Optional message to tenant:');
  fetch(`/api/offers/${offerId}/counter`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ counterOfferPrice: parseInt(price), moveInDate, landlordComment: comment || '' }) }).then(res => res.json()).then(data => { if (data.message) alert(data.message); loadOffers(); }).catch(err => console.error(err));
}
// ========== LEASE NEGOTIATIONS (FIXED – loads signed date and contract download) ==========
async function loadLeaseNegotiations() {
  try {
    const res = await fetch("/api/lease/my", { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) {
      console.error("Failed to fetch leases:", res.status, res.statusText);
      document.getElementById("leaseList").innerHTML = "<p>Error loading lease negotiations. Please ensure the lease route is configured.</p>";
      return;
    }
    const leases = await res.json();
    const container = document.getElementById("leaseList");
    if (!container) return;
    if (!leases || leases.length === 0) {
      container.innerHTML = "<p>No lease negotiations yet.</p>";
      return;
    }
    container.innerHTML = leases.map(lease => {
      let statusClass = 'offer-status';
      let statusText = lease.status;
      if (lease.status === 'signed' || lease.status === 'active') {
        statusClass += ' accepted';
        statusText = 'Signed ✓';
      } else if (lease.status === 'agreed') {
        statusClass += ' pending';
        statusText = 'Awaiting Signatures';
      } else if (lease.status === 'negotiating') {
        statusClass += ' pending';
      } else if (lease.status === 'rejected') {
        statusClass += ' rejected';
      }
      const tenantName = lease.tenantId?.name || 'Not joined';
      const signedDate = lease.signedAt ? new Date(lease.signedAt).toLocaleDateString() : 'Not signed';
      // Download button using the secure signed‑URL method
      const downloadButton = (lease.status === 'signed' || lease.status === 'active') 
        ? `<button class="btn" style="background: #2563eb; color: white; padding: 0.3rem 0.8rem; border-radius: 30px; font-size: 0.7rem; margin-left: 0.5rem;" onclick="downloadLeaseContract('${lease._id}')"><i class="fas fa-download"></i> Contract</button>`
        : '';
      return `
        <div class="lease-card">
          <div class="offer-header">
            <strong>${lease.houseId?.name || 'Unknown property'}</strong>
            <span class="${statusClass}">${statusText}</span>
          </div>
          <div class="offer-details">
            <p><i class="fas fa-user"></i> Tenant: ${tenantName}</p>
            <p><i class="fas fa-money-bill-wave"></i> Rent: MWK ${lease.rentAmount?.toLocaleString()}</p>
            <p><i class="fas fa-calendar-alt"></i> Start: ${new Date(lease.leaseStartDate).toLocaleDateString()}</p>
            <p><i class="fas fa-chart-line"></i> Lease Score: ${lease.leaseScore}/100</p>
            <p><i class="fas fa-calendar-check"></i> Signed Date: ${signedDate}</p>
          </div>
          <div class="offer-actions">
            <button class="edit" onclick="window.location.href='lease-negotiation.html?id=${lease._id}'">Continue Negotiation</button>
            ${downloadButton}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    document.getElementById("leaseList").innerHTML = "<p>Error loading lease negotiations. Please refresh.</p>";
  }
}
// Helper to download contract via signed URL
window.downloadLeaseContract = async function(negotiationId) {
  try {
    const res = await fetch(`/api/lease/download-temp/${negotiationId}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    if (res.ok && data.downloadUrl) {
      window.open(data.downloadUrl, '_blank');
    } else {
      alert('Failed to get download link');
    }
  } catch (err) {
    alert('Network error');
  }
};

// Initialize everything
initMap();
fetchUser();
loadMyHouses();
loadUnreadCount();
setTimeout(() => {
  if (document.getElementById("offersList")) loadOffers();
  if (document.getElementById("leaseList")) loadLeaseNegotiations();
}, 500);

// Expose functions globally
window.payForVerification = payForVerification;
window.featureHouse = featureHouse;
window.processPayment = processPayment;
window.closePaymentModal = closePaymentModal;
window.updateBooking = updateBooking;
window.openEditProfile = openEditProfile;
window.closeProfileModal = closeProfileModal;
window.deleteOffer = deleteOffer;
window.downloadLeaseContract = downloadLeaseContract;