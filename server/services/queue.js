/**
 * server/services/queue.js
 *
 * FIX 6: Files are NOT stored permanently on the server.
 * When a task completes, the file stays in the temp dir.
 * The client receives a signed /api/download/:id/file URL.
 * That endpoint streams the file directly to the browser (triggering Save As),
 * then schedules deletion of the temp dir after streaming.
 *
 * This means: zero permanent disk usage on the server.
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const { v4: uuidv4 } = require('uuid');

const CONFIG  = require('../config');
const { downloadAudio, downloadVideo } = require('./ytdlp');
const { fetchAndEmbedCover }           = require('./cover');
const { getLyrics }                    = require('./lyrics');

const tasks  = new Map();
let running  = 0;
let _io      = null;

function emit(taskId, event, data) {
  if (_io) _io.to(`task:${taskId}`).emit(event, { ...data, taskId });
}

function initQueue(io) { _io = io; }

function createTask(type, url, options, videoInfo) {
  const taskId  = uuidv4();
  const taskDir = path.join(CONFIG.TEMP_DIR, taskId);
  fs.mkdirSync(taskDir, { recursive:true });

  const task = {
    id:          taskId,
    type,
    url,
    options,
    videoInfo,
    status:      'pending',
    progress:    0,
    speed:       '',
    eta:         '',
    log:         [],
    error:       null,
    outputFile:  null,   // full path in temp dir
    fileSize:    null,
    lyrics:      null,
    createdAt:   Date.now(),
    taskDir,
    proc:        null,   // running child process (for cancellation)
    cancelled:   false,
  };

  tasks.set(taskId, task);
  console.log(`[Queue] Created task ${taskId} (${type})`);
  setImmediate(() => processQueue());
  return taskId;
}

function processQueue() {
  if (running >= CONFIG.MAX_CONCURRENT_DOWNLOADS) return;
  for (const [, task] of tasks) {
    if (task.status === 'pending') { runTask(task); break; }
  }
}

async function runTask(task) {
  const taskId = task.id;
  task.status  = 'running';
  running++;

  emit(taskId, 'progress', { percent:0, speed:'-', eta:'-', status:'running', log:'开始下载...' });

  const onProgress = p => {
    if (p.type === 'download') {
      // Real progress from yt-dlp [download] line
      task.progress = p.percent;
      task.speed    = p.speed;
      task.eta      = p.eta;
      emit(taskId, 'progress', {
        percent: p.percent, speed: p.speed, eta: p.eta,
        status: 'running', log: p.log,
      });
    } else if (p.type === 'log') {
      task.log.push(p.log);
      const isConverting = p.log.includes('[ffmpeg]') || p.log.includes('[ExtractAudio]');
      const status = isConverting ? 'converting' : 'running';
      // Keep last known percent — do NOT reset to 0 on log lines
      // This prevents the progress bar from appearing stuck at 0%
      emit(taskId, 'progress', {
        percent: task.progress,   // last real download percent
        speed: task.speed || '-',
        eta: task.eta || '-',
        status,
        log: p.log,
      });
    }
  };

  try {
    let outputPath;

    // Pass a callback so ytdlp.js can store the child process reference for cancellation
    const onProcStart = proc => { task.proc = proc; };

    if (task.type === 'audio') {
      outputPath = await downloadAudio(task.url, task.options.format||'flac', task.taskDir, onProgress, onProcStart);

      emit(taskId, 'progress', { percent:100, speed:'-', eta:'-', status:'converting', log:'处理封面图片...' });
      try {
        await fetchAndEmbedCover({
          audioPath: outputPath,
          taskDir:   task.taskDir,
          videoId:   task.videoInfo?.id,
          thumbnail: task.videoInfo?.bestThumbnail || task.videoInfo?.thumbnail,
        });
      } catch(e) { console.warn('[Queue] Cover embed failed:', e.message); }

    } else {
      outputPath = await downloadVideo(
        task.url,
        task.options.quality      || '1080p',
        task.options.outputFormat || 'mp4',
        task.taskDir,
        onProgress,
        onProcStart
      );
    }

    task.outputFile = outputPath;
    task.status     = 'done';
    task.fileSize   = fs.statSync(outputPath).size;

    const fileName = path.basename(outputPath);

    // FIX 6: /api/download/:id/file streams directly to browser — no shared /downloads dir
    emit(taskId, 'taskDone', {
      downloadUrl: `/api/download/${taskId}/file`,
      fileName,
      fileSize:    task.fileSize,
      lyrics:      null,
    });

    // Fetch lyrics in background (audio only)
    if (task.type === 'audio') {
      const vi = task.videoInfo || {};
      getLyrics({ title:vi.track||vi.title||'', artist:vi.artist||vi.uploader||'', source:'auto' })
        .then(lyrics => { if(lyrics){ task.lyrics=lyrics; emit(taskId,'lyricsReady',{lyrics}); } })
        .catch(()=>{});
    }

    // Schedule temp dir cleanup after 30 min (gives user time to download)
    setTimeout(() => {
      try { fs.rmSync(task.taskDir, { recursive:true, force:true }); console.log(`[Queue] Cleaned up ${taskId}`); }
      catch(_){}
    }, 30 * 60 * 1000);

  } catch(e) {
    task.status = 'error';
    task.error  = e.message;
    emit(taskId, 'taskError', { error:e.message });
    console.error(`[Queue] Task ${taskId} error:`, e.message);
  } finally {
    running--;
    setImmediate(() => processQueue());
  }
}

function getTask(taskId)     { return tasks.get(taskId); }
function getPublicTask(task) {
  if (!task) return null;
  return {
    id:          task.id,
    type:        task.type,
    status:      task.status,
    progress:    task.progress,
    speed:       task.speed,
    eta:         task.eta,
    error:       task.error,
    downloadUrl: task.outputFile ? `/api/download/${task.id}/file` : null,
    fileName:    task.outputFile ? path.basename(task.outputFile) : null,
    fileSize:    task.fileSize,
    lyrics:      task.lyrics,
    createdAt:   task.createdAt,
  };
}

function getQueueStatus() {
  return {
    running, pending:[...tasks.values()].filter(t=>t.status==='pending').length,
    total:tasks.size, max:CONFIG.MAX_CONCURRENT_DOWNLOADS,
  };
}

function cancelTask(taskId) {
  const task = tasks.get(taskId);
  if (!task) return false;
  task.cancelled = true;
  // Kill the running process immediately
  if (task.proc && !task.proc.killed) {
    try { task.proc.kill('SIGTERM'); } catch (_) {}
  }
  tasks.delete(taskId);
  // Clean up temp dir
  try { require('fs').rmSync(task.taskDir, { recursive:true, force:true }); } catch (_) {}
  if (task.status === 'running' || task.status === 'pending') {
    running = Math.max(0, running - 1);
    setImmediate(processQueue);
  }
  return true;
}

function listTasks() { return [...tasks.values()].map(getPublicTask); }

module.exports = { initQueue, createTask, getTask, getPublicTask, getQueueStatus, cancelTask, listTasks };
