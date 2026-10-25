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
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});