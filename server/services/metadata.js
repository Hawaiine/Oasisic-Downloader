/**
 * server/services/metadata.js
 * Writes audio tags via FFmpeg. Non-fatal — failure logs but does not abort.
 */
'use strict';
const fs        = require('fs');
const path      = require('path');
const { spawn } = require('child_process');
const CONFIG    = require('../config');

function processAudioMetadata(audioPath, tags = {}) {
  return new Promise((resolve) => {
    const ext    = path.extname(audioPath).toLowerCase();
    const tmpOut = audioPath + '.metatmp';
    const metaArgs = [];
    for (const [k, v] of Object.entries(tags)) {
      if (v !== null && v !== undefined && String(v).trim()) {
        metaArgs.push('-metadata', `${k}=${String(v).trim()}`);
      }
    }
    if (!metaArgs.length) return resolve();

    const extra = ext === '.mp3' ? ['-id3v2_version','3'] : [];
    const args  = ['-y','-i',audioPath,...metaArgs,'-c','copy',...extra, tmpOut];
    const proc  = spawn(CONFIG.FFMPEG_PATH, args, {
      env: { ...process.env, PATH: (process.env.PATH||'')+  ':/usr/local/bin:/usr/bin:/bin' },
      stdio: ['ignore','ignore','pipe'],
    });
    proc.on('close', code => {
      if (code === 0) {
        try { fs.renameSync(tmpOut, audioPath); } catch (_) {}
      } else {
        try { fs.unlinkSync(tmpOut); } catch (_) {}
        console.warn('[metadata] FFmpeg tags write failed (non-fatal)');
      }
      resolve();
    });
    proc.on('error', () => resolve());
  });
}

function extractTagsFromInfo(info) {
  const year = (info.release_year || info.upload_date || '').toString().slice(0, 4);
  return {
    title:        info.track    || info.title    || '',
    artist:       info.artist   || info.uploader || '',
    album:        info.album    || '',
    album_artist: info.artist   || info.uploader || '',
    date:         year,
    comment:      info.webpage_url || '',
    genre:        info.genre    || '',
  };
}

module.exports = { processAudioMetadata, extractTagsFromInfo };
