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
let comparisonList = [];
let currentRegion = '';
let currentDistrict = '';
let districtDropdown = null;

// Amenity data arrays (populated from GeoJSON)
let healthPoints = [];
let schoolPoints = [];
let marketPoints = [];

// For storing amenity layers (to toggle)
let amenityLayers = {};

// Last selected house for nearby searches
let lastSelectedHouse = null;

// ========== TOAST NOTIFICATION (replaces alert) ==========
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `<i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ========== CUSTOM VERIFIED BADGE (SVG) ==========
function fbSaturatedSky(size = 18, scallops = 12, depth = 3.5) {
  const cx = size/2, cy = size/2, r = size/2 - 2;
  const angleStep = (2 * Math.PI) / scallops;
  let path = '';
  for (let i = 0; i < scallops; i++) {
    const startAngle = i * angleStep;
    const midAngle = startAngle + angleStep / 2;
    const endAngle = startAngle + angleStep;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + (r + depth) * Math.cos(midAngle);
    const y2 = cy + (r + depth) * Math.sin(midAngle);
    const x3 = cx + r * Math.cos(endAngle);
    const y3 = cy + r * Math.sin(endAngle);
    path += `M${x1},${y1} A${r + depth},${r + depth} 0 0,1 ${x2},${y2} A${r},${r} 0 0,1 ${x3},${y3} `;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display: inline-block; vertical-align: middle;"><path d="${path}" fill="#009CFF"/><circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="#009CFF"/><path d="M${cx*0.65} ${cy*1.05} L${cx*0.85} ${cy*1.25} L${cx*1.35} ${cy*0.8}" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
}

// ========== HELPER: ESCAPE HTML ==========
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ========== HANDLE LANDLORD CLICK ==========
function handleLandlordClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const landlordId = this.getAttribute('data-landlord-id');
  if (landlordId) showLandlordProfile(landlordId);
}

// ========== ADD CROWN TO LANDLORD AVATAR ==========
function addCrownToLandlordAvatar(avatarElement, isPremiumLandlord) {
  if (!isPremiumLandlord) return;
  if (avatarElement.parentElement && avatarElement.parentElement.classList.contains('avatar-container')) {
    if (!avatarElement.parentElement.querySelector('.premium-crown')) {
      const crown = document.createElement('div');
      crown.className = 'premium-crown';
      crown.innerHTML = '<i class="fas fa-crown"></i>';
      avatarElement.parentElement.appendChild(crown);
    }
    return;
  }
  const parent = avatarElement.parentNode;
  const container = document.createElement('div');
  container.className = 'avatar-container';
  parent.insertBefore(container, avatarElement);
  container.appendChild(avatarElement);
  const crown = document.createElement('div');
  crown.className = 'premium-crown';
  crown.innerHTML = '<i class="fas fa-crown"></i>';
  container.appendChild(crown);
}

// ========== LOAD HERO CAROUSEL ==========
async function loadHeroCarousel() {
  try {
    const res = await fetch('/api/houses?page=1&limit=6');
    const data = await res.json();
    const houses = data.houses || [];
    const wrapper = document.getElementById('carousel-wrapper');
    if (!wrapper) return;
    if (houses.length === 0) {
      wrapper.innerHTML = '<div class="swiper-slide">No properties to display</div>';
      return;
    }
    wrapper.innerHTML = houses.map(house => `
      <div class="swiper-slide">
        <div class="carousel-card">
          <img src="${house.images?.[0] || 'placeholder.jpg'}" alt="${escapeHtml(house.name)}">
          <div class="carousel-card-content">
            <h3>${escapeHtml(house.name)}</h3>
            <p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(house.location || 'N/A')}</p>
            <div class="carousel-price">MWK ${Number(house.price).toLocaleString()}</div>
            <button class="carousel-btn" onclick="showDetails('${house._id}')">View Details</button>
          </div>
        </div>
      </div>
    `).join('');
    if (window.heroSwiper) window.heroSwiper.destroy(true, true);
    window.heroSwiper = new Swiper('.hero-swiper', {
      loop: true,
      autoplay: { delay: 5000, disableOnInteraction: false },
      effect: 'slide',
      grabCursor: true,
      slidesPerView: 1,
      spaceBetween: 20,
      breakpoints: { 640: { slidesPerView: 2 }, 1024: { slidesPerView: 3 }, 1280: { slidesPerView: 4 } },
      pagination: { el: '.swiper-pagination', clickable: true },
      navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' }
    });
  } catch (err) {
    console.error('Failed to load carousel:', err);
  }
}

// ========== DREAM MATCH SCORING (includes property type) ==========
function scoreHouseForDream(house, answers) {
  let score = 0;
  // Property type match (penalty if type doesn't match)
  if (answers.type && house.type !== answers.type) score -= 50;

  // Work from home
  if (answers.workFromHome === "essential") {
    if (house.bedrooms >= 2 || house.selfContained) score += 30;
    else if (house.bedrooms >= 1) score += 10;
  } else if (answers.workFromHome === "nice") {
    if (house.bedrooms >= 2 || house.selfContained) score += 15;
  }
  // Social
  if (answers.social === "often") {
    if (house.pool) score += 25;
    if (house.furnished) score += 15;
    if (house.parking) score += 10;
  } else if (answers.social === "sometimes") {
    if (house.furnished) score += 10;
  }
  // Outdoor
  if (answers.outdoor === "essential") {
    if (house.petFriendly) score += 20;
    if (house.selfContained) score += 10;
  } else if (answers.outdoor === "nice") {
    if (house.petFriendly) score += 10;
  }
  // Noise
  if (answers.noise === "quiet") {
    if (house.pool) score -= 15;
    if (house.selfContained) score += 10;
  } else if (answers.noise === "lively") {
    if (house.pool) score += 15;
    if (house.furnished) score += 5;
  }
  // Budget & bedrooms
  if (answers.maxPrice && house.price > answers.maxPrice) score -= 100;
  if (answers.bedrooms && house.bedrooms < answers.bedrooms) score -= 100;
  if (house.averageRating) score += house.averageRating * 5;
  return Math.max(0, score);
}

// ========== DREAM MATCH SUBMIT (MULTIPLE RESULTS, WITH TYPE) ==========
async function submitDreamMatch(e) {
  e.preventDefault();
  const type = document.getElementById("dream_type").value;
  const workFromHome = document.getElementById("dream_workFromHome").value;
  const social = document.getElementById("dream_social").value;
  const outdoor = document.getElementById("dream_outdoor").value;
  const noise = document.getElementById("dream_noise").value;
  const maxPrice = parseInt(document.getElementById("dream_maxPrice").value) || Infinity;
  const bedrooms = parseInt(document.getElementById("dream_bedrooms").value) || 0;

  const resultsDiv = document.getElementById("dreamMatchResults");
  const grid = document.getElementById("dreamMatchGrid");
  resultsDiv.style.display = "block";
  if (!grid) {
    // Fallback for old HTML structure
    console.warn("Dream match grid not found, using old wrapper");
    const wrapper = document.getElementById("dreamMatchWrapper");
    if (wrapper) wrapper.innerHTML = '<div class="swiper-slide"><div class="dream-card"><div class="dream-card-content"><i class="fas fa-spinner fa-pulse"></i> Finding your dream homes...</div></div></div>';
  } else {
    grid.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-pulse"></i> Finding your dream homes...</div>';
  }

  let candidates = allHouses.filter(house => {
    if (maxPrice && house.price > maxPrice) return false;
    if (bedrooms && house.bedrooms < bedrooms) return false;
    return true;
  });

  if (candidates.length === 0) {
    const msg = '<div style="text-align:center; padding:20px;">No properties match your basic criteria. Try increasing budget or reducing bedrooms.</div>';
    if (grid) grid.innerHTML = msg;
    else if (document.getElementById("dreamMatchWrapper")) document.getElementById("dreamMatchWrapper").innerHTML = msg;
    return;
  }

  const answers = { type, workFromHome, social, outdoor, noise, maxPrice, bedrooms };
  const scored = candidates.map(house => ({ house, score: scoreHouseForDream(house, answers) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 12).map(s => ({
    id: s.house._id,
    name: s.house.name,
    price: s.house.price,
    location: s.house.location,
    image: s.house.images?.[0] || "placeholder.jpg",
    type: s.house.type,
    score: s.score
  }));

  const resultsHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem;">` +
    top.map(house => `
      <div class="dream-card" style="cursor:pointer;" onclick="showDetails('${house.id}'); closeDreamMatchModal();">
        <img src="${house.image}" alt="${escapeHtml(house.name)}" style="width:100%; height:160px; object-fit:cover;">
        <div class="dream-card-content">
          <div class="dream-match-badge"><i class="fas fa-chart-line"></i> ${Math.round(house.score)}% Match</div>
          <h3>${escapeHtml(house.name)}</h3>
          <p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(house.location)}</p>
          <div class="dream-price">MWK ${Number(house.price).toLocaleString()}</div>
          <button class="carousel-btn" onclick="event.stopPropagation(); showDetails('${house.id}'); closeDreamMatchModal();">View Details</button>
        </div>
      </div>
    `).join('') + `</div>`;

  if (grid) grid.innerHTML = resultsHtml;
  else if (document.getElementById("dreamMatchWrapper")) document.getElementById("dreamMatchWrapper").innerHTML = resultsHtml;
  showToast(`Found ${top.length} dream matches!`);
}

function openDreamMatchModal() {
  const modal = document.getElementById("dreamMatchModal");
  if (modal) modal.style.display = "block";
  document.getElementById("dreamMatchForm").reset();
  const resultsDiv = document.getElementById("dreamMatchResults");
  if (resultsDiv) resultsDiv.style.display = "none";
}

function closeDreamMatchModal() {
  const modal = document.getElementById("dreamMatchModal");
  if (modal) modal.style.display = "none";
}

// ========== REGION MAPPING ==========
const regionMap = {
  'Mzuzu': 'Northern', 'Rumphi': 'Northern', 'Karonga': 'Northern', 'Chitipa': 'Northern',
  'Nkhata Bay': 'Northern', 'Mzimba': 'Northern',
  'Lilongwe': 'Central', 'Dedza': 'Central', 'Salima': 'Central', 'Mchinji': 'Central',
  'Ntcheu': 'Central', 'Kasungu': 'Central', 'Dowa': 'Central', 'Nkhotakota': 'Central',
  'Blantyre': 'Southern', 'Zomba': 'Southern', 'Mulanje': 'Southern', 'Thyolo': 'Southern',
  'Mangochi': 'Southern', 'Balaka': 'Southern', 'Chikwawa': 'Southern', 'Nsanje': 'Southern',
  'Phalombe': 'Southern', 'Machinga': 'Southern'
};

// ========== HELPER FUNCTIONS ==========
function checkAuth() { return !!localStorage.getItem("token"); }
function getUserIdFromToken() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id;
  } catch { return null; }
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

function getDisplayType(type) {
  const typeMap = {
    'House': 'House',
    'Apartment': 'Apartment',
    'Room': 'Room',
    'Hostel': 'Hostel',
    'Office': 'Office',
    'FurnishedApartment': 'Furnished Apartment',
    'ShortStay': 'Short-Stay',
    'SharedLiving': 'Shared Living',
    'StudentAccommodation': 'Student Accommodation'
  };
  return typeMap[type] || type;
}

function getTypeIcon(type) {
  const iconMap = {
    'House': 'fa-home',
    'Apartment': 'fa-building',
    'Room': 'fa-bed',
    'Hostel': 'fa-hotel',
    'Office': 'fa-briefcase',
    'FurnishedApartment': 'fa-couch',
    'ShortStay': 'fa-calendar-week',
    'SharedLiving': 'fa-users',
    'StudentAccommodation': 'fa-graduation-cap'
  };
  return iconMap[type] || 'fa-home';
}

function getStrongFieldsHTML(house) {
  const details = house.propertyDetails || {};
  switch (house.type) {
    case 'House':
      let houseFields = [];
      if (house.bedrooms) houseFields.push(`<i class="fas fa-bed"></i> ${house.bedrooms} bed`);
      if (house.bathrooms) houseFields.push(`<i class="fas fa-bath"></i> ${house.bathrooms} bath`);
      if (house.selfContained) houseFields.push(`<i class="fas fa-home"></i> Self Contained`);
      return houseFields.length ? `<div class="strong-fields">${houseFields.join(' • ')}</div>` : '';
    case 'Apartment':
      let aptFields = [];
      if (house.bedrooms) aptFields.push(`<i class="fas fa-bed"></i> ${house.bedrooms} bed`);
      if (details.floorLevel) aptFields.push(`<i class="fas fa-layer-group"></i> Floor ${details.floorLevel}`);
      if (details.hasElevator === 'true' || details.hasElevator === true) aptFields.push(`<i class="fas fa-arrow-up"></i> Elevator`);
      return aptFields.length ? `<div class="strong-fields">${aptFields.join(' • ')}</div>` : '';
    case 'Room':
      let roomFields = [];
      const roomType = details.roomType || 'Single';
      roomFields.push(`<i class="fas fa-door-open"></i> ${roomType}`);
      if (details.bathroomType) roomFields.push(`<i class="fas fa-toilet"></i> ${details.bathroomType} bath`);
      return `<div class="strong-fields">${roomFields.join(' • ')}</div>`;
    case 'Hostel':
      let hostelFields = [];
      if (details.vacancies) hostelFields.push(`<i class="fas fa-bed"></i> ${details.vacancies} vacancies`);
      if (details.bedsPerRoom) hostelFields.push(`<i class="fas fa-users"></i> ${details.bedsPerRoom} beds/room`);
      return hostelFields.length ? `<div class="strong-fields">${hostelFields.join(' • ')}</div>` : '';
    case 'FurnishedApartment':
      let furnishedFields = [];
      if (house.furnished || details.furnished === 'true' || details.furnished === true) furnishedFields.push(`<i class="fas fa-couch"></i> Furnished`);
      if (details.utilitiesIncluded) furnishedFields.push(`<i class="fas fa-water"></i> Utilities incl.`);
      return furnishedFields.length ? `<div class="strong-fields">${furnishedFields.join(' • ')}</div>` : '';
    case 'ShortStay':
      let shortFields = [];
      if (details.dailyPrice) shortFields.push(`<i class="fas fa-sun"></i> MWK ${Number(details.dailyPrice).toLocaleString()}/day`);
      if (details.minimumStay) shortFields.push(`<i class="fas fa-clock"></i> Min ${details.minimumStay} days`);
      return shortFields.length ? `<div class="strong-fields">${shortFields.join(' • ')}</div>` : '';
    case 'SharedLiving':
      let sharedFields = [];
      if (details.availableBeds) sharedFields.push(`<i class="fas fa-bed"></i> ${details.availableBeds} beds left`);
      if (details.genderPreference) sharedFields.push(`<i class="fas fa-venus-mars"></i> ${details.genderPreference}`);
      return sharedFields.length ? `<div class="strong-fields">${sharedFields.join(' • ')}</div>` : '';
    case 'StudentAccommodation':
      let studentFields = [];
      if (details.nearbyUniversity) studentFields.push(`<i class="fas fa-university"></i> ${details.nearbyUniversity}`);
      if (details.studentOnly === 'true' || details.studentOnly === true) studentFields.push(`<i class="fas fa-graduation-cap"></i> Students only`);
      return studentFields.length ? `<div class="strong-fields">${studentFields.join(' • ')}</div>` : '';
    default: return '';
  }
}

// ========== CUSTOM MARKER ICON ==========
function getMarkerIcon(house) {
  let iconClass = 'fa-house';
  let bgColor = '#3b82f6';
  switch (house.type) {
    case 'Hostel': iconClass = 'fa-hotel'; bgColor = '#10b981'; break;
    case 'Apartment': iconClass = 'fa-building'; bgColor = '#8b5cf6'; break;
    case 'Room': iconClass = 'fa-bed'; bgColor = '#f59e0b'; break;
    case 'Office': iconClass = 'fa-briefcase'; bgColor = '#6b7280'; break;
    case 'FurnishedApartment': iconClass = 'fa-couch'; bgColor = '#ec4899'; break;
    case 'ShortStay': iconClass = 'fa-calendar-week'; bgColor = '#f97316'; break;
    case 'SharedLiving': iconClass = 'fa-users'; bgColor = '#14b8a6'; break;
    case 'StudentAccommodation': iconClass = 'fa-graduation-cap'; bgColor = '#a855f7'; break;
    default: iconClass = 'fa-house'; bgColor = '#3b82f6';
  }
  if (house.owner?.verificationType === 'premium') { bgColor = '#f1c40f'; iconClass = 'fa-crown'; }
  else if (house.owner?.verificationType === 'official') { bgColor = '#2ecc71'; iconClass = 'fa-check-circle'; }
  const html = `<div style="background-color: ${bgColor}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.3); border: 2px solid white;"><i class="fas ${iconClass}"></i></div>`;
  return L.divIcon({ html, iconSize: [32, 32], popupAnchor: [0, -16], className: 'custom-marker' });
}

// ========== RENDER MARKERS ==========
function renderMarkers(houses) {
  if (!markersLayer) return;
  markersLayer.clearLayers();
  houses.forEach(house => {
    if (!house.lat || !house.lng) return;
    const icon = getMarkerIcon(house);
    const marker = L.marker([house.lat, house.lng], { icon });
    const img = house.images?.length ? house.images[0] : "placeholder.jpg";
    let badge = "";
    if (house.owner?.verificationType === "premium") badge = `<span class="badge premium"><i class="fas fa-star"></i> Premium</span>`;
    else if (house.owner?.verificationType === "official") badge = `<span class="badge verified"><i class="fas fa-check-circle"></i> Verified</span>`;
    let details = '';
    if (house.type === 'Hostel') {
      details = `<p><i class="fas fa-hotel"></i> Hostel</p><p><i class="fas fa-bed"></i> Vacancies: ${house.vacancies || 0} rooms</p><p><i class="fas fa-money-bill-wave"></i> MWK ${Number(house.price).toLocaleString()} / room</p>`;
    } else {
      let displayType = getDisplayType(house.type);
      details = `<p><i class="fas ${getTypeIcon(house.type)}"></i> ${displayType}</p><p><i class="fas fa-bed"></i> Bedrooms: ${house.bedrooms || 'N/A'}</p><p><i class="fas fa-money-bill-wave"></i> MWK ${Number(house.price).toLocaleString()} / month</p>`;
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
    const popup = `<div style="width:200px"><img src="${img}" style="width:100%;height:140px;object-fit:cover"><h4>${house.name}</h4>${details}${genderInfo}${amenitiesHtml}${unavailableHtml}${badge}${selfContainedBadge}${featuredBadge}<br><a href="https://wa.me/${house.phone}" target="_blank"><i class="fab fa-whatsapp"></i> Contact</a></div>`;
    marker.bindPopup(popup);
    markersLayer.addLayer(marker);
  });
}

// ========== FETCH HOUSES ==========
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
    if (filters.district && filters.district !== '') params.append('district', filters.district);

    const res = await fetch(`/api/houses?${params.toString()}`);
    const data = await res.json();
    allHouses = data.houses;
    currentPage = data.page;
    totalPages = data.pages;

    const urlParams = new URLSearchParams(window.location.search);
    const houseId = urlParams.get('house');
    if (houseId) {
      const house = allHouses.find(h => h._id === houseId);
      if (house) setTimeout(() => showDetails(houseId), 500);
    }
    applyRegionFilter();
    renderHouses(allHouses);
    renderMarkers(allHouses);
    renderPagination();
    updateURL();
  } catch (err) {
    console.error("Failed loading houses:", err);
    const container = document.getElementById("houses-container");
    if (container) container.innerHTML = "<p>Failed to load houses. Please refresh.</p>";
  }
}

function updateURL() {
  const url = new URL(window.location);
  url.searchParams.set('page', currentPage);
  if (currentType !== 'all') url.searchParams.set('type', currentType);
  else url.searchParams.delete('type');
  if (currentSort !== 'default') url.searchParams.set('sort', currentSort);
  else url.searchParams.delete('sort');
  if (currentDistrict) url.searchParams.set('district', currentDistrict);
  else url.searchParams.delete('district');
  window.history.replaceState({}, '', url);
}

function renderPagination() {
  const paginationDiv = document.getElementById('pagination');
  if (!paginationDiv) return;
  if (totalPages <= 1) { paginationDiv.innerHTML = ''; return; }
  let html = '';
  html += `<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="changePage(${currentPage - 1})"><i class="fas fa-chevron-left"></i> Prev</button>`;
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
  html += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="changePage(${currentPage + 1})">Next <i class="fas fa-chevron-right"></i></button>`;
  paginationDiv.innerHTML = html;
}

function changePage(page) {
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  loadHouses(currentPage, currentType, currentFilters, currentSort);
}

// ========== REGION FILTER ==========
function filterByRegion(house) {
  if (!currentRegion) return true;
  const locationLower = (house.location || '').toLowerCase();
  for (const [city, region] of Object.entries(regionMap)) {
    if (locationLower.includes(city.toLowerCase()) && region === currentRegion) return true;
  }
  return false;
}
function applyRegionFilter() {
  const filtered = allHouses.filter(house => filterByRegion(house));
  renderHouses(filtered);
  renderMarkers(filtered);
}

// ========== PRICE SLIDER ==========
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
    range: { 'min': 0, 'max': 2000000 },
    step: 5000,
    format: { to: value => Math.round(value), from: value => Number(value) }
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
  const districtDropdownEl = document.getElementById('districtFilterSelect');
  let districtValue = '';
  if (districtDropdownEl && districtDropdownEl.value) districtValue = districtDropdownEl.value;
  else if (window.selectedDistrict) districtValue = window.selectedDistrict;
  currentDistrict = districtValue;
  return {
    minPrice: document.getElementById('priceMin')?.value || '',
    maxPrice: document.getElementById('priceMax')?.value || '',
    bedrooms: document.getElementById('bedrooms')?.value || '',
    wifi: document.getElementById('filterWifi')?.checked || false,
    parking: document.getElementById('filterParking')?.checked || false,
    furnished: document.getElementById('filterFurnished')?.checked || false,
    petFriendly: document.getElementById('filterPetFriendly')?.checked || false,
    pool: document.getElementById('filterPool')?.checked || false,
    ac: document.getElementById('filterAC')?.checked || false,
    region: document.getElementById('regionFilter')?.value || '',
    district: districtValue
  };
}
function applyFilters() {
  currentFilters = getCurrentFilters();
  currentRegion = currentFilters.region;
  currentDistrict = currentFilters.district;
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

// ========== SAVE SEARCH ==========
function saveSearch() {
  const modal = document.getElementById('saveSearchModal');
  if (!modal) return;
  modal.style.display = 'block';
  document.getElementById('saveSearchForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('searchEmail').value;
    const name = document.getElementById('searchName').value;
    const filters = getCurrentFilters();
    const searchData = { name: name || 'Saved Search', email, filters, type: currentType, sort: currentSort, createdAt: new Date().toISOString() };
    let savedSearches = JSON.parse(localStorage.getItem('savedSearches') || '[]');
    savedSearches.push(searchData);
    localStorage.setItem('savedSearches', JSON.stringify(savedSearches));
    document.getElementById('saveSearchStatus').innerHTML = '<div class="message success"><i class="fas fa-check-circle"></i> Search saved! You will receive email alerts when new houses match.</div>';
    setTimeout(() => { modal.style.display = 'none'; document.getElementById('saveSearchStatus').innerHTML = ''; }, 2000);
  };
}

// ========== MAP INIT ==========
function initMap() {
  map = L.map("map").setView([-15.786, 35.005], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map);
  markersLayer = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50, iconCreateFunction: function(cluster) { return L.divIcon({ html: '<div style="background:#3498db; color:white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-weight:bold;">' + cluster.getChildCount() + '</div>', className: 'marker-cluster-custom', iconSize: L.point(30, 30) }); } });
  map.addLayer(markersLayer);
  drawnItems = L.featureGroup().addTo(map);
  const drawControl = new L.Control.Draw({ edit: { featureGroup: drawnItems, remove: true }, draw: { polygon: true, polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false } });
  map.addControl(drawControl);
  map.on(L.Draw.Event.CREATED, (e) => { if (drawnPolygon) map.removeLayer(drawnPolygon); drawnPolygon = e.layer; drawnItems.addLayer(drawnPolygon); filterHousesByPolygon(); });
  const clearDrawBtn = document.getElementById('clearDrawBtn');
  if (clearDrawBtn) clearDrawBtn.addEventListener('click', () => { drawnItems.clearLayers(); drawnPolygon = null; renderHouses(allHouses); renderMarkers(allHouses); });
  const radiusSlider = document.getElementById('radiusSliderControl');
  const radiusValueSpan = document.getElementById('radiusValueControl');
  if (radiusSlider) radiusSlider.addEventListener('input', (e) => { radius = parseFloat(e.target.value); radiusValueSpan.innerText = radius + ' km'; });
  const applyRadiusBtn = document.getElementById('applyRadiusBtn');
  if (applyRadiusBtn) applyRadiusBtn.addEventListener('click', () => { if (userLocation) { const nearby = allHouses.filter(h => { if (!h.lat || !h.lng) return false; const dist = getDistance(userLocation.lat, userLocation.lng, h.lat, h.lng); return dist <= radius; }); renderHouses(nearby); renderMarkers(nearby); map.setView([userLocation.lat, userLocation.lng], 14); L.marker([userLocation.lat, userLocation.lng]).addTo(map).bindPopup("<i class='fas fa-map-pin'></i> You are here").openPopup(); } else { showToast("Please use 'Near Me' first to get your location.", 'error'); } });
}
function filterHousesByPolygon() {
  if (!drawnPolygon) return;
  const filtered = allHouses.filter(house => { if (!house.lat || !house.lng) return false; const point = turf.point([house.lng, house.lat]); const coords = drawnPolygon.getLatLngs()[0].map(p => [p.lng, p.lat]); const poly = turf.polygon([coords]); return turf.booleanPointInPoint(point, poly); });
  renderHouses(filtered);
  renderMarkers(filtered);
}

// ========== COMPARISON ==========
function updateCompareButton() {
  const btn = document.getElementById('compareFloatingBtn');
  const countSpan = document.getElementById('compareCount');
  if (btn && countSpan) { const count = comparisonList.length; countSpan.textContent = count; btn.style.display = count > 0 ? 'flex' : 'none'; }
}
function addToCompare(houseId) {
  if (comparisonList.includes(houseId)) {
    comparisonList = comparisonList.filter(id => id !== houseId);
    const btn = document.querySelector(`.compare-btn[data-id="${houseId}"]`);
    if (btn) btn.innerHTML = '<i class="fas fa-chart-simple"></i> Compare';
  } else {
    if (comparisonList.length >= 3) { showToast('You can compare up to 3 properties at once.', 'error'); return; }
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
  let tableHtml = '<table style="width:100%; border-collapse: collapse; text-align: center; font-size: 0.75rem;">';
  tableHtml += '<thead><th style="padding: 8px;">Feature</th>';
  housesToCompare.forEach(house => { tableHtml += `<th style="padding: 8px;">${house.name}</th>`; });
  tableHtml += '</thead><tbody>';
  const features = [
    { label: '<i class="fas fa-money-bill-wave"></i> Price', key: 'price', format: (v, house) => `MWK ${v.toLocaleString()} ${house.type === 'Hostel' ? '/ room' : '/ month'}` },
    { label: '<i class="fas fa-map-marker-alt"></i> Location', key: 'location' },
    { label: '<i class="fas fa-home"></i> Type', key: 'type', format: (v) => getDisplayType(v) },
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
    tableHtml += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding: 8px; font-weight: bold;">${feature.label}</td>`;
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
    tableHtml += `<tr>`;
  });
  tableHtml += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding: 8px; font-weight: bold;"><i class="fas fa-image"></i> Image</td>`;
  housesToCompare.forEach(house => {
    const imgUrl = house.images?.[0] || 'placeholder.jpg';
    tableHtml += `<td style="padding: 8px;"><img src="${imgUrl}" style="width:60px; height:60px; object-fit:cover; border-radius:8px;"></td>`;
  });
  tableHtml += `<tr></tbody></table>`;
  let bestHouse = housesToCompare[0];
  for (let i = 1; i < housesToCompare.length; i++) {
    const a = bestHouse;
    const b = housesToCompare[i];
    const scoreA = (a.averageRating || 0) * 10 + (a.views || 0) / 100 - (a.price / 10000);
    const scoreB = (b.averageRating || 0) * 10 + (b.views || 0) / 100 - (b.price / 10000);
    if (scoreB > scoreA) bestHouse = b;
  }
  const summaryHtml = `<div style="margin-top: 1.5rem; padding: 1rem; background: rgba(37,99,235,0.05); border-radius: 16px; border-left: 3px solid #2563eb;"><i class="fas fa-robot" style="color: #2563eb; margin-right: 0.5rem;"></i><strong style="font-size: 0.85rem; font-weight: 600;">AI Recommendation:</strong><p style="font-size: 0.8rem; font-style: italic; color: var(--text-color); margin-top: 0.3rem;">Based on rating, views, and price, <strong>${bestHouse.name}</strong> is the best choice among your selections.</p></div>`;
  container.innerHTML = tableHtml + summaryHtml;
  document.getElementById('comparisonModal').style.display = 'block';
}
function closeComparisonModal() { document.getElementById('comparisonModal').style.display = 'none'; }

// ========== RENDER HOUSE CARDS (with price change display) ==========
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
    let slidesHtml = '';
    let dotsHtml = '';
    images.forEach((img, idx) => {
      slidesHtml += `<div class="slide"><img src="${img}" alt="${escapeHtml(house.name)}" loading="lazy"></div>`;
      dotsHtml += `<span class="dot" data-index="${idx}"></span>`;
    });
    let avatarHtml = '';
    if (house.owner) {
      const initial = house.owner.name ? house.owner.name.charAt(0).toUpperCase() : '?';
      const avatarStyle = house.owner.profilePicture ? `<img src="${house.owner.profilePicture}" alt="${house.owner.name}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:1rem;">${initial}</span>`;
      avatarHtml = `<div class="landlord-avatar" data-landlord-id="${house.owner._id}" onclick="event.stopPropagation(); showLandlordProfile('${house.owner._id}')">${avatarStyle}</div>`;
    }
    const isPremiumLandlord = house.owner && (house.owner.verificationType === 'premium' || house.owner.role === 'premium_landlord');
    let landlordBadge = '';
    if (house.owner && (house.owner.verificationType === 'official' || house.owner.verificationType === 'premium')) {
      landlordBadge = `<span class="verified-badge-custom" style="display: inline-flex; align-items: center; margin-left: 6px;">${fbSaturatedSky(18)}</span>`;
    }
    let landlordInfoHtml = '';
    if (house.owner) {
      landlordInfoHtml = `<div class="landlord-info-row" style="position: relative;">${avatarHtml}<a href="#" class="landlord-name-link" data-landlord-id="${house.owner._id}" style="text-decoration:none; font-weight:600;">${house.owner.name}</a>${landlordBadge}</div>`;
    }
    const featuredBadge = house.featured ? '<span class="badge featured"><i class="fas fa-star"></i> FEATURED</span>' : '';
    const selfContainedBadge = house.selfContained ? '<span class="badge self-contained"><i class="fas fa-home"></i> Self Contained</span>' : '';
    let genderBadgeHtml = '';
    if (house.gender && house.gender !== 'none') {
      let genderClass = '', genderText = '';
      if (house.gender === 'boys') { genderClass = 'gender-boys'; genderText = '<i class="fas fa-mars"></i> Boys Only'; }
      else if (house.gender === 'girls') { genderClass = 'gender-girls'; genderText = '<i class="fas fa-venus"></i> Girls Only'; }
      else if (house.gender === 'mixed') { genderClass = 'gender-mixed'; genderText = '<i class="fas fa-venus-mars"></i> Mixed'; }
      genderBadgeHtml = `<span class="badge ${genderClass}">${genderText}</span>`;
    }
    let rentalStatusBadge = '';
    if (house.rentalStatus === 'available') rentalStatusBadge = '<span class="badge available"><i class="fas fa-check-circle"></i> Available</span>';
    else if (house.rentalStatus === 'rented') rentalStatusBadge = '<span class="badge rented"><i class="fas fa-ban"></i> Rented</span>';
    else if (house.rentalStatus === 'pending') rentalStatusBadge = '<span class="badge pending"><i class="fas fa-clock"></i> Pending</span>';
    
    // Price display with old price and percentage change
    let priceHtml = '';
    const priceValue = house.price;
    const formattedPrice = `MWK ${Number(priceValue).toLocaleString()}`;
    if (house.oldPrice && house.oldPrice !== priceValue) {
      const oldPrice = house.oldPrice;
      const change = priceValue - oldPrice;
      const percent = ((change / oldPrice) * 100).toFixed(0);
      const changeClass = change < 0 ? 'negative' : '';
      const changeSymbol = change < 0 ? '↓' : '↑';
      priceHtml = `<p class="price"><i class="fas fa-money-bill-wave"></i> <span class="old-price">MWK ${oldPrice.toLocaleString()}</span> <span class="price-change ${changeClass}">${Math.abs(percent)}% ${changeSymbol}</span> ${formattedPrice} ${house.type === 'Hostel' ? '/ room' : '/ month'}</p>`;
    } else {
      priceHtml = `<p class="price"><i class="fas fa-money-bill-wave"></i> ${formattedPrice} ${house.type === 'Hostel' ? '/ room' : '/ month'}</p>`;
    }
    
    const ratingStars = getStarRating(house.averageRating);
    const ratingText = house.averageRating ? house.averageRating.toFixed(1) : "N/A";
    const favIcon = favorites.includes(house._id) ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
    const chatBtn = (isLoggedIn && house.owner && house.owner._id !== currentUserId) ? `<button class="chat-btn" onclick="startChat('${house.owner._id}', '${house._id}')"><i class="fas fa-comment-dots"></i> Chat</button>` : '';
    const shareBtn = `<button class="share-btn" onclick="shareHouse('${house._id}', '${house.name}')"><i class="fas fa-share-alt"></i> Share</button>`;
    const isSelected = comparisonList.includes(house._id);
    const compareBtn = `<button class="compare-btn" data-id="${house._id}" onclick="addToCompare('${house._id}')"><i class="fas fa-chart-simple"></i> ${isSelected ? 'Remove' : 'Compare'}</button>`;
    const reportBtn = isLoggedIn ? `<button class="report-btn" onclick="reportHouse('${house._id}')"><i class="fas fa-flag"></i> Report</button>` : '';
    const favBtn = `<button class="fav-btn" onclick="toggleFavorite('${house._id}')">${favIcon}</button>`;
    const readMoreBtn = `<button class="read-more-btn" onclick="showDetails('${house._id}')"><i class="fas fa-book-open"></i> Read more</button>`;
    const ratingWidgetHtml = `<div class="rating-widget" data-house-id="${house._id}">${[1,2,3,4,5].map(v => `<span class="star" data-value="${v}">☆</span>`).join('')}<span class="rating-message" style="font-size:0.6rem; margin-left:0.5rem;"></span></div>`;
    const displayType = getDisplayType(house.type);
    const typeIcon = getTypeIcon(house.type);
    const strongFieldsHtml = getStrongFieldsHTML(house);

    card.innerHTML = `
      <div class="slider">
        <div class="slides-container" data-house-id="${house._id}">
          ${slidesHtml}
        </div>
        <div class="dots">${dotsHtml}</div>
      </div>
      <div class="house-card-content">
        ${landlordInfoHtml}
        ${featuredBadge}
        ${selfContainedBadge}
        ${genderBadgeHtml}
        ${rentalStatusBadge}
        <h3>${house.name}</h3>
        <p><i class="fas fa-map-marker-alt"></i> ${house.location || 'N/A'}</p>
        ${priceHtml}
        ${strongFieldsHtml}
        <p><i class="fas ${typeIcon}"></i> ${displayType}</p>
        <p><i class="fas fa-star"></i> Rating: <span class="rating-value">${ratingText}</span> <span class="rating-stars">${ratingStars}</span></p>
        ${ratingWidgetHtml}
        <div class="action-buttons">
          ${chatBtn}
          ${favBtn}
          ${shareBtn}
          ${compareBtn}
          ${reportBtn}
        </div>
        ${readMoreBtn}
      </div>
    `;
    container.appendChild(card);

    // Apply crown to landlord avatar if premium
    const landlordAvatarDiv = card.querySelector('.landlord-avatar');
    if (landlordAvatarDiv && isPremiumLandlord) addCrownToLandlordAvatar(landlordAvatarDiv, true);

    // Initialize slider
    const sliderContainer = card.querySelector('.slides-container');
    const dots = card.querySelectorAll('.dot');
    if (sliderContainer && dots.length) {
      let activeIndex = 0;
      const updateActiveDot = () => {
        const scrollLeft = sliderContainer.scrollLeft;
        const slideWidth = sliderContainer.clientWidth;
        if (slideWidth === 0) return;
        const newIndex = Math.round(scrollLeft / slideWidth);
        if (newIndex !== activeIndex && newIndex >= 0 && newIndex < dots.length) {
          activeIndex = newIndex;
          dots.forEach((dot, idx) => dot.classList.toggle('active', idx === activeIndex));
        }
      };
      sliderContainer.addEventListener('scroll', updateActiveDot);
      sliderContainer.addEventListener('touchmove', updateActiveDot);
      setTimeout(updateActiveDot, 100);
      dots.forEach((dot, idx) => {
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          sliderContainer.scrollTo({ left: idx * sliderContainer.clientWidth, behavior: 'smooth' });
        });
      });
    }

    // Rating widget
    const ratingWidget = card.querySelector('.rating-widget');
    if (ratingWidget) {
      const stars = ratingWidget.querySelectorAll('.star');
      const houseId = ratingWidget.dataset.houseId;
      const messageSpan = ratingWidget.querySelector('.rating-message');
      const highlightStars = (value) => { stars.forEach((star, idx) => { star.textContent = idx < value ? '★' : '☆'; }); };
      const resetStars = () => {
        const currentRating = house.averageRating || 0;
        const rounded = Math.round(currentRating);
        stars.forEach((star, idx) => { star.textContent = idx < rounded ? '★' : '☆'; });
      };
      stars.forEach(star => {
        star.addEventListener('click', async (e) => {
          e.stopPropagation();
          const value = parseInt(star.dataset.value);
          const token = localStorage.getItem('token');
          if (!token) {
            messageSpan.textContent = 'Please login to rate';
            setTimeout(() => messageSpan.textContent = '', 2000);
            return;
          }
          try {
            const res = await fetch(`/api/houses/${houseId}/rate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
              body: JSON.stringify({ value })
            });
            const data = await res.json();
            if (res.ok) {
              messageSpan.textContent = '✅ Rated!';
              setTimeout(() => messageSpan.textContent = '', 1500);
              const ratingValueSpan = card.querySelector('.rating-value');
              const ratingStarsSpan = card.querySelector('.rating-stars');
              if (data.average) {
                ratingValueSpan.textContent = data.average.toFixed(1);
                ratingStarsSpan.textContent = getStarRating(data.average);
              }
              const foundHouse = allHouses.find(h => h._id === houseId);
              if (foundHouse) foundHouse.averageRating = data.average;
              resetStars();
            } else {
              messageSpan.textContent = data.message || 'Error';
              setTimeout(() => messageSpan.textContent = '', 2000);
            }
          } catch (err) {
            messageSpan.textContent = 'Network error';
            setTimeout(() => messageSpan.textContent = '', 2000);
          }
        });
        star.addEventListener('mouseenter', () => { highlightStars(parseInt(star.dataset.value)); });
        star.addEventListener('mouseleave', resetStars);
      });
      resetStars();
    }

    // Lightbox on image click
    const slidesContainer = card.querySelector('.slides-container');
    if (slidesContainer) {
      slidesContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG') {
          e.stopPropagation();
          const currentIdx = Math.round(slidesContainer.scrollLeft / slidesContainer.clientWidth);
          if (typeof window.openLightbox === 'function') window.openLightbox(images, currentIdx);
        }
      });
    }

    // Record view on card click
    card.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON" || e.target.tagName === "A" || e.target.classList.contains("star") || e.target.classList.contains("dot")) return;
      fetch(`/api/houses/${house._id}/view`, { method: "PUT" }).catch(err => console.error("Failed to record view", err));
    });
  });

  document.querySelectorAll('.landlord-name-link').forEach(link => {
    link.removeEventListener('click', handleLandlordClick);
    link.addEventListener('click', handleLandlordClick);
  });
}

// ========== REPORT, CHAT, LANDLORD PROFILE ==========
async function reportHouse(houseId) {
  const token = localStorage.getItem("token");
  if (!token) { showToast("Please login to report.", 'error'); return; }
  const reason = prompt("Reason for reporting (e.g., fake listing, wrong price):");
  if (!reason) return;
  try {
    const res = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ houseId, reason }) });
    const data = await res.json();
    showToast(data.message);
  } catch (err) { showToast("Network error. Please try again.", 'error'); }
}

async function startChat(recipientId, houseId = null) {
  const token = localStorage.getItem("token");
  if (!token) { showToast("Please log in to message the landlord.", 'error'); window.location = "login.html"; return; }
  try {
    const response = await fetch("/api/chat/start", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ recipientId, houseId }) });
    const data = await response.json();
    if (response.ok) window.location = `chat.html?chatId=${data.chatId}`;
    else showToast("Could not start chat: " + (data.message || "Unknown error"), 'error');
  } catch (error) { console.error(error); showToast("Network error. Please try again.", 'error'); }
}

async function showLandlordProfile(landlordId) {
  try {
    const res = await fetch(`/api/profile/landlord/${landlordId}`);
    if (!res.ok) throw new Error('Failed to fetch landlord profile');
    const data = await res.json();
    const landlord = data.landlord;
    const houses = data.houses;
    const avatarHtml = landlord.profilePicture ? `<img class="avatar" src="${landlord.profilePicture}" alt="${landlord.name}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;">` : `<div class="avatar" style="background: #3498db; display: flex; align-items: center; justify-content: center; font-size: 2rem; width:100px;height:100px;border-radius:50%;">${landlord.name.charAt(0)}</div>`;
    let badgeHtml = '';
    if (landlord.verificationType === 'premium') badgeHtml = '<span class="badge premium"><i class="fas fa-star"></i> Premium Landlord</span>';
    else if (landlord.verificationType === 'official') badgeHtml = '<span class="badge verified"><i class="fas fa-check-circle"></i> Verified Landlord</span>';
    else badgeHtml = '<span class="badge none"><i class="fas fa-lock"></i> Not Verified</span>';
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
          <div class="landlord-properties-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-top: 12px;">
            ${houses.slice(0, 12).map(house => `
              <div class="landlord-property-card" style="cursor:pointer; border: 1px solid var(--input-border); border-radius: 12px; overflow: hidden;" onclick="showDetails('${house._id}'); closeLandlordModal();">
                <img src="${house.images?.[0] || 'placeholder.jpg'}" alt="${house.name}" style="width:100%; height:120px; object-fit: cover;">
                <div class="info" style="padding: 8px;">
                  <h4 style="font-size: 0.75rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${house.name}</h4>
                  <p style="font-size: 0.7rem;">MWK ${house.price.toLocaleString()}</p>
                </div>
              </div>
            `).join('')}
          </div>
          ${houses.length > 12 ? '<small>+ more</small>' : ''}
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
    showToast('Could not load landlord profile.', 'error');
  }
}
function closeLandlordModal() { document.getElementById('landlordModal').style.display = 'none'; }

// ========== DETAILED NEARBY AMENITY MODAL ==========
function filterPropertiesNearAmenity(pointsArray, typeName) {
  if (!pointsArray.length) {
    showToast(`No ${typeName} data available.`, 'error');
    return;
  }
  if (!lastSelectedHouse) {
    showToast('Double‑click a property first to select it.', 'error');
    return;
  }
  const radiusKm = parseFloat(document.getElementById('radiusSliderControl')?.value || 2);
  const from = turf.point([lastSelectedHouse.lng, lastSelectedHouse.lat]);
  const nearby = [];
  for (const amenity of pointsArray) {
    const to = turf.point([amenity.lng, amenity.lat]);
    const distance = turf.distance(from, to, { units: 'kilometers' });
    if (distance <= radiusKm) {
      nearby.push({ name: amenity.name, distance, lat: amenity.lat, lng: amenity.lng });
    }
  }
  if (nearby.length === 0) {
    showToast(`No ${typeName} within ${radiusKm} km of ${lastSelectedHouse.name}.`);
    return;
  }
  nearby.sort((a,b) => a.distance - b.distance);
  const modalContent = `
    <div style="max-height: 60vh; overflow-y: auto;">
      <h3><i class="fas fa-location-dot"></i> Nearby ${typeName}</h3>
      <p>Near <strong>${lastSelectedHouse.name}</strong> within ${radiusKm} km:</p>
      <ul style="margin-top: 12px;">
        ${nearby.slice(0,15).map(a => `
          <li style="margin-bottom: 10px; padding: 8px; background: rgba(0,0,0,0.03); border-radius: 12px;">
            <i class="fas fa-map-marker-alt"></i> <strong>${a.name}</strong><br>
            <i class="fas fa-arrows-up-down"></i> ${a.distance.toFixed(2)} km (approx. ${Math.round(a.distance/5 * 60)} min walk)<br>
            <a href="https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}" target="_blank" style="font-size:0.7rem;">View on Google Maps <i class="fas fa-external-link-alt"></i></a>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `<div class="modal-content" style="max-width: 400px;"><span class="close-btn" onclick="this.parentElement.parentElement.remove()">&times;</span>${modalContent}</div>`;
  document.body.appendChild(modal);
}

// ========== DOUBLE-CLICK: FLY TO PROPERTY & STORE ==========
function attachDoubleClickToHouseCards() {
  const cards = document.querySelectorAll('.house-card');
  cards.forEach(card => {
    if (card.dataset.dblclickAttached) return;
    card.dataset.dblclickAttached = 'true';
    card.addEventListener('dblclick', async (e) => {
      e.stopPropagation();
      const houseId = card.querySelector('[data-house-id]')?.dataset.houseId ||
                      card.querySelector('.slider .slides-container')?.dataset.houseId;
      if (!houseId) return;
      const house = allHouses?.find(h => h._id === houseId);
      if (!house || !house.lat || !house.lng) return;
      lastSelectedHouse = house;
      map.flyTo([house.lat, house.lng], 16, { duration: 1.5 });
      showToast(`📍 ${house.name} – now showing nearby amenities`, 'info');
    });
  });
}

const observer = new MutationObserver(() => attachDoubleClickToHouseCards());
observer.observe(document.getElementById('houses-container'), { childList: true, subtree: true });
setTimeout(attachDoubleClickToHouseCards, 2000);

// ========== NEIGHBOURHOOD INSIGHTS ==========
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
    const query = `[out:json][timeout:25];(node["amenity"="${amenity.type}"](around:${radius},${houseLat},${houseLng});way["amenity"="${amenity.type}"](around:${radius},${houseLat},${houseLng});node["shop"="${amenity.type}"](around:${radius},${houseLat},${houseLng});way["shop"="${amenity.type}"](around:${radius},${houseLat},${houseLng}););out center;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.elements && data.elements.length) {
        const nearest = data.elements.map(el => { const lat = el.lat || el.center?.lat; const lng = el.lon || el.center?.lon; if (!lat || !lng) return null; const dist = getDistance(houseLat, houseLng, lat, lng) * 1000; return { name: el.tags?.name || `${amenity.label} (nearby)`, dist }; }).filter(el => el && el.dist <= amenity.maxDist).sort((a,b) => a.dist - b.dist);
        if (nearest.length) allResults.push({ label: amenity.label, places: nearest.slice(0,3) });
      }
    } catch (err) { console.warn(`Failed to fetch ${amenity.type} data:`, err); }
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
  if (props.length) prosText = `✨ ${house?.name || 'This property'} is a ${props.join(', ')} property. ${prosText}`;
  else prosText = `✨ ${house?.name || 'This property'} is a comfortable property in a convenient location. ${prosText}`;
  let insightsHtml = `<h3><i class="fas fa-city"></i> Neighbourhood Insights</h3><div class="insight-pros" style="background:rgba(0,0,0,0.05); padding:12px; border-radius:12px; margin-bottom:16px;">${prosText}</div>`;
  if (allResults.length === 0) { const mapsUrl = `https://www.google.com/maps/search/amenities/@${houseLat},${houseLng},15z`; insightsHtml += `<p>No nearby amenities found in OpenStreetMap data. But you can <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i> explore the area on Google Maps</a> to see what's around.</p>`; }
  else { insightsHtml += `<div style="display:grid; gap:12px;">`; allResults.forEach(cat => { insightsHtml += `<div><strong>${cat.label}</strong><ul style="margin:5px 0 0 20px;">`; cat.places.forEach(place => { const walkMinutes = Math.round(place.dist / 80); insightsHtml += `<li>${place.name} – ${Math.round(place.dist)}m (about ${walkMinutes} min walk)</li>`; }); insightsHtml += `</ul></div>`; }); insightsHtml += `</div>`; }
  insightsDiv.innerHTML = insightsHtml;
}

// ========== STREET VIEW ==========
function loadStreetView(lat, lng) {
  const container = document.getElementById('modalStreetView');
  container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading street view...</div>';
  const apiKey = window.GOOGLE_MAPS_API_KEY;
  if (!apiKey) { container.innerHTML = '<p style="text-align:center; padding:20px;">Street view not configured. Please contact support.</p>'; return; }
  const size = '600x300';
  const heading = '0';
  const pitch = '0';
  const url = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&key=${apiKey}`;
  const img = new Image();
  img.onload = () => { container.innerHTML = `<img src="${url}" style="width:100%; border-radius:12px;" alt="Street View">`; };
  img.onerror = () => { const mapsUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`; container.innerHTML = `<p style="text-align:center; padding:20px;">Street view not available in this image.<br>But you can <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i> open Google Maps Street View</a> to see the area.</p>`; };
  img.src = url;
}

// ========== PRICE INSIGHTS ==========
async function loadPriceInsights(houseId) {
  const container = document.getElementById('modalPricing');
  container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-chart-line fa-spin"></i> Fetching market data...</div>';
  try {
    const res = await fetch(`/api/houses/price-insights/${houseId}`);
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    container.innerHTML = `<h3><i class="fas fa-chart-line"></i> Price Insights</h3><p><strong>Based on ${data.similarCount} similar properties nearby:</strong></p><ul style="margin: 1rem 0;"><li><i class="fas fa-chart-simple"></i> Average price: MWK ${data.averagePrice.toLocaleString()}</li><li><i class="fas fa-chart-line"></i> Median price: MWK ${data.medianPrice.toLocaleString()}</li><li><i class="fas fa-arrows-up-down"></i> Price range: MWK ${data.priceRange.min.toLocaleString()} – ${data.priceRange.max.toLocaleString()}</li></ul><div class="insight-pros" style="background:rgba(0,0,0,0.05); padding:12px; border-radius:12px;">🤖 <strong>AI Recommendation:</strong> ${data.recommendation}</div>`;
  } catch (err) { container.innerHTML = '<p>Market insights temporarily unavailable.</p>'; }
}

// ========== SHARE FUNCTIONS ==========
function shareHouse(houseId, houseName) { currentShareHouseId = houseId; document.getElementById('shareModal').style.display = 'block'; }
function closeShareModal() { document.getElementById('shareModal').style.display = 'none'; document.getElementById('shareStatus').innerHTML = ''; }
function getShareUrl() { return `${window.location.origin}/house/${currentShareHouseId}`; }
function shareOnFacebook() { window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getShareUrl())}`, '_blank', 'width=600,height=400'); closeShareModal(); }
function shareOnWhatsApp() { window.open(`https://wa.me/?text=${encodeURIComponent(`Check out this property: ${getShareUrl()}`)}`, '_blank'); closeShareModal(); }
function shareOnTwitter() { window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(getShareUrl())}`, '_blank', 'width=600,height=400'); closeShareModal(); }
function copyShareLink() { navigator.clipboard.writeText(getShareUrl()).then(() => { document.getElementById('shareStatus').innerHTML = '<span style="color:green;"><i class="fas fa-check-circle"></i> Link copied to clipboard!</span>'; setTimeout(() => { document.getElementById('shareStatus').innerHTML = ''; }, 2000); }).catch(() => { document.getElementById('shareStatus').innerHTML = '<span style="color:red;"><i class="fas fa-times-circle"></i> Failed to copy link.</span>'; setTimeout(() => { document.getElementById('shareStatus').innerHTML = ''; }, 2000); }); }

// ========== VIRTUAL TOUR ==========
function loadVirtualTour(url) {
  const container = document.getElementById('virtualTourContainer');
  const messageDiv = document.getElementById('virtualTourMessage');
  if (!container) return;
  container.innerHTML = '';
  messageDiv.innerHTML = '';
  if (!url) { messageDiv.innerHTML = '<p><i class="fas fa-info-circle"></i> No virtual tour available for this property.</p>'; return; }
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (youtubeMatch) {
    const embedUrl = `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.style.width = '100%';
    iframe.style.height = '400px';
    iframe.style.border = 'none';
    container.appendChild(iframe);
    return;
  }
  if (vimeoMatch) {
    const embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.style.width = '100%';
    iframe.style.height = '400px';
    iframe.style.border = 'none';
    container.appendChild(iframe);
    return;
  }
  if (typeof PhotoSphereViewer === 'undefined') { messageDiv.innerHTML = '<p><i class="fas fa-exclamation-triangle"></i> Viewer library not loaded. Please refresh.</p>'; return; }
  try {
    new PhotoSphereViewer({ container, panorama: url, navbar: true, size: { width: '100%', height: '100%' }, default_long: 0, default_lat: 0 });
  } catch (err) { console.error('Failed to load 360 image:', err); messageDiv.innerHTML = '<p><i class="fas fa-exclamation-triangle"></i> Failed to load 360° image. Make sure it\'s a valid panoramic image.</p>'; }
}

// ========== SHOW DETAILS ==========
async function showDetails(houseId) {
  const house = allHouses.find(h => h._id === houseId);
  if (!house) return;

  let detailsHtml = `<h2>${house.name}</h2><p><strong><i class="fas fa-home"></i> Type:</strong> ${getDisplayType(house.type)}</p><p><strong><i class="fas fa-map-marker-alt"></i> Location:</strong> ${house.location}</p><p><strong><i class="fas fa-money-bill-wave"></i> Price:</strong> MWK ${house.price.toLocaleString()} ${house.type === 'Hostel' ? '/ room' : '/ month'}</p><p><strong><i class="fas fa-bed"></i> Bedrooms:</strong> ${house.bedrooms || 'N/A'}</p><p><strong><i class="fas fa-bath"></i> Bathrooms:</strong> ${house.bathrooms || 'N/A'}</p><p><strong><i class="fas fa-clipboard-list"></i> Condition:</strong> ${house.condition}</p><p><strong><i class="fas fa-home"></i> Self Contained:</strong> ${house.selfContained ? '<i class="fas fa-check-circle"></i> Yes' : '<i class="fas fa-times-circle"></i> No'}</p><p><strong><i class="fas fa-align-left"></i> Description:</strong> ${house.description || 'No description'}</p><p><strong><i class="fas fa-cogs"></i> Amenities:</strong> ${house.wifi ? '<i class="fas fa-wifi"></i> WiFi ' : ''}${house.parking ? '<i class="fas fa-parking"></i> Parking ' : ''}${house.furnished ? '<i class="fas fa-couch"></i> Furnished ' : ''}${house.petFriendly ? '<i class="fas fa-paw"></i> Pet Friendly ' : ''}${house.pool ? '<i class="fas fa-swimming-pool"></i> Pool ' : ''}${house.ac ? '<i class="fas fa-snowflake"></i> AC ' : ''}</p><p><strong><i class="fas fa-venus-mars"></i> Gender:</strong> ${house.gender === 'none' ? 'No restriction' : house.gender === 'boys' ? '<i class="fas fa-mars"></i> Boys Only' : house.gender === 'girls' ? '<i class="fas fa-venus"></i> Girls Only' : '<i class="fas fa-venus-mars"></i> Mixed'}</p><p><strong><i class="fas fa-calendar-times"></i> Unavailable Dates:</strong> ${house.unavailableDates?.length ? house.unavailableDates.map(d => new Date(d).toLocaleDateString()).join(', ') : 'None'}</p><p><strong><i class="fab fa-whatsapp"></i> Contact:</strong> <a href="https://wa.me/${house.phone}" target="_blank">WhatsApp</a></p>`;

  const isLoggedIn = !!localStorage.getItem("token");
  let currentUserId = null;
  if (isLoggedIn) {
    try {
      const payload = JSON.parse(atob(localStorage.getItem("token").split('.')[1]));
      currentUserId = payload.id;
    } catch(e) {}
  }

  // Fetch tenant's offer
  let myOffer = null;
  if (isLoggedIn && house.owner && house.owner._id !== currentUserId) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/offers/my/house/${house._id}`, { headers: { Authorization: 'Bearer ' + token } });
      if (res.ok) myOffer = await res.json();
    } catch (err) { console.error('Failed to fetch tenant offer', err); }
  }

  if (myOffer) {
    let statusHtml = '';
    if (myOffer.status === 'pending') statusHtml = `<div class="offer-status-card pending"><i class="fas fa-clock"></i> Your offer: Pending (MWK ${myOffer.proposedPrice.toLocaleString()})</div>`;
    else if (myOffer.status === 'accepted') statusHtml = `<div class="offer-status-card accepted"><i class="fas fa-check-circle"></i> Your offer was ACCEPTED! Contact the landlord to finalise.</div>`;
    else if (myOffer.status === 'rejected') statusHtml = `<div class="offer-status-card rejected"><i class="fas fa-times-circle"></i> Your offer was rejected.</div>`;
    else if (myOffer.status === 'countered') statusHtml = `<div class="offer-status-card countered"><i class="fas fa-exchange-alt"></i> Landlord countered: MWK ${myOffer.counterOfferPrice.toLocaleString()}<br>Move-in: ${new Date(myOffer.counterOfferDate).toLocaleDateString()}<br>${myOffer.landlordComment ? `<em>${myOffer.landlordComment}</em><br>` : ''}<div style="display: flex; gap: 8px; margin-top: 12px; justify-content: center;"><button id="acceptCounterFromModalBtn" class="save-search-btn" style="background: #10b981;">Accept Counter Offer</button><button id="rejectCounterFromModalBtn" class="save-search-btn" style="background: #ef4444;">Reject Counter Offer</button></div></div>`;
    detailsHtml = statusHtml + detailsHtml;
  }
  document.getElementById('modalDetails').innerHTML = detailsHtml;

  // Attach accept/reject handlers if counter offer
  if (myOffer && myOffer.status === 'countered') {
    const acceptBtn = document.getElementById('acceptCounterFromModalBtn');
    const rejectBtn = document.getElementById('rejectCounterFromModalBtn');
    if (acceptBtn) acceptBtn.addEventListener('click', async () => {
      if (!confirm('Accept the landlord’s counter offer?')) return;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/offers/${myOffer._id}/accept-tenant`, { method: 'PUT', headers: { Authorization: 'Bearer ' + token } });
        if (res.ok) { showToast('Counter offer accepted! The landlord will contact you.'); closePropertyModal(); }
        else { const err = await res.json(); showToast('Failed: ' + err.message, 'error'); }
      } catch (err) { showToast('Network error', 'error'); }
    });
    if (rejectBtn) rejectBtn.addEventListener('click', async () => {
      if (!confirm('Reject the landlord’s counter offer?')) return;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/offers/${myOffer._id}/reject-tenant`, { method: 'PUT', headers: { Authorization: 'Bearer ' + token } });
        if (res.ok) { showToast('Counter offer rejected.'); closePropertyModal(); }
        else { const err = await res.json(); showToast('Failed: ' + err.message, 'error'); }
      } catch (err) { showToast('Network error', 'error'); }
    });
  }

  // Make an Offer button
  const hasActiveOffer = myOffer && (myOffer.status === 'pending' || myOffer.status === 'countered');
  if (isLoggedIn && house.owner && house.owner._id !== currentUserId && house.allowBidding !== false && !hasActiveOffer) {
    const offerSection = document.createElement('div');
    offerSection.className = 'offer-section';
    offerSection.style.marginTop = '1rem';
    offerSection.style.paddingTop = '1rem';
    offerSection.style.borderTop = '1px solid var(--input-border)';
    offerSection.innerHTML = `<button id="makeOfferBtn" class="save-search-btn" style="background: #f59e0b;"><i class="fas fa-gavel"></i> Make an Offer</button><div id="offerFormContainer" style="display: none; margin-top: 1rem;"></div>`;
    document.getElementById('modalDetails').appendChild(offerSection);
    const makeOfferBtn = document.getElementById('makeOfferBtn');
    const container = document.getElementById('offerFormContainer');
    makeOfferBtn.addEventListener('click', () => {
      if (container.style.display === 'none') {
        container.style.display = 'block';
        container.innerHTML = `<div class="form-group"><label>Your Offer Price (MWK)</label><input type="number" id="offerPrice" placeholder="e.g., 150000" value="${house.price}"></div><div class="form-group"><label>Proposed Move‑in Date</label><input type="date" id="offerMoveInDate" required></div><div class="form-group"><label>Message to Landlord (optional)</label><textarea id="offerComment" rows="2" placeholder="e.g., I can move in immediately..."></textarea></div><button id="submitOfferBtn" class="save-search-btn">Submit Offer</button>`;
        document.getElementById('submitOfferBtn').addEventListener('click', async () => {
          const price = document.getElementById('offerPrice').value;
          const moveInDate = document.getElementById('offerMoveInDate').value;
          const comment = document.getElementById('offerComment').value;
          if (!price || !moveInDate) { showToast('Please fill in all required fields', 'error'); return; }
          const token = localStorage.getItem('token');
          try {
            const res = await fetch('/api/offers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
              body: JSON.stringify({ houseId: house._id, proposedPrice: parseInt(price), moveInDate, tenantComment: comment })
            });
            const data = await res.json();
            if (res.ok) { showToast('Offer submitted successfully! The landlord will be notified.'); container.style.display = 'none'; showDetails(house._id); }
            else showToast('Failed to submit offer: ' + (data.message || 'Unknown error'), 'error');
          } catch (err) { showToast('Network error', 'error'); }
        });
      } else { container.style.display = 'none'; }
    });
  }

  // Highest bid for premium users
  if (isLoggedIn && house.showHighestBidToPremium) {
    try {
      const token = localStorage.getItem('token');
      let isPremium = false;
      try { const payload = JSON.parse(atob(token.split('.')[1])); isPremium = payload.isPremium === true; } catch(e) {}
      if (!isPremium) {
        const userRes = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
        if (userRes.ok) { const userData = await userRes.json(); isPremium = userData.isPremium === true; }
      }
      if (isPremium) {
        const res = await fetch(`/api/offers/house/${house._id}/highest`, { headers: { Authorization: 'Bearer ' + token } });
        if (res.ok) {
          const highest = await res.json();
          if (highest && highest.proposedPrice) {
            const highestDiv = document.createElement('div');
            highestDiv.className = 'highest-bid';
            highestDiv.innerHTML = `<i class="fas fa-chart-line"></i> Current highest bid: MWK ${highest.proposedPrice.toLocaleString()}`;
            document.getElementById('modalDetails').appendChild(highestDiv);
          }
        }
      }
    } catch (err) { console.error('Failed to fetch highest bid', err); }
  }

  // Lease negotiation
  if (isLoggedIn && house.owner && house.owner._id === currentUserId) {
    const leaseBtn = document.createElement('button');
    leaseBtn.className = 'save-search-btn';
    leaseBtn.style.background = '#0d9488';
    leaseBtn.style.marginTop = '0.5rem';
    leaseBtn.style.width = '100%';
    leaseBtn.innerHTML = '<i class="fas fa-file-signature"></i> Start Lease Negotiation';
    leaseBtn.onclick = async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch('/api/lease/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ houseId: house._id, rentAmount: house.price, depositAmount: house.price * 2, leaseStartDate: new Date().toISOString().split('T')[0], leaseEndDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0] })
        });
        const data = await res.json();
        if (res.ok) {
          const negotiationUrl = `${window.location.origin}/lease-negotiation.html?id=${data._id}`;
          const copyLink = confirm(`Lease negotiation created!\n\nShare this link with the tenant:\n${negotiationUrl}\n\nClick OK to copy the link to clipboard.`);
          if (copyLink) { await navigator.clipboard.writeText(negotiationUrl); showToast('Link copied to clipboard! Send it to the tenant.'); }
          window.location.href = negotiationUrl;
        } else { showToast('Error: ' + data.message, 'error'); }
      } catch (err) { showToast('Network error: ' + err.message, 'error'); }
    };
    document.getElementById('modalDetails').appendChild(leaseBtn);
  } else if (isLoggedIn && house.owner && house.owner._id !== currentUserId) {
    try {
      const token = localStorage.getItem('token');
      const checkRes = await fetch(`/api/lease/check/${house._id}`, { headers: { Authorization: 'Bearer ' + token } });
      if (checkRes.ok) {
        const existingNegotiation = await checkRes.json();
        if (existingNegotiation && existingNegotiation.status !== 'signed') {
          const joinBtn = document.createElement('button');
          joinBtn.className = 'save-search-btn';
          joinBtn.style.background = '#8b5cf6';
          joinBtn.style.marginTop = '0.5rem';
          joinBtn.style.width = '100%';
          joinBtn.innerHTML = '<i class="fas fa-handshake"></i> Join Lease Negotiation';
          joinBtn.onclick = () => { window.location.href = `lease-negotiation.html?id=${existingNegotiation._id}`; };
          document.getElementById('modalDetails').appendChild(joinBtn);
        } else {
          const msg = document.createElement('p');
          msg.style.marginTop = '0.5rem';
          msg.style.fontSize = '0.8rem';
          msg.style.color = '#6b7280';
          msg.innerHTML = '<i class="fas fa-info-circle"></i> No active lease negotiation for this property. Ask the landlord to start one.';
          document.getElementById('modalDetails').appendChild(msg);
        }
      }
    } catch (err) { console.error('Failed to check existing negotiation', err); }
  } else {
    const loginMsg = document.createElement('p');
    loginMsg.style.marginTop = '0.5rem';
    loginMsg.style.fontSize = '0.8rem';
    loginMsg.style.color = '#6b7280';
    loginMsg.innerHTML = '<i class="fas fa-lock"></i> <a href="login.html" style="color: #2563eb;">Login</a> to start or join a lease negotiation.';
    document.getElementById('modalDetails').appendChild(loginMsg);
  }

  document.getElementById('propertyModal').style.display = 'block';
  if (house.lat && house.lng) { loadNeighbourhoodInsights(house.lat, house.lng); loadStreetView(house.lat, house.lng); } else { document.getElementById('modalInsights').innerHTML = '<p>No location data available for insights.</p>'; document.getElementById('modalStreetView').innerHTML = '<p>No location data for street view.</p>'; }
  loadPriceInsights(house._id);
  const tabs = document.querySelectorAll('.modal-tab');
  const detailsPanel = document.getElementById('modalDetails');
  const insightsPanel = document.getElementById('modalInsights');
  const streetViewPanel = document.getElementById('modalStreetView');
  const pricingPanel = document.getElementById('modalPricing');
  const virtualTourPanel = document.getElementById('modalVirtualTour');
  tabs.forEach(tab => { tab.addEventListener('click', () => { const target = tab.getAttribute('data-tab'); tabs.forEach(t => t.classList.remove('active')); tab.classList.add('active'); if (target === 'details') { detailsPanel.style.display = 'block'; insightsPanel.style.display = 'none'; streetViewPanel.style.display = 'none'; pricingPanel.style.display = 'none'; virtualTourPanel.style.display = 'none'; } else if (target === 'insights') { detailsPanel.style.display = 'none'; insightsPanel.style.display = 'block'; streetViewPanel.style.display = 'none'; pricingPanel.style.display = 'none'; virtualTourPanel.style.display = 'none'; } else if (target === 'streetview') { detailsPanel.style.display = 'none'; insightsPanel.style.display = 'none'; streetViewPanel.style.display = 'block'; pricingPanel.style.display = 'none'; virtualTourPanel.style.display = 'none'; } else if (target === 'pricing') { detailsPanel.style.display = 'none'; insightsPanel.style.display = 'none'; streetViewPanel.style.display = 'none'; pricingPanel.style.display = 'block'; virtualTourPanel.style.display = 'none'; } else if (target === 'virtualtour') { detailsPanel.style.display = 'none'; insightsPanel.style.display = 'none'; streetViewPanel.style.display = 'none'; pricingPanel.style.display = 'none'; virtualTourPanel.style.display = 'block'; loadVirtualTour(house.virtualTourUrl); } }); });
}
function closePropertyModal() { document.getElementById('propertyModal').style.display = 'none'; }
function toggleFavorite(id) {
  let favs = JSON.parse(localStorage.getItem("favorites") || "[]");
  if (favs.includes(id)) favs = favs.filter(x => x !== id);
  else favs.push(id);
  localStorage.setItem("favorites", JSON.stringify(favs));
  renderHouses(allHouses);
}
function generateLease() { console.log("Lease generation function called – implement if needed"); }

// ========== USER MENU ==========
const userMenu = document.getElementById('userMenu');
const userAvatar = document.getElementById('userAvatar');
const userDropdown = document.getElementById('userDropdown');

function setGuestDropdown() {
  userDropdown.innerHTML = `<div class="dropdown-header"><div class="avatar"><i class="fas fa-user"></i></div><div class="info"><h4>Guest User</h4><p>Sign in for more features</p></div></div><div class="dropdown-item" id="becomeLandlordGuest"><i class="fas fa-building"></i> Become a Landlord</div><div class="dropdown-item" id="becomePremiumGuest"><i class="fas fa-gem"></i> Become a Premium User <span class="premium-badge">MWK 500/mo</span></div><div class="dropdown-item" id="loginGuest"><i class="fas fa-sign-in-alt"></i> Login / Register</div>`;
  document.getElementById('becomeLandlordGuest')?.addEventListener('click', () => window.location.href = 'register.html?role=landlord');
  document.getElementById('becomePremiumGuest')?.addEventListener('click', () => window.location.href = 'register.html?role=premium_user');
  document.getElementById('loginGuest')?.addEventListener('click', () => window.location.href = 'login.html');
}

function setLoggedInDropdown(user) {
  const userName = user.name || 'User';
  const userInitial = userName.charAt(0).toUpperCase();
  const avatarHtml = user.profilePicture ? `<img src="${user.profilePicture}" style="width:100%;height:100%;object-fit:cover;">` : `<span>${userInitial}</span>`;
  userDropdown.innerHTML = `<div class="dropdown-header"><div class="avatar">${avatarHtml}</div><div class="info"><h4>${escapeHtml(userName)}</h4><p>${user.role === 'premium_user' ? 'Premium User' : (user.role === 'premium_landlord' ? 'Premium Landlord' : (user.role === 'admin' ? 'Admin' : 'Free User'))}</p></div></div><div class="dropdown-item" id="profileLink"><i class="fas fa-user-circle"></i> My Profile</div><div class="dropdown-item" id="premiumDashboardLink"><i class="fas fa-crown"></i> Premium Dashboard</div><div class="dropdown-item" id="becomeLandlordLink"><i class="fas fa-building"></i> Become a Landlord</div><div class="dropdown-item" id="upgradePremiumLink"><i class="fas fa-gem"></i> Upgrade to Premium <span class="premium-badge">MWK 500/mo</span></div><div class="dropdown-item" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Logout</div>`;
  document.getElementById('profileLink')?.addEventListener('click', () => window.location.href = 'profile.html');
  document.getElementById('premiumDashboardLink')?.addEventListener('click', () => window.location.href = 'premium-dashboard.html');
  document.getElementById('becomeLandlordLink')?.addEventListener('click', () => window.location.href = 'dashboard.html');
  document.getElementById('upgradePremiumLink')?.addEventListener('click', async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/payment/premium-user', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      const data = await res.json();
      if (data.payment_url) window.location.href = data.payment_url;
      else showToast('Payment initiation failed', 'error');
    } catch (err) { showToast('Error starting upgrade', 'error'); }
  });
  document.getElementById('logoutLink')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.reload();
  });
}

async function loadAndUpdateUserMenu() {
  const token = localStorage.getItem('token');
  if (!token) { setGuestDropdown(); return; }
  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    if (res.ok) {
      const user = await res.json();
      setLoggedInDropdown(user);
      if (user.profilePicture) userAvatar.innerHTML = `<img src="${user.profilePicture}">`;
      else userAvatar.innerHTML = `<span>${user.name?.charAt(0).toUpperCase() || 'U'}</span>`;
      const isPremiumLandlord = user.verificationType === 'premium' || user.role === 'premium_landlord';
      if (isPremiumLandlord && userAvatar && !userAvatar.parentElement?.classList.contains('avatar-container')) {
        const parent = userAvatar.parentNode;
        const container = document.createElement('div');
        container.className = 'avatar-container';
        parent.insertBefore(container, userAvatar);
        container.appendChild(userAvatar);
        const crown = document.createElement('div');
        crown.className = 'premium-crown';
        crown.innerHTML = '<i class="fas fa-crown"></i>';
        container.appendChild(crown);
      }
    } else {
      localStorage.removeItem('token');
      setGuestDropdown();
      userAvatar.innerHTML = '<i class="fas fa-user-circle"></i>';
    }
  } catch (err) { console.error('User fetch error', err); }
}
userAvatar.addEventListener('click', (e) => { e.stopPropagation(); userMenu.classList.toggle('active'); });
document.addEventListener('click', (e) => { if (!userMenu.contains(e.target)) userMenu.classList.remove('active'); });

// ========== AMENITY TOGGLES (for map layers) ==========
function initAmenityToggles() {
  const buttons = document.querySelectorAll('.amenity-toggle-btn');
  buttons.forEach(btn => {
    const layerKey = btn.dataset.layer;
    const layer = amenityLayers[layerKey];
    if (!layer) return;
    // Initially hide all amenity layers (clean map)
    map.removeLayer(layer);
    btn.classList.remove('active');
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) {
        map.removeLayer(layer);
        btn.classList.remove('active');
      } else {
        map.addLayer(layer);
        btn.classList.add('active');
      }
    });
  });
}

// ========== LOAD AMENITY LAYERS (populate healthPoints, etc.) ==========
async function loadAmenityLayers() {
  const layers = [
    { url: '/data/malawi_health_facilities.geojson', name: 'Health Facilities', icon: 'fas fa-hospital', color: '#ef4444', store: healthPoints, key: 'hospitals' },
    { url: '/data/malawi_schools.geojson', name: 'Schools', icon: 'fas fa-school', color: '#3b82f6', store: schoolPoints, key: 'schools' },
    { url: '/data/malawi_markets.geojson', name: 'Markets', icon: 'fas fa-store', color: '#f59e0b', store: marketPoints, key: 'markets' },
    { url: '/data/malawi_banks.geojson', name: 'Banks', icon: 'fas fa-university', color: '#8b5cf6', store: null, key: 'banks' },
    { url: '/data/malawi_police.geojson', name: 'Police', icon: 'fas fa-shield-alt', color: '#1e293b', store: null, key: 'police' },
    { url: '/data/malawi_fuel.geojson', name: 'Fuel Stations', icon: 'fas fa-gas-pump', color: '#10b981', store: null, key: 'fuel' },
    { url: '/data/malawi_restaurants.geojson', name: 'Restaurants', icon: 'fas fa-utensils', color: '#ec4899', store: null, key: 'restaurants' },
    { url: '/data/malawi_hotels.geojson', name: 'Hotels', icon: 'fas fa-bed', color: '#6b7280', store: null, key: 'hotels' },
    { url: '/data/malawi_transport.geojson', name: 'Transport', icon: 'fas fa-bus', color: '#f97316', store: null, key: 'transport' },
    { url: '/data/malawi_worship.geojson', name: 'Worship', icon: 'fas fa-church', color: '#a855f7', store: null, key: 'worship' },
    { url: '/data/malawi_districts.geojson', name: 'Districts', isDistrict: true, key: 'districts' }
  ];
  for (const l of layers) {
    try {
      const res = await fetch(l.url);
      if (!res.ok) continue;
      const data = await res.json();
      if (l.isDistrict) {
        const districtLayer = L.geoJSON(data, { style: { color: '#3b82f6', weight: 1.8, fillOpacity: 0.2 }, onEachFeature: (f, layer) => layer.bindPopup(f.properties.name) }).addTo(map);
        amenityLayers[l.key] = districtLayer;
      } else {
        const layer = L.geoJSON(data, { pointToLayer: (feat, latlng) => L.marker(latlng, { icon: L.divIcon({ html: `<i class="${l.icon}" style="color:${l.color}; font-size:20px;"></i>`, iconSize: [24,24] }) }) });
        layer.addTo(map);
        amenityLayers[l.key] = layer;
        if (l.store && data.features) {
          data.features.forEach(f => {
            if (f.geometry?.coordinates) {
              l.store.push({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], name: f.properties.name || 'Amenity' });
            }
          });
        }
      }
    } catch(e) { console.warn(`Skipped ${l.url}`); }
  }
  console.log(`Loaded ${healthPoints.length} health facilities, ${schoolPoints.length} schools, ${marketPoints.length} markets`);
  // After loading, initialise toggles if the HTML contains the amenity toggle panel
  initAmenityToggles();
}

// ========== HEATMAP & WALKABILITY ==========
let heatmapLayerGlobal = null;
let heatmapActive = false;
let walkabilityLayer = null;

function initHeatmap() {
  if (typeof L.heatLayer === 'undefined') {
    console.warn("Leaflet.heat plugin not loaded – heatmap disabled");
    return;
  }
  if (allHouses && allHouses.length > 0) {
    const heatPoints = allHouses.filter(h => h.lat && h.lng).map(h => [h.lat, h.lng, 1]);
    if (heatmapLayerGlobal) map.removeLayer(heatmapLayerGlobal);
    heatmapLayerGlobal = L.heatLayer(heatPoints, { radius: 25, blur: 15, maxZoom: 12 });
  } else {
    const demoPoints = [];
    for (let i = 0; i < 200; i++) {
      demoPoints.push([-15.786 + (Math.random() - 0.5) * 0.5, 35.005 + (Math.random() - 0.5) * 0.5, Math.random()]);
    }
    heatmapLayerGlobal = L.heatLayer(demoPoints, { radius: 25, blur: 15 });
  }
}

// ========== EVENT LISTENERS & INITIALIZATION ==========
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    currentType = this.dataset.type;
    currentPage = 1;
    loadHouses(currentPage, currentType, currentFilters, currentSort);
  });
});
const filterBtn = document.getElementById("applyFiltersBtn"); if (filterBtn) filterBtn.onclick = applyFilters;
const searchInput = document.getElementById("searchInput"); if (searchInput) { searchInput.addEventListener("keyup", () => { const term = searchInput.value.toLowerCase(); const filtered = allHouses.filter(h => (h.name.toLowerCase().includes(term) || (h.location && h.location.toLowerCase().includes(term))) && filterByRegion(h)); renderHouses(filtered); renderMarkers(filtered); }); }
const nearBtn = document.getElementById("nearMeBtn"); if (nearBtn) { nearBtn.onclick = () => { if (!navigator.geolocation) { showToast("GPS not supported", 'error'); return; } navigator.geolocation.getCurrentPosition(pos => { userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; map.setView([userLocation.lat, userLocation.lng], 14); L.marker([userLocation.lat, userLocation.lng]).addTo(map).bindPopup("<i class='fas fa-map-pin'></i> You are here").openPopup(); const nearby = allHouses.filter(h => { if (!h.lat || !h.lng) return false; const dist = getDistance(userLocation.lat, userLocation.lng, h.lat, h.lng); return dist <= radius; }); renderHouses(nearby); renderMarkers(nearby); }); }; }
const gpsBtn = document.getElementById("getLocationBtn"); if (gpsBtn) { gpsBtn.addEventListener("click", () => { const status = document.getElementById("gpsStatus"); if (navigator.geolocation) { status.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Getting location..."; navigator.geolocation.getCurrentPosition(pos => { document.getElementById("latitude").value = pos.coords.latitude; document.getElementById("longitude").value = pos.coords.longitude; status.innerHTML = `<i class="fas fa-check-circle"></i> Captured! Lat: ${pos.coords.latitude}, Lng: ${pos.coords.longitude}`; }, () => { status.innerHTML = "<i class='fas fa-exclamation-triangle'></i> Allow location access"; }, { enableHighAccuracy: true }); } else { status.innerHTML = "GPS not supported"; } }); }
const regionSelect = document.getElementById('regionFilter'); if (regionSelect) regionSelect.addEventListener('change', () => { currentRegion = regionSelect.value; applyRegionFilter(); });
const compareFloatingBtn = document.getElementById('compareFloatingBtn'); if (compareFloatingBtn) compareFloatingBtn.addEventListener('click', openComparisonModal);

// Dream Match listeners
const dreamLink = document.getElementById('dreamMatchLink');
if (dreamLink) dreamLink.addEventListener('click', (e) => { e.preventDefault(); openDreamMatchModal(); });
const dreamForm = document.getElementById('dreamMatchForm');
if (dreamForm) dreamForm.addEventListener('submit', submitDreamMatch);
const dreamCloseBtn = document.querySelector('#dreamMatchModal .close-btn');
if (dreamCloseBtn) dreamCloseBtn.addEventListener('click', closeDreamMatchModal);
window.closeDreamMatchModal = closeDreamMatchModal;

// Nearby amenity buttons (now call the detailed version)
document.getElementById('nearbyHospitalsBtn')?.addEventListener('click', () => filterPropertiesNearAmenity(healthPoints, 'hospitals/clinics'));
document.getElementById('nearbySchoolsBtn')?.addEventListener('click', () => filterPropertiesNearAmenity(schoolPoints, 'schools'));
document.getElementById('nearbyMarketsBtn')?.addEventListener('click', () => filterPropertiesNearAmenity(marketPoints, 'markets'));

// Heatmap button
const heatmapBtn = document.getElementById('toggleHeatmapBtn');
if (heatmapBtn && typeof L.heatLayer !== 'undefined') {
  heatmapBtn.addEventListener('click', () => {
    if (!heatmapLayerGlobal) initHeatmap();
    heatmapActive = !heatmapActive;
    if (heatmapActive) {
      if (heatmapLayerGlobal) map.addLayer(heatmapLayerGlobal);
      heatmapBtn.classList.add('heatmap-active');
      heatmapBtn.innerHTML = '<i class="fas fa-fire"></i> Hide Heatmap';
    } else {
      if (heatmapLayerGlobal) map.removeLayer(heatmapLayerGlobal);
      heatmapBtn.classList.remove('heatmap-active');
      heatmapBtn.innerHTML = '<i class="fas fa-fire"></i> Property Heatmap';
    }
  });
}

// Walkability button
const walkBtn = document.getElementById('walkabilityBtn');
if (walkBtn) {
  walkBtn.addEventListener('click', () => {
    if (walkabilityLayer) {
      map.removeLayer(walkabilityLayer);
      walkabilityLayer = null;
      walkBtn.style.background = '';
    } else {
      walkabilityLayer = L.polygon([[-15.8,34.98],[-15.75,34.98],[-15.75,35.02],[-15.8,35.02]], { color: 'green', fillOpacity: 0.3, weight: 2 }).addTo(map);
      walkabilityLayer.bindPopup('Walkability zone: High (simulated)');
      walkBtn.style.background = '#10b981';
    }
  });
}

// Sync district dropdown
function syncDistrictFilter() {
  const districtSelect = document.getElementById('districtFilterSelect');
  if (districtSelect) districtSelect.value = currentDistrict || '';
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
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
    document.querySelectorAll('.tab-btn').forEach(btn => { if (btn.dataset.type === currentType) btn.classList.add('active'); else btn.classList.remove('active'); });
  }
  if (urlParams.has('sort')) currentSort = urlParams.get('sort');
  if (sortSelect && currentSort !== 'default') sortSelect.value = currentSort;
  if (urlParams.has('district')) { currentDistrict = urlParams.get('district'); syncDistrictFilter(); }
  loadHouses(currentPage, currentType, currentFilters, currentSort);
  loadHeroCarousel();
  loadAndUpdateUserMenu();
  loadAmenityLayers(); // This populates healthPoints, schoolPoints, marketPoints and sets up toggles
  initHeatmap();
});

// Expose global functions
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
window.showLandlordProfile = showLandlordProfile;
window.closeLandlordModal = closeLandlordModal;
window.generateLease = generateLease;
window.openLightbox = (images, startIndex) => {
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  img.src = images[startIndex];
  modal.style.display = 'flex';
};
window.closeLightbox = () => document.getElementById('lightboxModal').style.display = 'none';

// ======================================================
// ========== NEW FEATURE: MARKET PULSE & SMART PRICE SCOUT ==========
// ======================================================
// This block adds the global market pulse widget and smart badges to property cards.
// It does not modify any existing function – it only adds new ones and extends renderHouses.

let priceTrendChart = null;

// Helper: compute district average price map
function getDistrictAvgPriceMap() {
  const districtMap = {};
  allHouses.forEach(house => {
    if (!house.location) return;
    // Try to match district from location (simple heuristic: first word or known district)
    let district = 'Unknown';
    for (const d of Object.keys(regionMap)) {
      if (house.location.toLowerCase().includes(d.toLowerCase())) {
        district = d;
        break;
      }
    }
    if (!districtMap[district]) districtMap[district] = { sum: 0, count: 0 };
    districtMap[district].sum += house.price;
    districtMap[district].count++;
  });
  const avgMap = {};
  for (const d in districtMap) {
    avgMap[d] = districtMap[d].sum / districtMap[d].count;
  }
  return avgMap;
}

// Add demand badge and price comparison to a card
function addSmartBadges(card, house, avgPriceMap) {
  // Demand badge
  const views = house.views || 0;
  const favCount = JSON.parse(localStorage.getItem("favorites") || "[]").includes(house._id) ? 1 : 0;
  const demandScore = (views * 0.6) + (favCount * 40);
  let demandClass = '', demandText = '';
  if (demandScore > 80) { demandClass = 'demand-high'; demandText = '🔥 High demand'; }
  else if (demandScore > 40) { demandClass = 'demand-trend'; demandText = '📈 Trending'; }
  else { demandClass = 'demand-new'; demandText = '🟢 New / quiet'; }
  const badgeDiv = document.createElement('div');
  badgeDiv.className = `demand-badge ${demandClass}`;
  badgeDiv.innerHTML = `<i class="fas fa-chart-line"></i> ${demandText}`;
  const priceP = card.querySelector('.price');
  if (priceP && priceP.parentNode) {
    priceP.parentNode.insertBefore(badgeDiv, priceP.nextSibling);
  }

  // Price comparison
  let district = 'Unknown';
  for (const d of Object.keys(regionMap)) {
    if (house.location && house.location.toLowerCase().includes(d.toLowerCase())) {
      district = d;
      break;
    }
  }
  const avgPrice = avgPriceMap[district];
  if (avgPrice && avgPrice > 0) {
    const diffPercent = ((house.price - avgPrice) / avgPrice * 100).toFixed(0);
    const diffClass = diffPercent < 0 ? 'price-below' : 'price-above';
    const diffSymbol = diffPercent < 0 ? '↓' : '↑';
    const compHtml = `<div class="price-compare ${diffClass}"><i class="fas fa-chart-simple"></i> ${Math.abs(diffPercent)}% ${diffSymbol} vs district avg</div>`;
    const priceContainer = card.querySelector('.price');
    if (priceContainer && priceContainer.parentNode) {
      priceContainer.parentNode.insertAdjacentHTML('beforeend', compHtml);
    }
  }
}

// Update Market Pulse widget
async function updateMarketPulse() {
  const totalListingsEl = document.getElementById('totalListings');
  const avgPriceEl = document.getElementById('avgPrice');
  const hotListingsEl = document.getElementById('hotListings');
  const hotDistrictsMarquee = document.getElementById('hotDistrictsMarquee');
  const weeklySummarySpan = document.querySelector('#weeklySummary span');

  if (!totalListingsEl) return;

  // Compute stats
  const total = allHouses.length;
  const avgPrice = total > 0 ? allHouses.reduce((s, h) => s + h.price, 0) / total : 0;
  // Hot properties: demandScore > 80
  const favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
  const hotCount = allHouses.filter(h => {
    const views = h.views || 0;
    const fav = favorites.includes(h._id) ? 1 : 0;
    return (views * 0.6 + fav * 40) > 80;
  }).length;

  // Animate numbers
  animateNumber(totalListingsEl, total);
  animateNumber(avgPriceEl, Math.round(avgPrice));
  animateNumber(hotListingsEl, hotCount);

  // Hot districts: count views per district
  const districtViews = {};
  allHouses.forEach(h => {
    let district = 'Unknown';
    for (const d of Object.keys(regionMap)) {
      if (h.location && h.location.toLowerCase().includes(d.toLowerCase())) {
        district = d;
        break;
      }
    }
    districtViews[district] = (districtViews[district] || 0) + (h.views || 0);
  });
  const topDistricts = Object.entries(districtViews).sort((a,b) => b[1] - a[1]).slice(0, 5);
  if (topDistricts.length) {
    hotDistrictsMarquee.innerHTML = topDistricts.map(([d, views]) => `<span><i class="fas fa-fire"></i> ${d} – ${views} views this week</span>`).join('');
  } else {
    hotDistrictsMarquee.innerHTML = '<span><i class="fas fa-chart-line"></i> No data yet</span>';
  }

  // Weekly summary (simulated)
  const summaries = [
    "Prices in Lilongwe dropped 2% this week – great time to rent!",
    "Blantyre sees 15% more listings – more choices for you.",
    "Mzuzu market is stable – landlords are open to negotiation.",
    "Demand for furnished apartments increased by 30%.",
    "Student housing near UNIMA is trending – act fast!"
  ];
  weeklySummarySpan.textContent = summaries[Math.floor(Math.random() * summaries.length)];

  // Update trend chart (simulated 7-day price trend)
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Generate random but plausible trend based on region filter
  let trendData = [avgPrice];
  for (let i = 1; i < 7; i++) {
    const prev = trendData[i-1];
    const change = (Math.random() - 0.5) * 0.03 * prev;
    trendData.push(Math.max(prev + change, prev * 0.9));
  }
  if (priceTrendChart) priceTrendChart.destroy();
  const ctx = document.getElementById('priceTrendChart').getContext('2d');
  priceTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Avg Price (MWK)',
        data: trendData,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `MWK ${Math.round(ctx.raw).toLocaleString()}` } } },
      scales: { y: { ticks: { callback: (val) => (val/1000).toFixed(0)+'k' } } }
    }
  });
}

function animateNumber(element, target) {
  if (!element) return;
  const start = parseInt(element.innerText) || 0;
  if (start === target) return;
  anime({
    targets: { val: start },
    val: target,
    round: 1,
    duration: 800,
    easing: 'easeOutQuad',
    update: function(a) { element.innerText = a.animations[0].currentValue.toLocaleString(); }
  });
}

// Extend renderHouses to include smart badges (original renderHouses remains untouched)
// We will wrap the original renderHouses with a new function that adds badges after rendering.
const originalRenderHouses = renderHouses;
window.renderHouses = function(houses) {
  originalRenderHouses(houses);
  // After standard render, add badges
  const avgMap = getDistrictAvgPriceMap();
  document.querySelectorAll('.house-card').forEach((card, idx) => {
    const house = houses[idx];
    if (house) addSmartBadges(card, house, avgMap);
  });
  updateMarketPulse(); // refresh widget when houses change
};

// Also trigger updateMarketPulse when region filter changes
const originalRegionListener = regionSelect?.onchange;
if (regionSelect) {
  regionSelect.addEventListener('change', () => {
    setTimeout(updateMarketPulse, 500);
  });
}

// Initial widget update after first load
setTimeout(() => {
  if (allHouses.length) updateMarketPulse();
}, 1000);