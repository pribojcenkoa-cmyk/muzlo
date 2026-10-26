import { Router } from 'express';
import axios from 'axios';
import { createRequire } from 'module';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const require = createRequire(import.meta.url);
const cheerio = require('cheerio');
const scdl = require('soundcloud-downloader').default;

const router = Router();

const POPULAR_ARTISTS = [
  'Onda Andar', 'Sematary', 'Kizaru', 'Miyagi', 'Andy Panda', 'Scriptonite', 
  'Boulevard Depo', 'Pharaoh', 'FACE', 'LSP', 'Markul', 'T-Fest', 
  'Big Baby Tape', 'Kino', 'Morgenshtern', 'GONE.Fludd', 'Gidayyat',
  'Lil Peep', 'Kendrick Lamar', 'Drake', 'Travis Scott', 'Future', 
  'Kanye West', 'Eminem', 'Playboi Carti', '21 Savage', 'Metro Boomin',
  'Juice WRLD', 'XXXTENTACION', 'Post Malone', 'The Weeknd'
];

// Вспомогательная функция форматирования трека
function formatTrack(track) {
  let cover = track.artwork_url || (track.user && track.user.avatar_url);
  if (cover) cover = cover.replace('large', 't500x500');
  return {
    id: track.id,
    title: track.title,
    artist_name: track.user ? track.user.username : 'Неизвестен',
    cover_url: cover ? `/api/search/cover?url=${encodeURIComponent(cover)}` : null,
    duration: Math.round(track.duration / 1000),
    permalink_url: track.permalink_url,
    stream_url: `/api/search/stream?url=${encodeURIComponent(track.permalink_url)}`,
    is_external: false 
  };
}

// Вспомогательная функция поиска
async function searchSoundCloud(q, offset = 0) {
  const searchResult = await scdl.search({
    query: q, resourceType: 'tracks', limit: 50, offset: offset
  });

  return searchResult.collection
    .filter(track => track.duration < 900000)
    .map(track => formatTrack(track));
}

// 1. Рекомендации
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

// 2. Поиск
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

// 3. Инфо (длительность)
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

// 5. Моя волна
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

// 6. История
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

// 7. Статистика
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

// 8. ИМПОРТ ИЗ SOUNDCLOUD (Гибридный метод: API -> Jina HTML -> Jina Text)
router.get('/import-likes', async (req, res) => {
  let rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: 'Ссылка не передана' });

  let url = rawUrl.split('?')[0].split('#')[0].replace(/\/$/, '');
  url = url.replace('/likes', '');

  try {
    if (url.includes('on.soundcloud.com')) {
      try {
        const info = await scdl.getInfo(url);
        if (info && info.permalink_url) {
          url = info.permalink_url.split('?')[0].replace(/\/$/, '');
        }
      } catch (e) {
        return res.status(400).json({ error: 'Не удалось открыть короткую ссылку. Скопируйте полную ссылку профиля.' });
      }
    }

    if (url.includes('/sets/')) {
      const playlist = await scdl.getSetInfo(url);
      const tracks = playlist.tracks.map(track => formatTrack(track));
      return res.json({ tracks });
    }

    const parts = url.replace('https://soundcloud.com/', '').replace('http://soundcloud.com/', '').split('/');
    if (parts.length >= 2) {
      const info = await scdl.getInfo(url);
      return res.json({ tracks: [formatTrack(info)] });
    }

    // ПРОФИЛЬ (Лайки)
    const username = parts[0];
    console.log(`[SoundCloud Import] Начинаем импорт лайков для: ${username}`);
    
    let tracks = [];
    let success = false;

    // --- СПОСОБ 1: API v2 (Самый быстрый и надежный, достает все сразу) ---
    try {
      if (!scdl.client_id) {
        await scdl.search({ query: 'test', resourceType: 'tracks', limit: 1 }).catch(() => {});
      }
      const clientId = scdl.client_id;
      if (clientId) {
        console.log(`[SoundCloud Import] Способ 1: API v2 (Client ID: ${clientId.substring(0, 5)}...)`);
        const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=https://soundcloud.com/${username}&client_id=${clientId}`;
        
        const userRes = await axios.get(`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(resolveUrl)}`, { timeout: 10000 });
        
        if (userRes.data && userRes.data.id) {
          const likesUrl = `https://api-v2.soundcloud.com/users/${userRes.data.id}/likes?client_id=${clientId}&limit=100`;
          const likesRes = await axios.get(`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(likesUrl)}`, { timeout: 10000 });
          
          if (likesRes.data && likesRes.data.collection) {
            const rawTracks = likesRes.data.collection.map(item => item.track || item).filter(Boolean);
            tracks = rawTracks.filter(t => t && t.duration < 900000).map(track => formatTrack(track));
            if (tracks.length > 0) {
              success = true;
              console.log(`[SoundCloud Import] Способ 1 успешно вернул ${tracks.length} треков`);
            }
          }
        }
      }
    } catch (e) {
      console.log(`[SoundCloud Import] Способ 1 (API) не сработал: ${e.message}`);
    }

    // --- СПОСОБ 2: Jina AI HTML (Если API заблокирован, парсим HTML страницы) ---
    if (!success) {
      try {
        console.log(`[SoundCloud Import] Способ 2: Jina AI HTML`);
        const jinaUrl = `https://r.jina.ai/https://soundcloud.com/${username}/likes`;
        const jinaRes = await axios.get(jinaUrl, { 
          headers: { 
            'Accept': 'text/html',
            'X-Return-Format': 'html' 
          }, 
          timeout: 20000 
        });
        let html = jinaRes.data;
        
        if (html && typeof html === 'string' && html.includes('window.__sc_hydration')) {
           const startStr = 'window.__sc_hydration = ';
           const startIndex = html.indexOf(startStr);
           const endIndex = html.indexOf('</script>', startIndex);
           let jsonStr = html.substring(startIndex + startStr.length, endIndex).trim();
           if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1);

           const hydration = JSON.parse(jsonStr);
           const likesData = hydration.find(item => item.hydratable === 'likes');
           
           if (likesData && likesData.data && likesData.data.collection) {
             const rawTracks = likesData.data.collection.map(item => item.track || item).filter(Boolean);
             tracks = rawTracks.filter(t => t && t.duration < 900000).map(track => formatTrack(track));
             if (tracks.length > 0) {
               success = true;
               console.log(`[SoundCloud Import] Способ 2 успешно вернул ${tracks.length} треков (первая страница)`);
             }
           }
        }
      } catch (e) {
        console.log(`[SoundCloud Import] Способ 2 (Jina HTML) не сработал: ${e.message}`);
      }
    }

    // --- СПОСОБ 3: Jina AI Text (Твой старый рабочий код, достает первые 10-20) ---
    if (!success) {
      try {
        console.log(`[SoundCloud Import] Способ 3: Jina AI Text (ссылки)`);
        const jinaUrl = `https://r.jina.ai/https://soundcloud.com/${username}/likes`;
        const jinaRes = await axios.get(jinaUrl, { headers: { 'Accept': 'text/plain' }, timeout: 20000 });
        const text = jinaRes.data;
        
        const urlMatches = text.match(/https:\/\/soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/g) || [];
        const trackUrls = [...new Set(urlMatches)].filter(u => {
          const p = u.replace('https://soundcloud.com/', '').split('/');
          return p.length === 2 && !['likes', 'sets', 'reposts', 'tracks', 'albums'].includes(p[1]);
        });

        if (trackUrls.length > 0) {
          for (const trackUrl of trackUrls.slice(0, 40)) {
            try {
              const info = await scdl.getInfo(trackUrl);
              tracks.push(formatTrack(info));
            } catch (e) {}
          }
        }
        if (tracks.length > 0) {
          success = true;
          console.log(`[SoundCloud Import] Способ 3 успешно вернул ${tracks.length} треков`);
        }
      } catch (e) {
        console.log(`[SoundCloud Import] Способ 3 (Jina Text) не сработал: ${e.message}`);
      }
    }

    if (success && tracks.length > 0) {
      return res.json({ tracks });
    } else {
      throw new Error('Все методы импорта исчерпаны');
    }

  } catch (err) { 
    console.error('Ошибка импорта SoundCloud:', err.message);
    res.status(400).json({ error: 'SoundCloud заблокировал все запросы с сервера. Попробуйте позже или используйте импорт текстом.' }); 
  }
});

// 9. ИМПОРТ ИЗ ЯНДЕКСА
router.get('/import-yandex', async (req, res) => {
  const url = req.query.url;
  if (!url || !url.includes('music.yandex.ru')) return res.status(400).json({ error: 'Ссылка не с Яндекса' });

  let parsedTracks = [];
  let apiUrl = null;
  
  if (url.includes('/users/')) {
    const match = url.match(/users\/([^/]+)\/playlists\/(\d+)/);
    if (match) apiUrl = `https://music.yandex.ru/handlers/playlist.jsx?owner=${match[1]}&kinds=${match[2]}&lang=ru`;
  } else if (url.includes('/playlists/')) {
    const match = url.match(/playlists\/([a-zA-Z0-9-]+)/);
    if (match) apiUrl = `https://music.yandex.ru/handlers/playlist.jsx?uuid=${match[1]}&lang=ru`;
  }

  if (apiUrl) {
    const PROXIES = [
      `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(apiUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`
    ];

    for (const proxyUrl of PROXIES) {
      try {
        const response = await axios.get(proxyUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, timeout: 8000 });
        if (response.data && response.data.playlist && response.data.playlist.tracks) {
          parsedTracks = response.data.playlist.tracks;
          break;
        }
      } catch (err) {}
    }
  }

  if (parsedTracks.length === 0) {
    try {
      const jinaUrl = `https://r.jina.ai/${url}`;
      const response = await axios.get(jinaUrl, { headers: { 'Accept': 'text/plain' }, timeout: 30000 });
      const lines = response.data.split('\n');
      for (const line of lines) {
        const cleanLine = line.replace(/\[|\]\(.*?\)|\d+\.\s*/g, '').trim();
        if (cleanLine.includes(' - ') && cleanLine.length > 3 && cleanLine.length < 150 && !cleanLine.includes('http')) {
          const parts = cleanLine.split(' - ');
          if (parts.length >= 2) parsedTracks.push({ title: parts[1].trim(), artists: [{ name: parts[0].trim() }] });
        }
      }
    } catch (err) {}
  }

  if (parsedTracks.length === 0) return res.status(404).json({ error: 'Яндекс блокирует запросы. Используйте текст.' });

  const tracks = [];
  for (const track of parsedTracks) {
    if (!track.title) continue;
    const artist = track.artists ? track.artists.map(a => a.name).join(', ') : 'Неизвестен';
    try {
      const found = await searchSoundCloud(`${artist} - ${track.title}`);
      if (found.length > 0) tracks.push(found[0]);
    } catch (e) {}
  }

  if (tracks.length === 0) return res.status(404).json({ error: 'Ничего не найдено в SoundCloud.' });
  res.json({ tracks });
});

// 10. ИМПОРТ ИЗ ТЕКСТА
router.post('/import-text', async (req, res) => {
  const { text } = req.body;
  if (!text || text.length < 5) return res.status(400).json({ error: 'Вставьте список' });

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
  const tracks = [];

  for (const line of lines) {
    try {
      const found = await searchSoundCloud(line);
      if (found.length > 0) tracks.push(found[0]);
    } catch (e) {}
  }

  if (tracks.length === 0) return res.status(404).json({ error: 'Ничего не найдено. Формат: Артист - Название' });
  res.json({ tracks });
});

// 11. Прокси картинок
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

// 12. Стриминг
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