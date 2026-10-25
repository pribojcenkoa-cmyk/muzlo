import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

const audioDir = path.resolve('storage/audio');
const coverDir = path.resolve('storage/covers');
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
if (!fs.existsSync(coverDir)) fs.mkdirSync(coverDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'audio') cb(null, audioDir);
    else if (file.fieldname === 'cover') cb(null, coverDir);
    else cb(new Error('Неизвестное поле'), null);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'audio') {
    const allowed = ['audio/mpeg', 'audio/wav', 'audio/ogg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Только MP3, WAV, OGG'), false);
  } else if (file.fieldname === 'cover') {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Только JPG, PNG, WEBP'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 2024 * 2024 } // 50 МБ
});
