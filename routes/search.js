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

function formatTrack(track) {
  if (!track) return null;
  let cover = track.artwork_url || (track.user && track.user.avatar_url);
  if (cover) cover = cover.replace('large', 't500x500');
  return {
    id: track.id,
    title: track.title || 'Без названия',
    artist_name: track.user ? track.user.username : 'Неизвестен',
    genre: track.genre || null,
    cover_url: cover ? `/api/search/cover?url=${encodeURIComponent(cover)}` : null,
    duration: Math.round((track.duration || 0) / 1000),
    permalink_url: track.permalink_url,
    stream_url: track.permalink_url ? `/api/search/stream?url=${encodeURIComponent(track.permalink_url)}` : null,
    is_external: false 
  };
}

async function searchSoundCloud(q, offset = 0) {
  try {
    const searchResult = await scdl.search({
      query: q, resourceType: 'tracks', limit: 50, offset: offset
    });
    return searchResult.collection
      .filter(track => track.duration < 900000)
      .map(track => formatTrack(track));
  } catch (e) {
    return [];
  }
}

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

router.get('/', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ tracks: [], albums: [] });
  
  try {
    const [tracks, playlistsRes] = await Promise.all([
      searchSoundCloud(q),
      scdl.search({ query: q, resourceType: 'playlists', limit: 20 }).catch(() => ({ collection: [] }))
    ]);

    const albums = playlistsRes.collection
      .filter(pl => pl.permalink_url)
      .map(pl => {
        let cover = pl.artwork_url || (pl.user && pl.user.avatar_url);
        if (cover) cover = cover.replace('large', 't500x500');
        return {
          id: pl.id, title: pl.title, artist_name: pl.user ? pl.user.username : 'Неизвестен',
          cover_url: cover ? `/api/search/cover?url=${encodeURIComponent(cover)}` : null,
          track_count: pl.track_count, permalink_url: pl.permalink_url, is_album: true
        };
      });

    res.json({ tracks, albums });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

router.get('/album', async (req, res) => {
  try {
    let albumUrl = req.query.url;
    if (!albumUrl || albumUrl === 'undefined') return res.status(400).json({ error: 'URL не передан' });
    albumUrl = albumUrl.split('?')[0];
    
    try {
      const playlist = await scdl.getSetInfo(albumUrl);
      if (playlist && playlist.tracks && playlist.tracks.length > 0) {
        const validTracks = playlist.tracks.filter(t => t && t.permalink_url).map(track => formatTrack(track)).filter(Boolean);
        if (validTracks.length > 0) return res.json({ tracks: validTracks });
      }
    } catch (e) {}

    try {
      const jinaUrl = `https://r.jina.ai/${albumUrl}`;
      const jinaRes = await axios.get(jinaUrl, { headers: { 'Accept': 'text/plain' }, timeout: 15000 });
      const text = jinaRes.data;
      const urlMatches = text.match(/https:\/\/soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/g) || [];
      const trackUrls = [...new Set(urlMatches)].filter(u => {
        const p = u.replace('https://soundcloud.com/', '').split('/');
        return p.length === 2 && !['likes', 'sets', 'reposts', 'tracks', 'albums'].includes(p[1]);
      });
      if (trackUrls.length > 0) {
        const tracks = [];
        for (const tUrl of trackUrls) {
          try { const info = await scdl.getInfo(tUrl); const formatted = formatTrack(info); if (formatted) tracks.push(formatted); } catch (e) {}
        }
        if (tracks.length > 0) return res.json({ tracks });
      }
    } catch (e) {}
    
    throw new Error('Все методы исчерпаны');
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки альбома.' });
  }
});

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

router.get('/my-wave', requireAuth, async (req, res) => {
  try {
    const libraryRes = await query('SELECT track_id FROM user_library WHERE user_id = $1', [req.user.id]);
    const likedTrackIds = new Set(libraryRes.rows.map(r => String(r.track_id)));

    const genresRes = await query(
      `SELECT genre, COUNT(*) as count 
       FROM (
         SELECT genre FROM listening_history WHERE user_id = $1 AND genre IS NOT NULL AND genre != ''
         UNION ALL
         SELECT genre FROM user_library WHERE user_id = $1 AND genre IS NOT NULL AND genre != ''
       ) as all_genres
       GROUP BY genre ORDER BY count DESC LIMIT 5`,
      [req.user.id]
    );
    
    let topGenres = genresRes.rows.map(r => r.genre);

    if (topGenres.length === 0) {
      const topHistory = await query(
        `SELECT artist_name, COUNT(*) as play_count FROM listening_history 
         WHERE user_id = $1 AND artist_name IS NOT NULL GROUP BY artist_name ORDER BY play_count DESC LIMIT 5`, 
        [req.user.id]);
      const topLiked = await query(
        `SELECT DISTINCT artist_name FROM user_library 
         WHERE user_id = $1 AND artist_name IS NOT NULL LIMIT 5`, 
        [req.user.id]);
      topGenres = [...new Set([
        ...topHistory.rows.map(r => r.artist_name),
        ...topLiked.rows.map(r => r.artist_name)
      ])];
    }

    if (topGenres.length === 0) {
      topGenres = POPULAR_ARTISTS.sort(() => 0.5 - Math.random()).slice(0, 5);
    }

    let allTracks = [];
    for (const queryStr of topGenres) {
      try {
        const randomOffset = Math.floor(Math.random() * 30);
        const tracks = await searchSoundCloud(queryStr, randomOffset);
        const newTracks = tracks.filter(t => !likedTrackIds.has(String(t.id)));
        allTracks = allTracks.concat(newTracks.sort(() => 0.5 - Math.random()).slice(0, 10));
      } catch (e) {}
    }

    if (allTracks.length === 0) {
      const randomArtist = POPULAR_ARTISTS[Math.floor(Math.random() * POPULAR_ARTISTS.length)];
      const fallbackTracks = await searchSoundCloud(randomArtist);
      allTracks = fallbackTracks.filter(t => !likedTrackIds.has(String(t.id)));
    }

    const shuffled = allTracks.sort(() => 0.5 - Math.random()).slice(0, 40);
    res.json({ tracks: shuffled });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка генерации волны' });
  }
});

router.post('/history', requireAuth, async (req, res) => {
  try {
    const { track_id, title, artist_name, duration, genre } = req.body;
    if (!track_id) return res.status(400).json({ error: 'Нет ID трека' });
    await query(
      'INSERT INTO listening_history (user_id, track_id, title, artist_name, duration, genre) VALUES ($1, $2, $3, $4, $5, $6)', 
      [req.user.id, String(track_id), title, artist_name, duration, genre || null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения истории' });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const totalTime = await query('SELECT SUM(duration) as total FROM listening_history WHERE user_id = $1', [req.user.id]);
    const topArtists = await query(`SELECT artist_name, COUNT(*) as count FROM listening_history WHERE user_id = $1 AND artist_name IS NOT NULL GROUP BY artist_name ORDER BY count DESC LIMIT 5`, [req.user.id]);
    const topTracks = await query(`SELECT title, artist_name, COUNT(*) as count FROM listening_history WHERE user_id = $1 GROUP BY title, artist_name ORDER BY count DESC LIMIT 5`, [req.user.id]);
    res.json({
      total_seconds: parseInt(totalTime.rows[0].total || 0),
      top_artists: topArtists.rows,
      top_tracks: topTracks.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

router.get('/import-likes', async (req, res) => {
  let rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: 'Ссылка не передана' });
  let url = rawUrl.split('?')[0].split('#')[0].replace(/\/$/, '').replace('/likes', '');
  try {
    if (url.includes('on.soundcloud.com')) {
      try {
        const info = await scdl.getInfo(url);
        if (info && info.permalink_url) url = info.permalink_url.split('?')[0].replace(/\/$/, '');
      } catch (e) {
        return res.status(400).json({ error: 'Не удалось открыть короткую ссылку.' });
      }
    }
    if (url.includes('/sets/')) {
      const playlist = await scdl.getSetInfo(url);
      return res.json({ tracks: playlist.tracks.map(track => formatTrack(track)).filter(Boolean) });
    }
    const parts = url.replace('https://soundcloud.com/', '').replace('http://soundcloud.com/', '').split('/');
    if (parts.length >= 2) {
      const info = await scdl.getInfo(url);
      return res.json({ tracks: [formatTrack(info)] });
    }
    const username = parts[0];
    let tracks = [];
    try {
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
          try { const info = await scdl.getInfo(trackUrl); tracks.push(formatTrack(info)); } catch (e) {}
        }
      }
    } catch (jinaErr) {}
    
    if (tracks.length > 0) return res.json({ tracks });
    throw new Error('Не удалось найти треки');
  } catch (err) { 
    res.status(400).json({ error: 'SoundCloud заблокировал запросы.' }); 
  }
});

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
  if (parsedTracks.length === 0) return res.status(404).json({ error: 'Яндекс блокирует запросы.' });
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

router.post('/import-text', async (req, res) => {
  const { text } = req.body;
  if (!text || text.length < 5) return res.status(400).json({ error: 'Вставьте список' });
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
  const tracks = [];
  for (const line of lines) {
    try { const found = await searchSoundCloud(line); if (found.length > 0) tracks.push(found[0]); } catch (e) {}
  }
  if (tracks.length === 0) return res.status(404).json({ error: 'Ничего не найдено.' });
  res.json({ tracks });
});

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

// 12. СТРИМИНГ (ТОЛЬКО СТАРЫЙ ДОБРЫЙ SCDL.DOWNLOAD)
router.get('/stream', async (req, res) => {
  try {
    const trackUrl = req.query.url;
    if (!trackUrl) throw new Error('Ссылка не передана');
    const stream = await scdl.download(trackUrl);
    res.setHeader('Content-Type', 'audio/mpeg');
    stream.pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Ошибка стриминга');
  }
});

export default router;
