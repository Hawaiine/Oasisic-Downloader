import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Clock, User, Disc3, Calendar, Download, X } from 'lucide-react';

// Fullscreen cover lightbox — rendered via React portal to document.body
function CoverPreview({ url, title, onClose }) {
  const boxRef = useRef(null);

  useEffect(() => {
    const onKey  = e => { if (e.key === 'Escape') onClose(); };
    const onDown = e => { if (boxRef.current && !boxRef.current.contains(e.target)) onClose(); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:99999,
        background:'rgba(0,0,0,0.84)', backdropFilter:'blur(14px)',
        WebkitBackdropFilter:'blur(14px)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:24,
        animation:'popIn .2s var(--ease)',
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
          boxShadow:'0 24px 64px rgba(0,0,0,0.7)',
          position:'relative',
        }}
      >
        <button onClick={onClose} style={{
          position:'absolute', top:10, right:10, zIndex:10,
          width:30, height:30, borderRadius:'50%',
          background:'rgba(0,0,0,0.7)', border:'1px solid rgba(255,255,255,0.25)',
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', color:'#fff',
        }}>
          <X size={14}/>
        </button>
        <img
          src={url}
          alt={title}
          style={{
            width:'100%', display:'block',
            objectFit:'contain', background:'var(--bg)',
            maxHeight:'72vh',
          }}
        />
        <div style={{
          display:'flex', alignItems:'center', gap:10,
          padding:'11px 16px', borderTop:'1px solid var(--border)',
        }}>
          <span style={{ flex:1, fontSize:12.5, color:'var(--t2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {title}
          </span>
          <a href={url} download="cover.jpg" target="_blank" rel="noreferrer"
            className="btn btn-tinted btn-sm">
            <Download size={12}/> 保存封面
          </a>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>收起</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Fix 3: 只显示最高可用画质/音质
function getBestBadges(formats) {
  if (!formats?.length) return [];
  const badges = [];

  // 音质: 只显示最高
  if (formats.some(f => f.format_id === '251')) {
    badges.push({ cls: 'bdg-cyan', text: 'Opus 160 kbps' });
  } else if (formats.some(f => f.acodec && f.acodec !== 'none')) {
    badges.push({ cls: 'bdg-muted', text: 'AAC' });
  }

  // 画质: 只显示最高
  const maxH = Math.max(...formats.filter(f => f.height).map(f => f.height), 0);
  if (maxH >= 2160)      badges.push({ cls: 'bdg-yellow', text: '4K' });
  else if (maxH >= 1440) badges.push({ cls: 'bdg-yellow', text: '2K' });
  else if (maxH >= 1080) badges.push({ cls: 'bdg-muted',  text: '1080p' });
  else if (maxH >= 720)  badges.push({ cls: 'bdg-muted',  text: '720p' });
  else if (maxH > 0)     badges.push({ cls: 'bdg-muted',  text: `${maxH}p` });

  return badges;
}

export default function VideoInfo({ info, loading }) {
  const [showCover, setShowCover] = useState(false);
  if (loading) return <Skeleton/>;
  if (!info) return null;
  const coverUrl = info.bestThumbnail || info.thumbnail;
  const qualityBadges = getBestBadges(info.formats);

  return (
    <div className="card card-p">
      <div style={{ display:'flex', gap:14 }}>
        {/* 封面缩略图 */}
        <div style={{
          flexShrink:0, width:118, height:88,
          borderRadius:'var(--r)', overflow:'hidden',
          background:'var(--surface-2)',
          cursor: coverUrl ? 'pointer' : 'default',
          position:'relative',
        }}
        onClick={() => coverUrl && setShowCover(v => !v)}
        title={coverUrl ? (showCover ? '收起' : '点击预览封面') : ''}>
          {coverUrl && <img src={coverUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>}
          <div style={{
            position:'absolute', bottom:5, right:5,
            background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)',
            borderRadius:3, padding:'1px 6px',
            fontFamily:'var(--mono)', fontSize:10.5, fontWeight:700, color:'#fff',
          }}>{info.durationStr}</div>
          {coverUrl && (
            <div className="cover-hover-overlay" style={{
              position:'absolute', inset:0,
              background:'rgba(0,0,0,0)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, color:'transparent',
              transition:'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(0,0,0,0.4)'; e.currentTarget.style.color='#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(0,0,0,0)'; e.currentTarget.style.color='transparent'; }}>
              {showCover ? '收起' : '预览'}
            </div>
          )}
        </div>

        {/* 信息区 */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:8 }}>
          <h2 style={{
            fontSize:14.5, fontWeight:600, lineHeight:1.4,
            display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden',
          }}>{info.title}</h2>

          <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 14px' }}>
            {info.artist && <Meta icon={<User size={11}/>} v={info.artist}/>}
            {info.album  && <Meta icon={<Disc3 size={11}/>} v={info.album}/>}
            {info.year   && <Meta icon={<Calendar size={11}/>} v={info.year}/>}
            <Meta icon={<Clock size={11}/>} v={info.durationStr}/>
          </div>

          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {qualityBadges.map(b => (
              <span key={b.text} className={`badge ${b.cls}`}>{b.text}</span>
            ))}
            <span className="badge bdg-green">可下载</span>
          </div>
        </div>
      </div>

      {showCover && coverUrl && (
        <CoverPreview url={coverUrl} title={info.title} onClose={() => setShowCover(false)}/>
      )}
    </div>
  );
}

function Meta({ icon, v }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <span style={{ color:'var(--t3)' }}>{icon}</span>
      <span style={{ fontSize:12, color:'var(--t2)' }}>{v}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="card card-p" style={{ display:'flex', gap:14 }}>
      <div className="skel" style={{ width:110, height:82, flexShrink:0 }}/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10 }}>
        <div className="skel" style={{ height:17, width:'80%' }}/>
        <div className="skel" style={{ height:12, width:'55%' }}/>
        <div className="skel" style={{ height:12, width:'40%' }}/>
      </div>
    </div>
  );
}
