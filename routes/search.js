import { Router } from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const scdl = require('soundcloud-downloader').default;

const router = Router();

async function searchSoundCloud(query) {
  const searchResult = await scdl.search({
    query: query,
    resourceType: 'tracks',
    limit: 50
  });

  return searchResult.collection
    .filter(track => track.duration < 900000) // Отсеиваем сборники > 15 мин
    .map(track => {
      let cover = track.artwork_url || (track.user && track.user.avatar_url);
      if (cover) cover = cover.replace('large', 't500x500');

      return {
        id: track.id,
        title: track.title,
        artist_name: track.user ? track.user.username : 'Неизвестен',
        cover_url: cover,
        duration: Math.round(track.duration / 1000),
        // Передаем публичную ссылку через параметр url
        stream_url: `/api/search/stream?url=${encodeURIComponent(track.permalink_url)}`, 
        is_external: false 
      };
    });
}

router.get('/trending', async (req, res) => {
  try {
    const tracks = await searchSoundCloud('popular music');
    res.json({ tracks });
  } catch (err) {
    console.error('Ошибка рекомендаций:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

router.get('/', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ tracks: [] });
  
  try {
    const tracks = await searchSoundCloud(query);
    res.json({ tracks });
  } catch (err) {
    console.error('Ошибка поиска:', err.message);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// 3. Стриминг через прямой поток
router.get('/stream', async (req, res) => {
  try {
    const trackUrl = req.query.url;
    if (!trackUrl) throw new Error('Ссылка на трек не передана');

    // Используем download, который сам находит и возвращает поток
    const stream = await scdl.download(trackUrl);
    
    // Устанавливаем заголовки для аудио
    res.setHeader('Content-Type', 'audio/mpeg');
    
    // Направляем поток прямо в браузер
    stream.pipe(res);
  } catch (err) {
    console.error('Ошибка стриминга:', err.message);
    if (!res.headersSent) res.status(500).send('Ошибка стриминга');
  }
});

export default router;