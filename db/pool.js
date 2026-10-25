import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Если это локальная база (localhost) — SSL не нужен.
  // Если Render или Neon — SSL обязателен.
  ssl: process.env.DATABASE_URL?.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Критическая ошибка БД:', err.message);
  process.exit(-1);
});

export const query = (text, params) => pool.query(text, params);