import { Router } from 'express';
import axios from 'axios';

const router = Router();

const PIPED_APIS = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee'
];

async function fetchPiped(endpoint) {
  for (const api of PIPED_APIS) {
    try {
      const res = await axios.get(`${api}${endpoint}`, { timeout: 6000 });
      return res.data;
    } catch (e) {
      console.log(`[Piped] ${api} failed`);
    }
  }
  throw new Error('All Piped APIs failed');
}

function mapTrack(item) {
  let videoId = item.url ? item.url.split('v=')[1] : item.id;
  return {
    id: videoId,
    title: item.title,
    artist_name: item.uploaderName,
    cover_url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    duration: item.duration, // Piped отдает длительность в секундах
    stream_url: `/api/search/stream/${videoId}`, // Ссылка на наш прокси
    is_external: false
  };
}

// 1. Рекомендации
router.get('/trending', async (req, res) => {
  try {
    const data = await fetchPiped('/search?q=top+music+2024&filter=music_songs');
    res.json({ tracks: data.items.map(mapTrack) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 2. Поиск
router.get('/', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ tracks: [] });
  try {
    const data = await fetchPiped(`/search?q=${encodeURIComponent(query)}&filter=music_songs`);
    res.json({ tracks: data.items.map(mapTrack) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// 3. Страница артиста
router.get('/artist', async (req, res) => {
  const query = req.query.name;
  if (!query) return res.json({ tracks: [] });
  try {
    const data = await fetchPiped(`/search?q=${encodeURIComponent(query)}&filter=music_songs`);
    res.json({ tracks: data.items.map(mapTrack) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 4. Стриминг (Проксирование через Piped)
router.get('/stream/:id', async (req, res) => {
  try {
    const videoId = req.params.id;
    const data = await fetchPiped(`/streams/${videoId}`);
    
    if (!data.audioStreams || data.audioStreams.length === 0) {
      throw new Error('Аудио не найдено');
    }

    // Сортируем по качеству и берем лучшую дорожку
    const bestAudio = data.audioStreams.sort((a, b) => b.bitrate - a.bitrate)[0];
    
    // proxyUrl — это специальная ссылка от Piped, которая обходит блокировки
    // и поддерживает перемотку (Range requests)
    if (bestAudio.proxyUrl) {
      return res.redirect(bestAudio.proxyUrl);
    }
    
    // Запасной вариант
    res.redirect(bestAudio.url);
  } catch (err) {
    console.error('Ошибка стриминга:', err.message);
    res.status(500).send('Ошибка стриминга');
  }
});

export default router;