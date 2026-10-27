const CACHE_NAME = 'muzlo-audio-v1';
const AUDIO_CACHE_NAME = 'muzlo-tracks-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Кэшируем только аудио-стрим
  if (url.pathname === '/api/search/stream') {
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        
        if (cachedResponse) {
          // Нашли в кэше — отдаем мгновенно
          return cachedResponse;
        }

        // Нет в кэше — качаем
        try {
          const networkResponse = await fetch(event.request);
          
          // Кэшируем только успешные ответы (200 OK, а не 206 Partial)
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            cache.put(event.request, responseClone);
          }
          
          return networkResponse;
        } catch (e) {
          return new Response('Offline', { status: 503 });
        }
      })
    );
  }
});