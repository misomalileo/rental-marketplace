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

// ========== CUSTOM MODAL SYSTEM ==========
function showModal(message, type = 'info', onConfirm = null, onCancel = null) {
  const overlay = document.createElement('div');
  overlay.className = 'custom-modal-overlay';
  let icon = '<i class="fas fa-info-circle"></i>';
  let title = 'Information';
  if (type === 'success') { icon = '<i class="fas fa-check-circle" style="color: #10b981;"></i>'; title = 'Success'; }
  else if (type === 'error') { icon = '<i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>'; title = 'Error'; }
  else if (type === 'confirm') { icon = '<i class="fas fa-question-circle" style="color: #f59e0b;"></i>'; title = 'Confirmation'; }
  overlay.innerHTML = `<div class="custom-modal">${icon}<h3>${title}</h3><p>${message}</p><div class="custom-modal-buttons">${type === 'confirm' ? '<button class="custom-modal-btn confirm">Yes, Proceed</button><button class="custom-modal-btn cancel">Cancel</button>' : '<button class="custom-modal-btn confirm">OK</button>'}</div></div>`;
  document.body.appendChild(overlay);
  const confirmBtn = overlay.querySelector('.confirm');
  const cancelBtn = overlay.querySelector('.cancel');
  confirmBtn?.addEventListener('click', () => { overlay.remove(); if (onConfirm) onConfirm(); });
  cancelBtn?.addEventListener('click', () => { overlay.remove(); if (onCancel) onCancel(); });
}

// ========== MAP INIT ==========
function initMap() {
  const container = document.getElementById('map');
  if (!container) return;
  const tryInit = () => {
    if (container.offsetWidth > 0) {
      map = L.map('map').setView([-15.7861, 35.0058], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      map.on('click', e => {
        document.getElementById('latitude').value = e.latlng.lat;
        document.getElementById('longitude').value = e.latlng.lng;
        if (marker) map.removeLayer(marker);
        marker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);
      });
    } else setTimeout(tryInit, 300);
  };
  tryInit();
}
initMap();

function getLocation() {
  const statusDiv = document.getElementById('gpsStatus');
  if (!statusDiv) return;
  statusDiv.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Getting location...';
  navigator.geolocation.getCurrentPosition(pos => {
    document.getElementById('latitude').value = pos.coords.latitude;
    document.getElementById('longitude').value = pos.coords.longitude;
    map.setView([pos.coords.latitude, pos.coords.longitude], 16);
    if (marker) map.removeLayer(marker);
    marker = L.marker([pos.coords.latitude, pos.coords.longitude]).addTo(map);
    statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> Location captured!';
    setTimeout(() => statusDiv.innerHTML = '', 2000);
  }, () => statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Unable to get location.');
}

// ========== PROPERTY TYPES & DETAILS ==========
const propertyTypeFields = {
  House: ['bedrooms','bathrooms','selfContained','hasGarden','parkingSpaces','furnished','petFriendly','ac','wifi','pool'],
  Apartment: ['bedrooms','bathrooms','floorLevel','hasElevator','selfContained','furnished','parking','securityGuard'],
  Room: ['roomType','sharedWith','bathroomType','kitchenAccess','selfContained','furnished','waterHeater'],
  Hostel: ['totalRooms','vacancies','bedsPerRoom','sharedBathroom','commonKitchen','curfew','laundryService','security'],
  Office: ['officeSize','hasReception','parking','ac','furnished'],
  FurnishedApartment: ['bedrooms','bathrooms','furnitureIncluded','utilitiesIncluded','internetSpeed','weeklyCleaning','parking','ac'],
  ShortStay: ['dailyPrice','weeklyPrice','minimumStay','maximumStay','instantBooking','selfCheckin','towelsLinen','cleaningFee','securityDeposit'],
  SharedLiving: ['totalBeds','availableBeds','genderPreference','sharedRoomSize','lockerProvided','commonArea','curfew'],
  StudentAccommodation: ['nearbyUniversity','studentOnly','studyRoom','mealPlan','counselingService','securityGuard','laundry','wifiInRooms','bicycleParking']
};
let selectedType = null;
let typeSpecificData = {};

function generatePropertyDetailsFields(type) {
  const container = document.getElementById('propertyDetailsContainer');
  if (!container) return;
  const fields = propertyTypeFields[type] || [];
  if (fields.length === 0) { container.innerHTML = '<p class="info">No additional details needed.</p>'; return; }
  let html = '<div class="details-grid">';
  fields.forEach(field => {
    const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    let inputHtml = '';
    if (field === 'roomType') inputHtml = `<select id="detail_${field}"><option value="single">Single</option><option value="double">Double</option><option value="shared">Shared</option></select>`;
    else if (field === 'bathroomType') inputHtml = `<select id="detail_${field}"><option value="private">Private</option><option value="shared">Shared</option><option value="outside">Outside</option></select>`;
    else if (field === 'genderPreference') inputHtml = `<select id="detail_${field}"><option value="boys">Boys only</option><option value="girls">Girls only</option><option value="mixed">Mixed</option></select>`;
    else if (field === 'furnitureIncluded' || field === 'utilitiesIncluded') inputHtml = `<input type="text" id="detail_${field}" placeholder="e.g., bed,sofa / water,electricity">`;
    else if (['selfContained','hasGarden','hasElevator','kitchenAccess','sharedBathroom','commonKitchen','laundryService','studentOnly','studyRoom','mealPlan','counselingService','wifiInRooms','bicycleParking','lockerProvided','commonArea','instantBooking','selfCheckin','towelsLinen','weeklyCleaning'].includes(field))
      inputHtml = `<select id="detail_${field}"><option value="true">Yes</option><option value="false">No</option></select>`;
    else if (field === 'dailyPrice' || field === 'weeklyPrice' || field === 'cleaningFee' || field === 'securityDeposit')
      inputHtml = `<input type="number" id="detail_${field}" placeholder="MWK">`;
    else inputHtml = `<input type="text" id="detail_${field}" placeholder="Enter ${label.toLowerCase()}">`;
    html += `<div class="form-group"><label>${label}</label>${inputHtml}</div>`;
  });
  html += '</div>';
  container.innerHTML = html;
  document.querySelectorAll('#propertyDetailsContainer input, #propertyDetailsContainer select').forEach(inp => {
    inp.addEventListener('change', () => {
      let val = inp.value;
      if (inp.type === 'checkbox') val = inp.checked;
      else if (inp.tagName === 'SELECT' && (inp.options[0]?.value === 'true' || inp.options[0]?.value === 'false'))
        val = inp.value === 'true';
      const key = inp.id.replace('detail_', '');
      typeSpecificData[key] = val;
    });
  });
}

function collectPropertyDetails() {
  const details = {};
  document.querySelectorAll('#propertyDetailsContainer input, #propertyDetailsContainer select').forEach(inp => {
    let val = inp.value;
    if (inp.type === 'checkbox') val = inp.checked;
    else if (inp.tagName === 'SELECT' && (inp.options[0]?.value === 'true' || inp.options[0]?.value === 'false'))
      val = inp.value === 'true';
    const key = inp.id.replace('detail_', '');
    details[key] = val;
  });
  return details;
}

function togglePriceFields(type) {
  const monthly = document.getElementById('monthlyPriceGroup');
  const daily = document.getElementById('dailyPriceGroup');
  if (!monthly || !daily) return;
  if (type === 'ShortStay') {
    monthly.style.display = 'none';
    daily.style.display = 'block';
    document.getElementById('propPrice').removeAttribute('required');
  } else {
    monthly.style.display = 'block';
    daily.style.display = 'none';
    document.getElementById('propPrice').setAttribute('required', 'required');
  }
}

function generateTypeCards() {
  const container = document.getElementById('typeSelector');
  if (!container) return;
  const types = [
    { id: 'House', name: 'House', icon: 'fas fa-home' },
    { id: 'Apartment', name: 'Apartment', icon: 'fas fa-building' },
    { id: 'Room', name: 'Room', icon: 'fas fa-bed' },
    { id: 'Hostel', name: 'Hostel', icon: 'fas fa-hotel' },
    { id: 'Office', name: 'Office', icon: 'fas fa-briefcase' },
    { id: 'FurnishedApartment', name: 'Furnished Apt', icon: 'fas fa-couch' },
    { id: 'ShortStay', name: 'Short-Stay', icon: 'fas fa-calendar-week' },
    { id: 'SharedLiving', name: 'Shared Living', icon: 'fas fa-users' },
    { id: 'StudentAccommodation', name: 'Student Acc', icon: 'fas fa-graduation-cap' }
  ];
  container.innerHTML = '';
  types.forEach(t => {
    const card = document.createElement('div');
    card.className = 'type-card';
    card.innerHTML = `<i class="${t.icon}"></i><span>${t.name}</span>`;
    card.addEventListener('click', () => {
      document.querySelectorAll('.type-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedType = t.id;
      generatePropertyDetailsFields(t.id);
      togglePriceFields(t.id);
    });
    container.appendChild(card);
  });
}

// ========== FETCH USER & PROFILE ==========
async function fetchUser() {
  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    if (res.ok) {
      currentUser = await res.json();
      updateVerificationUI();
      updateProfileCard();
      addPremiumCrownToAvatar();
      if (!currentUser.profileCompleted) showProfileModal();
    }
  } catch (err) { console.error(err); }
}

function updateProfileCard() {
  if (!currentUser) return;
  document.getElementById('profileAvatar').src = currentUser.profilePicture || 'default-avatar.png';
  document.getElementById('profileDisplayName').innerText = currentUser.name;
  document.getElementById('profileDisplayBusiness').innerHTML = currentUser.businessName ? `<strong>${currentUser.businessName}</strong>` : '';
  addPremiumCrownToAvatar();
}

function showProfileModal() {
  document.getElementById('profileName').value = currentUser.name || '';
  document.getElementById('profilePhone').value = currentUser.phone || '';
  document.getElementById('profileBusinessName').value = currentUser.businessName || '';
  document.getElementById('profileAddress').value = currentUser.address || '';
  document.getElementById('profileBio').value = currentUser.bio || '';
  document.getElementById('profileModal').style.display = 'block';
}

function closeProfileModal() { document.getElementById('profileModal').style.display = 'none'; }
window.closeProfileModal = closeProfileModal;

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
  if (!phone.match(/^265[0-9]{9}$/)) { showModal('Phone must be 265XXXXXXXXX', 'error'); hideLoading(); return; }
  let profilePictureUrl = currentUser.profilePicture || '';
  const file = document.getElementById('profilePicture').files[0];
  if (file) {
    const fd = new FormData(); fd.append('image', file);
    try {
      const up = await fetch('/api/houses/test-upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
      const upData = await up.json();
      if (up.ok) profilePictureUrl = upData.url;
      else { showModal('Failed to upload picture', 'error'); hideLoading(); return; }
    } catch (err) { showModal('Network error', 'error'); hideLoading(); return; }
  }
  try {
    const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ name, phone, businessName, address, bio, profilePicture: profilePictureUrl }) });
    if (res.ok) { currentUser = await res.json(); updateProfileCard(); showModal('Profile saved!', 'success'); closeProfileModal(); }
    else { const data = await res.json(); showModal('Error: ' + data.message, 'error'); }
  } catch (err) { showModal('Network error', 'error'); } finally { hideLoading(); }
});

document.getElementById('profilePicture').addEventListener('change', function(e) {
  const file = e.target.files[0];
  const preview = document.getElementById('profilePreview');
  preview.innerHTML = '';
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = ev => { const img = document.createElement('img'); img.src = ev.target.result; img.style.width = '80px'; img.style.height = '80px'; img.style.objectFit = 'cover'; img.style.borderRadius = '8px'; preview.appendChild(img); };
    reader.readAsDataURL(file);
  }
});

function updateVerificationUI() {
  const container = document.getElementById('verification-status');
  if (!container || !currentUser) return;
  let daysLeft = '';
  if (currentUser.subscriptionExpiresAt) {
    const now = new Date(), expiry = new Date(currentUser.subscriptionExpiresAt);
    const diff = Math.ceil((expiry - now) / (1000*60*60*24));
    if (diff > 0) daysLeft = ` (${diff} days left)`;
    else daysLeft = ' (Expired)';
  }
  if (currentUser.verificationType === 'premium') container.innerHTML = `<span><i class="fas fa-star"></i> Premium Landlord${daysLeft}</span>`;
  else if (currentUser.verificationType === 'official') container.innerHTML = `<span><i class="fas fa-check-circle"></i> Official Landlord${daysLeft}</span><button class="payment-btn premium" onclick="payForVerification('premium')">Upgrade to PREMIUM (K5000)</button>`;
  else container.innerHTML = `<span><i class="fas fa-lock"></i> Not Verified${daysLeft}</span><button class="payment-btn official" onclick="payForVerification('official')">Become OFFICIAL (K2500)</button><button class="payment-btn premium" onclick="payForVerification('premium')">Become PREMIUM (K5000)</button>`;
}

function payForVerification(type) {
  currentPaymentAction = type === 'official' ? 'verifyOfficial' : 'verifyPremium';
  currentHouseId = null;
  document.getElementById('paymentTitle').innerHTML = type === 'official' ? 'Official Landlord' : 'Premium Landlord';
  document.getElementById('paymentAmount').innerText = `MWK ${type === 'official' ? 2500 : 5000}`;
  document.getElementById('paymentModal').style.display = 'block';
  document.getElementById('paymentStatus').innerHTML = '';
  document.getElementById('phoneNumber').value = '';
}

function featureHouse(id) {
  currentPaymentAction = 'feature';
  currentHouseId = id;
  document.getElementById('paymentTitle').innerHTML = 'Feature House';
  document.getElementById('paymentAmount').innerText = 'MWK 5000';
  document.getElementById('paymentModal').style.display = 'block';
  document.getElementById('paymentStatus').innerHTML = '';
  document.getElementById('phoneNumber').value = '';
}

async function processPayment(method) {
  const phone = document.getElementById('phoneNumber').value.trim();
  if (!phone) { showModal('Enter mobile money number', 'error'); return; }
  if (!phone.match(/^265[0-9]{9}$/)) { showModal('Invalid phone number', 'error'); return; }
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
window.closePaymentModal = closePaymentModal;

async function loadUnreadCount() {
  try {
    const res = await fetch('/api/chat/my', { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error();
    const chats = await res.json();
    let unread = 0;
    chats.forEach(chat => {
      const last = chat.messages[chat.messages.length - 1];
      if (last && !last.read && last.sender !== currentUser?._id) unread++;
    });
    const badge = document.getElementById('messageBadge');
    if (badge) badge.style.display = unread > 0 ? 'inline' : 'none';
    if (badge && unread > 0) badge.textContent = unread;
  } catch (err) { console.warn('Chat not available'); }
}
setInterval(loadUnreadCount, 30000);

// ========== MY HOUSES ==========
async function loadMyHouses() {
  try {
    const res = await fetch('/api/houses/my-houses', { headers: { Authorization: 'Bearer ' + token } });
    const houses = await res.json();
    myHouses = houses;
    const total = houses.length;
    const views = houses.reduce((s, h) => s + (h.views || 0), 0);
    const avg = houses.reduce((s, h) => s + (h.averageRating || 0), 0) / (total || 1);
    const bookings = houses.reduce((s, h) => s + (h.bookings || 0), 0);
    animateValue(document.getElementById('totalHouses'), 0, total, 800);
    animateValue(document.getElementById('totalViews'), 0, views, 800);
    animateValue(document.getElementById('avgRating'), 0, avg, 800);
    animateValue(document.getElementById('totalBookings'), 0, bookings, 800);
    housesPage = 0;
    renderHousesPage();
    loadBookingRequests();
    loadHouseStats();
  } catch (err) { console.error(err); }
}

function renderHousesPage() {
  const start = housesPage * housesPerPage;
  const end = start + housesPerPage;
  const toShow = myHouses.slice(start, end);
  renderHouses(toShow);
  const btn = document.getElementById('loadMoreHousesBtn');
  if (btn) btn.style.display = (end >= myHouses.length) ? 'none' : 'block';
}

function renderHouses(houses) {
  const container = document.getElementById('my-houses');
  container.innerHTML = '';
  houses.forEach(house => {
    const img = house.images?.[0] || 'placeholder.jpg';
    const rentalStatusBadge = house.rentalStatus === 'rented' ? '<span class="rental-badge rented"><i class="fas fa-check-circle"></i> Rented</span>' : (house.rentalStatus === 'pending' ? '<span class="rental-badge pending"><i class="fas fa-clock"></i> Pending</span>' : '<span class="rental-badge available"><i class="fas fa-home"></i> Available</span>');
    let rentalAction = '';
    if (house.rentalStatus === 'available') rentalAction = `<button class="mark-rented-btn" data-id="${house._id}"><i class="fas fa-hand-peace"></i> Mark Rented</button>`;
    else if (house.rentalStatus === 'rented') rentalAction = `<button class="mark-available-btn" data-id="${house._id}"><i class="fas fa-undo-alt"></i> Mark Available</button>`;
    else rentalAction = `<button class="mark-available-btn" data-id="${house._id}"><i class="fas fa-undo-alt"></i> Make Available</button>`;
    const featureBtn = house.featured ? '<span class="featured-badge"><i class="fas fa-star"></i> Featured</span>' : `<button class="feature-btn" onclick="featureHouse('${house._id}')"><i class="fas fa-crown"></i> Feature (K5000)</button>`;
    container.innerHTML += `
      <div class="house-card">
        <img src="${img}">
        <div class="house-content">
          <h3 style="font-size:0.9rem;">${house.name}</h3>
          ${rentalStatusBadge}
          <p><i class="fas fa-map-marker-alt"></i> ${house.location || 'N/A'}</p>
          <p><i class="fas fa-money-bill-wave"></i> MWK ${house.price?.toLocaleString()}</p>
          <p><i class="fas fa-eye"></i> ${house.views || 0}</p>
          <p><i class="fas fa-star"></i> ${house.averageRating ? house.averageRating.toFixed(1) : 'No ratings'}</p>
          <div class="house-actions">
            <button class="edit" onclick="openEditModal('${house._id}')"><i class="fas fa-edit"></i> Edit</button>
            <button class="delete" onclick="deleteHouse('${house._id}')"><i class="fas fa-trash-alt"></i> Delete</button>
            ${rentalAction}
            ${featureBtn}
            <button class="booking-btn" onclick="openBookingModalFromDashboard('${house._id}', '${house.name}')"><i class="fas fa-calendar-check"></i> Request Booking</button>
          </div>
        </div>
      </div>
    `;
  });
  document.querySelectorAll('.mark-rented-btn').forEach(btn => btn.addEventListener('click', async e => {
    const id = btn.getAttribute('data-id');
    showModal('Mark this property as rented? It will disappear from public listings.', 'confirm', async () => { await updateRentalStatus(id, 'rented'); loadMyHouses(); });
  }));
  document.querySelectorAll('.mark-available-btn').forEach(btn => btn.addEventListener('click', async e => {
    const id = btn.getAttribute('data-id');
    showModal('Mark this property as available again? It will reappear.', 'confirm', async () => { await updateRentalStatus(id, 'available'); loadMyHouses(); });
  }));
}

async function updateRentalStatus(houseId, status) {
  try {
    const res = await fetch(`/api/houses/${houseId}/rental-status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ rentalStatus: status })
    });
    if (res.ok) showModal(`Property marked as ${status}`, 'success');
    else { const err = await res.json(); showModal(err.message || 'Failed', 'error'); }
  } catch (err) { showModal('Network error', 'error'); }
}

async function deleteHouse(id) {
  showModal('Delete this property permanently?', 'confirm', async () => {
    showLoading();
    try {
      const res = await fetch('/api/houses/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      if (res.ok) { showModal('Property deleted', 'success'); loadMyHouses(); }
      else { const data = await res.json(); showModal('Error: ' + data.message, 'error'); }
    } catch (err) { showModal('Network error', 'error'); } finally { hideLoading(); }
  });
}

// ========== IMAGE PREVIEW WITH REMOVE BUTTON ==========
let uploadFileList = [];
let editUploadFileList = [];

function updateImagePreview(containerId, fileList, inputElementId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!file.type.startsWith('image/')) continue;
    const reader = new FileReader();
    reader.onload = (function(idx) {
      return function(e) {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-preview-item';
        const img = document.createElement('img');
        img.src = e.target.result;
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.className = 'image-preview-remove';
        removeBtn.addEventListener('click', (function(i) {
          return function() {
            fileList.splice(i, 1);
            updateImagePreview(containerId, fileList, inputElementId);
            const dataTransfer = new DataTransfer();
            for (let f of fileList) dataTransfer.items.add(f);
            document.getElementById(inputElementId).files = dataTransfer.files;
          };
        })(idx));
        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        container.appendChild(wrapper);
      };
    })(i);
    reader.readAsDataURL(file);
  }
}

document.getElementById('uploadImages').addEventListener('change', function(e) {
  const files = Array.from(e.target.files);
  uploadFileList = files;
  updateImagePreview('imagePreview', uploadFileList, 'uploadImages');
});

document.getElementById('editImages').addEventListener('change', function(e) {
  const files = Array.from(e.target.files);
  editUploadFileList = files;
  updateImagePreview('editImagePreview', editUploadFileList, 'editImages');
});

// ========== EDIT MODAL FUNCTIONS ==========
function openEditModal(houseId) {
  currentEditId = houseId;
  const house = myHouses.find(h => h._id === houseId);
  if (!house) return;
  document.getElementById('editHouseId').value = house._id;
  document.getElementById('editName').value = house.name || '';
  document.getElementById('editLocation').value = house.location || '';
  document.getElementById('editPrice').value = house.price || '';
  document.getElementById('editPhone').value = house.phone || '';
  document.getElementById('editDescription').value = house.description || '';
  document.getElementById('editLat').value = house.lat || '';
  document.getElementById('editLng').value = house.lng || '';
  document.getElementById('editType').value = house.type || 'House';
  document.getElementById('editBedrooms').value = house.bedrooms || 0;
  document.getElementById('editCondition').value = house.condition || 'Good';
  document.getElementById('editWifi').checked = house.wifi || false;
  document.getElementById('editParking').checked = house.parking || false;
  document.getElementById('editFurnished').checked = house.furnished || false;
  document.getElementById('editPetFriendly').checked = house.petFriendly || false;
  document.getElementById('editPool').checked = house.pool || false;
  document.getElementById('editAC').checked = house.ac || false;
  document.getElementById('editVirtualTourUrl').value = house.virtualTourUrl || '';
  const unavail = document.getElementById('editUnavailableDates');
  if (unavail._flatpickr) unavail._flatpickr.destroy();
  flatpickr(unavail, { mode: 'multiple', dateFormat: 'Y-m-d', defaultDate: house.unavailableDates ? house.unavailableDates.map(d => new Date(d)) : [] });
  document.getElementById('editModal').style.display = 'block';
  setTimeout(() => {
    if (!editMap) {
      editMap = L.map('editMap').setView([house.lat || -15.7861, house.lng || 35.0058], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(editMap);
      editMap.on('click', e => {
        document.getElementById('editLat').value = e.latlng.lat;
        document.getElementById('editLng').value = e.latlng.lng;
        if (editMarker) editMap.removeLayer(editMarker);
        editMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(editMap);
      });
    } else editMap.setView([house.lat || -15.7861, house.lng || 35.0058], 13);
    if (house.lat && house.lng) {
      if (editMarker) editMap.removeLayer(editMarker);
      editMarker = L.marker([house.lat, house.lng]).addTo(editMap);
    }
  }, 200);
}

function closeEditModal() { document.getElementById('editModal').style.display = 'none'; if (editMarker) editMap.removeLayer(editMarker); editMarker = null; }
window.closeEditModal = closeEditModal;

function getEditLocation() {
  navigator.geolocation.getCurrentPosition(pos => {
    document.getElementById('editLat').value = pos.coords.latitude;
    document.getElementById('editLng').value = pos.coords.longitude;
    editMap.setView([pos.coords.latitude, pos.coords.longitude], 16);
    if (editMarker) editMap.removeLayer(editMarker);
    editMarker = L.marker([pos.coords.latitude, pos.coords.longitude]).addTo(editMap);
  });
}
window.getEditLocation = getEditLocation;

document.getElementById('editForm').addEventListener('submit', async e => {
  e.preventDefault(); showLoading();
  const formData = new FormData(e.target);
  formData.delete('houseId');
  const unavailable = document.getElementById('editUnavailableDates').value;
  const dates = unavailable ? unavailable.split(', ').filter(d => d) : [];
  formData.append('unavailableDates', JSON.stringify(dates));
  // Append new images from editUploadFileList
  for (let file of editUploadFileList) {
    formData.append('images', file);
  }
  try {
    const res = await fetch('/api/houses/' + currentEditId, { method: 'PUT', headers: { Authorization: 'Bearer ' + token }, body: formData });
    if (res.ok) { showModal('Property updated!', 'success'); closeEditModal(); loadMyHouses(); editUploadFileList = []; document.getElementById('editImagePreview').innerHTML = ''; }
    else { const data = await res.json(); showModal('Update failed: ' + (data.message || 'Unknown error'), 'error'); }
  } catch (err) { showModal('Network error', 'error'); } finally { hideLoading(); }
});

async function loadHouseStats() {
  if (!myHouses.length) return;
  const house = myHouses[0];
  try {
    const res = await fetch(`/api/houses/stats/${house._id}`, { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    const labels = data.views.map(d => d.date);
    const viewsData = data.views.map(d => d.views);
    if (viewsChart) viewsChart.destroy();
    viewsChart = new Chart(document.getElementById('viewsChart'), { type: 'line', data: { labels, datasets: [{ label: 'Views', data: viewsData, borderColor: '#3498db', fill: true }] } });
    if (earningsChart) earningsChart.destroy();
    earningsChart = new Chart(document.getElementById('earningsChart'), { type: 'bar', data: { labels: ['Week 1','Week 2','Week 3','Week 4'], datasets: [{ label: 'MWK', data: [10000,15000,8000,20000], backgroundColor: '#2ecc71' }] } });
    if (conversionChart) conversionChart.destroy();
    conversionChart = new Chart(document.getElementById('conversionChart'), { type: 'doughnut', data: { labels: ['Converted','Not'], datasets: [{ data: [5,95], backgroundColor: ['#f1c40f','#95a5a6'] }] } });
    const avgViews = viewsData.reduce((a,b)=>a+b,0)/viewsData.length;
    document.getElementById('insightText').innerHTML = avgViews > 20 ? '30% more views than similar houses. Great!' : '20% fewer views. Improve your photos.';
  } catch (err) { console.error(err); }
}

// ========== BOOKINGS ==========
async function loadBookingRequests() {
  try {
    let all = [];
    for (let house of myHouses) {
      const res = await fetch(`/api/bookings/house/${house._id}`, { headers: { Authorization: 'Bearer ' + token } });
      if (res.ok) { const b = await res.json(); all.push(...b); }
    }
    renderBookings(all);
  } catch (err) { console.error(err); }
}

function renderBookings(bookings) {
  const container = document.getElementById('bookingRequests');
  if (!container) return;
  if (!bookings.length) { container.innerHTML = '<p>No booking requests.</p>'; return; }
  container.innerHTML = '';
  bookings.forEach(b => {
    const card = document.createElement('div'); card.className = 'booking-card';
    card.innerHTML = `<p><strong><i class="fas fa-home"></i> ${b.houseName || b.house?.name}</strong></p><p><i class="fas fa-user"></i> ${b.tenantName} (${b.tenantEmail})</p><p><i class="fas fa-calendar-alt"></i> ${new Date(b.startDate).toLocaleDateString()} - ${new Date(b.endDate).toLocaleDateString()}</p><p><i class="fas fa-comment"></i> ${b.message || 'No message'}</p><p>Status: <span class="booking-status ${b.status}">${b.status}</span></p>`;
    if (b.status === 'pending') {
      const actions = document.createElement('div'); actions.className = 'booking-actions';
      actions.innerHTML = `<button class="approve-btn" onclick="updateBooking('${b._id}', 'approved')">Approve</button><button class="reject-btn" onclick="updateBooking('${b._id}', 'rejected')">Reject</button>`;
      card.appendChild(actions);
    }
    container.appendChild(card);
  });
}

async function updateBooking(bookingId, status) {
  showLoading();
  try {
    const res = await fetch(`/api/bookings/${bookingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ status }) });
    if (res.ok) { showModal(`Booking ${status}`, 'success'); loadBookingRequests(); loadMyHouses(); }
    else { const data = await res.json(); showModal('Error: ' + data.message, 'error'); }
  } catch (err) { showModal('Network error', 'error'); } finally { hideLoading(); }
}
window.updateBooking = updateBooking;

// ========== OFFERS ==========
async function loadOffers() {
  try {
    const res = await fetch('/api/offers/my-houses', { headers: { Authorization: 'Bearer ' + token } });
    const offers = await res.json();
    const container = document.getElementById('offersList');
    if (!container) return;
    if (!offers.length) { container.innerHTML = '<p>No offers yet.</p>'; return; }
    container.innerHTML = offers.map(o => `
      <div class="offer-card">
        <div class="offer-header"><strong>${o.houseId?.name || 'Unknown'}</strong><span class="offer-status ${o.status}">${o.status}</span></div>
        <div class="offer-details"><p><i class="fas fa-user"></i> ${o.tenantId?.name || 'Unknown'}</p><p><i class="fas fa-money-bill-wave"></i> MWK ${o.proposedPrice.toLocaleString()}</p><p><i class="fas fa-calendar-alt"></i> ${new Date(o.moveInDate).toLocaleDateString()}</p><p><i class="fas fa-comment"></i> ${o.tenantComment || 'No message'}</p>${o.counterOfferPrice ? `<p><i class="fas fa-exchange-alt"></i> Counter: MWK ${o.counterOfferPrice.toLocaleString()}</p>` : ''}</div>
        <div class="offer-actions">
          ${o.status === 'pending' ? `<button class="accept-offer" data-id="${o._id}">Accept</button><button class="reject-offer" data-id="${o._id}">Reject</button><button class="counter-offer" data-id="${o._id}">Counter</button>` : ''}
          ${o.status === 'countered' ? `<button class="accept-offer" data-id="${o._id}">Accept Counter</button><button class="reject-offer" data-id="${o._id}">Reject Counter</button>` : ''}
          <button class="delete-offer" data-id="${o._id}">Delete</button>
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
  showModal(`Are you sure you want to ${action} this offer?`, 'confirm', async () => {
    try {
      const res = await fetch(`/api/offers/${offerId}/${action}`, { method: 'PUT', headers: { Authorization: 'Bearer ' + token } });
      if (res.ok) { showModal(`Offer ${action}ed`, 'success'); loadOffers(); }
      else { const data = await res.json(); showModal('Failed: ' + data.message, 'error'); }
    } catch (err) { showModal('Network error', 'error'); }
  });
}

async function deleteOffer(offerId) {
  showModal('Delete this offer permanently?', 'confirm', async () => {
    try {
      const res = await fetch(`/api/offers/${offerId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      if (res.ok) { showModal('Offer deleted', 'success'); loadOffers(); }
      else { const data = await res.json(); showModal('Failed: ' + data.message, 'error'); }
    } catch (err) { showModal('Network error', 'error'); }
  });
}

function showCounterModal(offerId) {
  const price = prompt('Enter your counter offer price (MWK):');
  if (!price) return;
  const moveInDate = prompt('Proposed move‑in date (YYYY-MM-DD):');
  if (!moveInDate) return;
  const comment = prompt('Message to tenant (optional):');
  fetch(`/api/offers/${offerId}/counter`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ counterOfferPrice: parseInt(price), moveInDate, landlordComment: comment || '' })
  }).then(res => res.json()).then(data => { if (data.message) showModal(data.message, 'success'); loadOffers(); }).catch(err => console.error(err));
}

// ========== LEASE ==========
async function loadLeaseNegotiations() {
  try {
    const res = await fetch('/api/lease/my', { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error();
    const leases = await res.json();
    const container = document.getElementById('leaseList');
    if (!container) return;
    if (!leases.length) { container.innerHTML = '<p>No lease negotiations yet.</p>'; return; }
    container.innerHTML = leases.map(l => {
      let statusClass = 'offer-status';
      let statusText = l.status;
      if (l.status === 'signed' || l.status === 'active') { statusClass += ' accepted'; statusText = 'Signed ✓'; }
      else if (l.status === 'agreed') { statusClass += ' pending'; statusText = 'Awaiting Signatures'; }
      else if (l.status === 'negotiating') { statusClass += ' pending'; }
      else if (l.status === 'rejected') { statusClass += ' rejected'; }
      const downloadBtn = (l.status === 'signed' || l.status === 'active') ? `<button class="edit" style="margin-left:0.5rem;" onclick="downloadLeaseContract('${l._id}')">Contract</button>` : '';
      return `<div class="lease-card"><div class="offer-header"><strong>${l.houseId?.name || 'Unknown'}</strong><span class="${statusClass}">${statusText}</span></div><div class="offer-details"><p><i class="fas fa-user"></i> Tenant: ${l.tenantId?.name || 'Not joined'}</p><p><i class="fas fa-money-bill-wave"></i> Rent: MWK ${l.rentAmount?.toLocaleString()}</p><p><i class="fas fa-calendar-alt"></i> Start: ${new Date(l.leaseStartDate).toLocaleDateString()}</p><p><i class="fas fa-chart-line"></i> Score: ${l.leaseScore}/100</p><p><i class="fas fa-calendar-check"></i> Signed: ${l.signedAt ? new Date(l.signedAt).toLocaleDateString() : 'Not signed'}</p></div><div class="offer-actions"><button class="edit" onclick="window.location.href='lease-negotiation.html?id=${l._id}'">Continue Negotiation</button>${downloadBtn}</div></div>`;
    }).join('');
  } catch (err) { console.error(err); document.getElementById('leaseList').innerHTML = '<p>Error loading leases.</p>'; }
}
window.downloadLeaseContract = async function(id) {
  try {
    const res = await fetch(`/api/lease/download-temp/${id}`, { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    if (res.ok && data.downloadUrl) window.open(data.downloadUrl, '_blank');
    else showModal('Failed to get download link', 'error');
  } catch (err) { showModal('Network error', 'error'); }
};

function addPremiumCrownToAvatar() {
  if (!currentUser) return;
  const isPremium = currentUser.verificationType === 'premium' || currentUser.role === 'premium_landlord';
  if (!isPremium) return;
  const addCrown = (el) => {
    if (!el) return;
    if (el.parentElement?.classList.contains('avatar-container')) {
      if (!el.parentElement.querySelector('.premium-crown')) {
        const crown = document.createElement('div'); crown.className = 'premium-crown'; crown.innerHTML = '<i class="fas fa-crown"></i>';
        el.parentElement.appendChild(crown);
      }
      return;
    }
    const parent = el.parentNode;
    const container = document.createElement('div'); container.className = 'avatar-container';
    parent.insertBefore(container, el); container.appendChild(el);
    const crown = document.createElement('div'); crown.className = 'premium-crown'; crown.innerHTML = '<i class="fas fa-crown"></i>';
    container.appendChild(crown);
  };
  addCrown(document.getElementById('profileAvatar'));
}

// ========== WIZARD STEPS & TAB SWITCHING ==========
let currentStep = 1;
const steps = [1,2,3,4];
function updateWizard() {
  steps.forEach(s => {
    const stepDiv = document.getElementById(`step${s}`);
    if (stepDiv) stepDiv.classList.toggle('active', s === currentStep);
    const navBtn = document.querySelector(`.wizard-nav-btn[data-step="${s}"]`);
    if (navBtn) navBtn.classList.toggle('active', s === currentStep);
  });
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const submitBtn = document.getElementById('submitBtn');
  if (prevBtn) prevBtn.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
  if (currentStep === 4) {
    if (nextBtn) nextBtn.style.display = 'none';
    if (submitBtn) submitBtn.style.display = 'inline-block';
  } else {
    if (nextBtn) nextBtn.style.display = 'inline-block';
    if (submitBtn) submitBtn.style.display = 'none';
  }
}

document.getElementById('prevBtn')?.addEventListener('click', () => { if (currentStep > 1) { currentStep--; updateWizard(); } });
document.getElementById('nextBtn')?.addEventListener('click', () => { if (currentStep < 4) { currentStep++; updateWizard(); } });
document.querySelectorAll('.wizard-nav-btn').forEach(btn => {
  const step = parseInt(btn.getAttribute('data-step'));
  btn.addEventListener('click', () => { currentStep = step; updateWizard(); });
});
updateWizard();

document.querySelectorAll('.tab-btn-dash').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn-dash').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`${tab}-tab`).classList.add('active');
    if (tab === 'offers') loadOffers();
    if (tab === 'lease') loadLeaseNegotiations();
    if (tab === 'bookings') loadBookingRequests();
  });
});

// ========== UPLOAD FORM SUBMIT ==========
document.getElementById('houseForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('propName').value.trim();
  const location = document.getElementById('propLocation').value.trim();
  let price = document.getElementById('propPrice').value;
  const phone = document.getElementById('propPhone').value.trim();
  const description = document.getElementById('propDesc').value;
  if (selectedType === 'ShortStay') {
    const daily = document.getElementById('detail_dailyPrice')?.value;
    if (!daily) { showModal('Please enter daily price for Short-Stay', 'error'); return; }
    price = daily;
  }
  if (!name || !location || !price || price <= 0 || !phone.match(/^265[0-9]{9}$/) || uploadFileList.length === 0) {
    showModal('Please fill all fields correctly and select at least one image', 'error'); return;
  }
  if (!selectedType) { showModal('Please select a property type', 'error'); return; }
  showLoading();
  const formData = new FormData();
  formData.append('name', name);
  formData.append('location', location);
  formData.append('price', price);
  formData.append('phone', phone);
  formData.append('description', description);
  formData.append('type', selectedType);
  ['wifi','parking','furnished','petFriendly','pool','ac'].forEach(a => {
    const cb = document.querySelector(`input[name="${a}"]`);
    formData.append(a, cb && cb.checked ? 'on' : 'off');
  });
  formData.append('condition', document.querySelector('select[name="condition"]')?.value || 'Good');
  formData.append('gender', document.querySelector('select[name="gender"]')?.value || 'none');
  formData.append('selfContained', document.querySelector('input[name="selfContained"]')?.checked ? 'on' : 'off');
  const lat = document.getElementById('latitude').value;
  const lng = document.getElementById('longitude').value;
  if (lat) formData.append('lat', lat);
  if (lng) formData.append('lng', lng);
  const vt = document.querySelector('input[name="virtualTourUrl"]')?.value;
  if (vt) formData.append('virtualTourUrl', vt);
  const details = collectPropertyDetails();
  if (Object.keys(details).length) formData.append('propertyDetails', JSON.stringify(details));
  for (let file of uploadFileList) {
    formData.append('images', file);
  }
  try {
    const res = await fetch('/api/houses', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: formData });
    const data = await res.json();
    if (res.ok) {
      showModal('Property uploaded successfully!', 'success');
      document.getElementById('houseForm').reset();
      document.getElementById('imagePreview').innerHTML = '';
      if (marker) map.removeLayer(marker);
      selectedType = null;
      document.querySelectorAll('.type-card').forEach(c => c.classList.remove('selected'));
      document.getElementById('propertyDetailsContainer').innerHTML = '';
      togglePriceFields('none');
      uploadFileList = [];
      loadMyHouses();
    } else showModal('Upload failed: ' + (data.message || 'Unknown error'), 'error');
  } catch (err) { showModal('Network error', 'error'); } finally { hideLoading(); }
});

function animateValue(el, start, end, duration) {
  if (!el) return;
  const range = end - start;
  const step = range / (duration / 16);
  let current = start;
  const timer = setInterval(() => {
    current += step;
    if ((step > 0 && current >= end) || (step < 0 && current <= end)) {
      el.innerText = end;
      clearInterval(timer);
    } else el.innerText = Math.round(current);
  }, 16);
}
function showLoading() { document.getElementById('loadingOverlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }
function logout() { localStorage.clear(); window.location.href = 'login.html'; }
window.logout = logout;
window.openBookingModalFromDashboard = function(houseId, houseName) {
  window.currentBookingHouseId = houseId;
  document.getElementById('bookingHouseInfo').innerHTML = `<p><strong>${houseName}</strong></p>`;
  document.getElementById('bookingStart').value = '';
  document.getElementById('bookingEnd').value = '';
  document.getElementById('bookingMessage').value = '';
  document.getElementById('bookingStatus').innerHTML = '';
  document.getElementById('bookingModal').style.display = 'block';
};
document.getElementById('bookingForm').addEventListener('submit', async e => {
  e.preventDefault();
  const houseId = window.currentBookingHouseId;
  const startDate = document.getElementById('bookingStart').value;
  const endDate = document.getElementById('bookingEnd').value;
  const message = document.getElementById('bookingMessage').value;
  if (!startDate || !endDate) { showModal('Please select dates', 'error'); return; }
  showLoading();
  try {
    const res = await fetch('/api/bookings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ houseId, startDate, endDate, message })
    });
    const data = await res.json();
    if (res.ok) { showModal('Booking request sent!', 'success'); document.getElementById('bookingModal').style.display = 'none'; }
    else showModal('Error: ' + (data.message || 'Failed'), 'error');
  } catch (err) { showModal('Network error', 'error'); } finally { hideLoading(); }
});
function closeBookingModal() { document.getElementById('bookingModal').style.display = 'none'; }
window.closeBookingModal = closeBookingModal;

// ========== INIT ==========
fetchUser();
loadMyHouses();
loadUnreadCount();
generateTypeCards();
setTimeout(() => { loadOffers(); loadLeaseNegotiations(); }, 500);