/**
 * server/services/cover.js
 * Cover art pipeline: find → fetch → crop → embed
 */
'use strict';

const fs         = require('fs');
const path       = require('path');
const https      = require('https');
const { spawn }  = require('child_process');
const sharp      = require('sharp');
const CONFIG     = require('../config');

const YT_THUMBNAIL_URLS = id => [
  `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
  `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
];

function fetchToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req  = https.get(url, res => {
      if (res.statusCode !== 200) {
        res.resume(); file.close();
        fs.unlink(dest, () => {});
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', e => { file.close(); fs.unlink(dest, () => {}); reject(e); });
    req.setTimeout(10000, () => req.destroy(new Error('Timeout')));
  });
}

async function squareCrop(src, dest) {
  const meta = await sharp(src).metadata();
  const size = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width  - size) / 2);
  const top  = Math.floor((meta.height - size) / 2);
  await sharp(src)
    .extract({ left, top, width: size, height: size })
    .resize(CONFIG.COVER_SIZE || 1000, CONFIG.COVER_SIZE || 1000)
    .jpeg({ quality: CONFIG.COVER_QUALITY || 95 })
    .toFile(dest);
}

function embedCoverFFmpeg(audioPath, coverPath) {
  return new Promise((resolve, reject) => {
    const tmp  = audioPath + '.covertmp';
    const ext  = path.extname(audioPath).toLowerCase();
    const extra = ext === '.mp3' ? ['-id3v2_version','3'] : ext === '.m4a' ? ['-disposition:v:0','attached_pic'] : [];
    const args  = ['-y','-i',audioPath,'-i',coverPath,'-map','0:a','-map','1:v','-c:a','copy','-c:v','copy',...extra, tmp];

    const proc = spawn(CONFIG.FFMPEG_PATH, args, {
      env: { ...process.env, PATH: (process.env.PATH||'') + ':/usr/local/bin:/usr/bin:/bin' },
      stdio: ['ignore','ignore','pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) { fs.unlink(tmp, ()=>{}); return reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(-200)}`)); }
      try { fs.renameSync(tmp, audioPath); resolve(); } catch (e) { reject(e); }
    });
    proc.on('error', e => reject(e));
  });
}

// Main function called by queue.js
async function fetchAndEmbedCover({ audioPath, taskDir, videoId, thumbnail }) {
  const processedPath = path.join(taskDir, 'cover_processed.jpg');
  let rawPath = null;

  try {
    // 1. Check for yt-dlp thumbnail already in taskDir
    const thumbExts = ['.jpg','.jpeg','.png','.webp'];
    const existing  = fs.readdirSync(taskDir).find(f => thumbExts.includes(path.extname(f).toLowerCase()));
    if (existing) {
      rawPath = path.join(taskDir, existing);
    } else if (videoId) {
      // 2. Fetch from YouTube CDN
      const fetchPath = path.join(taskDir, 'cover_raw.jpg');
      for (const url of YT_THUMBNAIL_URLS(videoId)) {
        try { await fetchToFile(url, fetchPath); rawPath = fetchPath; break; } catch (_) {}
      }
    } else if (thumbnail) {
      // 3. Use thumbnail URL directly
      const fetchPath = path.join(taskDir, 'cover_raw.jpg');
      try { await fetchToFile(thumbnail, fetchPath); rawPath = fetchPath; } catch (_) {}
    }

    if (!rawPath) return;

    await squareCrop(rawPath, processedPath);
    await embedCoverFFmpeg(audioPath, processedPath);
    console.log('[cover] Cover embedded:', path.basename(audioPath));
  } catch (e) {
    console.warn('[cover] Non-fatal error:', e.message);
  } finally {
    for (const p of [processedPath, path.join(taskDir,'cover_raw.jpg')]) {
      try { fs.unlinkSync(p); } catch (_) {}
    }
  }
}

// For the /api/download/:id/cover route
async function getCoverForDownload(videoInfo, taskDir) {
  const destPath = path.join(taskDir, 'cover.jpg');
  const rawPath  = path.join(taskDir, 'cover_raw.jpg');

  const thumbnail = videoInfo?.bestThumbnail || videoInfo?.thumbnail;
  const videoId   = videoInfo?.id;

  if (thumbnail) {
    await fetchToFile(thumbnail, rawPath);
  } else if (videoId) {
    for (const url of YT_THUMBNAIL_URLS(videoId)) {
      try { await fetchToFile(url, rawPath); break; } catch (_) {}
    }
  }

  if (!fs.existsSync(rawPath)) throw new Error('No cover available');
  await squareCrop(rawPath, destPath);
  return destPath;
}

module.exports = { fetchAndEmbedCover, getCoverForDownload };
