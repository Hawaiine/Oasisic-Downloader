/**
 * server/routes/download.js
 *
 * FIX 6: /api/download/:id/file streams the file directly to the browser
 * with Content-Disposition: attachment, triggering a native Save-As dialog.
 * No file is permanently stored on the server.
 */
'use strict';
const { Router } = require('express');
const path = require('path');
const fs   = require('fs');
const { createTask, getTask, getPublicTask, cancelTask, getQueueStatus, listTasks } = require('../services/queue');
const { getVideoInfo } = require('../services/ytdlp');
const { getCoverForDownload } = require('../services/cover');
const { getLyrics }           = require('../services/lyrics');
const CONFIG = require('../config');
const router = Router();

// ── GET /api/download (list all tasks) ────────────────────────────────────────
router.get('/', (req, res) => res.json({ success:true, data:listTasks() }));

// ── POST /api/download ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { url, type='audio', format='flac', quality='1080p', outputFormat='mp4' } = req.body;
  if (!url) return res.status(400).json({ error:'缺少 url 参数' });
  if (type==='audio' && !CONFIG.AUDIO_FORMATS.includes(format))
    return res.status(400).json({ error:`不支持的音频格式: ${format}` });

  try {
    const videoInfo = await getVideoInfo(url);
    const taskId    = createTask(type, url, { format, quality, outputFormat }, videoInfo);
    res.json({ success:true, taskId, message:'任务已加入队列', queue:getQueueStatus() });
  } catch(e) {
    console.error('[Download] Create task failed:', e.message);
    res.status(500).json({ error:'创建任务失败: '+e.message });
  }
});

// ── GET /api/download/queue ───────────────────────────────────────────────────
router.get('/queue', (req, res) => res.json(getQueueStatus()));

// ── GET /api/download/:id ─────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  if (req.params.id === 'queue') return res.json(getQueueStatus()); // belt+suspenders
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error:'任务不存在' });
  res.json({ success:true, data:getPublicTask(task) });
});

// ── DELETE /api/download/:id ──────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const ok = cancelTask(req.params.id);
  if (!ok) return res.status(404).json({ error:'任务不存在或已结束' });
  res.json({ cancelled:true });
});

// ── GET /api/download/:id/file ────────────────────────────────────────────────
// FIX 6: Stream file directly to the browser client (Save-As dialog)
// The file lives in the task's temp dir and is NOT copied to a shared folder.
router.get('/:id/file', (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error:'任务不存在' });
  if (task.status !== 'done') return res.status(409).json({ error:'文件尚未准备好' });
  if (!task.outputFile || !fs.existsSync(task.outputFile))
    return res.status(404).json({ error:'文件已被清理，请重新下载' });

  const fileName = path.basename(task.outputFile);
  const stat     = fs.statSync(task.outputFile);

  // Set headers that trigger browser "Save As" dialog
  res.setHeader('Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Content-Type',   'application/octet-stream');
  res.setHeader('Content-Length', stat.size);

  const stream = fs.createReadStream(task.outputFile);
  stream.pipe(res);

  stream.on('error', e => {
    console.error('[Download/file] Stream error:', e.message);
    if (!res.headersSent) res.status(500).end();
  });
});

// ── GET /api/download/:id/cover ───────────────────────────────────────────────
router.get('/:id/cover', async (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error:'任务不存在' });
  try {
    const coverDir  = path.join(CONFIG.TEMP_DIR, req.params.id+'_cover');
    fs.mkdirSync(coverDir, { recursive:true });
    const coverPath = await getCoverForDownload(task.videoInfo, coverDir);
    const title     = (task.videoInfo?.title||'cover').replace(/[/\\?%*:|"<>]/g,'_');
    res.download(coverPath, `${title}_cover.jpg`, () => {
      try { fs.rmSync(coverDir,{recursive:true,force:true}); } catch(_){}
    });
  } catch(e) { res.status(500).json({ error:'封面获取失败: '+e.message }); }
});

// ── GET /api/download/:id/lyrics ─────────────────────────────────────────────
router.get('/:id/lyrics', async (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error:'任务不存在' });
  if (task.lyrics) return res.json({ success:true, data:task.lyrics });
  try {
    const vi = task.videoInfo || {};
    const searchTitle  = task.enriched?.title  || vi.track || vi.title || '';
    const searchArtist = task.enriched?.artist || vi.artist || vi.uploader || '';
    const lyrics = await getLyrics({
      title:  searchTitle,
      artist: searchArtist,
      source: 'auto',
    });
    res.json({ success:true, data:lyrics });
  } catch(e) { res.status(500).json({ error:'歌词获取失败: '+e.message }); }
});

module.exports = router;
