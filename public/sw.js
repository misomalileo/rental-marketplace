const CACHE_NAME = "rental-marketplace-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/login.html",
  "/register.html",
  "/dashboard.html",
  "/admin.html",
  "/chat.html",
  "/profile.html",
  "/css/style.css",
  "/js/i18n.js",
  "/js/theme.js",
  "/js/script.js",
  "/js/dashboard.js",
  "/js/admin.js",
  "/js/chat.js",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png"
];

// Install: cache our static assets
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("Caching app shell");
      return cache.addAll(urlsToCache);
    })
  );
});

// Fetch: serve from cache for our own files, otherwise network (never cache external)
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // If it's a request to our own origin (local files)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request);
      })
    );
  } else {
    // For any external request (tiles, APIs, etc.), bypass cache and go directly to network
    event.respondWith(fetch(event.request));
  }
});

// Activate: clean up old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});