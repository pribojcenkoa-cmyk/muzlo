import { pool } from './pool.js';

const sql = `
  CREATE TABLE IF NOT EXISTS user_library (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      track_id VARCHAR(255) NOT NULL,
      title TEXT NOT NULL,
      artist_name TEXT,
      cover_url TEXT,
      duration INTEGER,
      stream_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, track_id)
  );
`;

async function run() {
  try {
    console.log('Подключаемся к облачной базе данных...');
    await pool.query(sql);
    console.log('✅ Таблица user_library успешно создана!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  }
}

run();