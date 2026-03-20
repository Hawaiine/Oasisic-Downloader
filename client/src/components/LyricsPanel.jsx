import { useState, useCallback } from 'react';
import { Copy, Check, RefreshCw, AlertCircle, Music, Search, Info } from 'lucide-react';

// FIX 2+3: Removed QQ Music and Musixmatch (broken/unreliable).
// Apple Music kept but marked as "需配置". Spotify shown only if useful.
const SOURCES = [
  { id:'auto',       label:'自动',         note:'按优先级依次尝试所有可用来源' },
  { id:'netease',    label:'网易云音乐',    note:'中文歌曲覆盖最全，支持翻译歌词' },
  { id:'lrclib',     label:'LRCLib',       note:'开源歌词库，国际曲目覆盖广，支持时间轴' },
  { id:'applemusic', label:'Apple Music',  note:'需在 server/.env 配置 APPLE_MUSIC_TOKEN（Apple 开发者账号）', needsConfig:true },
  { id:'spotify',    label:'Spotify',      note:'需配置 SPOTIFY_CLIENT_ID + SECRET，仅返回曲目匹配信息，不含歌词', needsConfig:true },
];

export default function LyricsPanel({ lyrics, setLyrics, videoInfo }) {
  const [source,      setSource]      = useState('auto');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [copied,      setCopied]      = useState(false);
  const [showTrans,   setShowTrans]   = useState(false);
  const [showManual,  setShowManual]  = useState(false);
  const [manualTitle, setMT]          = useState('');
  const [manualArtist,setMA]          = useState('');

  const doFetch = useCallback(async (src, t, a) => {
    setLoading(true); setError('');
    try {
      const p = new URLSearchParams({
        title:  t || videoInfo?.title  || videoInfo?.track || '',
        artist: a || videoInfo?.artist || '',
        source: src || source,
      });
      const res  = await window.fetch(`/api/lyrics?${p}`);
      const data = await res.json();
      if (data.success && data.data) {
        setLyrics(data.data);
      } else {
        setError(data.message || data.error || '当前来源未找到歌词');
        setLyrics(null);
      }
    } catch (e) { setError('请求失败：' + e.message); }
    finally { setLoading(false); }
  }, [videoInfo, source, setLyrics]);

  const handleSrc = (s) => { setSource(s); doFetch(s); };

  const copyLRC = async () => {
    const text = lyrics?.lrc || lyrics?.plain || '';
    if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, ta.value.length);
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  const parsed = lyrics?.lrc ? parseLRC(lyrics.lrc) : [];
  const lyricsHasError = lyrics?.error;
  const currentSrc = SOURCES.find(s => s.id === source);

  return (
    <div className="card card-p">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <span style={{ fontWeight:600, fontSize:14, color:'var(--t1)' }}>歌词</span>
        {lyrics?.source && !lyricsHasError && (
          <span className="badge bdg-blue" style={{ fontSize:11 }}>
            {SOURCES.find(s=>s.id===lyrics.source)?.label || lyrics.source}
          </span>
        )}
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowManual(v=>!v)}>
            <Search size={12}/> 手动搜索
          </button>
          <button className="btn btn-ghost btn-sm"
            onClick={() => doFetch(source)} disabled={loading || !videoInfo}>
            <RefreshCw size={12} className={loading?'spin':''}/> {loading?'获取中':'刷新'}
          </button>
          {(lyrics?.lrc || lyrics?.plain) && !lyricsHasError && (
            <button className="btn btn-ghost btn-sm" onClick={copyLRC}>
              {copied ? <><Check size={12} color="var(--green)"/>已复制</> : <><Copy size={12}/>复制歌词</>}
            </button>
          )}
        </div>
      </div>

      {/* Source chips */}
      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:6 }}>
        {SOURCES.map(s => (
          <button key={s.id}
            className={`src-chip ${source===s.id?'on':''}`}
            onClick={() => handleSrc(s.id)}
            title={s.note}
            style={{ opacity: s.needsConfig ? 0.65 : 1 }}
          >
            {s.label}
            {s.needsConfig && <span style={{ fontSize:9, marginLeft:3, opacity:0.7 }}>*需配置</span>}
          </button>
        ))}
      </div>
      <p style={{ fontSize:11.5, color:'var(--t3)', marginBottom:14 }}>
        {currentSrc?.note}
      </p>

      {/* Manual search */}
      {showManual && (
        <div style={{ marginBottom:14, padding:'12px 14px', background:'var(--surface-2)',
          borderRadius:'var(--r)', border:'1px solid var(--border-2)' }}>
          <p className="label" style={{ marginBottom:8 }}>手动搜索</p>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <input className="input" style={{ flex:2, minWidth:120 }}
              placeholder="歌曲名称 *" value={manualTitle} onChange={e=>setMT(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&manualTitle.trim()&&doFetch(source,manualTitle.trim(),manualArtist.trim())}/>
            <input className="input" style={{ flex:1, minWidth:90 }}
              placeholder="艺术家" value={manualArtist} onChange={e=>setMA(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&manualTitle.trim()&&doFetch(source,manualTitle.trim(),manualArtist.trim())}/>
            <button className="btn btn-red btn-sm"
              disabled={!manualTitle.trim()||loading}
              onClick={()=>manualTitle.trim()&&doFetch(source,manualTitle.trim(),manualArtist.trim())}>
              <Search size={13}/> 搜索
            </button>
          </div>
        </div>
      )}

      <div className="hr" style={{ margin:'0 0 14px' }}/>

      {/* Config hint for Apple Music / Spotify */}
      {lyricsHasError && lyrics?.message && (
        <div style={{ padding:'10px 14px', marginBottom:12,
          background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)',
          borderRadius:'var(--r-sm)' }}>
          <div style={{ display:'flex', gap:7 }}>
            <Info size={14} color="var(--yellow)" style={{ flexShrink:0, marginTop:1 }}/>
            <div>
              <p style={{ fontSize:12.5, fontWeight:600, color:'var(--yellow)', marginBottom:4 }}>需要配置 API 凭证</p>
              <pre style={{ fontFamily:'var(--mono)', fontSize:11.5, color:'var(--t2)', whiteSpace:'pre-wrap', lineHeight:1.7 }}>
                {lyrics.message}
              </pre>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding:'9px 13px', marginBottom:12, background:'var(--red-dim)',
          border:'1px solid rgba(229,56,43,0.18)', borderRadius:'var(--r-sm)',
          color:'var(--red)', fontSize:12.5, display:'flex', gap:7 }}>
          <AlertCircle size={14} style={{ flexShrink:0, marginTop:1 }}/>{error}
        </div>
      )}

      {/* Empty state */}
      {!lyrics && !loading && !error && (
        <div style={{ padding:'36px 0', textAlign:'center', color:'var(--t3)' }}>
          <Music size={30} style={{ opacity:0.2, marginBottom:10 }}/>
          <p style={{ fontSize:13.5, marginBottom:4, color:'var(--t2)' }}>暂无歌词</p>
          <p style={{ fontSize:12 }}>下载完成后自动获取，或点击「刷新」手动搜索</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding:'32px 0', textAlign:'center', color:'var(--t3)' }}>
          <div className="spin" style={{ width:22,height:22,border:'2px solid var(--surface-3)',
            borderTopColor:'var(--red)',borderRadius:'50%',margin:'0 auto 10px' }}/>
          <p style={{ fontSize:13 }}>正在从 {currentSrc?.label} 获取...</p>
        </div>
      )}

      {/* Lyrics content */}
      {lyrics && !loading && !lyricsHasError && (
        <>
          {(lyrics.title || lyrics.artist) && (
            <div style={{ padding:'8px 13px', background:'var(--surface-2)',
              borderRadius:'var(--r-sm)', marginBottom:12 }}>
              {lyrics.title  && <p style={{ fontWeight:600, fontSize:13.5, color:'var(--t1)' }}>{lyrics.title}</p>}
              {lyrics.artist && <p style={{ fontSize:12.5, color:'var(--t2)', marginTop:2 }}>{lyrics.artist}</p>}
            </div>
          )}

          {parsed.length > 0 && (
            <div style={{ maxHeight:360, overflowY:'auto', border:'1px solid var(--border)',
              borderRadius:'var(--r-sm)' }}>
              {parsed.map((line,i) => (
                <div key={i} style={{ display:'flex', gap:12, padding:'5px 14px',
                  background: i%2===0 ? 'transparent' : 'var(--surface-2)',
                  borderBottom: i<parsed.length-1 ? '1px solid var(--border)' : 'none' }}>
                  {line.time && (
                    <span className="mono" style={{ fontSize:11, color:'var(--t3)',
                      flexShrink:0, width:50, paddingTop:3 }}>{line.time}</span>
                  )}
                  <span style={{ fontSize:13.5, color:line.text?'var(--t1)':'var(--t3)', lineHeight:1.65 }}>
                    {line.text || '♪'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Plain text fallback (no timestamps) */}
          {parsed.length === 0 && lyrics.plain && (
            <pre style={{ whiteSpace:'pre-wrap', fontFamily:'var(--font)', fontSize:13.5,
              lineHeight:2, color:'var(--t1)', padding:'8px 0' }}>
              {lyrics.plain}
            </pre>
          )}

          {/* Translation toggle */}
          {lyrics.tlyric && (
            <div style={{ marginTop:10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTrans(v=>!v)}>
                {showTrans ? '▲ 收起' : '▼ 翻译歌词'}
              </button>
              {showTrans && (
                <div style={{ marginTop:8, maxHeight:200, overflowY:'auto',
                  border:'1px solid var(--border)', borderRadius:'var(--r-sm)',
                  padding:'10px 14px', fontSize:13, lineHeight:2, color:'var(--t2)' }}>
                  {parseLRC(lyrics.tlyric).map((l,i)=><div key={i}>{l.text||''}</div>)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function parseLRC(lrc) {
  return (lrc||'').split('\n').map(line => {
    const m = line.match(/^\[(\d{2}:\d{2}[.:]\d{2,3})\](.*)/);
    if (m) return { time:m[1], text:m[2].trim() };
    return { time:'', text:line.replace(/^\[.*?\]/g,'').trim() };
  });
}
