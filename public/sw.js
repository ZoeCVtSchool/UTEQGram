
var CACHE_STATIC_NAME = 'static-v33';
var CACHE_DYNAMIC_NAME = 'dynamic-v33';

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
  '/src/images/main-image-lg.jpg',
  '/src/images/main-image-sm.jpg',
  '/src/images/san_francisco.jpg',
  '/offline.html',
  'https://fonts.googleapis.com/css?family=Roboto:400,700',
  'https://fonts.googleapis.com/icon?family=Material+Icons',
  'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// INSTALACIÓN
self.addEventListener('install', function(event) {
  console.log('[SW] Instalando Service Worker v33...');

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
  console.log('[SW] Activando Service Worker v33...');

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

function isAppShellRequest(requestUrl) {
  if (requestUrl.origin !== self.location.origin) {
    return false;
  }

  return (
    requestUrl.pathname === '/' ||
    requestUrl.pathname.endsWith('.html') ||
    requestUrl.pathname.endsWith('.js') ||
    requestUrl.pathname.endsWith('.css') ||
    requestUrl.pathname === '/manifest.json'
  );
}

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

  // Network-First para archivos de la app para evitar código obsoleto en caché.
  if (isAppShellRequest(requestUrl)) {
    event.respondWith(
      fetch(event.request)
        .then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            var responseClone = networkResponse.clone();
            caches.open(CACHE_STATIC_NAME).then(function(cache) {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(function() {
          return caches.match(event.request).then(function(cachedResponse) {
            if (cachedResponse) {
              return cachedResponse;
            }
            if (event.request.headers.get('accept') &&
                event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/offline.html');
            }
          });
        })
    );
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

            var contentLength = networkResponse.headers.get('content-length');
            if (!contentLength || Number(contentLength) <= 5 * 1024 * 1024) {
              var responseClone = networkResponse.clone();
              caches.open(CACHE_DYNAMIC_NAME)
                .then(function(cache) {
                  cache.put(event.request, responseClone);
                });
            }

            return networkResponse;
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
