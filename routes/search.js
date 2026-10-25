import { Router } from 'express';
import axios from 'axios';

const router = Router();
const AUDIUS_API = 'https://discoveryprovider.audius.co/v1';

// Вспомогательная функция для форматирования треков
function formatTracks(data) {
  if (!data || !Array.isArray(data)) return [];
  return data.map(t => ({
    id: t.id,
    title: t.title,
    artist_name: t.user.name,
    cover_url: t.artwork ? t.artwork['150x150'] : null,
    duration: t.duration,
    stream_url: `/api/search/stream/${t.id}`,
    is_external: false
  }));
}

// 1. РЕКОМЕНДАЦИИ (Официальный чарт популярных треков Audius)
router.get('/trending', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // Запрашиваем именно ТОП треков, а не случайного артиста
    const response = await axios.get(`${AUDIUS_API}/tracks/trending?app_name=MUZLO&limit=50`);
    res.json({ tracks: formatTracks(response.data.data) });
  } catch (err) {
    console.error('Ошибка рекомендаций:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 2. ПОИСК
router.get('/', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ tracks: [] });
  try {
    const response = await axios.get(`${AUDIUS_API}/tracks/search?query=${encodeURIComponent(query)}&app_name=MUZLO`);
    res.json({ tracks: formatTracks(response.data.data) });
  } catch (err) {
    console.error('Ошибка поиска:', err.message);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// 3. СТРАНИЦА АРТИСТА
router.get('/artist', async (req, res) => {
  const artistName = req.query.name;
  if (!artistName) return res.json({ tracks: [] });
  
  try {
    // Ищем профиль артиста
    const userRes = await axios.get(`${AUDIUS_API}/users/search?query=${encodeURIComponent(artistName)}&app_name=MUZLO`);
    const users = userRes.data.data;
    
    if (users.length === 0) return res.json({ tracks: [] });
    
    // Берем самого подходящего
    const artist = users.find(u => u.name.toLowerCase() === artistName.toLowerCase()) || users[0];
    
    // Достаем ИМЕННО ЕГО треки
    const tracksRes = await axios.get(`${AUDIUS_API}/users/${artist.id}/tracks?app_name=MUZLO&limit=50`);
    res.json({ tracks: formatTracks(tracksRes.data.data) });
    
  } catch (err) {
    console.error('Ошибка загрузки артиста:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 4. ПРОКСИ АУДИО
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