const AUDIO_CACHE_NAME = 'muzlo-tracks-v1';
const MAX_CACHE_SIZE = 50; // Максимум 50 треков в кэше

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname === '/api/search/stream') {
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) return cachedResponse;

        try {
          const networkResponse = await fetch(event.request);
          
          // Кэшируем только полные ответы
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            cache.put(event.request, responseClone);
            
            // Асинхронная очистка старых записей
            cleanOldCache(cache);
          }
          
          return networkResponse;
        } catch (e) {
          return new Response('Offline', { status: 503 });
        }
      })
    );
  }
});

async function cleanOldCache(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length > MAX_CACHE_SIZE) {
      // Удаляем самые старые (первым пришел — первым ушел)
      const toDelete = keys.length - MAX_CACHE_SIZE;
      for (let i = 0; i < toDelete; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch (e) {}
}