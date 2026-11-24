
var CACHE_STATIC_NAME = 'static-v32';
var CACHE_DYNAMIC_NAME = 'dynamic-v32';

var STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/js/app.js',
  '/src/js/feed.js',
  '/src/js/material.min.js',
  '/src/js/idb.js',
  '/src/js/utility.js',
  '/src/js/supabase.js',
  '/src/css/app.css',
  '/src/css/feed.css',
  '/src/images/main-image.jpg',
  '/src/images/san_francisco.jpg',
  '/offline.html',
  'https://fonts.googleapis.com/css?family=Roboto:400,700',
  'https://fonts.googleapis.com/icon?family=Material+Icons',
  'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// INSTALACIÓN
self.addEventListener('install', function(event) {
  console.log('[SW] Instalando Service Worker v32...');

  event.waitUntil(
    caches.open(CACHE_STATIC_NAME)
      .then(function(cache) {
        return cache.addAll(STATIC_FILES);
      })
      .then(function() {
        console.log('[SW] Archivos estáticos almacenados en caché.');
        return self.skipWaiting();
      })
  );
});

// ACTIVACIÓN
self.addEventListener('activate', function(event) {
  console.log('[SW] Activando Service Worker v15...');

  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(
          cacheNames.map(function(cacheName) {
            if (
              cacheName !== CACHE_STATIC_NAME &&
              cacheName !== CACHE_DYNAMIC_NAME
            ) {
              console.log('[SW] Eliminando caché antigua:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(function() {
        return self.clients.claim();
      })
  );
});

// PETICIONES GET
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') {
    return;
  }

  var requestUrl = new URL(event.request.url);

  // No interceptar peticiones a Supabase.
  if (requestUrl.hostname.indexOf('supabase.co') !== -1) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) {
          return response;
        }

        return fetch(event.request)
          .then(function(networkResponse) {
            if (
              !networkResponse ||
              networkResponse.status !== 200
            ) {
              return networkResponse;
            }

            return caches.open(CACHE_DYNAMIC_NAME)
              .then(function(cache) {
                cache.put(event.request, networkResponse.clone());
                return networkResponse;
              });
          });
      })
      .catch(function() {
        if (event.request.headers.get('accept') &&
            event.request.headers.get('accept').includes('text/html')) {
          return caches.match('/offline.html');
        }
      })
  );
});

console.log('[SW] Service Worker activo. Supabase + IndexedDB para modo offline.');
