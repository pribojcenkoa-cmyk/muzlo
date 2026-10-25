import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log('⏳ Подключаемся к Neon и создаем таблицы...');
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Таблицы успешно созданы (включая listening_history)');
    process.exit(0);
  } catch (err) {
    console.error('❌ Ошибка миграции:', err.message);
    process.exit(1);
  }
}

migrate();