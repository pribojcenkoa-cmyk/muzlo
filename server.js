import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import 'dotenv/config';
import dns from 'dns';
import { query } from './db/pool.js';

// Принудительно используем IPv4 для стабильности запросов
dns.setDefaultResultOrder('ipv4first');

// Импорт всех роутов
import authRoutes from './routes/auth.js';
import trackRoutes from './routes/tracks.js';
import searchRoutes from './routes/search.js';
import libraryRoutes from './routes/library.js';
import adminRoutes from './routes/admin.js'; // <-- Добавили админку

const app = express();
const PORT = process.env.PORT || 3000;

// Безопасность: разрешаем загрузку внешних картинок и медиа
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Отдача статики
app.use(express.static('public'));
app.use('/storage', express.static('storage'));

// Подключение роутов API
app.use('/api/auth', authRoutes);
app.use('/api/tracks', trackRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/admin', adminRoutes); // <-- Подключили админку ДО app.listen

// Проверка работоспособности
app.get('/api/health', async (req, res) => {
  try {
    const dbCheck = await query('SELECT NOW()');
    res.json({ status: 'ok', db_time: dbCheck.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'База данных недоступна' });
  }
});

// Обработка 404
app.use((req, res) => res.status(404).json({ error: 'Маршрут не найден' }));

// Запуск
app.listen(PORT, () => {
  console.log('=== ДИАГНОСТИКА ===');
  console.log('JWT_SECRET виден серверу:', process.env.JWT_SECRET ? 'ДА' : 'НЕТ');
  console.log('Длина ключа:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0);
  console.log('===================');
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});