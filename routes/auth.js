import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db/pool.js';
import nodemailer from 'nodemailer';
import 'dotenv/config';

const router = Router();

// Настройка почтового транспорта (данные берутся из Render -> Environment)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT || 465,
  secure: true, // true для порта 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Схема валидации
const authSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Пароль должен быть минимум 6 символов')
});

// РЕГИСТРАЦИЯ
router.post('/register', async (req, res) => {
  try {
    const data = authSchema.parse(req.body);
    
    // Проверяем, есть ли уже такой email
    const existing = await query('SELECT id FROM users WHERE email = $1', [data.email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Этот email уже занят' });
    }

    // Хешируем пароль
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(data.password, salt);

    // Создаём пользователя
    const result = await query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [data.email, hash, 'user']
    );
    const user = result.rows[0];

    // Генерируем токен
    const token = jwt.sign(
      { id: user.id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' } 
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({ user });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error('Ошибка регистрации:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ВХОД
router.post('/login', async (req, res) => {
  try {
    const data = authSchema.parse(req.body);

    const result = await query('SELECT * FROM users WHERE email = $1', [data.email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(data.password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error('Ошибка входа:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ВЫХОД
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Выход выполнен' });
});

// ПОЛУЧИТЬ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ
router.get('/me', async (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Неавторизован' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query('SELECT id, email, role FROM users WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0) throw new Error('User not found');
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(401).json({ error: 'Неверный токен' });
  }
});

// ЗАПРОС НА СБРОС ПАРОЛЯ (Отправка кода на почту)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const userRes = await query('SELECT id FROM users WHERE email = $1', [email]);
    
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь с такой почтой не найден' });
    }

    // Генерируем случайный 6-значный код
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // Код живет 15 минут

    await query(
      'UPDATE users SET reset_code = $1, reset_code_expires = $2 WHERE email = $3',
      [code, expires, email]
    );

    // Отправляем письмо
    await transporter.sendMail({
      from: `"Muzlo" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Сброс пароля на Muzlo',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #121212; color: white; border-radius: 10px;">
          <h2 style="color: #1db954;">Восстановление пароля</h2>
          <p>Ваш код для сброса пароля:</p>
          <h1 style="font-size: 32px; letter-spacing: 5px; color: #1db954;">${code}</h1>
          <p>Код действителен в течение 15 минут. Если вы не запрашивали сброс, просто проигнорируйте это письмо.</p>
        </div>
      `
    });

    res.json({ success: true, message: 'Код отправлен на почту' });
  } catch (err) {
    console.error('Ошибка отправки почты:', err);
    res.status(500).json({ error: 'Ошибка при отправке письма. Проверьте настройки почты.' });
  }
});

// УСТАНОВКА НОВОГО ПАРОЛЯ (по коду)
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });

    const userRes = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });

    const user = userRes.rows[0];
    
    // Проверяем код и время
    if (user.reset_code !== code) {
      return res.status(400).json({ error: 'Неверный код' });
    }
    if (new Date() > new Date(user.reset_code_expires)) {
      return res.status(400).json({ error: 'Срок действия кода истек' });
    }

    // Хешируем новый пароль
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    // Обновляем пароль и очищаем код
    await query(
      'UPDATE users SET password_hash = $1, reset_code = NULL, reset_code_expires = NULL WHERE email = $2',
      [hash, email]
    );

    res.json({ success: true, message: 'Пароль успешно изменен' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сброса пароля' });
  }
});

// СМЕНА ПАРОЛЯ (в профиле)
router.post('/change-password', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Неавторизован' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Новый пароль должен быть минимум 6 символов' });

    const userRes = await query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const user = userRes.rows[0];

    // Проверяем старый пароль
    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Неверный текущий пароль' });

    // Хешируем новый
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
    res.json({ success: true, message: 'Пароль изменен' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка смены пароля' });
  }
});

export default router;