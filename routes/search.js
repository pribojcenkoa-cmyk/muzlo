import { Router } from 'express';
import axios from 'axios';
import { createRequire } from 'module';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const require = createRequire(import.meta.url);
const cheerio = require('cheerio');
const scdl = require('soundcloud-downloader').default;

const router = Router();

// Список популярных артистов для рекомендаций
const POPULAR_ARTISTS = [
  'Onda Andar', 'Sematary', 'Kizaru', 'Miyagi', 'Andy Panda', 'Scriptonite', 
  'Boulevard Depo', 'Pharaoh', 'FACE', 'LSP', 'Markul', 'T-Fest', 
  'Big Baby Tape', 'Kino', 'Morgenshtern', 'GONE.Fludd', 'Gidayyat',
  'Lil Peep', 'Kendrick Lamar', 'Drake', 'Travis Scott', 'Future', 
  'Kanye West', 'Eminem', 'Playboi Carti', '21 Savage', 'Metro Boomin',
  'Juice WRLD', 'XXXTENTACION', 'Post Malone', 'The Weeknd'
];

// Вспомогательная функция поиска в SoundCloud
async function searchSoundCloud(q, offset = 0) {
  const searchResult = await scdl.search({
    query: q, resourceType: 'tracks', limit: 50, offset: offset
  });

  return searchResult.collection
    .filter(track => track.duration < 900000) // Отсеиваем сборники > 15 мин
    .map(track => {
      let cover = track.artwork_url || (track.user && track.user.avatar_url);
      if (cover) cover = cover.replace('large', 't500x500');
      const proxyCover = cover ? `/api/search/cover?url=${encodeURIComponent(cover)}` : null;

      return {
        id: track.id,
        title: track.title,
        artist_name: track.user ? track.user.username : 'Неизвестен',
        cover_url: proxyCover,
        duration: Math.round(track.duration / 1000),
        permalink_url: track.permalink_url,
        stream_url: `/api/search/stream?url=${encodeURIComponent(track.permalink_url)}`,
        is_external: false 
      };
    });
}

// 1. Рекомендации (Главная)
router.get('/trending', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); 
  try {
    const randomArtist = POPULAR_ARTISTS[Math.floor(Math.random() * POPULAR_ARTISTS.length)];
    const randomOffset = Math.floor(Math.random() * 4) * 10;
    const tracks = await searchSoundCloud(randomArtist, randomOffset);
    const artistTracks = tracks.filter(t => 
      t.artist_name.toLowerCase().includes(randomArtist.toLowerCase()) || 
      randomArtist.toLowerCase().includes(t.artist_name.toLowerCase())
    );
    res.json({ tracks: artistTracks.length > 0 ? artistTracks : tracks });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 2. Поиск по миру
router.get('/', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ tracks: [] });
  try {
    const tracks = await searchSoundCloud(q);
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// 3. Инфо о треке (точная длительность)
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

// 4. Страница артиста
router.get('/artist', async (req, res) => {
  const artistName = req.query.name;
  if (!artistName) return res.status(400).json({ error: 'Имя не передано' });
  try {
    const tracks = await searchSoundCloud(artistName);
    const filteredTracks = tracks.filter(t => {
      const trackArtist = t.artist_name.toLowerCase();
      const searchName = artistName.toLowerCase();
      return trackArtist.includes(searchName) || searchName.includes(trackArtist);
    });
    res.json({ tracks: filteredTracks });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// 5. Моя волна (Умная, на основе истории)
router.get('/my-wave', requireAuth, async (req, res) => {
  try {
    const topArtists = await query(
      `SELECT artist_name, COUNT(*) as play_count 
       FROM listening_history 
       WHERE user_id = $1 AND artist_name IS NOT NULL 
       GROUP BY artist_name 
       ORDER BY play_count DESC 
       LIMIT 7`,
      [req.user.id]
    );

    let baseArtists = topArtists.rows.map(r => r.artist_name);

    if (baseArtists.length < 5) {
      const liked = await query(
        'SELECT DISTINCT artist_name FROM user_library WHERE user_id = $1 AND artist_name IS NOT NULL LIMIT 5',
        [req.user.id]
      );
      baseArtists = [...new Set([...baseArtists, ...liked.rows.map(r => r.artist_name)])];
    }

    if (baseArtists.length === 0) {
      baseArtists = POPULAR_ARTISTS.sort(() => 0.5 - Math.random()).slice(0, 5);
    }

    const randomPopular = POPULAR_ARTISTS
      .sort(() => 0.5 - Math.random())
      .filter(a => !baseArtists.includes(a))
      .slice(0, 3);
    
    const allArtists = [...baseArtists, ...randomPopular];

    let allTracks = [];
    for (const artist of allArtists) {
      if (!artist || artist === 'Неизвестен') continue;
      try {
        const tracks = await searchSoundCloud(artist);
        const filtered = tracks.filter(t => 
          t.artist_name.toLowerCase().includes(artist.toLowerCase()) || 
          artist.toLowerCase().includes(t.artist_name.toLowerCase())
        );
        allTracks = allTracks.concat(filtered.sort(() => 0.5 - Math.random()).slice(0, 10));
      } catch (e) {}
    }

    const shuffled = allTracks.sort(() => 0.5 - Math.random());
    res.json({ tracks: shuffled.slice(0, 40) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка генерации волны' });
  }
});

// 6. Сохранение истории прослушивания
router.post('/history', requireAuth, async (req, res) => {
  try {
    const { track_id, title, artist_name, duration } = req.body;
    if (!track_id) return res.status(400).json({ error: 'Нет ID трека' });

    await query(
      'INSERT INTO listening_history (user_id, track_id, title, artist_name, duration) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, String(track_id), title, artist_name, duration]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения истории' });
  }
});

// 7. Статистика для профиля
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const totalTime = await query(
      'SELECT SUM(duration) as total FROM listening_history WHERE user_id = $1',
      [req.user.id]
    );
    
    const topArtists = await query(
      `SELECT artist_name, COUNT(*) as count FROM listening_history 
       WHERE user_id = $1 AND artist_name IS NOT NULL 
       GROUP BY artist_name ORDER BY count DESC LIMIT 5`,
      [req.user.id]
    );

    const topTracks = await query(
      `SELECT title, artist_name, COUNT(*) as count FROM listening_history 
       WHERE user_id = $1 
       GROUP BY title, artist_name ORDER BY count DESC LIMIT 5`,
      [req.user.id]
    );

    res.json({
      total_seconds: parseInt(totalTime.rows[0].total || 0),
      top_artists: topArtists.rows,
      top_tracks: topTracks.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// 8. Импорт из SoundCloud
router.get('/import-likes', async (req, res) => {
  let profileUrl = req.query.url;
  if (!profileUrl) return res.status(400).json({ error: 'Ссылка не передана' });
  profileUrl = profileUrl.replace(/\/$/, '');
  try {
    const likesUrl = `${profileUrl}/likes`;
    const likesResult = await scdl.getTracks({ url: likesUrl, limit: 100 });
    
    if (!likesResult.collection || likesResult.collection.length === 0) {
      return res.json({ tracks: [], message: 'Лайки не найдены' });
    }

    const tracks = likesResult.collection.filter(track => track.duration < 900000).map(track => {
      let cover = track.artwork_url || (track.user && track.user.avatar_url);
      if (cover) cover = cover.replace('large', 't500x500');
      return {
        id: track.id, title: track.title, artist_name: track.user ? track.user.username : 'Неизвестен',
        cover_url: cover ? `/api/search/cover?url=${encodeURIComponent(cover)}` : null,
        duration: Math.round(track.duration / 1000), permalink_url: track.permalink_url,
        stream_url: `/api/search/stream?url=${encodeURIComponent(track.permalink_url)}`, is_external: false 
      };
    });
    res.json({ tracks });
  } catch (err) { res.status(500).json({ error: 'Ошибка импорта' }); }
});

// 9. Импорт из Яндекс.Музыки (мульти-прокси + глубокий парсинг)
router.get('/import-yandex', async (req, res) => {
  const url = req.query.url;
  if (!url || !url.includes('music.yandex.ru')) {
    return res.status(400).json({ error: 'Ссылка должна быть с music.yandex.ru' });
  }

  const PROXIES = [
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://thingproxy.freeboard.io/fetch/'
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8'
  };

  let htmlContent = null;

  for (const proxy of PROXIES) {
    try {
      console.log(`[Yandex] Пробуем прокси: ${proxy}`);
      const targetUrl = proxy + encodeURIComponent(url);
      const response = await axios.get(targetUrl, { headers, timeout: 12000 });
      
      if (response.data && response.data.length > 5000) {
        console.log(`[Yandex] ✅ Прокси сработал, размер HTML: ${response.data.length}`);
        htmlContent = response.data;
        break;
      } else {
        console.log(`[Yandex] ❌ Пустой ответ от прокси`);
      }
    } catch (err) {
      console.log(`[Yandex] ❌ Прокси не сработал: ${err.message}`);
    }
  }

  if (!htmlContent) {
    try {
      console.log('[Yandex] Пробуем прямой запрос...');
      const response = await axios.get(url, { headers, timeout: 10000 });
      if (response.data && response.data.length > 5000) {
        htmlContent = response.data;
        console.log(`[Yandex] ✅ Прямой запрос сработал, размер: ${htmlContent.length}`);
      }
    } catch (err) {
      console.log(`[Yandex] ❌ Прямой запрос не сработал: ${err.message}`);
    }
  }

  if (!htmlContent) {
    return res.status(500).json({ error: 'Все прокси и прямой запрос заблокированы Яндексом.' });
  }

  try {
    const $ = cheerio.load(htmlContent);
    let parsedTracks = [];

    // СПОСОБ 1: JSON в script[type="application/json"]
    $('script[type="application/json"]').each((i, el) => {
      if (parsedTracks.length > 0) return;
      try {
        const content = $(el).html();
        if (!content || !content.includes('title')) return;
        const data = JSON.parse(content);
        const findTracks = (obj) => {
          if (!obj || typeof obj !== 'object' || parsedTracks.length > 0) return;
          if (Array.isArray(obj) && obj.length > 0 && obj[0].title && (obj[0].artists || obj[0].artist)) {
            parsedTracks = obj;
            return;
          }
          for (const key in obj) {
            findTracks(obj[key]);
            if (parsedTracks.length > 0) return;
          }
        };
        findTracks(data);
      } catch (e) {}
    });

    // СПОСОБ 2: Inline JSON (window.__INITIAL_STATE__)
    if (parsedTracks.length === 0) {
      $('script:not([src])').each((i, el) => {
        if (parsedTracks.length > 0) return;
        try {
          const content = $(el).html();
          if (!content || content.length < 1000 || !content.includes('"title"')) return;

          const matches = content.match(/\{[\s\S]{500,}?\}/g);
          if (!matches) return;

          for (const m of matches) {
            try {
              const data = JSON.parse(m);
              const findTracks = (obj) => {
                if (!obj || typeof obj !== 'object' || parsedTracks.length > 0) return;
                if (Array.isArray(obj) && obj.length > 0 && obj[0].title && (obj[0].artists || obj[0].artist)) {
                  parsedTracks = obj;
                  return;
                }
                for (const key in obj) {
                  findTracks(obj[key]);
                  if (parsedTracks.length > 0) return;
                }
              };
              findTracks(data);
            } catch (e) {}
          }
        } catch (e) {}
      });
    }

    // СПОСОБ 3: Регулярные выражения (парсим сырой HTML)
    if (parsedTracks.length === 0) {
      const regex = /"title":"([^"]+)","artists":\[\{"name":"([^"]+)"/g;
      let match;
      while ((match = regex.exec(htmlContent)) !== null) {
        parsedTracks.push({ title: match[1], artists: [{ name: match[2] }] });
        if (parsedTracks.length > 100) break;
      }
    }

    console.log(`[Yandex] Итого найдено в плейлисте: ${parsedTracks.length} треков`);

    if (parsedTracks.length === 0) {
      return res.status(404).json({ error: 'Не удалось распарсить плейлист. Возможно, ссылка приватная или имеет неверный формат.' });
    }

    const tracks = [];
    for (const track of parsedTracks) {
      if (!track.title) continue;
      const title = track.title;
      const artist = track.artists ? track.artists.map(a => a.name).join(', ') : (track.artist || 'Неизвестен');
      const searchQuery = `${artist} - ${title}`;

      try {
        const found = await searchSoundCloud(searchQuery);
        if (found.length > 0) {
          const bestMatch = found.find(t => 
            t.artist_name.toLowerCase().includes(artist.toLowerCase().split(',')[0]) ||
            title.toLowerCase().includes(t.title.toLowerCase())
          ) || found[0];
          tracks.push(bestMatch);
        }
      } catch (e) {}
    }

    if (tracks.length === 0) {
      return res.status(404).json({ error: `Найдено ${parsedTracks.length} треков в плейлисте, но ни один не найден в SoundCloud.` });
    }

    res.json({ tracks });
  } catch (err) {
    console.error('Ошибка парсинга Яндекса:', err.message);
    res.status(500).json({ error: 'Ошибка парсинга HTML.' });
  }
});

// 10. Прокси для картинок
router.get('/cover', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('Нет URL');
    const response = await axios.get(imageUrl, { responseType: 'stream', headers: { 'User-Agent': 'Mozilla/5.0' } });
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    response.data.pipe(res);
  } catch (err) { res.redirect('/img/default-cover.png'); }
});

// 11. Стриминг аудио
router.get('/stream', async (req, res) => {
  try {
    const trackUrl = req.query.url;
    if (!trackUrl) throw new Error('Ссылка не передана');
    const stream = await scdl.download(trackUrl);
    res.setHeader('Content-Type', 'audio/mpeg');
    stream.pipe(res);
  } catch (err) { if (!res.headersSent) res.status(500).send('Ошибка стриминга'); }
});

export default router;