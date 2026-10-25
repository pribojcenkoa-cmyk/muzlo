import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { parseFile } from 'music-metadata';
import { query } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

const getOrCreateArtist = async (name) => {
  let res = await query('SELECT id FROM artists WHERE name = $1', [name]);
  if (res.rows.length > 0) return res.rows[0].id;
  res = await query('INSERT INTO artists (name) VALUES ($1) RETURNING id', [name]);
  return res.rows[0].id;
};

const getOrCreateAlbum = async (title, artistId, coverUrl) => {
  let res = await query('SELECT id FROM albums WHERE title = $1 AND artist_id = $2', [title, artistId]);
  if (res.rows.length > 0) return res.rows[0].id;
  res = await query('INSERT INTO albums (title, artist_id, cover_url) VALUES ($1, $2, $3) RETURNING id', [title, artistId, coverUrl]);
  return res.rows[0].id;
};

// 1. ЗАГРУЗКА ТРЕКА (только для админа)
router.post('/upload', requireAuth, requireAdmin, upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), async (req, res) => {
  try {
    if (!req.files || !req.files.audio) {
      return res.status(400).json({ error: 'Аудиофайл обязателен' });
    }

    const audioFile = req.files.audio[0];
    const coverFile = req.files.cover ? req.files.cover[0] : null;
    let { title, artist, album } = req.body;

    const metadata = await parseFile(audioFile.path);
    const duration = Math.round(metadata.format.duration || 0);
    
    title = title || metadata.common.title || 'Без названия';
    artist = artist || metadata.common.artist || 'Неизвестный исполнитель';
    album = album || metadata.common.album || 'Сингл';

    const artistId = await getOrCreateArtist(artist);
    const coverUrl = coverFile ? `/storage/covers/${coverFile.filename}` : null;
    const albumId = await getOrCreateAlbum(album, artistId, coverUrl);
    const fileUrl = `/storage/audio/${audioFile.filename}`;

    const trackResult = await query(
      'INSERT INTO tracks (album_id, title, duration, file_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [albumId, title, duration, fileUrl]
    );

    res.status(201).json({ message: 'Трек загружен', track: trackResult.rows[0] });
  } catch (err) {
    console.error(err);
    if (req.files?.audio) fs.unlinkSync(req.files.audio[0].path);
    if (req.files?.cover) fs.unlinkSync(req.files.cover[0].path);
    res.status(500).json({ error: 'Ошибка при загрузке' });
  }
});

// 2. ПОЛУЧЕНИЕ СПИСКА ТРЕКОВ
router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT t.id, t.title, t.duration, t.file_url, t.plays_count,
             a.title AS album_title, a.cover_url, ar.name AS artist_name
      FROM tracks t
      LEFT JOIN albums a ON t.album_id = a.id
      LEFT JOIN artists ar ON a.artist_id = ar.id
      ORDER BY t.created_at DESC
    `);
    res.json({ tracks: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения списка' });
  }
});

// 3. СТРИМИНГ (с поддержкой перемотки)
router.get('/:id/stream', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT file_url FROM tracks WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Трек не найден' });
    
    query('UPDATE tracks SET plays_count = plays_count + 1 WHERE id = $1', [id]).catch(console.error);

    const fileUrl = result.rows[0].file_url; 
    const absolutePath = path.resolve('.' + fileUrl);
    
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'Файл не найден на диске' });
    res.sendFile(absolutePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка стриминга' });
  }
});

export default router;