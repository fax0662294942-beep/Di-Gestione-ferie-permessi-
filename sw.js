const CACHE_NAME = 'ferie-permessi-v20';

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll([
                    './',
                    'index.html',
                    'manifest.json',
                    'styles.css',
                    'app.js',
                    'firebase-config.js',
                    'icons/icon-72x72.png',
                    'icons/icon-96x96.png',
                    'icons/icon-128x128.png',
                    'icons/icon-144x144.png',
                    'icons/icon-152x152.png',
                    'icons/icon-192x192.png',
                    'icons/icon-384x384.png',
                    'icons/icon-512x512.png'
                ]);
            })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) return response;
                return fetch(event.request);
            })
    );
});
