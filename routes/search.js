import { Router } from 'express';
import axios from 'axios';
import YouTube from 'youtube-sr';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ytdl = require('@distube/ytdl-core');

const router = Router();

// Список надежных серверов-посредников Invidious
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.nerdvpn.de',
  'https://vid.puffyan.us'
];

// Поиск через youtube-sr (очень быстрый и стабильный)
async function searchYouTube(query) {
  try {
    const results = await YouTube.search(query, { limit: 25, type: 'video' });
    return results.map(v => ({
      id: v.id,
      title: v.title,
      artist_name: v.channel.name,
      cover_url: v.thumbnail?.url,
      duration: Math.round(v.duration / 1000),
      stream_url: `/api/search/stream/${v.id}`,
      is_external: false
    }));
  } catch (err) {
    console.error('Ошибка поиска:', err.message);
    return [];
  }
}

// 1. Рекомендации (Топовые рэперы)
router.get('/trending', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const rappers = ['Kendrick Lamar', 'Future', 'Travis Scott', 'Drake', 'Metro Boomin', '21 Savage'];
    const randomRapper = rappers[Math.floor(Math.random() * rappers.length)];
    const tracks = await searchYouTube(randomRapper);
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
    const tracks = await searchYouTube(query);
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// 3. Страница артиста
router.get('/artist', async (req, res) => {
  const query = req.query.name;
  if (!query) return res.json({ tracks: [] });
  try {
    const tracks = await searchYouTube(query);
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 4. ИДЕАЛЬНЫЙ СТРИМИНГ (Invidious -> ytdl fallback)
router.get('/stream/:id', async (req, res) => {
  const videoId = req.params.id;
  
  // Попытка 1: Через сервера Invidious (они обходят блокировки IP)
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const proxyUrl = `${instance}/latest_version?id=${videoId}&itag=140`;
      const check = await axios.head(proxyUrl, { timeout: 3000 });
      
      if (check.status >= 200 && check.status < 400) {
        return res.redirect(proxyUrl);
      }
    } catch (e) {
      // Если сервер не отвечает, пробуем следующий
    }
  }

  // Попытка 2: Прямое скачивание (если Invidious не сработал)
  try {
    const stream = ytdl(videoId, { filter: 'audioonly', quality: 'highestaudio' });
    res.setHeader('Content-Type', 'audio/mp4');
    stream.pipe(res);
  } catch (err) {
    console.error('Фатальная ошибка стриминга:', err.message);
    res.status(500).send('Ошибка стриминга');
  }
});

export default router;