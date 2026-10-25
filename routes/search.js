import { Router } from 'express';
import axios from 'axios';

const router = Router();

const PIPED_APIS = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.leptons.xyz'
];

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

router.get('/trending', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const queries = ['top music 2024', 'popular hits', 'lofi hip hop', 'rock classics', 'electronic dance', 'chillout'];
    const randomQuery = queries[Math.floor(Math.random() * queries.length)];
    const { data } = await fetchPiped(`/search?q=${encodeURIComponent(randomQuery)}&filter=music_songs`);
    const filteredItems = data.items.filter(item => item.duration < 900); 
    res.json({ tracks: filteredItems.map(mapTrack) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

router.get('/', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ tracks: [] });
  try {
    const { data } = await fetchPiped(`/search?q=${encodeURIComponent(query)}&filter=music_songs`);
    const filteredItems = data.items.filter(item => item.duration < 900);
    res.json({ tracks: filteredItems.map(mapTrack) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

router.get('/artist', async (req, res) => {
  const query = req.query.name;
  if (!query) return res.json({ tracks: [] });
  try {
    const { data } = await fetchPiped(`/search?q=${encodeURIComponent(query)}&filter=music_songs`);
    const filteredItems = data.items.filter(item => item.duration < 900);
    res.json({ tracks: filteredItems.map(mapTrack) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// ИСПРАВЛЕННЫЙ РЕДИРЕКТ (Браузер сам скачает музыку)
router.get('/stream/:id', async (req, res) => {
  try {
    const videoId = req.params.id;
    const { data, api } = await fetchPiped(`/streams/${videoId}`);
    
    if (!data.audioStreams || data.audioStreams.length === 0) {
      throw new Error('Аудио не найдено');
    }

    const bestAudio = data.audioStreams.find(a => a.proxyUrl) || data.audioStreams[0];
    let audioUrl = bestAudio.proxyUrl || bestAudio.url;

    if (!audioUrl) throw new Error('Ссылка не найдена');

    // Если ссылка относительная, приклеиваем домен сервера Piped
    if (audioUrl.startsWith('/')) {
      audioUrl = `${api}${audioUrl}`;
    }
    
    // Отправляем браузер пользователя прямо на этот адрес
    return res.redirect(audioUrl);
  } catch (err) {
    console.error('Ошибка стриминга:', err.message);
    res.status(500).send('Ошибка стриминга');
  }
});

export default router;