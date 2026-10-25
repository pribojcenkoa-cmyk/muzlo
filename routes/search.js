import { Router } from 'express';
import axios from 'axios';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const scdl = require('soundcloud-downloader').default;

const router = Router();

// Список разных запросов для рекомендаций
const TRENDING_QUERIES = [
  'top hits 2024', 'popular music', 'lofi hip hop', 'rock classics', 
  'electronic dance', 'r&b hits', 'indie music', 'metal', 'jazz', 
  'chillout', 'hip hop', '80s hits', '90s hits', 'acoustic', 'rap'
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

// 1. Рекомендации (Случайные при каждом запросе)
router.get('/trending', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); // Запрещаем браузеру кэшировать
  try {
    // Выбираем случайный запрос из списка
    const randomQuery = TRENDING_QUERIES[Math.floor(Math.random() * TRENDING_QUERIES.length)];
    // Выбираем случайный отступ, чтобы треки не повторялись
    const randomOffset = Math.floor(Math.random() * 20) * 20; 
    
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
    console.error('Ошибка поиска:', err.message);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

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

router.get('/stream', async (req, res) => {
  try {
    const trackUrl = req.query.url;
    if (!trackUrl) throw new Error('Ссылка на трек не передана');

    const info = await scdl.getInfo(trackUrl);
    let progressiveUrl = null;

    if (info.formats) {
      const prog = info.formats.find(f => f.format.protocol === 'progressive');
      if (prog) progressiveUrl = prog.url;
    }

    if (!progressiveUrl && info.media && info.media.transcodings) {
      const trans = info.media.transcodings.find(t => t.format.protocol === 'progressive');
      if (trans) {
        const tRes = await axios.get(trans.url, { params: { client_id: scdl.client_id } });
        progressiveUrl = tRes.data.url;
      }
    }

    if (progressiveUrl) {
      return res.redirect(progressiveUrl);
    }

    const stream = await scdl.download(trackUrl);
    res.setHeader('Content-Type', 'audio/mpeg');
    stream.pipe(res);
  } catch (err) {
    console.error('Ошибка стриминга:', err.message);
    if (!res.headersSent) res.status(500).send('Ошибка стриминга');
  }
});

export default router;