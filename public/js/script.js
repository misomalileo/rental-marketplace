// ======================================
// GLOBAL VARIABLES
// ======================================
let allHouses = [];
let map;
let markersLayer;
let currentPage = 1;
let totalPages = 1;
let currentType = 'all';
let currentFilters = {};

// ======================================
// CHECK LOGIN STATUS
// ======================================
function checkAuth() {
  return !!localStorage.getItem("token");
}

// ======================================
// GET USER ID FROM TOKEN
// ======================================
function getUserIdFromToken() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id;
  } catch {
    return null;
  }
}

// ======================================
// INITIALIZE MAP
// ======================================
function initMap() {
  map = L.map("map").setView([-15.786, 35.005], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

// ======================================
// FETCH HOUSES WITH PAGINATION
// ======================================
async function loadHouses(page = 1, type = 'all', filters = {}) {
  try {
    const params = new URLSearchParams();
    params.append('page', page);
    params.append('limit', 12);
    if (type !== 'all') params.append('type', type);
    if (filters.minPrice) params.append('minPrice', filters.minPrice);
    if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
    if (filters.bedrooms) params.append('bedrooms', filters.bedrooms);
    if (filters.wifi) params.append('wifi', 'true');
    if (filters.parking) params.append('parking', 'true');
    if (filters.furnished) params.append('furnished', 'true');
    if (filters.petFriendly) params.append('petFriendly', 'true');

    const res = await fetch(`/api/houses?${params.toString()}`);
    const data = await res.json();
    allHouses = data.houses;
    currentPage = data.page;
    totalPages = data.pages;
    renderHouses(allHouses);
    renderMarkers(allHouses);
    renderPagination();
    updateURL();
  } catch (err) {
    console.error("Failed loading houses:", err);
    const container = document.getElementById("houses-container");
    if (container) container.innerHTML = "<p>Failed to load houses.</p>";
  }
}

// ======================================
// UPDATE BROWSER URL
// ======================================
function updateURL() {
  const url = new URL(window.location);
  url.searchParams.set('page', currentPage);
  if (currentType !== 'all') {
    url.searchParams.set('type', currentType);
  } else {
    url.searchParams.delete('type');
  }
  window.history.replaceState({}, '', url);
}

// ======================================
// RENDER PAGINATION CONTROLS
// ======================================
function renderPagination() {
  const paginationDiv = document.getElementById('pagination');
  if (!paginationDiv) return;
  if (totalPages <= 1) {
    paginationDiv.innerHTML = '';
    return;
  }
  let html = '';
  html += `<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="changePage(${currentPage - 1})">« Prev</button>`;
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
  }
  html += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="changePage(${currentPage + 1})">Next »</button>`;
  paginationDiv.innerHTML = html;
}

function changePage(page) {
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  loadHouses(currentPage, currentType, currentFilters);
}

function getStarRating(average) {
  if (!average) return "☆☆☆☆☆";
  const fullStars = Math.round(average);
  const emptyStars = 5 - fullStars;
  return "★".repeat(fullStars) + "☆".repeat(emptyStars);
}

async function reportHouse(houseId) {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Please login to report.");
    return;
  }
  const reason = prompt("Reason for reporting (e.g., fake listing, wrong price):");
  if (!reason) return;
  try {
    const res = await fetch("/api/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ houseId, reason })
    });
    const data = await res.json();
    alert(data.message);
  } catch (err) {
    alert("Network error. Please try again.");
  }
}

// ======================================
// START CHAT FROM HOUSE CARD
// ======================================
async function startChat(houseId, landlordId) {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Please login to chat.");
    return;
  }
  try {
    const res = await fetch("/api/chat/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ otherUserId: landlordId, houseId })
    });
    const chat = await res.json();
    window.location.href = `/chat.html?chatId=${chat._id}`;
  } catch (err) {
    alert("Failed to start chat");
  }
}

// ======================================
// SHOW PROPERTY DETAILS MODAL
// ======================================
function showDetails(houseId) {
  const house = allHouses.find(h => h._id === houseId);
  if (!house) return;
  const modalContent = document.getElementById("propertyModalContent");
  modalContent.innerHTML = `
    <h2>${house.name}</h2>
    <p><strong>Type:</strong> ${house.type}</p>
    <p><strong>Location:</strong> ${house.location}</p>
    <p><strong>Price:</strong> MWK ${house.price.toLocaleString()} ${house.type === 'Hostel' ? '/ room' : '/ month'}</p>
    <p><strong>Bedrooms:</strong> ${house.bedrooms || 'N/A'}</p>
    <p><strong>Bathrooms:</strong> ${house.bathrooms || 'N/A'}</p>
    <p><strong>Condition:</strong> ${house.condition}</p>
    <p><strong>Self Contained:</strong> ${house.selfContained ? '✅ Yes' : '❌ No'}</p>
    <p><strong>Description:</strong> ${house.description || 'No description'}</p>
    <p><strong>Amenities:</strong> ${house.wifi ? '📶 WiFi ' : ''}${house.parking ? '🅿️ Parking ' : ''}${house.furnished ? '🛋️ Furnished ' : ''}${house.petFriendly ? '🐾 Pet Friendly ' : ''}</p>
    <p><strong>Gender:</strong> ${house.gender === 'none' ? 'No restriction' : house.gender}</p>
    <p><strong>Unavailable Dates:</strong> ${house.unavailableDates?.length ? house.unavailableDates.map(d => new Date(d).toLocaleDateString()).join(', ') : 'None'}</p>
    <p><strong>Contact:</strong> <a href="https://wa.me/${house.phone}" target="_blank">WhatsApp</a></p>
  `;
  document.getElementById("propertyModal").style.display = "block";
}

function closePropertyModal() {
  document.getElementById("propertyModal").style.display = "none";
}

// ======================================
// RENDER HOUSE CARDS
// ======================================
function renderHouses(houses) {
  const container = document.getElementById("houses-container");
  if (!container) return;
  container.innerHTML = "";

  const favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
  const isLoggedIn = checkAuth();
  const currentUserId = getUserIdFromToken();

  houses.forEach(house => {
    const card = document.createElement("div");
    card.className = "house-card";

    const images = house.images && house.images.length ? house.images : ["placeholder.jpg"];
    let current = 0;

    let landlordInfo = '';
    if (house.owner) {
      landlordInfo = `<p><a href="profile.html?id=${house.owner._id}" style="text-decoration:none; font-weight:600;">${house.owner.name}</a> `;
      if (house.owner.verificationType === "premium") {
        landlordInfo += `<span class="badge premium">⭐ Premium</span>`;
      } else if (house.owner.verificationType === "official") {
        landlordInfo += `<span class="badge verified">✔ Verified</span>`;
      }
      landlordInfo += '</p>';
    }

    const featuredBadge = house.featured ? '<span class="badge featured">⭐ FEATURED</span>' : '';
    const selfContainedBadge = house.selfContained ? '<span class="badge self-contained">🏡 Self Contained</span>' : '';
    const ratingStars = getStarRating(house.averageRating);
    const ratingText = house.averageRating ? house.averageRating.toFixed(1) : "N/A";
    const favIcon = favorites.includes(house._id) ? "❤️" : "🤍";

    const ratingWidget = isLoggedIn
      ? `<div class="rating-widget" data-house-id="${house._id}">
           <span class="star" data-value="1">☆</span>
           <span class="star" data-value="2">☆</span>
           <span class="star" data-value="3">☆</span>
           <span class="star" data-value="4">☆</span>
           <span class="star" data-value="5">☆</span>
           <span class="rating-message"></span>
         </div>`
      : `<p><small><a href="login.html">Login to rate</a></small></p>`;

    let details = '';
    if (house.type === 'Hostel') {
      details = `
        <p>🏨 Hostel</p>
        <p>🛏️ Vacancies: ${house.vacancies || 0} rooms</p>
        <p>💰 MWK ${Number(house.price).toLocaleString()} / room</p>
      `;
    } else {
      details = `
        <p>🏠 ${house.type || 'House'}</p>
        <p>🛏️ Bedrooms: ${house.bedrooms || 'N/A'}</p>
        <p>💰 MWK ${Number(house.price).toLocaleString()} / month</p>
      `;
    }
    details += `<p>📋 Condition: ${house.condition || 'Good'}</p>`;

    let genderInfo = '';
    if (house.gender && house.gender !== 'none') {
      let genderText = '';
      if (house.gender === 'boys') genderText = '👦 Boys Only';
      else if (house.gender === 'girls') genderText = '👧 Girls Only';
      else if (house.gender === 'mixed') genderText = '👫 Mixed';
      genderInfo = `<p>${genderText}</p>`;
    }

    let amenities = [];
    if (house.wifi) amenities.push("📶 WiFi");
    if (house.parking) amenities.push("🅿️ Parking");
    if (house.furnished) amenities.push("🛋️ Furnished");
    if (house.petFriendly) amenities.push("🐾 Pet Friendly");
    const amenitiesHtml = amenities.length ? `<p class="amenities-list">${amenities.join(" • ")}</p>` : '';

    let unavailableHtml = '';
    if (house.unavailableDates && house.unavailableDates.length > 0) {
      const dates = house.unavailableDates.map(d => new Date(d).toLocaleDateString()).join(', ');
      unavailableHtml = `<p>🚫 Unavailable: ${dates}</p>`;
    }

    // Short description and read more
    const shortDesc = house.description ? house.description.substring(0, 60) + '...' : '';
    const readMoreBtn = house.description ? `<button class="read-more-btn" onclick="showDetails('${house._id}')">📖 Read more</button>` : '';

    const reportBtn = isLoggedIn 
      ? `<button class="report-btn" onclick="reportHouse('${house._id}')">🚩 Report</button>`
      : '';

    const chatBtn = (isLoggedIn && house.owner && house.owner._id !== currentUserId) 
      ? `<button class="chat-btn" onclick="startChat('${house._id}', '${house.owner._id}')">💬 Chat</button>`
      : '';

    // ✅ IMAGE SOURCE – use full Cloudinary URL directly
    card.innerHTML = `
      <div class="slider">
        <img id="img-${house._id}" src="${images[0]}">
        ${images.length > 1 ? `<button class="prev">‹</button><button class="next">›</button>` : ""}
      </div>
      <div class="house-card-content">
        ${landlordInfo}
        ${featuredBadge}
        ${selfContainedBadge}
        <h3>${house.name}</h3>
        ${details}
        ${genderInfo}
        ${amenitiesHtml}
        ${unavailableHtml}
        <p>${shortDesc} ${readMoreBtn}</p>
        <p>⭐ Rating: <span class="rating-value">${ratingText}</span> <span class="rating-stars">${ratingStars}</span></p>
        <p><a href="https://wa.me/${house.phone}" target="_blank">WhatsApp Landlord</a></p>
        ${chatBtn}
        <button class="fav-btn" onclick="toggleFavorite('${house._id}')">${favIcon}</button>
        ${ratingWidget}
        ${reportBtn}
      </div>
    `;

    container.appendChild(card);

    // ✅ SLIDER – update image source using the full URL from the array
    if (images.length > 1) {
      const img = card.querySelector(`#img-${house._id}`);
      const prevBtn = card.querySelector(".prev");
      const nextBtn = card.querySelector(".next");
      prevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        current = (current - 1 + images.length) % images.length;
        img.src = images[current];
      });
      nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        current = (current + 1) % images.length;
        img.src = images[current];
      });
    }

    if (isLoggedIn) {
      const widget = card.querySelector(".rating-widget");
      const stars = widget.querySelectorAll(".star");
      const messageSpan = widget.querySelector(".rating-message");
      stars.forEach(star => {
        star.addEventListener("mouseover", () => {
          const value = star.dataset.value;
          highlightStars(stars, value);
        });
        star.addEventListener("mouseout", () => {
          resetStars(stars);
        });
        star.addEventListener("click", async () => {
          const value = star.dataset.value;
          await submitRating(house._id, value, stars, messageSpan);
        });
      });
    }

    card.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (house.lat && house.lng) {
        map.setView([house.lat, house.lng], 16);
      }
    });

    card.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON" || e.target.tagName === "A" || e.target.classList.contains("star")) return;
      fetch(`/api/houses/${house._id}/view`, { method: "PUT" })
        .catch(err => console.error("Failed to record view", err));
    });
  });
}

function highlightStars(stars, value) {
  stars.forEach(s => {
    s.textContent = s.dataset.value <= value ? "★" : "☆";
  });
}
function resetStars(stars) {
  stars.forEach(s => s.textContent = "☆");
}
async function submitRating(houseId, value, stars, messageSpan) {
  const token = localStorage.getItem("token");
  if (!token) {
    messageSpan.textContent = "Please login first.";
    return;
  }
  try {
    const res = await fetch(`/api/houses/${houseId}/rate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ value })
    });
    const data = await res.json();
    if (res.ok) {
      messageSpan.textContent = "✅ Rating submitted!";
      const ratingValueSpan = stars[0].closest(".house-card-content").querySelector(".rating-value");
      const ratingStarsSpan = stars[0].closest(".house-card-content").querySelector(".rating-stars");
      if (data.average) {
        ratingValueSpan.textContent = data.average.toFixed(1);
        ratingStarsSpan.textContent = getStarRating(data.average);
      }
    } else {
      messageSpan.textContent = "❌ " + (data.message || "Error");
    }
  } catch (err) {
    messageSpan.textContent = "❌ Network error";
  }
}

// ======================================
// MAP MARKERS – use full Cloudinary URLs in popup
// ======================================
function renderMarkers(houses) {
  if (!markersLayer) return;
  markersLayer.clearLayers();

  houses.forEach(house => {
    if (!house.lat || !house.lng) return;

    const img = house.images?.length ? house.images[0] : "placeholder.jpg";
    let badge = "";
    if (house.owner?.verificationType === "premium") {
      badge = `<span class="badge premium">⭐ Premium</span>`;
    } else if (house.owner?.verificationType === "official") {
      badge = `<span class="badge verified">✔ Verified</span>`;
    }

    let details = '';
    if (house.type === 'Hostel') {
      details = `
        <p>🏨 Hostel</p>
        <p>🛏️ Vacancies: ${house.vacancies || 0} rooms</p>
        <p>💰 MWK ${Number(house.price).toLocaleString()} / room</p>
      `;
    } else {
      details = `
        <p>🏠 ${house.type || 'House'}</p>
        <p>🛏️ Bedrooms: ${house.bedrooms || 'N/A'}</p>
        <p>💰 MWK ${Number(house.price).toLocaleString()} / month</p>
      `;
    }
    details += `<p>📋 Condition: ${house.condition || 'Good'}</p>`;

    let genderInfo = '';
    if (house.gender && house.gender !== 'none') {
      let genderText = '';
      if (house.gender === 'boys') genderText = '👦 Boys Only';
      else if (house.gender === 'girls') genderText = '👧 Girls Only';
      else if (house.gender === 'mixed') genderText = '👫 Mixed';
      genderInfo = `<p>${genderText}</p>`;
    }

    let amenities = [];
    if (house.wifi) amenities.push("📶 WiFi");
    if (house.parking) amenities.push("🅿️ Parking");
    if (house.furnished) amenities.push("🛋️ Furnished");
    if (house.petFriendly) amenities.push("🐾 Pet Friendly");
    const amenitiesHtml = amenities.length ? `<p>${amenities.join(" • ")}</p>` : '';

    let unavailableHtml = '';
    if (house.unavailableDates && house.unavailableDates.length > 0) {
      const dates = house.unavailableDates.map(d => new Date(d).toLocaleDateString()).join(', ');
      unavailableHtml = `<p>🚫 Unavailable: ${dates}</p>`;
    }

    const selfContainedBadge = house.selfContained ? '<br><span class="badge self-contained">🏡 Self Contained</span>' : '';
    const featuredBadge = house.featured ? '<br><span class="badge featured">⭐ FEATURED</span>' : '';

    // ✅ POPUP IMAGE – use full Cloudinary URL directly
    const popup = `
      <div style="width:200px">
        <img src="${img}" style="width:100%;height:140px;object-fit:cover">
        <h4>${house.name}</h4>
        ${details}
        ${genderInfo}
        ${amenitiesHtml}
        ${unavailableHtml}
        ${badge}
        ${selfContainedBadge}
        ${featuredBadge}
        <br>
        <a href="https://wa.me/${house.phone}" target="_blank">Contact</a>
      </div>
    `;

    const icon = house.owner?.verificationType === "premium"
      ? L.icon({ iconUrl: "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png", iconSize: [32, 32] })
      : L.icon({ iconUrl: "https://maps.google.com/mapfiles/ms/icons/red-dot.png", iconSize: [32, 32] });

    const marker = L.marker([house.lat, house.lng], { icon });
    marker.bindPopup(popup);
    markersLayer.addLayer(marker);
  });
}

function toggleFavorite(id) {
  let favs = JSON.parse(localStorage.getItem("favorites") || "[]");
  if (favs.includes(id)) {
    favs = favs.filter(x => x !== id);
  } else {
    favs.push(id);
  }
  localStorage.setItem("favorites", JSON.stringify(favs));
  renderHouses(allHouses);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    currentType = this.dataset.type;
    currentPage = 1;
    loadHouses(currentPage, currentType, currentFilters);
  });
});

const filterBtn = document.getElementById("applyFiltersBtn");
if (filterBtn) {
  filterBtn.onclick = () => {
    currentFilters = {
      minPrice: document.getElementById("priceMin").value,
      maxPrice: document.getElementById("priceMax").value,
      bedrooms: document.getElementById("bedrooms").value,
      wifi: document.getElementById("filterWifi")?.checked,
      parking: document.getElementById("filterParking")?.checked,
      furnished: document.getElementById("filterFurnished")?.checked,
      petFriendly: document.getElementById("filterPetFriendly")?.checked
    };
    currentPage = 1;
    loadHouses(currentPage, currentType, currentFilters);
  };
}

const searchInput = document.getElementById("searchInput");
if (searchInput) {
  searchInput.addEventListener("keyup", () => {
    const term = searchInput.value.toLowerCase();
    const filtered = allHouses.filter(h =>
      h.name.toLowerCase().includes(term) ||
      (h.location && h.location.toLowerCase().includes(term))
    );
    renderHouses(filtered);
    renderMarkers(filtered);
  });
}

const nearBtn = document.getElementById("nearMeBtn");
if (nearBtn) {
  nearBtn.onclick = () => {
    if (!navigator.geolocation) {
      alert("GPS not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      map.setView([lat, lng], 14);
      L.marker([lat, lng]).addTo(map).bindPopup("You are here").openPopup();

      const nearby = allHouses.filter(h => {
        if (!h.lat || !h.lng) return false;
        const R = 6371;
        const dLat = (h.lat - lat) * Math.PI / 180;
        const dLng = (h.lng - lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(lat * Math.PI / 180) *
          Math.cos(h.lat * Math.PI / 180) *
          Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const dist = R * c;
        return dist <= 2;
      });

      renderHouses(nearby);
      renderMarkers(nearby);
    });
  };
}

const gpsBtn = document.getElementById("getLocationBtn");
if (gpsBtn) {
  gpsBtn.addEventListener("click", () => {
    const status = document.getElementById("gpsStatus");
    if (navigator.geolocation) {
      status.innerHTML = "Getting location...";
      navigator.geolocation.getCurrentPosition(
        pos => {
          document.getElementById("latitude").value = pos.coords.latitude;
          document.getElementById("longitude").value = pos.coords.longitude;
          status.innerHTML = `✅ Captured! Lat: ${pos.coords.latitude}, Lng: ${pos.coords.longitude}`;
        },
        () => { status.innerHTML = "⚠️ Allow location access"; },
        { enableHighAccuracy: true }
      );
    } else {
      status.innerHTML = "GPS not supported";
    }
  });
}

initMap();

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('page')) currentPage = parseInt(urlParams.get('page'));
if (urlParams.has('type')) {
  currentType = urlParams.get('type');
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.dataset.type === currentType) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}
loadHouses(currentPage, currentType, currentFilters);

// Expose modal functions globally
window.showDetails = showDetails;
window.closePropertyModal = closePropertyModal;