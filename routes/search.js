import { Router } from 'express';
import axios from 'axios';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const scdl = require('soundcloud-downloader').default;

const router = Router();

// ЗАПРОСЫ ДЛЯ ПОПУЛЯРНЫХ РЕПЕРОВ И ХИП-ХОПА
const TRENDING_QUERIES = [
  'Travis Scott', 'Drake', 'Kendrick Lamar', 'J. Cole', 
  '21 Savage', 'Future', 'Playboi Carti', 'Metro Boomin', 
  'Lil Baby', 'Pop Smoke', 'Eminem', 'Kanye West', 
  'A$AP Rocky', 'Lil Uzi Vert', 'Don Toliver', 'Gunna', 
  'rap hits', 'hip hop hits', 'trap music', 'drill music'
];

async function searchSoundCloud(query, offset = 0) {
  const searchResult = await scdl.search({
    query: query,
    resourceType: 'tracks',
    limit: 50,
    offset: offset
  });

  return searchResult.collection
    // Отсеиваем длинные сборники и миксы (оставляем только треки до 10 минут)
    .filter(track => track.duration < 600000)
    .map(track => {
      let cover = track.artwork_url || (track.user && track.user.avatar_url);
      if (cover) cover = cover.replace('large', 't500x500');

      const proxyCover = cover ? `/api/search/cover?url=${encodeURIComponent(cover)}` : null;

      return {
        id: track.id,
        title: track.title,
        artist_name: track.user ? track.user.username : 'Неизвестен',
        cover_url: proxyCover,
        duration: Math.round(track.duration / 1000),
        permalink_url: track.permalink_url,
        stream_url: `/api/search/stream?url=${encodeURIComponent(track.permalink_url)}`, 
        is_external: false 
      };
    });
}

// 1. Рекомендации (Случайный рэпер при каждом F5)
router.get('/trending', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); 
  try {
    const randomQuery = TRENDING_QUERIES[Math.floor(Math.random() * TRENDING_QUERIES.length)];
    // Берем случайный отступ от 0 до 40, чтобы треки не повторялись
    const randomOffset = Math.floor(Math.random() * 4) * 10; 
    const tracks = await searchSoundCloud(randomQuery, randomOffset);
    res.json({ tracks });
  } catch (err) {
    console.error('Ошибка рекомендаций:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 2. Поиск
router.get('/', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ tracks: [] });
  try {
    const tracks = await searchSoundCloud(query);
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// 3. Получение точной длительности
router.get('/info', async (req, res) => {
  try {
    const trackUrl = req.query.url;
    if (!trackUrl) return res.status(400).json({ error: 'URL не передан' });
    const info = await scdl.getInfo(trackUrl);
    res.json({ duration: Math.round(info.duration / 1000) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Артист
router.get('/artist', async (req, res) => {
  const artistName = req.query.name;
  if (!artistName) return res.status(400).json({ error: 'Имя не передано' });
  try {
    const tracks = await searchSoundCloud(artistName);
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 5. Прокси для картинок
router.get('/cover', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('Нет URL');
    const response = await axios.get(imageUrl, { responseType: 'stream' });
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    response.data.pipe(res);
  } catch (err) {
    res.redirect('/img/default-cover.png');
  }
});

// 6. Стриминг
router.get('/stream', async (req, res) => {
  try {
    const trackUrl = req.query.url;
    if (!trackUrl) throw new Error('Ссылка не передана');
    const stream = await scdl.download(trackUrl);
    res.setHeader('Content-Type', 'audio/mpeg');
    stream.pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Ошибка стриминга');
  }
});

export default router;