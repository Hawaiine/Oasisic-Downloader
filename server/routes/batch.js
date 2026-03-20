/**
 * server/routes/batch.js
 * POST /api/batch/download
 *
 * Body: { taskIds: string[] }
 *
 * Streams a tar.gz archive of all completed files to the browser.
 *
 * Why tar.gz over ZIP:
 *   - Audio files (FLAC/MP3/AAC) are already compressed; gzip adds nothing,
 *     but both achieve ~0% reduction on compressed data.
 *   - tar preserves file metadata and streams in a single pass (no seeking).
 *   - Uses system `tar` (always available on Debian/Ubuntu) — zero npm deps.
 *   - ZIP requires a central directory written at the end → can't stream without
 *     knowing total size upfront. The `archiver` npm workaround adds a dep.
 *   - Conclusion: tar.gz is simpler, dependency-free, and more reliable here.
 *
 * On Windows: modern Windows 10+ has built-in tar.exe; 7-Zip and WinRAR also
 * support .tar.gz natively. The tradeoff is acceptable for a music downloader.
 */
'use strict';

const { Router } = require('express');
const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');
const { getTask } = require('../services/queue');

const router = Router();

router.post('/download', async (req, res) => {
  const { taskIds } = req.body;
  if (!Array.isArray(taskIds) || !taskIds.length) {
    return res.status(400).json({ error: '缺少 taskIds 参数' });
  }

  // Collect completed files
  const files = [];
  const diagnostics = [];

  for (const id of taskIds) {
    const task = getTask(id);
    if (!task) {
      diagnostics.push(`taskId ${id}: 队列中不存在（可能已过期或服务重启）`);
      continue;
    }
    if (task.status !== 'done') {
      diagnostics.push(`taskId ${id}: 状态=${task.status}，未完成`);
      continue;
    }
    if (!task.outputFile) {
      diagnostics.push(`taskId ${id}: outputFile 为空`);
      continue;
    }
    if (!fs.existsSync(task.outputFile)) {
      diagnostics.push(`taskId ${id}: 文件已被清理 (${path.basename(task.outputFile)})`);
      continue;
    }
    files.push({ dir: path.dirname(task.outputFile), name: path.basename(task.outputFile) });
  }

  if (diagnostics.length > 0) {
    console.warn('[batch] Diagnostics:\n' + diagnostics.join('\n'));
  }

  if (!files.length) {
    return res.status(404).json({
      error: '没有可打包的文件',
      detail: diagnostics.join(' | ') || '所有文件均不可用',
      hint: '请在文件下载完成后30分钟内点击打包，否则临时文件会被自动清理',
    });
  }

  const archiveName = `oasisic-${files.length}tracks-${Date.now()}.tar.gz`;
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(archiveName)}`);

  // Stream tar.gz to response using system tar
  // -czf - : write compressed archive to stdout
  // -C dir : change to each file's directory before adding
  // We add files one by one via multiple -C/file pairs
  const tarArgs = ['-czf', '-'];
  for (const { dir, name } of files) {
    tarArgs.push('-C', dir, name);
  }

  const tarProc = spawn('tar', tarArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

  tarProc.stdout.pipe(res);

  tarProc.stderr.on('data', d => {
    console.error('[batch/tar] stderr:', d.toString().trim());
  });

  tarProc.on('error', err => {
    console.error('[batch/tar] spawn error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'tar 命令执行失败: ' + err.message });
  });

  tarProc.on('close', code => {
    if (code !== 0) {
      console.error(`[batch/tar] exit code ${code}`);
    }
  });

  req.on('close', () => {
    tarProc.kill();
  });
});

module.exports = router;
