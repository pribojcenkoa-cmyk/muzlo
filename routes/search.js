import { Router } from 'express';
import axios from 'axios';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const scdl = require('soundcloud-downloader').default;

const router = Router();

const TRENDING_QUERIES = [
  'top hits 2026', 'popular music 2026', 'trending songs 2026', 
  'new music 2026', 'billboard hot 100 2026', 'spotify top 50 2026',
  'best songs 2026', 'viral hits 2026', 'top r&b 2026', 'top rap 2026'
];

async function searchSoundCloud(query, offset = 0) {
  const searchResult = await scdl.search({
    query: query,
    resourceType: 'tracks',
    limit: 50,
    offset: offset
  });

  return searchResult.collection
    .filter(track => track.duration < 900000)
    .map(track => {
      let cover = track.artwork_url || (track.user && track.user.avatar_url);
      if (cover) cover = cover.replace('large', 't500x500');

      // ПРОКСИРУЕМ КАРТИНКИ ЧЕРЕЗ НАШ СЕРВЕР
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

// 1. Рекомендации
router.get('/trending', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); 
  try {
    const randomQuery = TRENDING_QUERIES[Math.floor(Math.random() * TRENDING_QUERIES.length)];
    const randomOffset = Math.floor(Math.random() * 20) * 20; 
    const tracks = await searchSoundCloud(randomQuery, randomOffset);
    res.json({ tracks });
  } catch (err) {
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

// 5. ПРОКСИ ДЛЯ КАРТИНОК (чтобы не блокировались на мобильных)
router.get('/cover', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('Нет URL');
    
    const response = await axios.get(imageUrl, { responseType: 'stream' });
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Кэш на сутки
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