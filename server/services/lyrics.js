/**
 * server/services/lyrics.js
 *
 * Lyrics sources (trimmed):
 *   1. 网易云音乐 (NetEase) — best for Chinese music, supports translation
 *   2. LRCLib               — open source, good international coverage, timestamped
 *   3. Apple Music          — requires APPLE_MUSIC_TOKEN (skip if not configured)
 *   4. Spotify              — requires CLIENT_ID + SECRET (search only, no lyrics)
 *
 * REMOVED: QQ Music (API broken/blocked in 2024), Musixmatch (scraping unreliable)
 */
'use strict';

const https  = require('https');
const http   = require('http');
const CONFIG = require('../config');

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpGet(urlString, options = {}) {
  return new Promise((resolve, reject) => {
    const url    = new URL(urlString);
    const lib    = url.protocol === 'https:' ? https : http;
    const reqOpt = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OasisicDownloader/1.0)',
        'Accept':     'application/json, text/plain, */*',
        ...options.headers,
      },
      timeout: options.timeout || 8000,
    };
    const req = lib.request(reqOpt, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`Timeout: ${urlString}`)));
    req.end();
  });
}

function httpPost(urlString, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const buf = Buffer.from(body);
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Length': buf.length, ...headers },
    }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(buf); req.end();
  });
}

// ── Source 1: 网易云音乐 ──────────────────────────────────────────────────────
async function fetchNetease({ title, artist }) {
  try {
    const query  = encodeURIComponent(`${artist} ${title}`);
    const search = await httpGet(`https://music.163.com/api/search/get?s=${query}&type=1&limit=5`);
    const data   = JSON.parse(search.body);
    const songs  = data?.result?.songs;
    if (!songs?.length) return null;

    const songId  = songs[0].id;
    const lyrResp = await httpGet(
      `https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`
    );
    const lyrData = JSON.parse(lyrResp.body);
    const lrc     = lyrData?.lrc?.lyric    || null;
    const tlyric  = lyrData?.tlyric?.lyric || null;
    if (!lrc) return null;

    return { source:'netease', lrc, plain:null, translation:tlyric };
  } catch (e) {
    console.warn(`[lyrics/netease] ${e.message}`);
    return null;
  }
}

// ── Source 2: LRCLib (open-source, free, timestamped) ────────────────────────
// https://lrclib.net — no auth required, good global coverage
async function fetchLRCLib({ title, artist }) {
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    const resp   = await httpGet(`https://lrclib.net/api/search?${params}`);
    if (resp.status !== 200) return null;

    const results = JSON.parse(resp.body);
    if (!Array.isArray(results) || !results.length) return null;

    // Prefer results with synced lyrics
    const best = results.find(r => r.syncedLyrics) || results[0];
    const lrc  = best.syncedLyrics || null;
    const plain = best.plainLyrics || null;

    if (!lrc && !plain) return null;

    return { source:'lrclib', lrc, plain, translation:null };
  } catch (e) {
    console.warn(`[lyrics/lrclib] ${e.message}`);
    return null;
  }
}

// ── Source 3: Apple Music (requires APPLE_MUSIC_TOKEN) ───────────────────────
async function fetchAppleMusic({ title, artist }) {
  if (!CONFIG.APPLE_MUSIC_TOKEN) return null;

  try {
    const query  = encodeURIComponent(`${artist} ${title}`);
    const search = await httpGet(
      `https://api.music.apple.com/v1/catalog/us/search?types=songs&term=${query}&limit=5`,
      { headers: { Authorization: `Bearer ${CONFIG.APPLE_MUSIC_TOKEN}` } }
    );
    const data  = JSON.parse(search.body);
    const songs = data?.results?.songs?.data;
    if (!songs?.length) return null;

    const songId  = songs[0].id;
    const lyrResp = await httpGet(
      `https://api.music.apple.com/v1/catalog/us/songs/${songId}/lyrics`,
      { headers: { Authorization: `Bearer ${CONFIG.APPLE_MUSIC_TOKEN}` } }
    );
    const lyrData = JSON.parse(lyrResp.body);
    const lyrText = lyrData?.data?.[0]?.attributes?.ttml;
    if (!lyrText) return null;

    return { source:'applemusic', lrc:null, plain:lyrText, translation:null };
  } catch (e) {
    console.warn(`[lyrics/applemusic] ${e.message}`);
    return null;
  }
}

// ── Source 4: Spotify (requires CLIENT_ID + SECRET) ──────────────────────────
// NOTE: Spotify does NOT provide lyrics via public API.
// This returns track match info only — useful to confirm the right song.
async function fetchSpotify({ title, artist }) {
  if (!CONFIG.SPOTIFY_CLIENT_ID || !CONFIG.SPOTIFY_CLIENT_SECRET) return null;

  try {
    const creds  = Buffer.from(`${CONFIG.SPOTIFY_CLIENT_ID}:${CONFIG.SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const tokResp = await httpPost(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      { Authorization:`Basic ${creds}`, 'Content-Type':'application/x-www-form-urlencoded' }
    );
    const token = JSON.parse(tokResp.body).access_token;
    if (!token) return null;

    const q      = encodeURIComponent(`track:${title} artist:${artist}`);
    const search = await httpGet(
      `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
      { headers: { Authorization:`Bearer ${token}` } }
    );
    const item = JSON.parse(search.body)?.tracks?.items?.[0];
    if (!item) return null;

    return {
      source: 'spotify',
      lrc:    null,
      plain:  `[Spotify] ${item.name} — ${item.artists.map(a=>a.name).join(', ')}\n${item.album.name} (${(item.album.release_date||'').slice(0,4)})\n\n注意：Spotify 公开 API 不提供歌词，仅显示曲目匹配信息。`,
      translation: null,
    };
  } catch (e) {
    console.warn(`[lyrics/spotify] ${e.message}`);
    return null;
  }
}

// ── Priority chain ────────────────────────────────────────────────────────────
const SOURCES = {
  netease:    fetchNetease,
  lrclib:     fetchLRCLib,
  applemusic: fetchAppleMusic,
  spotify:    fetchSpotify,
};

const AUTO_ORDER = ['netease', 'lrclib', 'applemusic', 'spotify'];

async function getLyrics({ title, artist, source = 'auto' }) {
  if (source !== 'auto') {
    const fn = SOURCES[source];
    if (!fn) throw new Error(`Unknown source: ${source}`);
    return fn({ title, artist });
  }
  for (const src of AUTO_ORDER) {
    const result = await SOURCES[src]({ title, artist });
    if (result) return result;
  }
  return null;
}

module.exports = { getLyrics, SOURCES, AUTO_ORDER };
