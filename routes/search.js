import { Router } from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const scdl = require('soundcloud-downloader').default;

const router = Router();

const TRENDING_QUERIES = [
  'Sematary', 'Onda Andar', 'Lil Peep', 'Kendrick Lamar', 'Drake', 
  'Travis Scott', 'Future', 'Kanye West', 'Eminem', 'Phonk',
  'rap hits 2026', 'hip hop', 'trap music', 'underground rap'
];

async function searchSoundCloud(query, offset = 0) {
  const searchResult = await scdl.search({
    query: query, resourceType: 'tracks', limit: 50, offset: offset
  });

  return searchResult.collection
    .filter(track => track.duration < 900000)
    .map(track => {
      let cover = track.artwork_url || (track.user && track.user.avatar_url);
      if (cover) cover = cover.replace('large', 't500x500');

      return {
        id: track.id,
        title: track.title,
        artist_name: track.user ? track.user.username : 'Неизвестен',
        cover_url: cover,
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

// 3. Точная длительность
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

// 4. СТРАНИЦА АРТИСТА (ИСПРАВЛЕНО: ищем именно профиль, а не текст)
router.get('/artist', async (req, res) => {
  const artistName = req.query.name;
  if (!artistName) return res.status(400).json({ error: 'Имя не передано' });
  
  try {
    // Сначала ищем самого артиста (профиль), а не треки
    const userSearch = await scdl.search({
      query: artistName,
      resourceType: 'users',
      limit: 5
    });

    if (!userSearch.collection || userSearch.collection.length === 0) {
      return res.json({ tracks: [] });
    }

    // Берем самого подходящего артиста (совпадение по имени)
    const artist = userSearch.collection.find(u => 
      u.username.toLowerCase() === artistName.toLowerCase()
    ) || userSearch.collection[0];

    // Теперь загружаем ТОЛЬКО ЕГО треки по публичной ссылке профиля
    const tracksRes = await scdl.getTracks({
      url: artist.permalink_url,
      limit: 50
    });

    const tracks = tracksRes.collection
      .filter(track => track.duration < 900000)
      .map(track => {
        let cover = track.artwork_url || (track.user && track.user.avatar_url);
        if (cover) cover = cover.replace('large', 't500x500');

        return {
          id: track.id,
          title: track.title,
          artist_name: track.user ? track.user.username : 'Неизвестен',
          cover_url: cover,
          duration: Math.round(track.duration / 1000),
          permalink_url: track.permalink_url,
          stream_url: `/api/search/stream?url=${encodeURIComponent(track.permalink_url)}`,
          is_external: false 
        };
      });

    res.json({ tracks });
  } catch (err) {
    console.error('Ошибка загрузки артиста:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 5. Стриминг
router.get('/stream', async (req, res) => {
  try {
    const trackUrl = req.query.url;
    if (!trackUrl) throw new Error('Ссылка не передана');

    const stream = await scdl.download(trackUrl);
    res.setHeader('Content-Type', 'audio/mpeg');
    stream.pipe(res);
  } catch (err) {
    console.error('Ошибка стриминга:', err.message);
    if (!res.headersSent) res.status(500).send('Ошибка стриминга');
  }
});

export default router;