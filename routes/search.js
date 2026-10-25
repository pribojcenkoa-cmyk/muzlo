import { Router } from 'express';
import axios from 'axios';

const router = Router();
const AUDIUS_API = 'https://discoveryprovider.audius.co/v1';

// 1. Рекомендации
router.get('/trending', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const rappers = ['Kendrick Lamar', 'Future', 'Travis Scott', 'Drake', 'Metro Boomin', '21 Savage'];
    const randomRapper = rappers[Math.floor(Math.random() * rappers.length)];
    
    const response = await axios.get(`${AUDIUS_API}/tracks/search?query=${encodeURIComponent(randomRapper)}&app_name=MUZLO`);
    const tracks = response.data.data.map(t => ({
      id: t.id,
      title: t.title,
      artist_name: t.user.name,
      cover_url: t.artwork ? t.artwork['150x150'] : null,
      duration: t.duration,
      stream_url: `/api/search/stream/${t.id}`,
      is_external: false
    }));
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
    const response = await axios.get(`${AUDIUS_API}/tracks/search?query=${encodeURIComponent(query)}&app_name=MUZLO`);
    const tracks = response.data.data.map(t => ({
      id: t.id,
      title: t.title,
      artist_name: t.user.name,
      cover_url: t.artwork ? t.artwork['150x150'] : null,
      duration: t.duration,
      stream_url: `/api/search/stream/${t.id}`,
      is_external: false
    }));
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// 3. УМНАЯ СТРАНИЦА АРТИСТА (Ищем профиль, а не просто слова)
router.get('/artist', async (req, res) => {
  const artistName = req.query.name;
  if (!artistName) return res.json({ tracks: [] });
  
  try {
    // Сначала ищем самого артиста в базе пользователей
    const userRes = await axios.get(`${AUDIUS_API}/users/search?query=${encodeURIComponent(artistName)}&app_name=MUZLO`);
    const users = userRes.data.data;
    
    if (users.length === 0) return res.json({ tracks: [] });
    
    // Берем самого популярного или первого найденного артиста
    const artist = users.find(u => u.name.toLowerCase() === artistName.toLowerCase()) || users[0];
    
    // Теперь достаем ИМЕННО ЕГО треки
    const tracksRes = await axios.get(`${AUDIUS_API}/users/${artist.id}/tracks?app_name=MUZLO&limit=50`);
    
    const tracks = tracksRes.data.data.map(t => ({
      id: t.id,
      title: t.title,
      artist_name: t.user.name,
      cover_url: t.artwork ? t.artwork['150x150'] : null,
      duration: t.duration,
      stream_url: `/api/search/stream/${t.id}`,
      is_external: false
    }));
    
    res.json({ tracks });
  } catch (err) {
    console.error('Ошибка загрузки артиста:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 4. Проксирование аудио
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
    res.status(500).send('Ошибка стриминга');
  }
});

export default router;