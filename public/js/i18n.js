// Translations
const translations = {
  en: {
    // Navbar
    home: "Home",
    exploreMap: "Explore Map",
    landlordLogin: "Landlord Login",
    logout: "Logout",
    // Hero
    heroTitle: "Find Houses & Hostels in Blantyre",
    heroSubtitle: "Explore verified rentals posted by landlords",
    // Filters
    minPrice: "Min Price",
    maxPrice: "Max Price",
    anyBedrooms: "Any Bedrooms",
    anyType: "Any Type",
    nearMe: "📍 Near Me",
    applyFilters: "Apply Filters",
    searchPlaceholder: "Search by area or name...",
    // House grid
    availableProperties: "Available Properties",
    loading: "Loading houses...",
    failedToLoad: "Failed to load houses.",
    // House card
    bedrooms: "Bedrooms",
    vacancies: "Vacancies",
    perRoom: "/ room",
    perMonth: "/ month",
    condition: "Condition",
    whatsapp: "WhatsApp Landlord",
    favorite: "Favorite",
    report: "Report",
    rating: "Rating",
    // Map
    mapView: "📍 Map View",
    // GPS
    gpsLocator: "📍 Property GPS Locator",
    captureLocation: "Capture My Property Location",
    gpsCaptured: "✅ Captured! Lat: {lat}, Lng: {lng}",
    gpsWaiting: "Getting location...",
    gpsError: "⚠️ Allow location access",
    gpsNotSupported: "GPS not supported",
    // Dashboard
    welcome: "Welcome, Landlord",
    totalHouses: "Total Houses",
    totalViews: "Total Views",
    avgRating: "Avg Rating",
    accountVerification: "Account Verification",
    uploadNewHouse: "📤 Upload New House",
    myHouses: "📋 My Houses",
    edit: "Edit",
    delete: "Delete",
    feature: "Feature",
    featured: "Featured",
    // Admin
    dashboardOverview: "Dashboard Overview",
    totalLandlords: "Total Landlords",
    totalHouses: "Total Houses",
    pendingVerifications: "Pending Verifications",
    landlordManagement: "🧑‍💼 Landlord Management",
    allHouses: "🏠 All Houses",
    userReports: "🚩 User Reports",
    actions: "Actions",
    verify: "Verify",
    ban: "Ban",
    // Footer
    terms: "Terms",
    privacy: "Privacy",
    faq: "FAQ",
    contact: "Contact",
    copyright: "© 2026 Rental Marketplace Malawi",
    // Language switcher
    language: "Language",
    // Theme
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    aquatic: "Aquatic",
  },
  ny: { // Chichewa
    home: "Nyumba",
    exploreMap: "Onani Mapu",
    landlordLogin: "Lowani ngati Mwini Nyumba",
    logout: "Tulukani",
    heroTitle: "Pezani Nyumba ndi Ma Hostel ku Blantyre",
    heroSubtitle: "Onani malo otsimikizika olembedwa ndi eni nyumba",
    minPrice: "Mtengo Wochepera",
    maxPrice: "Mtengo Wokwera",
    anyBedrooms: "Zipinda Zilizonse",
    anyType: "Mtundu Uliwonse",
    nearMe: "📍 Pafupi nane",
    applyFilters: "Gwiritsani Zosefera",
    searchPlaceholder: "Fufuzani m'dera kapena dzina...",
    availableProperties: "Malo Opezeka",
    loading: "Kutsegula nyumba...",
    failedToLoad: "Kulephera kutsegula nyumba.",
    bedrooms: "Zipinda",
    vacancies: "Mipata",
    perRoom: "/ chipinda",
    perMonth: "/ mwezi",
    condition: "Mkhalidwe",
    whatsapp: "Lumikizanani ndi Mwini",
    favorite: "Konda",
    report: "Lipoti",
    rating: "Mavoti",
    mapView: "📍 Mapu",
    gpsLocator: "📍 Chozindikira Malo",
    captureLocation: "Tengani Malo Anga",
    gpsCaptured: "✅ Zatengedwa! Lat: {lat}, Lng: {lng}",
    gpsWaiting: "Kutenga malo...",
    gpsError: "⚠️ Lolani kuti malo apezeke",
    gpsNotSupported: "GPS sigwiritsidwa ntchito",
    welcome: "Takulandirani, Mwini Nyumba",
    totalHouses: "Nyumba Zonse",
    totalViews: "Kuwonedwa konse",
    avgRating: "Mavoti Apakati",
    accountVerification: "Kutsimikizira Akaunti",
    uploadNewHouse: "📤 Kwezani Nyumba Yatsopano",
    myHouses: "📋 Nyumba Zanga",
    edit: "Kusintha",
    delete: "Kuchotsa",
    feature: "Khalani Wodziwika",
    featured: "Wodziwika",
    dashboardOverview: "Chiwonetsero Chachikulu",
    totalLandlords: "Eni Nyumba Onse",
    totalHouses: "Nyumba Zonse",
    pendingVerifications: "Zotsimikizira Zoyembekeza",
    landlordManagement: "🧑‍💼 Kuwongolera Eni Nyumba",
    allHouses: "🏠 Nyumba Zonse",
    userReports: "🚩 Malipoti a Ogwiritsa",
    actions: "Zochita",
    verify: "Tsimikizani",
    ban: "Letsani",
    terms: "Malamulo",
    privacy: "Zachinsinsi",
    faq: "Mafunso",
    contact: "Kulumikizana",
    copyright: "© 2026 Rental Marketplace Malawi",
    language: "Chilankhulo",
    theme: "Mawonekedwe",
    light: "Kuwala",
    dark: "Mdima",
    aquatic: "M'madzi",
  }
};

let currentLanguage = localStorage.getItem('language') || 'en';

// Expose t globally
window.t = function(key, params = {}) {
  let text = translations[currentLanguage][key] || translations['en'][key] || key;
  for (let param in params) {
    text = text.replace(`{${param}}`, params[param]);
  }
  return text;
};

function setLanguage(lang) {
  if (translations[lang]) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = window.t(key);
    });
    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = window.t(key);
    });
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setLanguage(currentLanguage);
});