const CACHE_NAME = 'rental-marketplace-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/dashboard.html',
  '/admin.html',
  '/chat.html',
  '/profile.html',
  '/css/style.css',
  '/js/i18n.js',
  '/js/theme.js',
  '/js/script.js',
  '/js/dashboard.js',
  '/js/admin.js',
  '/js/chat.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  // Don't cache API calls or external assets
  if (event.request.url.includes('/api/') ||
      event.request.url.includes('cloudinary') ||
      event.request.url.includes('googleapis')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
});