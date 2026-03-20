/**
 * server/routes/info.js
 * GET /api/info?url=...
 * Returns { success:true, data: VideoInfo } for single videos,
 * or { success:true, data: PlaylistInfo } for playlists.
 */
'use strict';
const { Router } = require('express');
const { getVideoInfo, getPlaylistInfo, isPlaylistUrl } = require('../services/ytdlp');
const router = Router();

function isYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)/.test(url);
}

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: '缺少 url 参数' });
  if (!isYouTubeUrl(url)) return res.status(400).json({ error: '不支持的链接，请输入 YouTube 链接' });

  try {
    if (isPlaylistUrl(url)) {
      const pl = await getPlaylistInfo(url);
      return res.json({ success:true, data: { isPlaylist:true, ...pl } });
    }
    const info = await getVideoInfo(url);
    res.json({ success:true, data: { isPlaylist:false, ...info } });
  } catch (e) {
    console.error('[Info] Failed:', e.message);
    const msg = e.message.includes('Private')       ? '该视频是私密视频'           :
                e.message.includes('not available') ? '该视频在当前地区不可用'     :
                e.message.includes('age-restricted')? '该视频有年龄限制'           :
                `解析失败: ${e.message}`;
    res.status(502).json({ error: msg });
  }
});

module.exports = router;
