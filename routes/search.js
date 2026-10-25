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
      const res = await axios.get(`${api}${endpoint}`, { timeout: 8000 });
      return { data: res.data, api };
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
    // Топовые рэперы (через YouTube)
    const rappers = ['Future', 'Travis Scott', 'Drake', 'Kendrick Lamar', '21 Savage', 'Metro Boomin'];
    const randomRapper = rappers[Math.floor(Math.random() * rappers.length)];
    
    const { data } = await fetchPiped(`/search?q=${encodeURIComponent(randomRapper)}&filter=music_songs`);
    const filtered = data.items.filter(i => i.duration < 900); // Только треки до 15 минут
    res.json({ tracks: filtered.map(mapTrack) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

router.get('/', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ tracks: [] });
  try {
    const { data } = await fetchPiped(`/search?q=${encodeURIComponent(query)}&filter=music_songs`);
    const filtered = data.items.filter(i => i.duration < 900);
    res.json({ tracks: filtered.map(mapTrack) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

router.get('/artist', async (req, res) => {
  const query = req.query.name;
  if (!query) return res.json({ tracks: [] });
  try {
    const { data } = await fetchPiped(`/search?q=${encodeURIComponent(query)}&filter=music_songs`);
    const filtered = data.items.filter(i => i.duration < 900);
    res.json({ tracks: filtered.map(mapTrack) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// СТРИМИНГ ЧЕРЕЗ PIPED
router.get('/stream/:id', async (req, res) => {
  try {
    const videoId = req.params.id;
    const { data, api } = await fetchPiped(`/streams/${videoId}`);
    
    if (!data.audioStreams || data.audioStreams.length === 0) {
      throw new Error('Аудио не найдено');
    }

    // Ищем аудио в формате mp4 (его понимают все браузеры) или берем первое
    const audio = data.audioStreams.find(s => s.mimeType.includes('audio/mp4')) || data.audioStreams[0];
    
    let url = audio.proxyUrl || audio.url;
    
    // Если ссылка относительная, добавляем домен
    if (url.startsWith('/')) {
      url = `${api}${url}`;
    }

    // Перенаправляем браузер напрямую на аудиофайл
    res.redirect(url);
  } catch (err) {
    console.error('Ошибка стриминга:', err.message);
    res.status(500).send('Ошибка стриминга');
  }
});

export default router;