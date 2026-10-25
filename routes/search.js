import { Router } from 'express';
import axios from 'axios';
import 'dotenv/config';

const router = Router();
const VK_TOKEN = process.env.VK_TOKEN;
const VK_API = 'https://api.vk.com/method/audio.search';
const VK_VER = '5.199'; // Обновили версию API

async function searchVK(query, count = 50) {
  try {
    console.log(`[VK] Ищем: ${query}`);
    
    const res = await axios.get(VK_API, {
      params: {
        access_token: VK_TOKEN,
        v: VK_VER,
        q: query,
        count: count,
        sort: 2,
        auto_complete: 1
      }
    });

    // Если ВК вернул ошибку (например, токен просрочен или доступ закрыт)
    if (res.data.error) {
      console.error('❌ ОШИБКА VK API:', JSON.stringify(res.data.error));
      return [];
    }

    // Если треков нет
    if (!res.data.response || !res.data.response.items) {
      console.warn('⚠️ VK не вернул треки (пустой ответ).');
      return [];
    }

    console.log(`✅ Найдено треков: ${res.data.response.items.length}`);

    return res.data.response.items.map(t => ({
      id: t.id,
      title: t.title,
      artist_name: t.artist,
      cover_url: null, 
      duration: t.duration,
      file_url: t.url, 
      is_external: true,
      stream_url: t.url 
    }));
  } catch (err) {
    console.error('❌ Ошибка запроса к ВК:', err.message);
    return [];
  }
}

router.get('/trending', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const queries = ['Sematary', 'Onda Andar', 'Lil Peep', 'phonk', 'популярная музыка 2026'];
    const randomQuery = queries[Math.floor(Math.random() * queries.length)];
    const tracks = await searchVK(randomQuery);
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

router.get('/', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ tracks: [] });
  try {
    const tracks = await searchVK(query);
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

router.get('/artist', async (req, res) => {
  const query = req.query.name;
  if (!query) return res.json({ tracks: [] });
  try {
    const tracks = await searchVK(query);
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

export default router;