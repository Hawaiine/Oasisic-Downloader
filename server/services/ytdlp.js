/**
 * server/services/ytdlp.js
 *
 * FIX 4/5: YouTube bot detection workarounds:
 *   - Use cookies file if server/cookies.txt exists (exported from browser)
 *   - Add --sleep-interval 1 --max-sleep-interval 3 to look less bot-like
 *   - Add extractor-retries and fragment-retries
 *   - More realistic User-Agent
 *   - If cookies file present, --cookies flag added automatically
 *
 * FIX 6: downloadAudio/downloadVideo do NOT move files to a shared downloads/
 *   directory. Instead they return the output path inside the task's temp dir.
 *   The queue streams the file back to the client directly via res.download(),
 *   then deletes the temp dir. Files are never permanently stored on the server.
 *
 * Other rules:
 *   - %(id)s output template — Chinese paths cause ENOENT in Node lstat()
 *   - --ffmpeg-location takes a DIRECTORY, not full binary path
 *   - t2s() on ALL filename fields for Traditional→Simplified conversion
 */
'use strict';

const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');
const sanitize   = require('sanitize-filename');
const CONFIG     = require('../config');
const { t2s }    = require('./zhConvert');

// Cookies file path — user exports cookies from browser, places here
const COOKIES_FILE = path.join(__dirname, '..', 'cookies.txt');

function safeEnv() {
  return {
    ...process.env,
    PATH:       (process.env.PATH || '') + ':/usr/local/bin:/usr/bin:/bin',
    PYTHONPATH: '',
  };
}

// Common args that reduce bot-detection risk
function antiDetectArgs() {
  const args = [
    '--sleep-interval', '1',
    '--max-sleep-interval', '3',
    '--extractor-retries', '3',
    '--fragment-retries', '5',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];
  // Add cookies if file exists — most reliable fix for bot detection
  if (fs.existsSync(COOKIES_FILE)) {
    args.push('--cookies', COOKIES_FILE);
    console.log('[yt-dlp] Using cookies file:', COOKIES_FILE);
  }
  return args;
}

// ── Normalize raw yt-dlp JSON ─────────────────────────────────────────────────
function normalizeInfo(raw) {
  return {
    id:           raw.id,
    title:        raw.title,
    artist:       raw.artist      || raw.uploader || raw.channel || '',
    album:        raw.album       || '',
    track:        raw.track       || raw.title,
    year:         raw.release_year|| (raw.upload_date || '').slice(0, 4) || '',
    genre:        raw.genre       || '',
    duration:     raw.duration,
    durationStr:  formatDuration(raw.duration),
    thumbnail:    raw.thumbnail,
    thumbnails:   raw.thumbnails  || [],
    webpage_url:  raw.webpage_url,
    formats: (raw.formats || []).map(f => ({
      format_id:f.format_id, ext:f.ext, acodec:f.acodec, vcodec:f.vcodec,
      abr:f.abr, height:f.height, filesize:f.filesize, format_note:f.format_note,
    })),
    bestThumbnail: getBestThumbnail(raw.thumbnails || [], raw.thumbnail),
  };
}

function getBestThumbnail(thumbs, fallback) {
  // 1. Prefer maxresdefault (1280×720) from ytimg CDN — highest quality freely available
  const maxres = (thumbs || []).find(t => t.url && t.url.includes('maxresdefault'));
  if (maxres) return maxres.url;

  // 2. Look for sddefault (640×480)
  const sd = (thumbs || []).find(t => t.url && t.url.includes('sddefault'));
  if (sd) return sd.url;

  // 3. Sort by area — pick largest available
  const sorted = (thumbs || [])
    .filter(t => t.url && t.width && t.height)
    .sort((a,b) => (b.width*b.height)-(a.width*a.height));
  if (sorted.length) return sorted[0].url;

  // 4. Fallback: swap webp/jpg variant for a higher-res ytimg URL
  if (fallback && fallback.includes('ytimg.com')) {
    const videoIdMatch = fallback.match(/\/vi(?:_webp)?\/([^/]+)\//);
    if (videoIdMatch) {
      return `https://i.ytimg.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`;
    }
  }
  return fallback;
}

function formatDuration(s) {
  if (!s) return '0:00';
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=Math.floor(s%60);
  if (h>0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function buildHumanName(info, ext) {
  const clean = s => sanitize(t2s(s||''), { replacement:'_' }).trim();
  const artist = clean(info.artist||info.uploader||info.channel||'Unknown Artist');
  const title  = clean(info.track ||info.title   ||info.id     ||'Unknown Title');
  const album  = clean(info.album ||'');
  const year   = (info.release_year||info.upload_date||'').toString().slice(0,4);
  let name = `${artist} - ${title}`;
  if (album)                        name += ` (${album})`;
  if (year && /^\d{4}$/.test(year)) name += ` [${year}]`;
  return `${name.replace(/\s{2,}/g,' ').trim()}.${ext}`;
}

const PROGRESS_RE = /\[download\]\s+([\d.]+)%\s+of[\s~]+([\S]+)\s+at\s+([\S]+)\s+ETA\s+([\S]+)/;

// ── isPlaylistUrl ─────────────────────────────────────────────────────────────
function isPlaylistUrl(url) {
  try {
    const u = new URL(url);
    // Standard YouTube playlist paths
    if (u.pathname === '/playlist')               return true;
    // Any URL with ?list= (includes music.youtube.com)
    if (u.searchParams.has('list'))               return true;
    // Channel/user pages
    if (u.pathname.match(/^\/[@cC]|^\/channel\/|^\/user\//)) return true;
  } catch (_) {}
  return false;
}

// ── getVideoInfo ──────────────────────────────────────────────────────────────
function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-playlist', '--dump-json', '-4', '--no-warnings',
      ...antiDetectArgs(),
      url,
    ];
    let stdout='', stderr='';
    const proc = spawn(CONFIG.YTDLP_PATH, args, { env:safeEnv(), stdio:['ignore','pipe','pipe'] });
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(buildUserFriendlyError(stderr, code)));
      try { resolve(normalizeInfo(JSON.parse(stdout.trim().split('\n')[0]))); }
      catch (e) { reject(new Error('解析视频信息失败: ' + e.message)); }
    });
    proc.on('error', e => reject(new Error('无法启动 yt-dlp: ' + e.message)));
  });
}

// ── getPlaylistInfo ───────────────────────────────────────────────────────────
//
// 使用 yt-dlp -J（大写 J）获取播放列表信息。
// -J 输出单个 JSON 对象（含 entries 数组），适用于：
//   - youtube.com/playlist?list=...
//   - music.youtube.com/playlist?list=...
//   - youtu.be 频道/合辑
//
// 与 --flat-playlist --dump-json 的区别：
//   --dump-json 逐行输出，每行一个视频 JSON，_type 字段判断困难；
//   -J 输出整体结构，entries 数组清晰可靠，music.youtube.com 也适用。
//
function getPlaylistInfo(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '-J',                // 输出完整播放列表 JSON（含 entries 数组）
      '--flat-playlist',   // 只获取列表结构，不下载各视频详情（速度快）
      '--yes-playlist',    // 明确允许播放列表（防止被 --no-playlist 阻止）
      '--ignore-errors',   // 跳过不可用的单曲，不中断整体
      '--no-warnings',
      '-4',
      ...antiDetectArgs(),
      url,
    ];

    let stdout = '';
    let stderr = '';
    const proc = spawn(CONFIG.YTDLP_PATH, args, {
      env:   safeEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', code => {
      // yt-dlp 对播放列表可能因单曲不可用返回非零退出码，但仍有有效输出
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(buildUserFriendlyError(stderr, code)));
      }

      const rawText = stdout.trim();
      if (!rawText) {
        return reject(new Error('播放列表为空或无法访问，请检查链接是否正确'));
      }

      try {
        const data = JSON.parse(rawText);

        // ── 情形 A：标准播放列表 JSON（含 entries 数组）────────────────────
        const rawEntries = data.entries || [];

        // yt-dlp -J 有时嵌套两层：data.entries[0].entries（频道/合辑场景）
        const flatEntries = rawEntries.length > 0 && rawEntries[0].entries
          ? rawEntries.flatMap(group => group.entries || [])
          : rawEntries;

        const entries = flatEntries
          .filter(e => e && e.id)
          .map(e => {
            // Detect best available format hints from flat-playlist metadata
            const hasVideo  = e.live_status !== 'is_live' && e.duration > 0;
            // YouTube music videos typically have ≥1080p; pure audio tracks are 720p
            const bestVideo = e.height
              ? (e.height >= 2160 ? '4K' : e.height >= 1440 ? '2K' : e.height >= 1080 ? '1080p' : '720p')
              : (hasVideo ? '1080p' : null);
            const bestAudio = 'FLAC'; // yt-dlp always extracts lossless from YouTube

            return {
              id:        e.id,
              title:     t2s(e.title    || e.id    || ''),
              duration:  e.duration    || 0,
              uploader:  t2s(e.uploader || e.channel || ''),
              url: e.url || e.webpage_url
                || (e.ie_key === 'YoutubeMusic'
                    ? `https://music.youtube.com/watch?v=${e.id}`
                    : `https://www.youtube.com/watch?v=${e.id}`),
              thumbnail: e.id
                ? `https://i.ytimg.com/vi/${e.id}/maxresdefault.jpg`
                : getBestThumbnail(e.thumbnails || [], e.thumbnail),
              bestAudio,   // 'FLAC'
              bestVideo,   // '1080p' | '4K' | null
            };
          });

        if (!entries.length) {
          return reject(new Error(
            '播放列表为空，或所有曲目均不可用。\n' +
            '如果是私人/地区限制播放列表，请在 server/cookies.txt 放置登录 Cookie。'
          ));
        }

        resolve({
          playlistTitle: t2s(data.title || data.playlist_title || '') || 'Playlist',
          playlistId:    data.id || data.playlist_id || '',
          count:         entries.length,
          entries,
        });

      } catch (e) {
        reject(new Error('解析播放列表 JSON 失败: ' + e.message));
      }
    });

    proc.on('error', e => reject(new Error('无法启动 yt-dlp: ' + e.message)));
  });
}

// ── downloadAudio ─────────────────────────────────────────────────────────────
// FIX 6: Returns path inside taskDir. Caller streams to client, then deletes.
function downloadAudio(url, format, taskDir, onProgress, onProcStart) {
  return new Promise((resolve, reject) => {
    const safeTemplate = path.join(taskDir, '%(id)s.%(ext)s');
    const args = [
      '-4', '--no-playlist',
      '-f', 'bestaudio[ext=webm]/bestaudio/best',
      '-x', '--audio-format', format, '--audio-quality', '0',
      '--embed-thumbnail', '--embed-metadata', '--add-metadata',
      '--write-info-json', '--write-thumbnail', '--convert-thumbnails', 'jpg',
      '--newline', '--no-warnings',
      '--ffmpeg-location', CONFIG.FFMPEG_DIR,
      '--downloader', 'aria2c',
      '--downloader-args', 'aria2c:-x16 -s16 -k1M --min-split-size=1M',
      '--concurrent-fragments', '16', '--retries', '5', '--geo-bypass',
      ...antiDetectArgs(),
      '-o', safeTemplate, url,
    ];

    const proc = spawn(CONFIG.YTDLP_PATH, args, { cwd:taskDir, env:safeEnv() });
    if (onProcStart) onProcStart(proc); // allow caller to store ref for cancellation
    proc.stdout.on('data', data => {
      for (const line of data.toString().split('\n')) {
        const t=line.trim(); if (!t) continue;
        const m=t.match(PROGRESS_RE);
        if (m&&onProgress) onProgress({ type:'download',percent:parseFloat(m[1]),total:m[2],speed:m[3],eta:m[4],log:t });
        else if (onProgress) onProgress({ type:'log', log:t });
      }
    });
    proc.stderr.on('data', d => {
      const t=d.toString().trim();
      if (t&&onProgress) onProgress({ type:'log', log:`[ffmpeg] ${t}` });
    });
    proc.on('close', code => {
      if (code!==0) return reject(new Error(`yt-dlp 退出码 ${code}`));
      try {
        const files    = fs.readdirSync(taskDir);
        const audioFile= files.find(f=>CONFIG.AUDIO_FORMATS.some(ext=>f.toLowerCase().endsWith('.'+ext)));
        if (!audioFile) return reject(new Error('未找到下载的音频文件'));

        // Build human-readable name with t2s conversion, place in taskDir
        const infoFile = files.find(f=>f.endsWith('.info.json'));
        let finalPath  = path.join(taskDir, audioFile);
        if (infoFile) {
          try {
            const info    = JSON.parse(fs.readFileSync(path.join(taskDir,infoFile),'utf8'));
            const ext     = path.extname(audioFile).slice(1);
            const safeName= buildHumanName(info, ext);
            const dest    = path.join(taskDir, safeName);
            fs.renameSync(finalPath, dest);
            finalPath = dest;
          } catch(_){}
        }
        resolve(finalPath);
      } catch(e) { reject(new Error('文件处理失败: '+e.message)); }
    });
    proc.on('error', e => reject(new Error('无法启动 yt-dlp: '+e.message)));
  });
}

// ── downloadVideo ─────────────────────────────────────────────────────────────
function downloadVideo(url, quality, outputFormat, taskDir, onProgress, onProcStart) {
  return new Promise((resolve, reject) => {
    const safeTemplate  = path.join(taskDir, '%(id)s.%(ext)s');
    const formatSelector= CONFIG.VIDEO_QUALITY?.[quality] || 'bestvideo[height<=1080]+bestaudio/best';
    const args = [
      '-4', '--no-playlist', '-f', formatSelector,
      '--merge-output-format', outputFormat,
      '--embed-thumbnail', '--embed-metadata', '--add-metadata',
      '--write-info-json', '--newline', '--no-warnings',
      '--ffmpeg-location', CONFIG.FFMPEG_DIR,
      '--downloader', 'aria2c',
      '--downloader-args', 'aria2c:-x16 -s16 -k1M',
      '--concurrent-fragments', '16', '--retries', '5', '--geo-bypass',
      ...antiDetectArgs(),
      '-o', safeTemplate, url,
    ];

    const proc = spawn(CONFIG.YTDLP_PATH, args, { cwd:taskDir, env:safeEnv() });
    if (onProcStart) onProcStart(proc);
    proc.stdout.on('data', data => {
      for (const line of data.toString().split('\n')) {
        const t=line.trim(); if(!t) continue;
        const m=t.match(PROGRESS_RE);
        if(m&&onProgress) onProgress({type:'download',percent:parseFloat(m[1]),total:m[2],speed:m[3],eta:m[4],log:t});
        else if(onProgress) onProgress({type:'log',log:t});
      }
    });
    proc.stderr.on('data', d=>{ const t=d.toString().trim(); if(t&&onProgress) onProgress({type:'log',log:`[ffmpeg] ${t}`}); });
    proc.on('close', code => {
      if (code!==0) return reject(new Error(`yt-dlp 视频下载失败，退出码: ${code}`));
      try {
        const files    = fs.readdirSync(taskDir);
        const videoFile= files.find(f=>(CONFIG.VIDEO_FORMATS||['mp4','mkv']).some(ext=>f.toLowerCase().endsWith('.'+ext)));
        if (!videoFile) return reject(new Error('未找到下载的视频文件'));
        let finalPath  = path.join(taskDir, videoFile);
        const infoFile = files.find(f=>f.endsWith('.info.json'));
        if (infoFile) {
          try {
            const info    = JSON.parse(fs.readFileSync(path.join(taskDir,infoFile),'utf8'));
            const ext     = path.extname(videoFile).slice(1);
            const safeName= buildHumanName(info, ext);
            const dest    = path.join(taskDir, safeName);
            fs.renameSync(finalPath, dest);
            finalPath = dest;
          } catch(_){}
        }
        resolve(finalPath);
      } catch(e) { reject(new Error('视频文件处理失败: '+e.message)); }
    });
    proc.on('error', e => reject(new Error('无法启动 yt-dlp: '+e.message)));
  });
}

// ── User-friendly error messages ──────────────────────────────────────────────
function buildUserFriendlyError(stderr, code) {
  const s = stderr || '';
  if (s.includes('Sign in to confirm') || s.includes('bot'))
    return 'YouTube 要求验证身份（机器人检测）。请在服务器上导出浏览器 Cookie 并放置到 server/cookies.txt，详见安装说明。';
  if (s.includes('Private video'))
    return '该视频是私密视频，无法访问';
  if (s.includes('age-restricted') || s.includes('age restricted'))
    return '该视频有年龄限制，需要登录的 Cookie';
  if (s.includes('not available'))
    return '该视频在当前地区不可用';
  if (s.includes('Video unavailable'))
    return '视频不可用（可能已被删除）';
  if (s.includes('Unable to download') || s.includes('HTTP Error 403'))
    return '下载被拒绝（403 Forbidden）。请尝试配置 cookies.txt';
  return `yt-dlp 退出码 ${code}: ${s.slice(0, 300)}`;
}

module.exports = { getVideoInfo, getPlaylistInfo, downloadAudio, downloadVideo, isPlaylistUrl, normalizeInfo, buildHumanName };
