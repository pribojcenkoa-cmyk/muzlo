import { Router } from 'express';
import axios from 'axios';

const router = Router();

// Публичный API Audius
const AUDIUS_API = 'https://discoveryprovider.audius.co/v1';

async function searchAudius(query) {
  const res = await axios.get(`${AUDIUS_API}/tracks/search?query=${encodeURIComponent(query)}&app_name=MUZLO`);
  
  return res.data.data.map(t => ({
    id: t.id,
    title: t.title,
    artist_name: t.user.name,
    cover_url: t.artwork ? t.artwork['150x150'] : null,
    duration: t.duration,
    // Ссылка на наш прокси для обхода блокировок
    stream_url: `/api/search/stream/${t.id}`,
    is_external: false
  }));
}

// 1. Рекомендации (Топовые рэперы)
router.get('/trending', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const rappers = ['Kendrick Lamar', 'Future', 'Travis Scott', 'Drake', 'Metro Boomin', '21 Savage'];
    const randomRapper = rappers[Math.floor(Math.random() * rappers.length)];
    const tracks = await searchAudius(randomRapper);
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
    const tracks = await searchAudius(query);
    res.json({ tracks });
  } catch (err) {
    console.error('Ошибка поиска:', err.message);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// 3. Страница артиста
router.get('/artist', async (req, res) => {
  const query = req.query.name;
  if (!query) return res.json({ tracks: [] });
  try {
    const tracks = await searchAudius(query);
    res.json({ tracks });
  } catch (err) {
    console.error('Ошибка загрузки артиста:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 4. Проксирование аудио (чтобы не было блокировок)
router.get('/stream/:id', async (req, res) => {
  try {
    const streamUrl = `${AUDIUS_API}/tracks/${req.params.id}/stream?app_name=MUZLO`;
    const response = await axios.get(streamUrl, { 
      responseType: 'stream',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    res.setHeader('Content-Type', 'audio/mpeg');
    response.data.pipe(res);
  } catch (err) {
    console.error('Ошибка стриминга:', err.message);
    res.status(500).send('Ошибка стриминга');
  }
});

export default router;