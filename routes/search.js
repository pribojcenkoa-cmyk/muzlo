import { Router } from 'express';
import axios from 'axios';
import { createRequire } from 'module';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const require = createRequire(import.meta.url);
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

async function searchSoundCloud(query, offset = 0) {
  const searchResult = await scdl.search({
    query: query, resourceType: 'tracks', limit: 50, offset: offset
  });

  return searchResult.collection
    .filter(track => track.duration < 900000)
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

// 3. Инфо
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

// 5. МОЯ ВОЛНА (Умный рандом по лайкам)
router.get('/my-wave', requireAuth, async (req, res) => {
  try {
    const liked = await query(
      'SELECT artist_name FROM user_library WHERE user_id = $1 ORDER BY RANDOM() LIMIT 3',
      [req.user.id]
    );

    if (liked.rows.length === 0) {
      return res.status(400).json({ error: 'Добавьте треки в медиатеку, чтобы мы поняли ваши вкусы!' });
    }

    const randomArtist = liked.rows[0].artist_name;
    const tracks = await searchSoundCloud(randomArtist);
    const shuffled = tracks.sort(() => 0.5 - Math.random()).slice(0, 20);
    res.json({ tracks: shuffled });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка генерации волны' });
  }
});

// 6. Импорт лайков SoundCloud
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

    const tracks = likesResult.collection
      .filter(track => track.duration < 900000)
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

    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка импорта' });
  }
});

// 7. Прокси картинок
router.get('/cover', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('Нет URL');
    const response = await axios.get(imageUrl, { responseType: 'stream', headers: { 'User-Agent': 'Mozilla/5.0' } });
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    response.data.pipe(res);
  } catch (err) {
    res.redirect('/img/default-cover.png');
  }
});

// 8. Стриминг
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