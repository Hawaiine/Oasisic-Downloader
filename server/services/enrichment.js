/**
 * server/services/enrichment.js
 *
 * Metadata enrichment from multiple music databases:
 *   1. MusicBrainz - best global coverage, no auth
 *   2. Deezer - good metadata + album art, no auth
 *   3. Netease - strong for Chinese songs, no auth
 *
 * Sources are queried in priority order and merged into the result.
 * Each returned field tracks where it came from via `_sources`.
 */

'use strict';

const https  = require('https');
const http   = require('http');
const CONFIG = require('../config');

// ── HTTP helpers ───────────────────────────────────────────────────────────────

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
        'User-Agent': 'OasisicDownloader/1.0 (metadata enrichment)',
        'Accept':     'application/json, text/plain, */*',
        ...options.headers,
      },
      timeout: options.timeout || 10000,
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Source 1: MusicBrainz ─────────────────────────────────────────────────────
// https://musicbrainz.org/doc/MusicBrainz_API
// No auth required, but requires 1 request/sec for anonymous users.

async function fetchMusicBrainz({ title, artist }) {
  try {
    const q = `artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(title)}"`;
    const search = await httpGet(
      `https://musicbrainz.org/ws/2/recording/?query=${q}&fmt=json&limit=5`
    );
    if (search.status !== 200) return null;

    const data = JSON.parse(search.body);
    const recordings = data?.recordings;
    if (!Array.isArray(recordings) || !recordings.length) return null;

    const rec = recordings[0];
    const result = { source: 'musicbrainz' };
    const sources = {};

    // title
    if (rec.title) {
      result.title = rec.title;
      sources.title = 'musicbrainz';
    }

    // artist-credit
    if (Array.isArray(rec['artist-credit']) && rec['artist-credit'].length) {
      result.artist = rec['artist-credit'].map(ac => ac.name || ac.join?.(' ') || '').join(' ').trim();
      if (result.artist) sources.artist = 'musicbrainz';
    }

    // release / album / year / genre via relations / releases
    const releases = rec.releases;
    if (Array.isArray(releases) && releases.length) {
      const release = releases[0];
      if (release.title) {
        result.album = release.title;
        sources.album = 'musicbrainz';
      }
      if (release.date) {
        result.year = String(release.date).slice(0, 4);
        sources.year = 'musicbrainz';
      }
      if (release.relations?.length) {
        const genreRel = release.relations.find(r => r.type === 'discogs' || r.type === 'wikidata');
      }
    }

    // Genres are not directly on recording; skip if not found to avoid wrong data.
    // MusicBrainz `/ws/2/recording` does not include genre by default.

    result._sources = sources;
    return result;
  } catch (e) {
    console.warn(`[enrichment/musicbrainz] ${e.message}`);
    return null;
  }
}

// ── Source 2: Deezer ──────────────────────────────────────────────────────────
// https://developers.deezer.com/api
// Free, no auth, good metadata + cover art.

async function fetchDeezer({ title, artist }) {
  try {
    const q = `artist:"${encodeURIComponent(artist)}" track:"${encodeURIComponent(title)}"`;
    const search = await httpGet(`https://api.deezer.com/search?q=${q}&limit=3`);
    if (search.status !== 200) return null;

    const data = JSON.parse(search.body);
    const tracks = data?.data;
    if (!Array.isArray(tracks) || !tracks.length) return null;

    const track = tracks[0];
    const result = { source: 'deezer' };
    const sources = {};

    if (track.title) {
      result.title = track.title;
      sources.title = 'deezer';
    }
    if (track.artist?.name) {
      result.artist = track.artist.name;
      sources.artist = 'deezer';
    }
    if (track.album?.title) {
      result.album = track.album.title;
      sources.album = 'deezer';
    }
    if (track.album?.cover_medium) {
      result.cover = track.album.cover_medium;
      sources.cover = 'deezer';
    }
    if (track.album?.release_date) {
      result.year = String(track.album.release_date).slice(0, 4);
      sources.year = 'deezer';
    }
    if (typeof track.duration === 'number') {
      result.duration = track.duration;
      sources.duration = 'deezer';
    }
    if (typeof track.explicit === 'boolean') {
      result.explicit = track.explicit;
      sources.explicit = 'deezer';
    }

    result._sources = sources;
    return result;
  } catch (e) {
    console.warn(`[enrichment/deezer] ${e.message}`);
    return null;
  }
}

// ── Source 3: Netease ─────────────────────────────────────────────────────────
// Uses the same endpoint pattern as lyrics.js for consistency.

async function fetchNetease({ title, artist }) {
  try {
    const query = encodeURIComponent(`${artist} ${title}`);
    const search = await httpGet(`https://music.163.com/api/search/get?s=${query}&type=1&limit=3`);
    if (search.status !== 200) return null;

    const data = JSON.parse(search.body);
    const songs = data?.result?.songs;
    if (!Array.isArray(songs) || !songs.length) return null;

    const song = songs[0];
    const result = { source: 'netease' };
    const sources = {};

    if (song.name) {
      result.title = song.name;
      sources.title = 'netease';
    }
    if (Array.isArray(song.artists) && song.artists.length && song.artists[0].name) {
      result.artist = song.artists.map(a => a.name).join(', ');
      sources.artist = 'netease';
    }
    if (song.album?.name) {
      result.album = song.album.name;
      sources.album = 'netease';
    }
    if (song.album?.picUrl) {
      result.cover = song.album.picUrl;
      sources.cover = 'netease';
    }
    if (song.duration) {
      result.duration = Math.round(song.duration / 1000);
      sources.duration = 'netease';
    }
    if (typeof song.fee === 'number') {
      // 0 = free, not equivalent to explicit; do not map blindly.
    }

    result._sources = sources;
    return result;
  } catch (e) {
    console.warn(`[enrichment/netease] ${e.message}`);
    return null;
  }
}

// ── Merge helper ──────────────────────────────────────────────────────────────

function mergeResults(base, sourceResult) {
  if (!sourceResult) return base;
  if (!base) base = { source: sourceResult.source || 'unknown' };

  const fields = ['title', 'artist', 'album', 'year', 'genre', 'cover', 'duration', 'explicit'];
  for (const field of fields) {
    if (base[field] === undefined || base[field] === null || base[field] === '') {
      if (sourceResult[field] !== undefined && sourceResult[field] !== null && sourceResult[field] !== '') {
        base[field] = sourceResult[field];
      }
    }
  }

  base._sources = { ...(base._sources || {}), ...(sourceResult._sources || {}) };
  if (sourceResult.source && !base.source) {
    base.source = sourceResult.source;
  }
  return base;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function enrichMetadata({ title, artist, album }) {
  const input = { title: title || '', artist: artist || '', album: album || '' };
  let result = null;

  // MusicBrainz first, with rate limiting
  const mbResult = await fetchMusicBrainz(input);
  if (mbResult) {
    result = mergeResults(result, mbResult);
    await delay(1000);
  }

  const dzResult = await fetchDeezer(input);
  result = mergeResults(result, dzResult);

  const neResult = await fetchNetease(input);
  result = mergeResults(result, neResult);

  if (!result) return null;

  // Determine source from what populated fields
  if (!result.source) {
    const srcs = Object.values(result._sources || {});
    result.source = srcs.length ? srcs[srcs.length - 1] : 'none';
  }

  // Clean internal metadata
  delete result._sources;

  return result;
}

module.exports = { enrichMetadata };
