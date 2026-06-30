import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Sun, Moon, Monitor, FileMusic, Video, ChevronRight } from 'lucide-react';
import { getVideoInfo, createDownload } from './api.js';
import { useTheme } from './hooks/useTheme.js';
import URLInput, { LogoIcon } from './components/URLInput.jsx';
import VideoInfoCard from './components/VideoInfo.jsx';
import DownloadOptions from './components/DownloadOptions.jsx';
import ProgressPanel from './components/ProgressPanel.jsx';
import LyricsPanel from './components/LyricsPanel.jsx';
import PersistentPlayer from './components/PersistentPlayer.jsx';
import PlaylistPanel from './components/PlaylistPanel.jsx';

const socket = io('/', { transports: ['websocket', 'polling'] });
window.oasisicSocket = socket;

// ── Theme dropdown (hover) ────────────────────────────────────────────────────
function ThemeDropdown({ mode, setMode }) {
  const [open, setOpen] = useState(false);
  const ref      = useRef(null);
  const timerRef = useRef(null);

  const options = [
    { v:'dark',  icon:<Moon size={13}/>,    label:'深色模式' },
    { v:'light', icon:<Sun size={13}/>,     label:'浅色模式' },
    { v:'auto',  icon:<Monitor size={13}/>, label:'跟随系统' },
  ];
  const current = options.find(o => o.v === mode) || options[0];

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const enter = () => { clearTimeout(timerRef.current); setOpen(true); };
  const leave = () => { timerRef.current = setTimeout(() => setOpen(false), 150); };

  return (
    <div ref={ref} style={{ position:'relative' }} onMouseEnter={enter} onMouseLeave={leave}>
      <button onClick={() => setOpen(v => !v)} style={{
        display:'flex', alignItems:'center', gap:6, padding:'5px 10px',
        borderRadius:'var(--r-sm)', border:'1px solid var(--border-2)',
        background:'var(--surface-2)', cursor:'pointer', color:'var(--t2)',
        fontFamily:'var(--font)', fontSize:12.5, fontWeight:500,
        transition:'all var(--dur)', whiteSpace:'nowrap',
      }}>
        {current.icon}{current.label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ marginLeft:1, opacity:0.5, transition:'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div onMouseEnter={enter} onMouseLeave={leave} style={{
          position:'absolute', top:'calc(100% + 6px)', right:0,
          background:'var(--surface)', border:'1px solid var(--border-2)',
          borderRadius:'var(--r)', boxShadow:'var(--sh-md)',
          minWidth:130, overflow:'hidden', zIndex:300,
          animation:'popIn .15s var(--ease)',
        }}>
          {options.map(o => (
            <button key={o.v} onClick={() => { setMode(o.v); setOpen(false); }} style={{
              display:'flex', alignItems:'center', gap:9, width:'100%',
              padding:'9px 14px', border:'none',
              background: mode === o.v ? 'var(--red-dim)' : 'transparent',
              color: mode === o.v ? 'var(--red)' : 'var(--t1)',
              fontFamily:'var(--font)', fontSize:13, cursor:'pointer',
              textAlign:'left', transition:'background var(--dur)',
            }}
            onMouseEnter={e => { if (mode !== o.v) e.currentTarget.style.background = 'var(--hover)'; }}
            onMouseLeave={e => { if (mode !== o.v) e.currentTarget.style.background = 'transparent'; }}
            >
              {o.icon}{o.label}
              {mode === o.v && <span style={{ marginLeft:'auto', fontSize:11 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Server status ─────────────────────────────────────────────────────────────
function ServerStatus() {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
        if (!cancelled) setStatus(r.ok ? 'online' : 'offline');
      } catch { if (!cancelled) setStatus('offline'); }
    };
    check();
    const iv = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);
  const cfg = {
    checking: { dot:'var(--yellow)', label:'检查中', cls:'bdg-yellow' },
    online:   { dot:'var(--green)',  label:'运行中', cls:'bdg-green'  },
    offline:  { dot:'var(--red)',    label:'离线',   cls:'bdg-red'    },
  }[status];
  return (
    <span className={`badge ${cfg.cls}`} style={{ fontSize:11, gap:5 }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:cfg.dot, display:'inline-block', flexShrink:0 }}/>
      {cfg.label}
    </span>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // URL + video info
  const [url,         setUrl]        = useState('');
  const [videoInfo,   setVideoInfo]  = useState(null);
  const [playlistInfo,setPlaylist]   = useState(null);
  const [infoLoading, setInfoLoad]   = useState(false);
  const [infoError,   setInfoError]  = useState('');

  // Download options (single-track)
  const [mode,        setMode]       = useState('audio');
  const [audioFormat, setAF]         = useState('flac');
  const [videoQuality,setVQ]         = useState('1080p');
  const [videoFormat, setVF]         = useState('mp4');

  // Single-track task state
  const [taskId,      setTaskId]     = useState(null);
  const [taskStatus,  setStatus]     = useState(null);
  const [progress,    setProgress]   = useState(0);
  const [speed,       setSpeed]      = useState('');
  const [eta,         setEta]        = useState('');
  const [logs,        setLogs]       = useState([]);
  const [downloadUrl, setDlUrl]      = useState(null);
  const [fileName,    setFileName]   = useState('');
  const [fileSize,    setFileSize]   = useState(null);
  const [lyrics,      setLyrics]     = useState(null);
  const [activeTab,   setTab]        = useState('progress');

  // ── Audio element — lives here, never unmounted ───────────────────────────
  const audioRef       = useRef(null);
  const videoInfoRef   = useRef(null);
  // Set of taskIds belonging to playlist downloads — App's onDone should ignore these
  // (PlaylistPanel handles them itself via socket)
  const playlistTaskIds = useRef(new Set());

  // ── Player queue state ────────────────────────────────────────────────────
  // queue: [{ title, artist, thumbnail, url, fileName }]
  const [playerOn,     setPlayerOn]     = useState(false);
  const [playing,      setPlaying]      = useState(false);
  const [curTime,      setCurTime]      = useState(0);
  const [dur,          setDur]          = useState(0);
  const [vol,          setVol]          = useState(1);
  const [queue,        setQueue]        = useState([]);   // playlist of tracks
  const [queueIndex,   setQueueIndex]   = useState(0);   // currently playing

  useEffect(() => { videoInfoRef.current = videoInfo; }, [videoInfo]);
  const addLog = (type, text) => setLogs(p => [...p.slice(-300), { type, text }]);

  // ── Load audio track from queue ───────────────────────────────────────────
  const loadQueueTrack = useCallback((idx, autoPlay = true) => {
    const track = queue[idx];
    if (!track || !audioRef.current) return;
    audioRef.current.src = track.url;
    audioRef.current.load();
    setQueueIndex(idx);
    setCurTime(0);
    setDur(0);
    setPlaying(false);
    if (autoPlay) {
      audioRef.current.play().catch(() => {});
    }
  }, [queue]);

  // Add a track to queue (deduplicates by url)
  const enqueueTrack = useCallback((track) => {
    setQueue(prev => {
      if (prev.some(t => t.url === track.url)) return prev;
      return [...prev, track];
    });
    setPlayerOn(true);
  }, []);

  // ── Socket handlers ───────────────────────────────────────────────────────
  useEffect(() => {
    const onProgress = d => {
      // Skip playlist tasks — they have their own handlers in PlaylistPanel
      if (playlistTaskIds.current.has(d.taskId)) return;
      setProgress(d.percent || 0);
      setSpeed(d.speed || '');
      setEta(d.eta || '');
      setStatus(d.status);
      if (d.log) addLog(d.status || 'log', d.log);
    };

    const onDone = d => {
      // Skip playlist tasks — PlaylistPanel handles them via its own socket listeners
      if (playlistTaskIds.current.has(d.taskId)) return;

      setStatus('done'); setProgress(100);
      setDlUrl(d.downloadUrl); setFileName(d.fileName || '');
      setFileSize(d.fileSize);
      if (d.lyrics) setLyrics(d.lyrics);
      addLog('done', `完成：${d.fileName || ''}`);

      // Single-track: load into player queue
      if (d.downloadUrl && mode === 'audio') {
        const vi = videoInfoRef.current;
        if (vi && !vi.isPlaylist) {
          const track = {
            title:     vi.title || '',
            artist:    vi.artist || '',
            thumbnail: vi.bestThumbnail || vi.thumbnail || '',
            url:       d.downloadUrl,
            fileName:  d.fileName,
          };
          setQueue(prev => {
            const exists = prev.some(t => t.url === d.downloadUrl);
            const next   = exists ? prev : [...prev, track];
            // Auto-switch to this track if nothing was playing
            if (!exists) {
              setTimeout(() => {
                setQueueIndex(next.length - 1);
                if (audioRef.current) {
                  audioRef.current.src = d.downloadUrl;
                  audioRef.current.load();
                  setCurTime(0); setDur(0); setPlaying(false);
                }
              }, 0);
            }
            return next;
          });
          setPlayerOn(true);
        }
      }
    };

    const onErr  = d => { setStatus('error'); addLog('error', `错误：${d.error}`); };
    const onLyrics = d => { if (d.lyrics) setLyrics(d.lyrics); };

    socket.on('progress',    onProgress);
    socket.on('taskDone',    onDone);
    socket.on('taskError',   onErr);
    socket.on('lyricsReady', onLyrics);
    return () => {
      socket.off('progress', onProgress).off('taskDone', onDone)
            .off('taskError', onErr).off('lyricsReady', onLyrics);
    };
  }, [mode]);

  useEffect(() => { if (taskId) socket.emit('subscribe', taskId); }, [taskId]);

  // ── Audio element events ──────────────────────────────────────────────────
  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onTime = () => setCurTime(a.currentTime);
    const onMeta = () => setDur(a.duration || 0);
    const onEnd  = () => {
      setPlaying(false);
      // Auto-advance to next track in queue
      setQueueIndex(prev => {
        const next = prev + 1;
        if (next < queue.length) {
          setTimeout(() => loadQueueTrack(next, true), 200);
          return next;
        }
        return prev;
      });
    };
    const onPlay  = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener('timeupdate',     onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended',          onEnd);
    a.addEventListener('play',           onPlay);
    a.addEventListener('pause',          onPause);
    return () => {
      a.removeEventListener('timeupdate',     onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('ended',          onEnd);
      a.removeEventListener('play',           onPlay);
      a.removeEventListener('pause',          onPause);
    };
  }, [queue, loadQueueTrack]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    a.paused ? a.play().catch(() => {}) : a.pause();
  }, []);

  const seek = useCallback(r => {
    const a = audioRef.current; if (a && dur) a.currentTime = r * dur;
  }, [dur]);

  const changeVol = useCallback(v => {
    setVol(v); if (audioRef.current) audioRef.current.volume = v;
  }, []);

  const handlePrev = useCallback(() => {
    if (queueIndex > 0) loadQueueTrack(queueIndex - 1, true);
  }, [queueIndex, loadQueueTrack]);

  const handleNext = useCallback(() => {
    if (queueIndex < queue.length - 1) loadQueueTrack(queueIndex + 1, true);
  }, [queueIndex, queue.length, loadQueueTrack]);

  const handleJumpTo = useCallback((idx) => {
    if (idx >= 0 && idx < queue.length) loadQueueTrack(idx, true);
  }, [queue.length, loadQueueTrack]);

  // ── Parse URL ─────────────────────────────────────────────────────────────
  const handleParse = useCallback(async inputUrl => {
    const u = (inputUrl || url).trim(); if (!u) return;
    setInfoLoad(true); setInfoError(''); setVideoInfo(null); setPlaylist(null);
    setTaskId(null); setStatus(null); setProgress(0); setDlUrl(null);
    setLogs([]); setLyrics(null); setFileSize(null);
    playlistTaskIds.current.clear(); // reset playlist task tracking
    try {
      const info = await getVideoInfo(u);
      setUrl(u);
      if (info.isPlaylist) setPlaylist(info);
      else                 setVideoInfo(info);
    } catch (e) {
      setInfoError(e.response?.data?.error || e.message);
    } finally { setInfoLoad(false); }
  }, [url]);

  // ── Single-track download ─────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!videoInfo) return;
    setStatus('pending'); setProgress(0); setDlUrl(null); setFileSize(null);
    setLogs([{ type:'log', text:'正在建立下载任务...' }]); setTab('progress');
    try {
      const res = await createDownload({
        url:          videoInfo.webpage_url || url,
        type:         mode,
        format:       audioFormat,
        quality:      videoQuality,
        outputFormat: videoFormat,
      });
      setTaskId(res.taskId);
      addLog('log', `任务 ID：${res.taskId}`);
    } catch (e) {
      setStatus('error');
      addLog('error', `创建失败：${e.response?.data?.error || e.message}`);
    }
  }, [videoInfo, url, mode, audioFormat, videoQuality, videoFormat]);

  // ── Cancel single-track download ─────────────────────────────────────────
  const handleCancel = useCallback(async (tid) => {
    if (!tid) return;
    try {
      await fetch(`/api/download/${tid}`, { method: 'DELETE' });
      setStatus('error');
      addLog('error', '下载已取消');
      setProgress(0);
    } catch (e) {
      console.warn('Cancel failed:', e.message);
    }
  }, []);

  // ── Playlist batch download ───────────────────────────────────────────────
  // FIX: onTaskCreated callback notifies PlaylistPanel of each taskId IMMEDIATELY
  // as it's created, preventing race condition where onDone fires before taskId
  // is written to state (fast downloads on first track while loop is still creating others).
  const handlePlaylistDownload = useCallback(async (selectedEntries, format, onTaskCreated) => {
    for (const entry of selectedEntries) {
      try {
        const res = await createDownload({
          url:          entry.url,
          type:         'audio',
          format,
          quality:      '1080p',
          outputFormat: 'mp4',
        });
        // Notify PlaylistPanel immediately — before any socket events can arrive
        if (onTaskCreated) onTaskCreated(entry.id, res.taskId);
        socket.emit('subscribe', res.taskId);
        playlistTaskIds.current.add(res.taskId);
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.warn('Playlist task failed:', e.message);
        if (onTaskCreated) onTaskCreated(entry.id, null);
      }
    }
  }, []);

  // ── onTrackReady: called by PlaylistPanel when each track finishes ────────
  const handleTrackReady = useCallback((track) => {
    enqueueTrack(track);
    // If player isn't playing anything yet, load this track
    setQueue(prev => {
      const idx = prev.findIndex(t => t.url === track.url);
      if (idx < 0) return prev; // not yet in queue (shouldn't happen)
      // If audio is idle (no src), load this track automatically
      if (audioRef.current && !audioRef.current.src) {
        audioRef.current.src = track.url;
        audioRef.current.load();
        setQueueIndex(idx);
        setCurTime(0); setDur(0);
      }
      return prev;
    });
  }, [enqueueTrack]);

  const fmtSz = b => {
    if (!b) return null;
    if (b > 1073741824) return `${(b / 1073741824).toFixed(2)} GB`;
    if (b > 1048576)    return `${(b / 1048576).toFixed(2)} MB`;
    return `${(b / 1024).toFixed(1)} KB`;
  };

  const isBusy = ['pending', 'running', 'converting'].includes(taskStatus);
  const isDone = taskStatus === 'done';

  return (
    <>
      <audio ref={audioRef} preload="metadata" style={{ display:'none' }}/>

      {/* Top bar */}
      <header className="topbar">
        <LogoIcon size={30}/>
        <div>
          <p style={{ fontWeight:700, fontSize:14.5, letterSpacing:'-0.3px', lineHeight:1.2, color:'var(--t1)' }}>
            MediaMagnet
          </p>
          <p style={{ fontSize:11, color:'var(--t3)', marginTop:1 }}>YouTube 音视频下载器</p>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          <ServerStatus/>
          <ThemeDropdown mode={themeMode} setMode={setThemeMode}/>
        </div>
      </header>

      <main className="page">
        <URLInput url={url} setUrl={setUrl} onParse={handleParse} loading={infoLoading} error={infoError}/>

        {/* Playlist mode */}
        {playlistInfo && (
          <div className="fade-up">
            <PlaylistPanel
              info={playlistInfo}
              onDownloadSelected={handlePlaylistDownload}
              onTrackReady={handleTrackReady}
            />
          </div>
        )}

        {/* Single-track mode */}
        {(videoInfo || infoLoading) && (
          <div className="fade-up">
            <VideoInfoCard info={videoInfo} loading={infoLoading}/>
          </div>
        )}
        {videoInfo && !infoLoading && (
          <div className="fade-up">
            <DownloadOptions
              mode={mode} setMode={setMode}
              audioFormat={audioFormat} setAF={setAF}
              videoQuality={videoQuality} setVQ={setVQ}
              videoFormat={videoFormat}  setVF={setVF}
            />
            <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn btn-red btn-xl" onClick={handleDownload} disabled={isBusy} style={{ flex:1, minWidth:160 }}>
                {isBusy
                  ? <><span className="spin" style={{ width:15, height:15, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%' }}/>处理中</>
                  : <>{mode==='audio' ? <FileMusic size={15}/> : <Video size={15}/>}开始下载<ChevronRight size={14}/></>
                }
              </button>
              {taskId && mode === 'audio' && (
                <a href={`/api/download/${taskId}/cover`} download className="btn btn-outline btn-xl">
                  下载封面
                </a>
              )}
            </div>
          </div>
        )}

        {taskStatus && (
          <div className="fade-up">
            <div className="tabs" style={{ marginBottom:14 }}>
              <button className={`tab ${activeTab==='progress'?'on':''}`} onClick={() => setTab('progress')}>下载进度</button>
              <button className={`tab ${activeTab==='lyrics'?'on':''}`} onClick={() => setTab('lyrics')}>
                歌词{lyrics ? ' ✓' : ''}
              </button>
            </div>
            {activeTab === 'progress' && (
              <ProgressPanel status={taskStatus} progress={progress} speed={speed} eta={eta}
                logs={logs} downloadUrl={downloadUrl} fileName={fileName}
                fileSize={isDone ? fmtSz(fileSize) : null} duration={videoInfo?.durationStr}
                taskId={taskId} onCancel={handleCancel}/>
            )}
            {activeTab === 'lyrics' && (
              <LyricsPanel lyrics={lyrics} setLyrics={setLyrics} videoInfo={videoInfo}/>
            )}
          </div>
        )}
      </main>

      <PersistentPlayer
        visible={playerOn}
        playing={playing}
        currentTime={curTime}
        duration={dur}
        volume={vol}
        queue={queue}
        queueIndex={queueIndex}
        onTogglePlay={togglePlay}
        onSeek={seek}
        onVolume={changeVol}
        onPrev={handlePrev}
        onNext={handleNext}
        onJumpTo={handleJumpTo}
        onClose={() => { setPlayerOn(false); audioRef.current?.pause(); }}
      />
    </>
  );
}
