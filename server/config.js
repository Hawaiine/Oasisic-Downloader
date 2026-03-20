/**
 * server/config.js
 *
 * CRITICAL FIX: Must load dotenv BEFORE reading process.env.PORT.
 * Previously dotenv was not called, so PORT from server/.env was invisible
 * to the Node process when started by PM2. The port always fell back to 3000.
 *
 * Load order:
 *   1. require('dotenv').config({ path }) — injects server/.env into process.env
 *   2. Read PORT from process.env.PORT    — now correctly reflects .env value
 *   3. Auto-detect binary paths
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Step 1: Load .env FIRST ───────────────────────────────────────────────────
// Path is relative to this file (server/config.js → server/.env)
const ENV_PATH = path.join(__dirname, '.env');
require('dotenv').config({ path: ENV_PATH });

// Confirm the port that was loaded (helpful for debugging)
console.log(`[config] PORT from .env = ${process.env.PORT || '(not set, using 3000)'}`);

// ── Binary auto-detection ─────────────────────────────────────────────────────

function detectBin(name, fallbacks = []) {
  try {
    const found = execSync(`which ${name}`, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
    if (found) return found;
  } catch (_) {}
  for (const p of fallbacks) {
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (_) {}
  }
  console.warn(`[config] WARNING: Could not locate '${name}'; using bare name.`);
  return name;
}

const FFMPEG_PATH = detectBin('ffmpeg',  ['/usr/bin/ffmpeg',  '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg']);
const FFMPEG_DIR  = path.dirname(FFMPEG_PATH); // MUST pass dir to --ffmpeg-location, not full path

const FFPROBE_PATH = detectBin('ffprobe', ['/usr/bin/ffprobe', '/usr/local/bin/ffprobe']);
const YTDLP_PATH   = detectBin('yt-dlp',  ['/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp', `${process.env.HOME || '/root'}/.local/bin/yt-dlp`]);
const ARIA2C_PATH  = detectBin('aria2c',  ['/usr/bin/aria2c', '/usr/local/bin/aria2c']);

// ── Directories ───────────────────────────────────────────────────────────────

const ROOT_DIR      = path.resolve(__dirname, '..');
const DOWNLOADS_DIR = path.join(ROOT_DIR, 'downloads');
const TEMP_DIR      = path.join(ROOT_DIR, 'tmp');
const LOGS_DIR      = path.join(ROOT_DIR, 'logs');
const CLIENT_BUILD  = path.join(ROOT_DIR, 'client', 'dist');

for (const dir of [DOWNLOADS_DIR, TEMP_DIR, LOGS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// ── Export ────────────────────────────────────────────────────────────────────

const CONFIG = Object.freeze({
  // PORT is now correctly loaded from .env via dotenv above
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  FFMPEG_PATH,
  FFMPEG_DIR,
  FFPROBE_PATH,
  YTDLP_PATH,
  ARIA2C_PATH,

  ROOT_DIR,
  DOWNLOADS_DIR,
  TEMP_DIR,
  LOGS_DIR,
  CLIENT_BUILD,

  MAX_CONCURRENT_DOWNLOADS: 5,
  AUDIO_QUALITY: '0',

  AUDIO_FORMATS: ['flac', 'alac', 'm4a', 'mp3', 'wav', 'aac', 'opus'],
  VIDEO_FORMATS: ['mp4', 'mkv'],
  VIDEO_QUALITY: {
    '4k':   'bestvideo[height<=2160]+bestaudio/best[height<=2160]',
    '2k':   'bestvideo[height<=1440]+bestaudio/best[height<=1440]',
    '1080p':'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '720p': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
    '480p': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
  },

  COVER_SIZE:    1000,
  COVER_QUALITY: 95,

  APPLE_MUSIC_TOKEN:     process.env.APPLE_MUSIC_TOKEN     || null,
  SPOTIFY_CLIENT_ID:     process.env.SPOTIFY_CLIENT_ID     || null,
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || null,
});

console.log(`[config] Server will listen on PORT=${CONFIG.PORT}`);
console.log(`[config] ffmpeg  → ${FFMPEG_PATH} (dir: ${FFMPEG_DIR})`);
console.log(`[config] yt-dlp  → ${YTDLP_PATH}`);

module.exports = CONFIG;
