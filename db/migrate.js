import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);

    // Дополнительная миграция для истории прослушиваний
    await pool.query(`
      CREATE TABLE IF NOT EXISTS listening_history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          track_id VARCHAR(255) NOT NULL,
          title VARCHAR(255) NOT NULL,
          artist_name VARCHAR(255),
          duration INTEGER,
          played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Таблицы успешно созданы (включая listening_history)');
    process.exit(0);
  } catch (err) {
    console.error('❌ Ошибка миграции:', err.message);
    process.exit(1);
  }
}

migrate();