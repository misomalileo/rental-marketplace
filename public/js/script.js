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
let currentSort = 'default';
let userLocation = null;
let radius = 2; // km
let drawnPolygon = null;
let drawnItems;
let currentShareHouseId = null;
let comparisonList = []; // array of house IDs (max 3)

// ======================================
// HELPER FUNCTIONS
// ======================================
function checkAuth() {
  return !!localStorage.getItem("token");
}

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

function getStarRating(average) {
  if (!average) return "☆☆☆☆☆";
  const fullStars = Math.round(average);
  const emptyStars = 5 - fullStars;
  return "★".repeat(fullStars) + "☆".repeat(emptyStars);
}

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ======================================
// CUSTOM MARKER ICON (Font Awesome)
// ======================================
function getMarkerIcon(house) {
  let iconClass = 'fa-house';
  let bgColor = '#3b82f6'; // default blue
  if (house.type === 'Hostel') {
    iconClass = 'fa-hotel';
    bgColor = '#10b981';
  } else if (house.type === 'Apartment') {
    iconClass = 'fa-building';
    bgColor = '#8b5cf6';
  } else if (house.type === 'Room') {
    iconClass = 'fa-bed';
    bgColor = '#f59e0b';
  } else if (house.type === 'Office') {
    iconClass = 'fa-briefcase';
    bgColor = '#6b7280';
  }

  if (house.owner?.verificationType === 'premium') {
    bgColor = '#f1c40f'; // gold
    iconClass = 'fa-crown';
  } else if (house.owner?.verificationType === 'official') {
    bgColor = '#2ecc71'; // green
    iconClass = 'fa-check-circle';
  }

  const html = `
    <div style="
      background-color: ${bgColor};
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 16px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      border: 2px solid white;
    ">
      <i class="fas ${iconClass}"></i>
    </div>
  `;

  return L.divIcon({
    html: html,
    iconSize: [32, 32],
    popupAnchor: [0, -16],
    className: 'custom-marker'
  });
}

// ======================================
// RENDER MARKERS (clustering)
// ======================================
function renderMarkers(houses) {
  if (!markersLayer) return;
  markersLayer.clearLayers();

  houses.forEach(house => {
    if (!house.lat || !house.lng) return;
    const icon = getMarkerIcon(house);
    const marker = L.marker([house.lat, house.lng], { icon });
    const img = house.images?.length ? house.images[0] : "placeholder.jpg";
    let badge = "";
    if (house.owner?.verificationType === "premium") {
      badge = `<span class="badge premium"><i class="fas fa-star"></i> Premium</span>`;
    } else if (house.owner?.verificationType === "official") {
      badge = `<span class="badge verified"><i class="fas fa-check-circle"></i> Verified</span>`;
    }

    let details = '';
    if (house.type === 'Hostel') {
      details = `
        <p><i class="fas fa-hotel"></i> Hostel</p>
        <p><i class="fas fa-bed"></i> Vacancies: ${house.vacancies || 0} rooms</p>
        <p><i class="fas fa-money-bill-wave"></i> MWK ${Number(house.price).toLocaleString()} / room</p>
      `;
    } else {
      details = `
        <p><i class="fas ${house.type === 'House' ? 'fa-home' : (house.type === 'Apartment' ? 'fa-building' : 'fa-home')}"></i> ${house.type || 'House'}</p>
        <p><i class="fas fa-bed"></i> Bedrooms: ${house.bedrooms || 'N/A'}</p>
        <p><i class="fas fa-money-bill-wave"></i> MWK ${Number(house.price).toLocaleString()} / month</p>
      `;
    }
    details += `<p><i class="fas fa-clipboard-list"></i> Condition: ${house.condition || 'Good'}</p>`;

    let genderInfo = '';
    if (house.gender && house.gender !== 'none') {
      let genderText = '';
      if (house.gender === 'boys') genderText = '<i class="fas fa-mars"></i> Boys Only';
      else if (house.gender === 'girls') genderText = '<i class="fas fa-venus"></i> Girls Only';
      else if (house.gender === 'mixed') genderText = '<i class="fas fa-venus-mars"></i> Mixed';
      genderInfo = `<p>${genderText}</p>`;
    }

    let amenities = [];
    if (house.wifi) amenities.push('<i class="fas fa-wifi"></i> WiFi');
    if (house.parking) amenities.push('<i class="fas fa-parking"></i> Parking');
    if (house.furnished) amenities.push('<i class="fas fa-couch"></i> Furnished');
    if (house.petFriendly) amenities.push('<i class="fas fa-paw"></i> Pet Friendly');
    if (house.pool) amenities.push('<i class="fas fa-swimming-pool"></i> Pool');
    if (house.ac) amenities.push('<i class="fas fa-snowflake"></i> AC');
    const amenitiesHtml = amenities.length ? `<p>${amenities.join(" • ")}</p>` : '';

    let unavailableHtml = '';
    if (house.unavailableDates && house.unavailableDates.length > 0) {
      const dates = house.unavailableDates.map(d => new Date(d).toLocaleDateString()).join(', ');
      unavailableHtml = `<p><i class="fas fa-calendar-times"></i> Unavailable: ${dates}</p>`;
    }

    const selfContainedBadge = house.selfContained ? '<br><span class="badge self-contained"><i class="fas fa-home"></i> Self Contained</span>' : '';
    const featuredBadge = house.featured ? '<br><span class="badge featured"><i class="fas fa-star"></i> FEATURED</span>' : '';

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
        <a href="https://wa.me/${house.phone}" target="_blank"><i class="fab fa-whatsapp"></i> Contact</a>
      </div>
    `;
    marker.bindPopup(popup);
    markersLayer.addLayer(marker);
  });
}

// ======================================
// FETCH HOUSES (with filters, sorting, and share link)
// ======================================
async function loadHouses(page = 1, type = 'all', filters = {}, sort = 'default') {
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
    if (filters.pool) params.append('pool', 'true');
    if (filters.ac) params.append('ac', 'true');
    if (sort !== 'default') params.append('sort', sort);

    const res = await fetch(`/api/houses?${params.toString()}`);
    const data = await res.json();
    allHouses = data.houses;
    currentPage = data.page;
    totalPages = data.pages;

    // Handle share link
    const urlParams = new URLSearchParams(window.location.search);
    const houseId = urlParams.get('house');
    if (houseId) {
      const house = allHouses.find(h => h._id === houseId);
      if (house) {
        setTimeout(() => showDetails(houseId), 500);
      }
    }

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

function updateURL() {
  const url = new URL(window.location);
  url.searchParams.set('page', currentPage);
  if (currentType !== 'all') url.searchParams.set('type', currentType);
  else url.searchParams.delete('type');
  if (currentSort !== 'default') url.searchParams.set('sort', currentSort);
  else url.searchParams.delete('sort');
  window.history.replaceState({}, '', url);
}

function renderPagination() {
  const paginationDiv = document.getElementById('pagination');
  if (!paginationDiv) return;
  if (totalPages <= 1) {
    paginationDiv.innerHTML = '';
    return;
  }
  let html = '';
  html += `<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="changePage(${currentPage - 1})"><i class="fas fa-chevron-left"></i> Prev</button>`;
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
  }
  html += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="changePage(${currentPage + 1})">Next <i class="fas fa-chevron-right"></i></button>`;
  paginationDiv.innerHTML = html;
}

function changePage(page) {
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  loadHouses(currentPage, currentType, currentFilters, currentSort);
}

// ======================================
// PRICE SLIDER
// ======================================
function initPriceSlider() {
  const slider = document.getElementById('priceSlider');
  if (!slider) return;
  const minPriceInput = document.getElementById('priceMin');
  const maxPriceInput = document.getElementById('priceMax');
  const minLabel = document.getElementById('priceMinLabel');
  const maxLabel = document.getElementById('priceMaxLabel');

  noUiSlider.create(slider, {
    start: [0, 2000000],
    connect: true,
    range: {
      'min': 0,
      'max': 2000000
    },
    step: 5000,
    format: {
      to: value => Math.round(value),
      from: value => Number(value)
    }
  });

  slider.noUiSlider.on('update', (values) => {
    const min = values[0];
    const max = values[1];
    minPriceInput.value = min;
    maxPriceInput.value = max;
    minLabel.innerText = `Min: ${min.toLocaleString()}`;
    maxLabel.innerText = `Max: ${max.toLocaleString()}`;
  });
}

function getCurrentFilters() {
  return {
    minPrice: document.getElementById('priceMin')?.value || '',
    maxPrice: document.getElementById('priceMax')?.value || '',
    bedrooms: document.getElementById('bedrooms')?.value || '',
    wifi: document.getElementById('filterWifi')?.checked || false,
    parking: document.getElementById('filterParking')?.checked || false,
    furnished: document.getElementById('filterFurnished')?.checked || false,
    petFriendly: document.getElementById('filterPetFriendly')?.checked || false,
    pool: document.getElementById('filterPool')?.checked || false,
    ac: document.getElementById('filterAC')?.checked || false
  };
}

function applyFilters() {
  currentFilters = getCurrentFilters();
  currentPage = 1;
  loadHouses(currentPage, currentType, currentFilters, currentSort);
}

function handleSortChange() {
  const sortSelect = document.getElementById('sortSelect');
  if (!sortSelect) return;
  currentSort = sortSelect.value;
  currentPage = 1;
  loadHouses(currentPage, currentType, currentFilters, currentSort);
}

// ======================================
// SAVE SEARCH
// ======================================
function saveSearch() {
  const modal = document.getElementById('saveSearchModal');
  if (!modal) return;
  modal.style.display = 'block';
  document.getElementById('saveSearchForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('searchEmail').value;
    const name = document.getElementById('searchName').value;
    const filters = getCurrentFilters();
    const searchData = {
      name: name || 'Saved Search',
      email,
      filters,
      type: currentType,
      sort: currentSort,
      createdAt: new Date().toISOString()
    };
    let savedSearches = JSON.parse(localStorage.getItem('savedSearches') || '[]');
    savedSearches.push(searchData);
    localStorage.setItem('savedSearches', JSON.stringify(savedSearches));
    document.getElementById('saveSearchStatus').innerHTML = '<div class="message success"><i class="fas fa-check-circle"></i> Search saved! You will receive email alerts when new houses match.</div>';
    setTimeout(() => {
      modal.style.display = 'none';
      document.getElementById('saveSearchStatus').innerHTML = '';
    }, 2000);
  };
}

// ======================================
// MAP INIT
// ======================================
function initMap() {
  map = L.map("map").setView([-15.786, 35.005], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  markersLayer = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    iconCreateFunction: function(cluster) {
      return L.divIcon({
        html: '<div style="background:#3498db; color:white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-weight:bold;">' + cluster.getChildCount() + '</div>',
        className: 'marker-cluster-custom',
        iconSize: L.point(30, 30)
      });
    }
  });
  map.addLayer(markersLayer);

  drawnItems = L.featureGroup().addTo(map);
  const drawControl = new L.Control.Draw({
    edit: {
      featureGroup: drawnItems,
      remove: true
    },
    draw: {
      polygon: true,
      polyline: false,
      rectangle: false,
      circle: false,
      marker: false,
      circlemarker: false
    }
  });
  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, (e) => {
    if (drawnPolygon) map.removeLayer(drawnPolygon);
    drawnPolygon = e.layer;
    drawnItems.addLayer(drawnPolygon);
    filterHousesByPolygon();
  });

  const clearDrawBtn = document.getElementById('clearDrawBtn');
  if (clearDrawBtn) {
    clearDrawBtn.addEventListener('click', () => {
      drawnItems.clearLayers();
      drawnPolygon = null;
      renderHouses(allHouses);
      renderMarkers(allHouses);
    });
  }

  const radiusSlider = document.getElementById('radiusSliderControl');
  const radiusValueSpan = document.getElementById('radiusValueControl');
  if (radiusSlider) {
    radiusSlider.addEventListener('input', (e) => {
      radius = parseFloat(e.target.value);
      radiusValueSpan.innerText = radius + ' km';
    });
  }

  const applyRadiusBtn = document.getElementById('applyRadiusBtn');
  if (applyRadiusBtn) {
    applyRadiusBtn.addEventListener('click', () => {
      if (userLocation) {
        const nearby = allHouses.filter(h => {
          if (!h.lat || !h.lng) return false;
          const dist = getDistance(userLocation.lat, userLocation.lng, h.lat, h.lng);
          return dist <= radius;
        });
        renderHouses(nearby);
        renderMarkers(nearby);
        map.setView([userLocation.lat, userLocation.lng], 14);
        L.marker([userLocation.lat, userLocation.lng]).addTo(map).bindPopup("<i class='fas fa-map-pin'></i> You are here").openPopup();
      } else {
        alert("Please use 'Near Me' first to get your location.");
      }
    });
  }
}

function filterHousesByPolygon() {
  if (!drawnPolygon) return;
  const filtered = allHouses.filter(house => {
    if (!house.lat || !house.lng) return false;
    const point = turf.point([house.lng, house.lat]);
    const coords = drawnPolygon.getLatLngs()[0].map(p => [p.lng, p.lat]);
    const poly = turf.polygon([coords]);
    return turf.booleanPointInPolygon(point, poly);
  });
  renderHouses(filtered);
  renderMarkers(filtered);
}

// ======================================
// COMPARISON FUNCTIONS
// ======================================
function updateCompareButton() {
  const btn = document.getElementById('compareFloatingBtn');
  const countSpan = document.getElementById('compareCount');
  if (btn && countSpan) {
    const count = comparisonList.length;
    countSpan.textContent = count;
    btn.style.display = count > 0 ? 'flex' : 'none';
  }
}

function addToCompare(houseId) {
  if (comparisonList.includes(houseId)) {
    // Already in list – remove it
    comparisonList = comparisonList.filter(id => id !== houseId);
    // Update button text on the card
    const btn = document.querySelector(`.compare-btn[data-id="${houseId}"]`);
    if (btn) btn.innerHTML = '<i class="fas fa-chart-simple"></i> Compare';
  } else {
    if (comparisonList.length >= 3) {
      alert('You can compare up to 3 properties at once.');
      return;
    }
    comparisonList.push(houseId);
    const btn = document.querySelector(`.compare-btn[data-id="${houseId}"]`);
    if (btn) btn.innerHTML = '<i class="fas fa-trash-alt"></i> Remove';
  }
  updateCompareButton();
}

function openComparisonModal() {
  if (comparisonList.length === 0) return;
  const housesToCompare = allHouses.filter(h => comparisonList.includes(h._id));
  const container = document.getElementById('comparisonTable');
  if (!container) return;

  if (housesToCompare.length === 0) {
    container.innerHTML = '<p>No houses selected.</p>';
    document.getElementById('comparisonModal').style.display = 'block';
    return;
  }

  // Build comparison table
  let tableHtml = '<table style="width:100%; border-collapse: collapse; text-align: center;">';
  // Header row with house names
  tableHtml += '<thead> <th style="padding: 8px;">Feature</th>';
  housesToCompare.forEach(house => {
    tableHtml += `<th style="padding: 8px;">${house.name}</th>`;
  });
  tableHtml += '</thead><tbody>';

  const features = [
    { label: '<i class="fas fa-money-bill-wave"></i> Price', key: 'price', format: (v, house) => `MWK ${v.toLocaleString()} ${house.type === 'Hostel' ? '/ room' : '/ month'}` },
    { label: '<i class="fas fa-map-marker-alt"></i> Location', key: 'location' },
    { label: '<i class="fas fa-home"></i> Type', key: 'type' },
    { label: '<i class="fas fa-bed"></i> Bedrooms', key: 'bedrooms', format: (v) => v || 'N/A' },
    { label: '<i class="fas fa-clipboard-list"></i> Condition', key: 'condition' },
    { label: '<i class="fas fa-home"></i> Self Contained', key: 'selfContained', format: (v) => v ? '<i class="fas fa-check-circle"></i> Yes' : '<i class="fas fa-times-circle"></i> No' },
    { label: '<i class="fas fa-wifi"></i> WiFi', key: 'wifi', format: (v) => v ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>' },
    { label: '<i class="fas fa-parking"></i> Parking', key: 'parking', format: (v) => v ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>' },
    { label: '<i class="fas fa-couch"></i> Furnished', key: 'furnished', format: (v) => v ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>' },
    { label: '<i class="fas fa-paw"></i> Pet Friendly', key: 'petFriendly', format: (v) => v ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>' },
    { label: '<i class="fas fa-swimming-pool"></i> Pool', key: 'pool', format: (v) => v ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>' },
    { label: '<i class="fas fa-snowflake"></i> AC', key: 'ac', format: (v) => v ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>' },
    { label: '<i class="fas fa-star"></i> Rating', key: 'averageRating', format: (v) => v ? v.toFixed(1) : 'No ratings' }
  ];

  features.forEach(feature => {
    tableHtml += `<tr><td style="padding: 8px; font-weight: bold;">${feature.label}</td>`;
    housesToCompare.forEach(house => {
      let value = house[feature.key];
      if (feature.format) {
        if (feature.key === 'price') value = feature.format(value, house);
        else value = feature.format(value);
      } else {
        value = value || 'N/A';
      }
      tableHtml += `<td style="padding: 8px;">${value}</td>`;
    });
    tableHtml += '</tr>';
  });

  // Image row
  tableHtml += `<tr><td style="padding: 8px; font-weight: bold;"><i class="fas fa-image"></i> Image</td>`;
  housesToCompare.forEach(house => {
    const imgUrl = house.images?.[0] || 'placeholder.jpg';
    tableHtml += `<td style="padding: 8px;"><img src="${imgUrl}" style="width:80px; height:80px; object-fit:cover; border-radius:8px;"></td>`;
  });
  tableHtml += '</tr>';

  tableHtml += '</tbody></table>';
  container.innerHTML = tableHtml;
  document.getElementById('comparisonModal').style.display = 'block';
}

function closeComparisonModal() {
  document.getElementById('comparisonModal').style.display = 'none';
}

// ======================================
// RENDER HOUSE CARDS (with icons, no emojis)
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
    let currentIndex = 0;

    // Landlord avatar
    let avatarHtml = '';
    if (house.owner) {
      const initial = house.owner.name ? house.owner.name.charAt(0).toUpperCase() : '?';
      const avatarStyle = house.owner.profilePicture 
        ? `<img src="${house.owner.profilePicture}" alt="${house.owner.name}">`
        : `<span style="font-size:1rem;">${initial}</span>`;
      avatarHtml = `
        <div class="landlord-avatar" data-landlord-id="${house.owner._id}" onclick="event.stopPropagation(); showLandlordProfile('${house.owner._id}')">
          ${avatarStyle}
        </div>
      `;
    }

    let landlordInfoHtml = '';
    if (house.owner) {
      landlordInfoHtml = `<div class="landlord-info-row">
        ${avatarHtml}
        <a href="#" class="landlord-name-link" data-landlord-id="${house.owner._id}" style="text-decoration:none; font-weight:600;">${house.owner.name}</a>
        ${house.owner.verificationType === "premium" ? '<span class="badge premium"><i class="fas fa-star"></i> Premium</span>' : ''}
        ${house.owner.verificationType === "official" ? '<span class="badge verified"><i class="fas fa-check-circle"></i> Verified</span>' : ''}
      </div>`;
    }

    const featuredBadge = house.featured ? '<span class="badge featured"><i class="fas fa-star"></i> FEATURED</span>' : '';
    const selfContainedBadge = house.selfContained ? '<span class="badge self-contained"><i class="fas fa-home"></i> Self Contained</span>' : '';
    const ratingStars = getStarRating(house.averageRating);
    const ratingText = house.averageRating ? house.averageRating.toFixed(1) : "N/A";
    const favIcon = favorites.includes(house._id) ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';

    const ratingWidget = isLoggedIn
      ? `<div class="rating-widget" data-house-id="${house._id}">
           <span class="star" data-value="1">☆</span>
           <span class="star" data-value="2">☆</span>
           <span class="star" data-value="3">☆</span>
           <span class="star" data-value="4">☆</span>
           <span class="star" data-value="5">☆</span>
           <span class="rating-message"></span>
         </div>`
      : `<p><small><a href="login.html"><i class="fas fa-sign-in-alt"></i> Login to rate</a></small></p>`;

    let details = '';
    if (house.type === 'Hostel') {
      details = `
        <p><i class="fas fa-hotel"></i> Hostel</p>
        <p><i class="fas fa-bed"></i> Vacancies: ${house.vacancies || 0} rooms</p>
        <p><i class="fas fa-money-bill-wave"></i> MWK ${Number(house.price).toLocaleString()} / room</p>
      `;
    } else {
      details = `
        <p><i class="fas ${house.type === 'House' ? 'fa-home' : (house.type === 'Apartment' ? 'fa-building' : 'fa-home')}"></i> ${house.type || 'House'}</p>
        <p><i class="fas fa-bed"></i> Bedrooms: ${house.bedrooms || 'N/A'}</p>
        <p><i class="fas fa-money-bill-wave"></i> MWK ${Number(house.price).toLocaleString()} / month</p>
      `;
    }
    details += `<p><i class="fas fa-clipboard-list"></i> Condition: ${house.condition || 'Good'}</p>`;

    let genderInfo = '';
    if (house.gender && house.gender !== 'none') {
      let genderText = '';
      if (house.gender === 'boys') genderText = '<i class="fas fa-mars"></i> Boys Only';
      else if (house.gender === 'girls') genderText = '<i class="fas fa-venus"></i> Girls Only';
      else if (house.gender === 'mixed') genderText = '<i class="fas fa-venus-mars"></i> Mixed';
      genderInfo = `<p>${genderText}</p>`;
    }

    let amenities = [];
    if (house.wifi) amenities.push('<i class="fas fa-wifi"></i> WiFi');
    if (house.parking) amenities.push('<i class="fas fa-parking"></i> Parking');
    if (house.furnished) amenities.push('<i class="fas fa-couch"></i> Furnished');
    if (house.petFriendly) amenities.push('<i class="fas fa-paw"></i> Pet Friendly');
    if (house.pool) amenities.push('<i class="fas fa-swimming-pool"></i> Pool');
    if (house.ac) amenities.push('<i class="fas fa-snowflake"></i> AC');
    const amenitiesHtml = amenities.length ? `<p class="amenities-list">${amenities.join(" • ")}</p>` : '';

    let unavailableHtml = '';
    if (house.unavailableDates && house.unavailableDates.length > 0) {
      const dates = house.unavailableDates.map(d => new Date(d).toLocaleDateString()).join(', ');
      unavailableHtml = `<p><i class="fas fa-calendar-times"></i> Unavailable: ${dates}</p>`;
    }

    const shortDesc = house.description ? house.description.substring(0, 60) + '...' : '';
    const readMoreBtn = house.description ? `<button class="read-more-btn" onclick="showDetails('${house._id}')"><i class="fas fa-book-open"></i> Read more</button>` : '';

    const reportBtn = isLoggedIn 
      ? `<button class="report-btn" onclick="reportHouse('${house._id}')"><i class="fas fa-flag"></i> Report</button>`
      : '';

    const chatBtn = (isLoggedIn && house.owner && house.owner._id !== currentUserId) 
      ? `<button class="chat-btn" onclick="startChat('${house._id}', '${house.owner._id}')"><i class="fas fa-comment-dots"></i> Chat</button>`
      : '';

    const shareBtn = `<button class="share-btn" onclick="shareHouse('${house._id}', '${house.name}')"><i class="fas fa-share-alt"></i> Share</button>`;
    const isSelected = comparisonList.includes(house._id);
    const compareBtn = `<button class="compare-btn" data-id="${house._id}" onclick="addToCompare('${house._id}')"><i class="fas fa-chart-simple"></i> ${isSelected ? 'Remove' : 'Compare'}</button>`;

    card.innerHTML = `
      <div class="slider">
        <img id="img-${house._id}" src="${images[0]}" data-current-index="0" style="cursor:pointer">
        ${images.length > 1 ? `<button class="prev"><i class="fas fa-chevron-left"></i></button><button class="next"><i class="fas fa-chevron-right"></i></button>` : ""}
      </div>
      <div class="house-card-content">
        ${landlordInfoHtml}
        ${featuredBadge}
        ${selfContainedBadge}
        <div class="house-details-content">
          <h3>${house.name}</h3>
          ${details}
          ${genderInfo}
          ${amenitiesHtml}
          ${unavailableHtml}
          <p>${shortDesc} ${readMoreBtn}</p>
          <p><i class="fas fa-star"></i> Rating: <span class="rating-value">${ratingText}</span> <span class="rating-stars">${ratingStars}</span></p>
          <p><a href="https://wa.me/${house.phone}" target="_blank"><i class="fab fa-whatsapp"></i> WhatsApp Landlord</a></p>
          <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px;">
            ${chatBtn}
            <button class="fav-btn" onclick="toggleFavorite('${house._id}')">${favIcon}</button>
            ${shareBtn}
            ${compareBtn}
          </div>
          ${ratingWidget}
          ${reportBtn}
        </div>
      </div>
    `;

    container.appendChild(card);

    // Apply blur if landlord unverified
    const detailsDiv = card.querySelector('.house-details-content');
    if (house.owner && house.owner.verificationType === "none") {
      detailsDiv.classList.add('house-details-blurred');
    } else {
      detailsDiv.classList.remove('house-details-blurred');
    }

    // Slider and lightbox
    const img = card.querySelector(`#img-${house._id}`);
    if (images.length > 1) {
      const prevBtn = card.querySelector(".prev");
      const nextBtn = card.querySelector(".next");
      const updateImage = (newIndex) => {
        currentIndex = newIndex;
        img.src = images[currentIndex];
        img.setAttribute('data-current-index', currentIndex);
      };
      prevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const newIndex = (currentIndex - 1 + images.length) % images.length;
        updateImage(newIndex);
      });
      nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const newIndex = (currentIndex + 1) % images.length;
        updateImage(newIndex);
      });
    }
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      const currentIdx = parseInt(img.getAttribute('data-current-index') || "0");
      if (typeof window.openLightbox === 'function') {
        window.openLightbox(images, currentIdx);
      }
    });

    // Rating widget
    if (isLoggedIn) {
      const widget = card.querySelector(".rating-widget");
      if (widget) {
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

  document.querySelectorAll('.landlord-name-link').forEach(link => {
    link.removeEventListener('click', handleLandlordClick);
    link.addEventListener('click', handleLandlordClick);
  });
}

function handleLandlordClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const landlordId = this.getAttribute('data-landlord-id');
  if (landlordId) showLandlordProfile(landlordId);
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
// LANDLORD PROFILE MODAL
// ======================================
async function showLandlordProfile(landlordId) {
  try {
    const res = await fetch(`/api/profile/landlord/${landlordId}`);
    if (!res.ok) throw new Error('Failed to fetch landlord profile');
    const data = await res.json();
    const landlord = data.landlord;
    const houses = data.houses;

    const avatarHtml = landlord.profilePicture
      ? `<img class="avatar" src="${landlord.profilePicture}" alt="${landlord.name}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;">`
      : `<div class="avatar" style="background: #3498db; display: flex; align-items: center; justify-content: center; font-size: 2rem; width:100px;height:100px;border-radius:50%;">${landlord.name.charAt(0)}</div>`;

    let badgeHtml = '';
    if (landlord.verificationType === 'premium') {
      badgeHtml = '<span class="badge premium"><i class="fas fa-star"></i> Premium Landlord</span>';
    } else if (landlord.verificationType === 'official') {
      badgeHtml = '<span class="badge verified"><i class="fas fa-check-circle"></i> Verified Landlord</span>';
    } else {
      badgeHtml = '<span class="badge none"><i class="fas fa-lock"></i> Not Verified</span>';
    }

    const businessHtml = landlord.businessName ? `<div class="business-name"><i class="fas fa-building"></i> ${landlord.businessName}</div>` : '';
    const addressHtml = landlord.address ? `<div class="info-row"><i class="fas fa-map-marker-alt"></i> ${landlord.address}</div>` : '';
    const phoneHtml = `<div class="info-row"><i class="fas fa-phone-alt"></i> ${landlord.phone || 'Not provided'}</div>`;
    const emailHtml = `<div class="info-row"><i class="fas fa-envelope"></i> ${landlord.email}</div>`;
    const joinedHtml = `<div class="info-row"><i class="fas fa-calendar-alt"></i> Joined ${new Date(landlord.createdAt).toLocaleDateString()}</div>`;
    const responseRateHtml = `<div class="info-row"><i class="fas fa-reply-all"></i> Response Rate: ${landlord.profile?.responseRate || 0}%</div>`;
    const bioHtml = landlord.bio ? `<div class="bio"><i class="fas fa-quote-left"></i> ${landlord.bio}</div>` : '';

    let housesPreview = '';
    if (houses && houses.length) {
      housesPreview = `
        <div class="houses-preview">
          <h4><i class="fas fa-home"></i> Properties (${houses.length})</h4>
          <div class="houses-list">
            ${houses.slice(0, 6).map(house => `
              <img class="house-thumb" src="${house.images?.[0] || 'placeholder.jpg'}" alt="${house.name}" onclick="openLightbox(['${house.images?.[0]}'], 0); event.stopPropagation();">
            `).join('')}
          </div>
          ${houses.length > 6 ? '<small>+ more</small>' : ''}
        </div>
      `;
    }

    const modalContent = `
      <div class="landlord-profile">
        ${avatarHtml}
        <h2>${landlord.name}</h2>
        ${businessHtml}
        ${badgeHtml}
        ${addressHtml}
        ${phoneHtml}
        ${emailHtml}
        ${joinedHtml}
        ${responseRateHtml}
        ${bioHtml}
        ${housesPreview}
        <div style="margin-top: 1rem;">
          <button class="fav-btn" onclick="closeLandlordModal(); window.location.href='profile.html?id=${landlordId}'"><i class="fas fa-external-link-alt"></i> View Full Profile</button>
        </div>
      </div>
    `;

    document.getElementById('landlordModalContent').innerHTML = modalContent;
    document.getElementById('landlordModal').style.display = 'block';
  } catch (err) {
    console.error('Error loading landlord profile:', err);
    alert('Could not load landlord profile.');
  }
}

function closeLandlordModal() {
  document.getElementById('landlordModal').style.display = 'none';
}

// ======================================
// NEIGHBOURHOOD INSIGHTS (enhanced)
// ======================================
async function loadNeighbourhoodInsights(houseLat, houseLng) {
  const insightsDiv = document.getElementById('modalInsights');
  if (!insightsDiv) return;
  insightsDiv.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Scanning nearby amenities...</div>';

  const amenities = [
    { type: 'school', label: '<i class="fas fa-school"></i> Schools', maxDist: 2000 },
    { type: 'university', label: '<i class="fas fa-university"></i> Universities', maxDist: 3000 },
    { type: 'hospital', label: '<i class="fas fa-hospital"></i> Hospitals', maxDist: 5000 },
    { type: 'clinic', label: '<i class="fas fa-clinic-medical"></i> Clinics', maxDist: 2000 },
    { type: 'pharmacy', label: '<i class="fas fa-pills"></i> Pharmacy', maxDist: 2000 },
    { type: 'supermarket', label: '<i class="fas fa-shopping-cart"></i> Supermarkets', maxDist: 2000 },
    { type: 'restaurant', label: '<i class="fas fa-utensils"></i> Restaurants', maxDist: 1500 },
    { type: 'cafe', label: '<i class="fas fa-coffee"></i> Cafes', maxDist: 1500 },
    { type: 'fast_food', label: '<i class="fas fa-hamburger"></i> Fast Food', maxDist: 1500 },
    { type: 'police', label: '<i class="fas fa-shield-alt"></i> Police Station', maxDist: 3000 },
    { type: 'marketplace', label: '<i class="fas fa-store"></i> Markets', maxDist: 2000 },
    { type: 'bank', label: '<i class="fas fa-university"></i> Banks', maxDist: 2000 },
    { type: 'atm', label: '<i class="fas fa-money-bill-wave"></i> ATMs', maxDist: 1000 },
    { type: 'fuel', label: '<i class="fas fa-gas-pump"></i> Fuel Station', maxDist: 3000 }
  ];

  let allResults = [];
  for (let amenity of amenities) {
    const radius = amenity.maxDist;
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="${amenity.type}"](around:${radius},${houseLat},${houseLng});
        way["amenity"="${amenity.type}"](around:${radius},${houseLat},${houseLng});
        node["shop"="${amenity.type}"](around:${radius},${houseLat},${houseLng});
        way["shop"="${amenity.type}"](around:${radius},${houseLat},${houseLng});
      );
      out center;
    `;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.elements && data.elements.length) {
        const nearest = data.elements
          .map(el => {
            const lat = el.lat || el.center?.lat;
            const lng = el.lon || el.center?.lon;
            if (!lat || !lng) return null;
            const dist = getDistance(houseLat, houseLng, lat, lng) * 1000;
            return { name: el.tags?.name || `${amenity.label} (nearby)`, dist };
          })
          .filter(el => el && el.dist <= amenity.maxDist)
          .sort((a,b) => a.dist - b.dist);
        if (nearest.length) {
          allResults.push({
            label: amenity.label,
            places: nearest.slice(0, 3)
          });
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch ${amenity.type} data:`, err);
    }
  }

  const house = allHouses.find(h => Math.abs(h.lat - houseLat) < 0.001 && Math.abs(h.lng - houseLng) < 0.001);
  let prosText = '';
  const props = [];
  if (house) {
    if (house.featured) props.push('<i class="fas fa-star"></i> featured listing');
    if (house.wifi) props.push('<i class="fas fa-wifi"></i> WiFi');
    if (house.parking) props.push('<i class="fas fa-parking"></i> parking');
    if (house.furnished) props.push('<i class="fas fa-couch"></i> furnished');
    if (house.petFriendly) props.push('<i class="fas fa-paw"></i> pet-friendly');
    if (house.pool) props.push('<i class="fas fa-swimming-pool"></i> pool');
    if (house.ac) props.push('<i class="fas fa-snowflake"></i> air conditioning');
    if (house.selfContained) props.push('<i class="fas fa-home"></i> self-contained');
  }

  const nearbySchools = allResults.find(r => r.label.includes('Schools') && r.places[0]?.dist < 1000);
  if (nearbySchools) prosText += `<i class="fas fa-school"></i> Within ${Math.round(nearbySchools.places[0].dist)}m of a school. `;
  const nearbySupermarkets = allResults.find(r => r.label.includes('Supermarkets') && r.places[0]?.dist < 1000);
  if (nearbySupermarkets) prosText += `<i class="fas fa-shopping-cart"></i> Nearby supermarket (${Math.round(nearbySupermarkets.places[0].dist)}m). `;
  const nearbyHospitals = allResults.find(r => r.label.includes('Hospitals') && r.places[0]?.dist < 2000);
  if (nearbyHospitals) prosText += `<i class="fas fa-hospital"></i> Hospital within ${Math.round(nearbyHospitals.places[0].dist)}m. `;

  if (props.length) {
    prosText = `✨ ${house?.name || 'This property'} is a ${props.join(', ')} property. ${prosText}`;
  } else {
    prosText = `✨ ${house?.name || 'This property'} is a comfortable property in a convenient location. ${prosText}`;
  }

  let insightsHtml = `<h3><i class="fas fa-city"></i> Neighbourhood Insights</h3>`;
  insightsHtml += `<div class="insight-pros" style="background:rgba(0,0,0,0.05); padding:12px; border-radius:12px; margin-bottom:16px;">${prosText}</div>`;

  if (allResults.length === 0) {
    const mapsUrl = `https://www.google.com/maps/search/amenities/@${houseLat},${houseLng},15z`;
    insightsHtml += `<p>No nearby amenities found in OpenStreetMap data. But you can <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i> explore the area on Google Maps</a> to see what's around.</p>`;
  } else {
    insightsHtml += `<div style="display:grid; gap:12px;">`;
    allResults.forEach(cat => {
      insightsHtml += `<div><strong>${cat.label}</strong><ul style="margin:5px 0 0 20px;">`;
      cat.places.forEach(place => {
        const walkMinutes = Math.round(place.dist / 80);
        insightsHtml += `<li>${place.name} – ${Math.round(place.dist)}m (about ${walkMinutes} min walk)</li>`;
      });
      insightsHtml += `</ul></div>`;
    });
    insightsHtml += `</div>`;
  }

  insightsDiv.innerHTML = insightsHtml;
}

// ======================================
// STREET VIEW (with fallback)
// ======================================
function loadStreetView(lat, lng) {
  const container = document.getElementById('modalStreetView');
  container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading street view...</div>';

  const apiKey = window.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    container.innerHTML = '<p style="text-align:center; padding:20px;">Street view not configured. Please contact support.</p>';
    return;
  }

  const size = '600x300';
  const heading = '0';
  const pitch = '0';
  const url = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&key=${apiKey}`;

  const img = new Image();
  img.onload = () => {
    container.innerHTML = `<img src="${url}" style="width:100%; border-radius:12px;" alt="Street View">`;
  };
  img.onerror = () => {
    const mapsUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    container.innerHTML = `<p style="text-align:center; padding:20px;">Street view not available in this image.<br>But you can <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i> open Google Maps Street View</a> to see the area.</p>`;
  };
  img.src = url;
}

// ======================================
// PRICE INSIGHTS
// ======================================
async function loadPriceInsights(houseId) {
  const container = document.getElementById('modalPricing');
  container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-chart-line fa-spin"></i> Fetching market data...</div>';
  try {
    const res = await fetch(`/api/houses/price-insights/${houseId}`);
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    container.innerHTML = `
      <h3><i class="fas fa-chart-line"></i> Price Insights</h3>
      <p><strong>Based on ${data.similarCount} similar properties nearby:</strong></p>
      <ul style="margin: 1rem 0;">
        <li><i class="fas fa-chart-simple"></i> Average price: MWK ${data.averagePrice.toLocaleString()}</li>
        <li><i class="fas fa-chart-line"></i> Median price: MWK ${data.medianPrice.toLocaleString()}</li>
        <li><i class="fas fa-arrows-up-down"></i> Price range: MWK ${data.priceRange.min.toLocaleString()} – ${data.priceRange.max.toLocaleString()}</li>
      </ul>
      <div class="insight-pros" style="background:rgba(0,0,0,0.05); padding:12px; border-radius:12px;">
        🤖 <strong>AI Recommendation:</strong> ${data.recommendation}
      </div>
    `;
  } catch (err) {
    container.innerHTML = '<p>Market insights temporarily unavailable.</p>';
  }
}

// ======================================
// SHARE FUNCTIONS
// ======================================
function shareHouse(houseId, houseName) {
  currentShareHouseId = houseId;
  document.getElementById('shareModal').style.display = 'block';
}

function closeShareModal() {
  document.getElementById('shareModal').style.display = 'none';
  document.getElementById('shareStatus').innerHTML = '';
}

function getShareUrl() {
  return `${window.location.origin}/house/${currentShareHouseId}`;
}

function shareOnFacebook() {
  const url = getShareUrl();
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'width=600,height=400');
  closeShareModal();
}

function shareOnWhatsApp() {
  const url = getShareUrl();
  window.open(`https://wa.me/?text=${encodeURIComponent(`Check out this property: ${url}`)}`, '_blank');
  closeShareModal();
}

function shareOnTwitter() {
  const url = getShareUrl();
  window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`, '_blank', 'width=600,height=400');
  closeShareModal();
}

function copyShareLink() {
  const url = getShareUrl();
  navigator.clipboard.writeText(url).then(() => {
    const statusDiv = document.getElementById('shareStatus');
    statusDiv.innerHTML = '<span style="color:green;"><i class="fas fa-check-circle"></i> Link copied to clipboard!</span>';
    setTimeout(() => { statusDiv.innerHTML = ''; }, 2000);
  }).catch(() => {
    const statusDiv = document.getElementById('shareStatus');
    statusDiv.innerHTML = '<span style="color:red;"><i class="fas fa-times-circle"></i> Failed to copy link.</span>';
    setTimeout(() => { statusDiv.innerHTML = ''; }, 2000);
  });
}

// ======================================
// SHOW DETAILS (with tabs)
// ======================================
function showDetails(houseId) {
  const house = allHouses.find(h => h._id === houseId);
  if (!house) return;

  const detailsHtml = `
    <h2>${house.name}</h2>
    <p><strong><i class="fas fa-home"></i> Type:</strong> ${house.type}</p>
    <p><strong><i class="fas fa-map-marker-alt"></i> Location:</strong> ${house.location}</p>
    <p><strong><i class="fas fa-money-bill-wave"></i> Price:</strong> MWK ${house.price.toLocaleString()} ${house.type === 'Hostel' ? '/ room' : '/ month'}</p>
    <p><strong><i class="fas fa-bed"></i> Bedrooms:</strong> ${house.bedrooms || 'N/A'}</p>
    <p><strong><i class="fas fa-bath"></i> Bathrooms:</strong> ${house.bathrooms || 'N/A'}</p>
    <p><strong><i class="fas fa-clipboard-list"></i> Condition:</strong> ${house.condition}</p>
    <p><strong><i class="fas fa-home"></i> Self Contained:</strong> ${house.selfContained ? '<i class="fas fa-check-circle"></i> Yes' : '<i class="fas fa-times-circle"></i> No'}</p>
    <p><strong><i class="fas fa-align-left"></i> Description:</strong> ${house.description || 'No description'}</p>
    <p><strong><i class="fas fa-cogs"></i> Amenities:</strong> ${house.wifi ? '<i class="fas fa-wifi"></i> WiFi ' : ''}${house.parking ? '<i class="fas fa-parking"></i> Parking ' : ''}${house.furnished ? '<i class="fas fa-couch"></i> Furnished ' : ''}${house.petFriendly ? '<i class="fas fa-paw"></i> Pet Friendly ' : ''}${house.pool ? '<i class="fas fa-swimming-pool"></i> Pool ' : ''}${house.ac ? '<i class="fas fa-snowflake"></i> AC ' : ''}</p>
    <p><strong><i class="fas fa-venus-mars"></i> Gender:</strong> ${house.gender === 'none' ? 'No restriction' : house.gender === 'boys' ? '<i class="fas fa-mars"></i> Boys Only' : house.gender === 'girls' ? '<i class="fas fa-venus"></i> Girls Only' : '<i class="fas fa-venus-mars"></i> Mixed'}</p>
    <p><strong><i class="fas fa-calendar-times"></i> Unavailable Dates:</strong> ${house.unavailableDates?.length ? house.unavailableDates.map(d => new Date(d).toLocaleDateString()).join(', ') : 'None'}</p>
    <p><strong><i class="fab fa-whatsapp"></i> Contact:</strong> <a href="https://wa.me/${house.phone}" target="_blank">WhatsApp</a></p>
  `;

  document.getElementById('modalDetails').innerHTML = detailsHtml;
  document.getElementById('propertyModal').style.display = 'block';

  if (house.lat && house.lng) {
    loadNeighbourhoodInsights(house.lat, house.lng);
    loadStreetView(house.lat, house.lng);
  } else {
    document.getElementById('modalInsights').innerHTML = '<p>No location data available for insights.</p>';
    document.getElementById('modalStreetView').innerHTML = '<p>No location data for street view.</p>';
  }
  loadPriceInsights(house._id);

  const tabs = document.querySelectorAll('.modal-tab');
  const detailsPanel = document.getElementById('modalDetails');
  const insightsPanel = document.getElementById('modalInsights');
  const streetViewPanel = document.getElementById('modalStreetView');
  const pricingPanel = document.getElementById('modalPricing');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (target === 'details') {
        detailsPanel.style.display = 'block';
        insightsPanel.style.display = 'none';
        streetViewPanel.style.display = 'none';
        pricingPanel.style.display = 'none';
      } else if (target === 'insights') {
        detailsPanel.style.display = 'none';
        insightsPanel.style.display = 'block';
        streetViewPanel.style.display = 'none';
        pricingPanel.style.display = 'none';
      } else if (target === 'streetview') {
        detailsPanel.style.display = 'none';
        insightsPanel.style.display = 'none';
        streetViewPanel.style.display = 'block';
        pricingPanel.style.display = 'none';
      } else if (target === 'pricing') {
        detailsPanel.style.display = 'none';
        insightsPanel.style.display = 'none';
        streetViewPanel.style.display = 'none';
        pricingPanel.style.display = 'block';
      }
    });
  });
}

function closePropertyModal() {
  document.getElementById("propertyModal").style.display = "none";
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

// ======================================
// EVENT LISTENERS
// ======================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    currentType = this.dataset.type;
    currentPage = 1;
    loadHouses(currentPage, currentType, currentFilters, currentSort);
  });
});

const filterBtn = document.getElementById("applyFiltersBtn");
if (filterBtn) filterBtn.onclick = applyFilters;

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
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.setView([userLocation.lat, userLocation.lng], 14);
      L.marker([userLocation.lat, userLocation.lng]).addTo(map).bindPopup("<i class='fas fa-map-pin'></i> You are here").openPopup();

      const nearby = allHouses.filter(h => {
        if (!h.lat || !h.lng) return false;
        const dist = getDistance(userLocation.lat, userLocation.lng, h.lat, h.lng);
        return dist <= radius;
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
      status.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Getting location...";
      navigator.geolocation.getCurrentPosition(
        pos => {
          document.getElementById("latitude").value = pos.coords.latitude;
          document.getElementById("longitude").value = pos.coords.longitude;
          status.innerHTML = `<i class="fas fa-check-circle"></i> Captured! Lat: ${pos.coords.latitude}, Lng: ${pos.coords.longitude}`;
        },
        () => { status.innerHTML = "<i class='fas fa-exclamation-triangle'></i> Allow location access"; },
        { enableHighAccuracy: true }
      );
    } else {
      status.innerHTML = "GPS not supported";
    }
  });
}

// Floating compare button event
const compareFloatingBtn = document.getElementById('compareFloatingBtn');
if (compareFloatingBtn) {
  compareFloatingBtn.addEventListener('click', openComparisonModal);
}

// ======================================
// INITIALIZATION
// ======================================
initMap();
initPriceSlider();
const sortSelect = document.getElementById('sortSelect');
if (sortSelect) sortSelect.addEventListener('change', handleSortChange);
const saveBtn = document.getElementById('saveSearchBtn');
if (saveBtn) saveBtn.addEventListener('click', saveSearch);

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('page')) currentPage = parseInt(urlParams.get('page'));
if (urlParams.has('type')) {
  currentType = urlParams.get('type');
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.dataset.type === currentType) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}
if (urlParams.has('sort')) currentSort = urlParams.get('sort');
if (sortSelect && currentSort !== 'default') sortSelect.value = currentSort;

loadHouses(currentPage, currentType, currentFilters, currentSort);

// Expose functions
window.showDetails = showDetails;
window.closePropertyModal = closePropertyModal;
window.toggleFavorite = toggleFavorite;
window.reportHouse = reportHouse;
window.startChat = startChat;
window.shareHouse = shareHouse;
window.closeShareModal = closeShareModal;
window.shareOnFacebook = shareOnFacebook;
window.shareOnWhatsApp = shareOnWhatsApp;
window.shareOnTwitter = shareOnTwitter;
window.copyShareLink = copyShareLink;
window.addToCompare = addToCompare;
window.closeComparisonModal = closeComparisonModal;