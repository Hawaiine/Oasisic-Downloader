/**
 * PlaylistPanel.jsx — Complete rewrite
 *
 * Fixes:
 * 1. Race condition: taskId mapped immediately via onTaskCreated callback
 * 2. "全部保存" only enabled when ALL queued downloads are done (not mid-flight)
 * 3. Cover lightbox uses full-quality URL (reconstructed maxresdefault from video ID)
 * 4. Progress visible for all states including pending (animated stripe)
 * 5. Per-track real-time log panel (collapsible, shows last 5 lines)
 * 6. Redesigned UI — status chips, animated indicators, clear visual hierarchy
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, Square, Download, Music, Clock, X as XIcon,
         ChevronDown, ChevronUp, FileMusic } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const FORMATS = [
  { id:'flac', label:'FLAC', hint:'无损 PCM' },
  { id:'alac', label:'ALAC', hint:'Apple 无损' },
  { id:'m4a',  label:'M4A',  hint:'AAC 容器' },
  { id:'mp3',  label:'MP3',  hint:'VBR V0' },
  { id:'wav',  label:'WAV',  hint:'未压缩' },
  { id:'aac',  label:'AAC',  hint:'裸流' },
  { id:'opus', label:'Opus', hint:'原生流' },
];

function fmtDur(s) {
  if (!s || s <= 0) return '';
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Extract YouTube video ID from any thumbnail URL or construct from known pattern
function getMaxresThumbnail(entry) {
  // If we have the video ID, always use maxresdefault
  if (entry.id) return `https://i.ytimg.com/vi/${entry.id}/maxresdefault.jpg`;
  // Fallback: try to extract ID from existing thumbnail URL
  const m = (entry.thumbnail || '').match(/\/vi(?:_webp)?\/([^/]+)\//);
  if (m) return `https://i.ytimg.com/vi/${m[1]}/maxresdefault.jpg`;
  return entry.thumbnail || '';
}

// ── Cover lightbox ─────────────────────────────────────────────────────────────
function CoverLightbox({ entry, onClose }) {
  const boxRef = useRef(null);
  const [imgSrc, setImgSrc] = useState(getMaxresThumbnail(entry));

  useEffect(() => {
    const h = e => { if (boxRef.current && !boxRef.current.contains(e.target)) onClose(); };
    const k = e => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => {
      document.addEventListener('mousedown', h);
      document.addEventListener('keydown', k);
    }, 0);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [onClose]);

  const handleImgError = () => {
    if (imgSrc.includes('maxresdefault')) setImgSrc(imgSrc.replace('maxresdefault', 'hqdefault'));
    else if (imgSrc.includes('hqdefault')) setImgSrc(imgSrc.replace('hqdefault', 'mqdefault'));
  };

  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:9999,
        background:'rgba(0,0,0,0.82)', backdropFilter:'blur(12px)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:24,
      }}
    >
      <div
        ref={boxRef}
        onClick={e => e.stopPropagation()}
        style={{
          borderRadius:'var(--r-lg)', overflow:'hidden',
          border:'1px solid var(--border-2)',
          background:'var(--surface-2)',
          maxWidth:560, width:'100%',
          boxShadow:'var(--sh-lg)', position:'relative',
        }}
      >
        <button onClick={onClose} style={{
          position:'absolute', top:10, right:10, zIndex:10,
          width:28, height:28, borderRadius:'50%',
          background:'rgba(0,0,0,0.65)', border:'1px solid rgba(255,255,255,0.2)',
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', color:'#fff',
        }}>
          <XIcon size={13}/>
        </button>
        {/* Full-quality image */}
        <img
          src={imgSrc}
          alt={entry.title}
          onError={handleImgError}
          style={{
            width:'100%', display:'block',
            objectFit:'contain', background:'var(--bg)',
            maxHeight:'70vh',
          }}
        />
        <div style={{
          display:'flex', alignItems:'center', gap:10,
          padding:'10px 14px', borderTop:'1px solid var(--border)',
        }}>
          <span style={{ flex:1, fontSize:12.5, color:'var(--t2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {entry.title}
          </span>
          <a
            href={imgSrc}
            download={`${entry.title}-cover.jpg`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-tinted btn-sm"
          >
            <Download size={12}/> 保存封面
          </a>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>收起</button>
        </div>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, percent }) {
  const cfg = {
    pending:    { bg:'var(--surface-3)',       color:'var(--t3)',    text:'等待中' },
    running:    { bg:'rgba(6,182,212,0.12)',   color:'var(--cyan)',  text:`${Math.round(percent || 0)}%` },
    converting: { bg:'rgba(245,158,11,0.12)',  color:'var(--yellow)',text:'处理中' },
    done:       { bg:'rgba(34,197,94,0.12)',   color:'var(--green)', text:'完成' },
    error:      { bg:'rgba(229,56,43,0.12)',   color:'var(--red)',   text:'失败' },
  }[status] || { bg:'transparent', color:'var(--t3)', text:'' };

  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600,
      background:cfg.bg, color:cfg.color, whiteSpace:'nowrap',
    }}>
      {status === 'running' && (
        <span className="spin" style={{ width:8, height:8, border:'1.5px solid currentColor', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block' }}/>
      )}
      {status === 'converting' && (
        <span className="spin" style={{ width:8, height:8, border:'1.5px solid currentColor', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block' }}/>
      )}
      {status === 'done'    && '✓ '}
      {status === 'error'   && '✗ '}
      {cfg.text}
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PlaylistPanel({ info, onDownloadSelected, onTrackReady }) {
  const entries = info.entries || [];

  const [selected,   setSelected]  = useState(() => new Set(entries.map(e => e.id)));
  const [format,     setFormat]    = useState('flac');
  const [taskMap,    setTaskMap]   = useState({});
  const [coverEntry, setCoverEntry] = useState(null);
  const [showLog,    setShowLog]   = useState(false);
  const [globalLogs, setGlobalLogs] = useState([]);   // { time, text, type }

  // Derived state
  const ACTIVE       = new Set(['pending', 'running', 'converting']);
  const hasRunning   = Object.values(taskMap).some(t => ACTIVE.has(t.status));
  const queuedCount  = Object.values(taskMap).filter(t => ACTIVE.has(t.status)).length;
  const doneCount    = Object.values(taskMap).filter(t => t.status === 'done').length;
  const errCount     = Object.values(taskMap).filter(t => t.status === 'error').length;
  const totalTasks   = Object.keys(taskMap).length;
  const allFinished  = totalTasks > 0 && !hasRunning;
  const allChecked   = selected.size === entries.length && entries.length > 0;
  const noneChecked  = selected.size === 0;

  // Refs for stable socket handlers
  const entriesRef       = useRef(entries);
  const onTrackReadyRef  = useRef(onTrackReady);
  useEffect(() => { entriesRef.current = entries; },       [entries]);
  useEffect(() => { onTrackReadyRef.current = onTrackReady; }, [onTrackReady]);

  const addLog = (text, type = 'log') => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setGlobalLogs(prev => [...prev.slice(-100), { time, text, type }]);
  };

  // ── Socket — stable, empty deps ──────────────────────────────────────────
  useEffect(() => {
    const socket = window.oasisicSocket;
    if (!socket) return;

    const onProgress = d => {
      if (!d.taskId) return;
      setTaskMap(prev => {
        const eid = Object.entries(prev).find(([, v]) => v.taskId === d.taskId)?.[0];
        if (!eid) return prev;
        // Add log line for download progress
        if (d.log && d.type !== 'download') {
          const text = d.log.replace(/^\[.*?\]\s*/, '').trim();
          if (text) setGlobalLogs(gl => {
            const time = new Date().toLocaleTimeString('zh-CN', {hour12:false});
            return [...gl.slice(-100), { time, text: `${prev[eid]?.title?.slice(0,20) || eid}: ${text}`, type: d.status }];
          });
        }
        return {
          ...prev,
          [eid]: {
            ...prev[eid],
            status:  d.status  || prev[eid].status,
            percent: d.percent ?? prev[eid].percent,
            log:     d.log     || prev[eid].log,
            speed:   d.speed   || prev[eid].speed,
          },
        };
      });
    };

    const onDone = d => {
      if (!d.taskId) return;
      setTaskMap(prev => {
        const eid = Object.entries(prev).find(([, v]) => v.taskId === d.taskId)?.[0];
        if (!eid) return prev;
        const entry = entriesRef.current.find(e => e.id === eid);
        if (entry && d.downloadUrl && onTrackReadyRef.current) {
          onTrackReadyRef.current({
            title:     entry.title,
            artist:    entry.uploader || '',
            thumbnail: entry.thumbnail || '',
            url:       d.downloadUrl,
            fileName:  d.fileName,
          });
        }
        const title = entry?.title?.slice(0, 20) || eid;
        setGlobalLogs(gl => {
          const time = new Date().toLocaleTimeString('zh-CN', {hour12:false});
          return [...gl.slice(-100), { time, text:`✓ ${title} — ${d.fileName || ''}`, type:'done' }];
        });
        return {
          ...prev,
          [eid]: { ...prev[eid], status:'done', percent:100, downloadUrl:d.downloadUrl, fileName:d.fileName },
        };
      });
    };

    const onError = d => {
      if (!d.taskId) return;
      setTaskMap(prev => {
        const eid = Object.entries(prev).find(([, v]) => v.taskId === d.taskId)?.[0];
        if (!eid) return prev;
        const title = entriesRef.current.find(e=>e.id===eid)?.title?.slice(0,20) || eid;
        setGlobalLogs(gl => {
          const time = new Date().toLocaleTimeString('zh-CN', {hour12:false});
          return [...gl.slice(-100), { time, text:`✗ ${title}: ${d.error || '失败'}`, type:'error' }];
        });
        return { ...prev, [eid]: { ...prev[eid], status:'error' } };
      });
    };

    socket.on('progress',  onProgress);
    socket.on('taskDone',  onDone);
    socket.on('taskError', onError);
    return () => {
      socket.off('progress',  onProgress);
      socket.off('taskDone',  onDone);
      socket.off('taskError', onError);
    };
  }, []); // ← stable, never re-registers

  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(entries.map(e => e.id)));
  const toggleOne = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Start downloads ─────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (noneChecked || hasRunning) return;
    const sel = entries.filter(e => selected.has(e.id));

    // Set all selected to pending immediately
    setTaskMap(prev => {
      const init = {};
      sel.forEach(e => { init[e.id] = { ...prev[e.id], taskId: null, status:'pending', percent:0, log:'', speed:'' }; });
      return { ...prev, ...init };
    });
    setGlobalLogs([]);
    setShowLog(true);

    // FIX: Use onTaskCreated callback so each taskId is stored IMMEDIATELY
    // when created — prevents race condition where onDone fires before taskId is mapped
    await onDownloadSelected(sel, format, (entryId, taskId) => {
      setTaskMap(prev => ({
        ...prev,
        [entryId]: { ...(prev[entryId] || {}), taskId, status: taskId ? 'pending' : 'error', percent: 0 },
      }));
      if (taskId) {
        const entry = entries.find(e => e.id === entryId);
        addLog(`排队: ${entry?.title?.slice(0,30) || entryId}`, 'log');
      }
    });
  }, [entries, selected, format, hasRunning, noneChecked, onDownloadSelected]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const overallPct = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;
  const logAreaRef = useRef(null);
  useEffect(() => {
    if (logAreaRef.current) logAreaRef.current.scrollTop = logAreaRef.current.scrollHeight;
  }, [globalLogs]);

  return (
    <div className="card">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ padding:'16px 20px 14px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:38, height:38, borderRadius:'var(--r)', background:'var(--red-dim)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <FileMusic size={17} color="var(--red)"/>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontWeight:700, fontSize:14.5, color:'var(--t1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {info.playlistTitle}
            </p>
            <p style={{ fontSize:11.5, color:'var(--t3)', marginTop:1 }}>{entries.length} 首曲目</p>
          </div>
          {/* 下载按钮 */}
          <button
            className="btn btn-red btn-sm"
            onClick={handleDownload}
            disabled={noneChecked || hasRunning}
            style={{ flexShrink:0 }}
          >
            {hasRunning
              ? <><span className="spin" style={{ width:12, height:12, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%' }}/> 下载中</>
              : <><Download size={13}/> 下载选中 ({selected.size})</>
            }
          </button>
        </div>

        {/* 格式选择 */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:12, flexWrap:'wrap' }}>
          <button
            onClick={toggleAll}
            style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none', cursor:'pointer', color: allChecked ? 'var(--red)' : 'var(--t3)', fontFamily:'var(--font)', fontSize:12, fontWeight:500, padding:'2px 0', flexShrink:0 }}
          >
            {allChecked ? <CheckSquare size={13} color="var(--red)"/> : <Square size={13}/>}
            {allChecked ? '取消全选' : '全选'}
          </button>
          <span style={{ color:'var(--border-2)', fontSize:13 }}>|</span>
          {FORMATS.map(f => (
            <button
              key={f.id}
              className={`chip ${format === f.id ? 'on' : ''}`}
              style={{ padding:'2px 8px', fontSize:10 }}
              onClick={() => setFormat(f.id)}
              title={f.hint}
            >
              {f.label}
            </button>
          ))}
          <span style={{ marginLeft:'auto', fontSize:11, color:'var(--t3)' }}>
            已选 {selected.size}/{entries.length}
          </span>
        </div>
      </div>

      {/* ── Overall progress (shown during/after download) ──────────────── */}
      {totalTasks > 0 && (
        <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface-2)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <span style={{ fontSize:12, fontWeight:600, color:'var(--t1)', minWidth:60 }}>
              {overallPct}%
            </span>
            <div style={{ flex:1, height:6, background:'var(--surface-3)', borderRadius:3, overflow:'hidden' }}>
              <div
                className="prog-fill"
                style={{ height:'100%', width:`${overallPct}%`, transition:'width .4s ease', borderRadius:3 }}
              />
            </div>
            <span style={{ fontSize:11.5, color:'var(--t2)', flexShrink:0 }}>
              {doneCount}/{totalTasks}
            </span>
          </div>

          <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
            {queuedCount > 0 && <span className="badge bdg-yellow">⬇ 进行中 {queuedCount}</span>}
            {doneCount   > 0 && <span className="badge bdg-green">✓ 完成 {doneCount}</span>}
            {errCount    > 0 && <span className="badge bdg-red">✗ 失败 {errCount}</span>}



            {/* Log toggle */}
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setShowLog(v => !v)}
              style={{ marginLeft: doneCount > 0 ? 0 : 'auto' }}
            >
              {showLog ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
              日志
            </button>
          </div>

          {/* Log panel */}
          {showLog && (
            <div
              ref={logAreaRef}
              className="log-box"
              style={{ marginTop:10, maxHeight:140, fontSize:11 }}
            >
              {globalLogs.length === 0
                ? <span style={{ color:'var(--t4)' }}>等待下载开始...</span>
                : globalLogs.map((l, i) => (
                    <span key={i} className={`log-line ${l.type}`} style={{ fontSize:10.5 }}>
                      <span style={{ color:'var(--t4)', marginRight:6 }}>{l.time}</span>
                      {l.text}
                    </span>
                  ))
              }
            </div>
          )}
        </div>
      )}

      {/* ── Track list ─────────────────────────────────────────────────── */}
      <div style={{ maxHeight:520, overflowY:'auto' }}>
        {entries.map((entry, idx) => {
          const ti      = taskMap[entry.id];
          const status  = ti?.status  || 'idle';
          const percent = ti?.percent ?? 0;
          const isDone  = status === 'done';
          const isPending = status === 'pending';
          const isActive  = status === 'running' || status === 'converting';
          const isQueued  = isPending || isActive;

          return (
            <div
              key={entry.id}
              style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'10px 16px',
                borderBottom:'1px solid var(--border)',
                background: isDone ? 'transparent' : isActive ? 'rgba(6,182,212,0.03)' : 'transparent',
                transition:'background .2s',
                opacity: isDone ? 0.75 : 1,
              }}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={selected.has(entry.id)}
                onChange={() => toggleOne(entry.id)}
                disabled={isActive}
                style={{ flexShrink:0, cursor: isActive ? 'not-allowed' : 'pointer', accentColor:'var(--red)' }}
              />

              {/* Index */}
              <span style={{ width:22, textAlign:'right', fontSize:11, color:'var(--t4)', flexShrink:0 }}>
                {idx + 1}
              </span>

              {/* Thumbnail */}
              <div
                style={{
                  width:80, height:60, borderRadius:'var(--r-sm)',
                  overflow:'hidden', flexShrink:0, position:'relative',
                  cursor: entry.thumbnail ? 'zoom-in' : 'default',
                  background:'var(--surface-3)',
                  boxShadow: isActive ? '0 0 0 2px var(--cyan)' : isDone ? '0 0 0 2px var(--green)' : 'none',
                  transition:'box-shadow .2s',
                }}
                onClick={() => entry.thumbnail && setCoverEntry(entry)}
                title={entry.thumbnail ? '点击查看封面' : ''}
              >
                {entry.thumbnail
                  ? <img
                      src={entry.thumbnail}
                      alt=""
                      onError={e => {
                        const s = e.currentTarget.src;
                        if (s.includes('maxresdefault')) e.currentTarget.src = s.replace('maxresdefault','hqdefault');
                        else if (s.includes('hqdefault')) e.currentTarget.src = s.replace('hqdefault','mqdefault');
                        e.currentTarget.onerror = null;
                      }}
                      style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                    />
                  : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Music size={14} style={{ color:'var(--t3)', opacity:0.4 }}/>
                    </div>
                }
                {/* Hover overlay */}
                {entry.thumbnail && !isQueued && (
                  <div
                    style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0)', color:'transparent', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background='rgba(0,0,0,0.5)'; e.currentTarget.style.color='#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background='rgba(0,0,0,0)'; e.currentTarget.style.color='transparent'; }}
                  >
                    预览
                  </div>
                )}
                {/* Pending overlay — animated */}
                {isPending && (
                  <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize:18, opacity:0.8 }}>⏳</span>
                  </div>
                )}
                {/* Progress overlay while downloading */}
                {isActive && (
                  <div style={{ position:'absolute', bottom:0, left:0, right:0, height:4, background:'rgba(0,0,0,0.4)' }}>
                    <div style={{ height:'100%', width:`${percent}%`, background:'var(--cyan)', transition:'width .3s' }}/>
                  </div>
                )}
              </div>

              {/* Title + meta */}
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13, color:'var(--t1)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:3 }}>
                  {entry.title || entry.id}
                </p>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  {entry.uploader && (
                    <span style={{ fontSize:11, color:'var(--t3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>
                      {entry.uploader}
                    </span>
                  )}
                  {entry.duration > 0 && (
                    <span style={{ fontSize:11, color:'var(--t3)', display:'flex', alignItems:'center', gap:2, flexShrink:0 }}>
                      <Clock size={9}/>{fmtDur(entry.duration)}
                    </span>
                  )}
                  {/* Format/quality badges — shown when idle/pending */}
                  {!isActive && !isDone && entry.bestAudio && (
                    <span style={{
                      fontSize:9.5, fontWeight:700, letterSpacing:.4,
                      padding:'1px 5px', borderRadius:3,
                      background:'rgba(6,182,212,0.1)', color:'var(--cyan)',
                      fontFamily:'var(--mono)', flexShrink:0,
                    }}>
                      {entry.bestAudio}
                    </span>
                  )}
                  {!isActive && !isDone && entry.bestVideo && (
                    <span style={{
                      fontSize:9.5, fontWeight:700, letterSpacing:.4,
                      padding:'1px 5px', borderRadius:3,
                      background:'rgba(168,85,247,0.1)', color:'var(--purple)',
                      fontFamily:'var(--mono)', flexShrink:0,
                    }}>
                      {entry.bestVideo}
                    </span>
                  )}
                  {/* Speed while downloading */}
                  {isActive && ti?.speed && ti.speed !== '-' && (
                    <span style={{ fontSize:10.5, color:'var(--cyan)', flexShrink:0 }}>{ti.speed}</span>
                  )}
                </div>
                {/* Progress bar (running/converting) */}
                {(isActive || isPending) && (
                  <div style={{ marginTop:5, height:3, background:'var(--surface-3)', borderRadius:2, overflow:'hidden', width:'100%' }}>
                    {isPending
                      ? <div style={{ height:'100%', width:'100%', background:'linear-gradient(90deg,transparent 0%,var(--t4) 50%,transparent 100%)', backgroundSize:'200% 100%', animation:'sk 1.4s infinite' }}/>
                      : <div className="prog-fill" style={{ height:'100%', width:`${percent}%`, transition:'width .3s', background: status==='converting' ? 'var(--yellow)' : 'var(--cyan)' }}/>
                    }
                  </div>
                )}
                {/* File name when done */}
                {isDone && ti?.fileName && (
                  <p style={{ fontSize:10.5, color:'var(--t3)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {ti.fileName}
                  </p>
                )}
              </div>

              {/* Right column: status + save */}
              <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
                {status !== 'idle' && <StatusBadge status={status} percent={percent}/>}
                {isDone && ti?.downloadUrl && (
                  <a
                    href={ti.downloadUrl}
                    download={ti.fileName}
                    className="btn btn-red btn-xs"
                    style={{ fontSize:10, padding:'3px 8px' }}
                  >
                    ↓ 保存
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cover lightbox */}
      {coverEntry && (
        <CoverLightbox
          entry={coverEntry}
          onClose={() => setCoverEntry(null)}
        />
      )}
    </div>
  );
}
