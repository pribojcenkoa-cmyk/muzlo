import { query } from './pool.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const scdl = require('soundcloud-downloader').default;
import 'dotenv/config';

async function migrateGenres() {
  console.log('=== НАЧАЛО МИГРАЦИИ ЖАНРОВ ===');
  
  try {
    // Берем треки, которые мы еще НЕ проверяли (genre_checked = false)
    const result = await query(`
      SELECT DISTINCT ON (track_id) track_id, title, artist_name 
      FROM (
        SELECT track_id, title, artist_name FROM user_library WHERE genre IS NULL AND genre_checked = false
        UNION ALL
        SELECT track_id, title, artist_name FROM listening_history WHERE genre IS NULL AND genre_checked = false
      ) AS combined
      WHERE title NOT LIKE '%<%>%'
      LIMIT 50
    `);

    const tracks = result.rows;
    console.log(`Найдено треков для проверки: ${tracks.length}`);

    if (tracks.length === 0) {
      console.log('Все треки уже проверены! Миграция не нужна.');
      process.exit(0);
    }

    let updatedCount = 0;

    for (const track of tracks) {
      try {
        const cleanTitle = track.title
          .replace(/\(.*?\)/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/[<>]/g, '')
          .replace(/\.com|vk\.com/g, '')
          .trim();
          
        const cleanArtist = track.artist_name.replace(/[<>]/g, '').trim();
        const searchQuery = `${cleanArtist} ${cleanTitle}`.substring(0, 80);
        
        console.log(`Ищем: ${searchQuery}`);
        
        let genre = null;

        try {
          const searchRes = await scdl.search({
            query: searchQuery,
            resourceType: 'tracks',
            limit: 1
          });

          if (searchRes.collection && searchRes.collection.length > 0) {
            const foundTrack = searchRes.collection[0];
            const info = await scdl.getInfo(foundTrack.permalink_url);
            
            genre = info.genre || null;

            if (genre && (genre.includes('<') || genre.includes('>') || genre.length > 40)) {
              genre = null;
            }

            if (!genre && info.tag_list) {
              const tags = info.tag_list.split(' ').filter(t => t.length > 2 && !t.includes('<'));
              if (tags.length > 0) genre = tags[0];
            }
          }
        } catch (e) {
          // Если ошибка сети, просто оставляем genre = null
        }

        if (genre) {
          console.log(`  -> Жанр: ${genre}`);
          await query('UPDATE user_library SET genre = $1, genre_checked = true WHERE track_id = $2', [genre, track.track_id]);
          await query('UPDATE listening_history SET genre = $1, genre_checked = true WHERE track_id = $2', [genre, track.track_id]);
          updatedCount++;
        } else {
          console.log(`  -> Жанр не найден (помечаем как проверенный)`);
          // Помечаем, что проверили, но жанра нет. Больше не будем искать.
          await query('UPDATE user_library SET genre_checked = true WHERE track_id = $1', [track.track_id]);
          await query('UPDATE listening_history SET genre_checked = true WHERE track_id = $1', [track.track_id]);
        }

        await new Promise(r => setTimeout(r, 1500));

      } catch (err) {
        console.error(`  -> Ошибка: ${err.message}`);
      }
    }

    console.log('=== МИГРАЦИЯ ЗАВЕРШЕНА ===');
    console.log(`Обновлено жанров: ${updatedCount}`);
    console.log(`Треков проверено и помечено: ${tracks.length}`);
    process.exit(0);

  } catch (err) {
    console.error('Критическая ошибка миграции:', err);
    process.exit(1);
  }
}

migrateGenres();