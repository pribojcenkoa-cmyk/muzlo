import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Статистика для админ-панели
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Онлайн: были активны за последние 5 минут
    const online = await query(
      `SELECT COUNT(*) as count FROM users 
       WHERE last_seen > CURRENT_TIMESTAMP - INTERVAL '5 minutes'`
    );

    // Всего пользователей
    const totalUsers = await query('SELECT COUNT(*) as count FROM users');

    // Всего прослушано треков за сутки
    const playsToday = await query(
      `SELECT COUNT(*) as count FROM listening_history 
       WHERE played_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'`
    );

    // Онлайн-список (для отображения конкретных пользователей)
    const onlineList = await query(
      `SELECT email, last_seen FROM users 
       WHERE last_seen > CURRENT_TIMESTAMP - INTERVAL '5 minutes'
       ORDER BY last_seen DESC LIMIT 20`
    );

    res.json({
      online: parseInt(online.rows[0].count),
      total_users: parseInt(totalUsers.rows[0].count),
      plays_today: parseInt(playsToday.rows[0].count),
      online_list: onlineList.rows
    });
  } catch (err) {
    console.error('Ошибка админ-статистики:', err);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

export default router;