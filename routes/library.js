import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Сохранить трек
router.post('/', requireAuth, async (req, res) => {
  try {
    const { track_id, title, artist_name, cover_url, duration, stream_url } = req.body;
    const userId = req.user.id;

    await query(
      `INSERT INTO user_library (user_id, track_id, title, artist_name, cover_url, duration, stream_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [userId, track_id, title, artist_name, cover_url, duration, stream_url]
    );
    res.status(201).json({ message: 'Трек сохранен' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при сохранении' });
  }
});

// Получить медиатеку
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT track_id as id, title, artist_name, cover_url, duration, stream_url as file_url, true as is_external
       FROM user_library WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ tracks: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения медиатеки' });
  }
});

export default router; // ЭТА СТРОКА ОБЯЗАТЕЛЬНА