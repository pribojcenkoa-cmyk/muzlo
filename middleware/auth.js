import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import 'dotenv/config';

export const requireAuth = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Неавторизован' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Обновляем время последней активности (не чаще раза в минуту, чтобы не спамить БД)
    query(
      `UPDATE users SET last_seen = CURRENT_TIMESTAMP 
       WHERE id = $1 AND (last_seen IS NULL OR last_seen < CURRENT_TIMESTAMP - INTERVAL '1 minute')`,
      [decoded.id]
    ).catch(() => {});

    next();
  } catch (err) {
    res.status(401).json({ error: 'Неверный или истекший токен' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён (только для админа)' });
  }
  next();
};