/**
 * PersistentPlayer.jsx
 *
 * Audio player bar with queue (playlist) support.
 *
 * Props:
 *   visible, playing, currentTime, duration, volume
 *   queue: [{ title, artist, thumbnail, url, fileName }]
 *   queueIndex: number
 *   onTogglePlay, onSeek(ratio), onVolume(v), onClose
 *   onPrev, onNext  — navigate queue
 */
import { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X, Music, List } from 'lucide-react';

export default function PersistentPlayer({
  visible, playing, currentTime, duration, volume,
  queue = [], queueIndex = 0,
  onTogglePlay, onSeek, onVolume, onClose, onPrev, onNext, onJumpTo,
}) {
  const [muted,     setMuted]     = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  const pct     = duration ? (currentTime / duration) * 100 : 0;
  const current = queue[queueIndex] || {};
  const hasPrev = queueIndex > 0;
  const hasNext = queueIndex < queue.length - 1;

  const fmt = s => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const handleSeek = e => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek((e.clientX - r.left) / r.width);
  };

  return (
    <div className={`player ${!visible ? 'off' : ''}`}>
      {/* Seek strip */}
      <div className="player-seek" onClick={handleSeek} title="点击跳转">
        <div className="player-seek-fill" style={{ width:`${pct}%` }}/>
      </div>

      {/* Cover */}
      <div style={{
        flexShrink:0, width:42, height:42,
        borderRadius:'var(--r-sm)', overflow:'hidden',
        background:'var(--surface-3)',
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow:'var(--sh-sm)',
      }}>
        {current.thumbnail
          ? <img src={current.thumbnail} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
          : <Music size={18} style={{ color:'var(--t3)', opacity:0.5 }}/>
        }
      </div>

      {/* Track info */}
      <div style={{ flex:1, minWidth:0, overflow:'hidden' }}>
        <p style={{
          fontSize:13.5, fontWeight:600, lineHeight:1.3,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          color:'var(--t1)',
        }}>
          {current.title || '—'}
        </p>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:2 }}>
          <p style={{
            fontSize:12, color:'var(--t2)',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            flex:1,
          }}>
            {current.artist || ''}
          </p>
          {/* Queue position */}
          {queue.length > 1 && (
            <span style={{ fontSize:11, color:'var(--t3)', flexShrink:0 }}>
              {queueIndex + 1}/{queue.length}
            </span>
          )}
        </div>
      </div>

      {/* Time */}
      <span style={{
        fontFamily:'var(--mono)', fontSize:11.5, color:'var(--t3)',
        flexShrink:0, userSelect:'none', minWidth:72, textAlign:'center',
      }}>
        {fmt(currentTime)}<span style={{ opacity:0.4, margin:'0 2px' }}>/</span>{fmt(duration)}
      </span>

      {/* Controls */}
      <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
        {/* Prev */}
        <button
          className="btn btn-ghost btn-sq"
          onClick={onPrev}
          disabled={!hasPrev}
          title="上一曲"
          style={{ color: hasPrev ? 'var(--t2)' : 'var(--t4)', opacity: hasPrev ? 1 : 0.3 }}
        >
          <SkipBack size={15}/>
        </button>

        {/* Play/Pause */}
        <button
          onClick={onTogglePlay}
          title={playing ? '暂停' : '播放'}
          style={{
            width:36, height:36, borderRadius:'50%',
            background:'var(--red)', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 2px 8px var(--red-glow)',
            transition:'transform .12s, background .12s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--red-bright)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--red)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.93)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {playing
            ? <Pause  size={16} fill="white" color="white"/>
            : <Play   size={16} fill="white" color="white" style={{ marginLeft:2 }}/>
          }
        </button>

        {/* Next */}
        <button
          className="btn btn-ghost btn-sq"
          onClick={onNext}
          disabled={!hasNext}
          title="下一曲"
          style={{ color: hasNext ? 'var(--t2)' : 'var(--t4)', opacity: hasNext ? 1 : 0.3 }}
        >
          <SkipForward size={15}/>
        </button>
      </div>

      {/* Volume */}
      <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
        <button
          className="btn btn-ghost btn-sq-sm"
          onClick={() => { const n = !muted; setMuted(n); onVolume(n ? 0 : (volume || 0.8)); }}
          style={{ color:'var(--t2)' }}
          title={muted || volume === 0 ? '取消静音' : '静音'}
        >
          {muted || volume === 0 ? <VolumeX size={14}/> : <Volume2 size={14}/>}
        </button>
        <input
          type="range" min="0" max="1" step="0.02"
          value={muted ? 0 : volume}
          onChange={e => { setMuted(false); onVolume(parseFloat(e.target.value)); }}
          style={{
            width:64, cursor:'pointer', accentColor:'var(--red)',
            appearance:'none', WebkitAppearance:'none',
            height:3, borderRadius:2, outline:'none', border:'none',
            background:`linear-gradient(to right, var(--red) ${(muted ? 0 : volume) * 100}%, var(--surface-3) ${(muted ? 0 : volume) * 100}%)`,
          }}
          title="音量"
        />
      </div>

      {/* Queue toggle (only shown when queue has >1 item) */}
      {queue.length > 1 && (
        <button
          className="btn btn-ghost btn-sq-sm"
          onClick={() => setShowQueue(v => !v)}
          style={{ color: showQueue ? 'var(--red)' : 'var(--t2)' }}
          title="播放队列"
        >
          <List size={14}/>
        </button>
      )}

      {/* Close */}
      <button
        className="btn btn-ghost btn-sq-sm"
        onClick={onClose}
        title="关闭播放器"
        style={{ color:'var(--t3)' }}
      >
        <X size={14}/>
      </button>

      {/* Queue popup */}
      {showQueue && queue.length > 1 && (
        <div style={{
          position:'absolute', bottom:'calc(100% + 6px)', right:16,
          width:280, maxHeight:320, overflowY:'auto',
          background:'var(--surface)', border:'1px solid var(--border-2)',
          borderRadius:'var(--r-md)', boxShadow:'var(--sh-md)',
          zIndex:1001,
        }}>
          <div style={{ padding:'10px 14px 6px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:12.5, fontWeight:600, color:'var(--t1)' }}>
              播放队列 ({queue.length})
            </span>
            <button
              className="btn btn-ghost btn-sq-sm"
              onClick={() => setShowQueue(false)}
              style={{ color:'var(--t3)' }}
            >
              <X size={12}/>
            </button>
          </div>
          {queue.map((track, i) => (
            <div
              key={i}
              onDoubleClick={() => { if (i !== queueIndex && onJumpTo) onJumpTo(i); }}
              title={i !== queueIndex ? '双击播放' : '正在播放'}
              style={{
                display:'flex', alignItems:'center', gap:9,
                padding:'8px 14px',
                background: i === queueIndex ? 'var(--red-dim)' : 'transparent',
                borderBottom: i < queue.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: i !== queueIndex ? 'pointer' : 'default',
                transition:'background 0.12s',
              }}
              onMouseEnter={e => { if (i !== queueIndex) e.currentTarget.style.background='var(--hover)'; }}
              onMouseLeave={e => { if (i !== queueIndex) e.currentTarget.style.background='transparent'; }}
            >
              {/* Playing indicator */}
              <span style={{ fontSize:10, color:'var(--red)', width:14, textAlign:'center', flexShrink:0 }}>
                {i === queueIndex ? (playing ? '▶' : '‖') : ''}
              </span>
              <span style={{ fontSize:11.5, color:'var(--t3)', width:18, textAlign:'right', flexShrink:0 }}>
                {i + 1}
              </span>
              {track.thumbnail && (
                <img src={track.thumbnail} alt="" style={{ width:30, height:22, borderRadius:2, objectFit:'cover', flexShrink:0 }}/>
              )}
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:12, color: i === queueIndex ? 'var(--red)' : 'var(--t1)', fontWeight: i === queueIndex ? 600 : 400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {track.title || '—'}
                </p>
                {track.artist && (
                  <p style={{ fontSize:10.5, color:'var(--t3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {track.artist}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
