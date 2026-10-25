import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// 1. Сохранить трек в медиатеку
router.post('/', requireAuth, async (req, res) => {
  try {
    const { track_id, title, artist_name, cover_url, duration, stream_url } = req.body;
    const userId = req.user.id;

    if (!track_id || !stream_url) {
      return res.status(400).json({ error: 'Не хватает данных о треке' });
    }

    await query(
      `INSERT INTO user_library (user_id, track_id, title, artist_name, cover_url, duration, stream_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [userId, track_id, title, artist_name, cover_url, duration, stream_url]
    );

    res.status(201).json({ message: 'Трек сохранен' });
  } catch (err) {
    console.error('Ошибка сохранения в библиотеку:', err);
    res.status(500).json({ error: 'Ошибка при сохранении: ' + err.message });
  }
});

// 2. Получить медиатеку пользователя
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT track_id as id, title, artist_name, cover_url, duration, stream_url as file_url, true as is_external
       FROM user_library WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ tracks: result.rows });
  } catch (err) {
    console.error('Ошибка получения медиатеки:', err);
    res.status(500).json({ error: 'Ошибка получения медиатеки' });
  }
});

// 3. Удалить трек из медиатеки
router.delete('/:trackId', requireAuth, async (req, res) => {
  try {
    const trackId = req.params.trackId;
    const userId = req.user.id;

    await query(
      'DELETE FROM user_library WHERE user_id = $1 AND track_id = $2',
      [userId, trackId]
    );

    res.json({ message: 'Трек удален' });
  } catch (err) {
    console.error('Ошибка удаления:', err);
    res.status(500).json({ error: 'Ошибка при удалении' });
  }
});

export default router;