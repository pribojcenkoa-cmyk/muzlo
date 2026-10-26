import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// --- ТРЕКИ ---

// Получить треки из медиатеки
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM user_library WHERE user_id = $1 ORDER BY added_at DESC', [req.user.id]);
    res.json({ tracks: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения медиатеки' });
  }
});

// Добавить трек
router.post('/', requireAuth, async (req, res) => {
  try {
    const { track_id, title, artist_name, cover_url, duration, stream_url } = req.body;
    const existing = await query('SELECT id FROM user_library WHERE user_id = $1 AND track_id = $2', [req.user.id, track_id]);
    if (existing.rows.length > 0) return res.json({ success: true });

    await query(
      'INSERT INTO user_library (user_id, track_id, title, artist_name, cover_url, duration, stream_url) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [req.user.id, track_id, title, artist_name, cover_url, duration, stream_url]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка добавления трека' });
  }
});

// Удалить трек
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM user_library WHERE user_id = $1 AND track_id = $2', [req.user.id, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления трека' });
  }
});


// --- АЛЬБОМЫ ---

// Получить сохраненные альбомы
router.get('/albums', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM user_albums WHERE user_id = $1 ORDER BY added_at DESC', [req.user.id]);
    res.json({ albums: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения альбомов' });
  }
});

// Сохранить альбом
router.post('/albums', requireAuth, async (req, res) => {
  try {
    const { album_id, title, artist_name, cover_url, track_count, permalink_url } = req.body;
    const existing = await query('SELECT id FROM user_albums WHERE user_id = $1 AND album_id = $2', [req.user.id, album_id]);
    if (existing.rows.length > 0) return res.json({ success: true });

    await query(
      'INSERT INTO user_albums (user_id, album_id, title, artist_name, cover_url, track_count, permalink_url) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [req.user.id, album_id, title, artist_name, cover_url, track_count, permalink_url]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения альбома' });
  }
});

// Удалить альбом
router.delete('/albums/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM user_albums WHERE user_id = $1 AND album_id = $2', [req.user.id, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления альбома' });
  }
});

export default router;