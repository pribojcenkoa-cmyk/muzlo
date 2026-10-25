import { Router } from 'express';
import axios from 'axios';

const router = Router();

const PIPED_APIS = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee'
];

// Теперь функция возвращает и данные, и адрес сервера, который ответил
async function fetchPiped(endpoint) {
  for (const api of PIPED_APIS) {
    try {
      const res = await axios.get(`${api}${endpoint}`, { timeout: 6000 });
      return { data: res.data, api: api };
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
    duration: item.duration,
    stream_url: `/api/search/stream/${videoId}`, 
    is_external: false
  };
}

// 1. Рекомендации
router.get('/trending', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // Добавляем случайности, чтобы треки менялись
    const queries = ['top music 2024', 'popular hits', 'lofi hip hop', 'rock classics', 'electronic dance'];
    const randomQuery = queries[Math.floor(Math.random() * queries.length)];
    
    const { data } = await fetchPiped(`/search?q=${encodeURIComponent(randomQuery)}&filter=music_songs`);
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
    const { data } = await fetchPiped(`/search?q=${encodeURIComponent(query)}&filter=music_songs`);
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
    const { data } = await fetchPiped(`/search?q=${encodeURIComponent(query)}&filter=music_songs`);
    res.json({ tracks: data.items.map(mapTrack) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 4. Стриминг (ИСПРАВЛЕНА ОШИБКА 500)
router.get('/stream/:id', async (req, res) => {
  try {
    const videoId = req.params.id;
    const { data, api } = await fetchPiped(`/streams/${videoId}`);
    
    if (!data.audioStreams || data.audioStreams.length === 0) {
      throw new Error('Аудио не найдено');
    }

    // Берем лучшую аудиодорожку
    const bestAudio = data.audioStreams.sort((a, b) => b.bitrate - a.bitrate)[0];
    
    let audioUrl = null;

    if (bestAudio.proxyUrl) {
      // Если ссылка относительная (начинается с /), приклеиваем адрес сервера Piped
      audioUrl = bestAudio.proxyUrl.startsWith('http') 
        ? bestAudio.proxyUrl 
        : `${api}${bestAudio.proxyUrl}`;
    } else if (bestAudio.url) {
      audioUrl = bestAudio.url;
    }

    if (audioUrl) {
      return res.redirect(audioUrl);
    }
    
    throw new Error('Прямая ссылка не найдена');
  } catch (err) {
    console.error('Ошибка стриминга:', err.message);
    res.status(500).send('Ошибка стриминга');
  }
});

export default router;