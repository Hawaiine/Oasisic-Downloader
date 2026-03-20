import { Music2, Video, Zap } from 'lucide-react';

// Audio formats with descriptions (from reference design)
const AUDIO = [
  { id:'flac', hint:'无损 PCM 编码，完整保留原始动态范围，适合收藏与后期制作',          size:'~25–40 MB' },
  { id:'alac', hint:'Apple Lossless 无损压缩，与 Apple Music / iTunes 原生兼容',    size:'~18–28 MB' },
  { id:'m4a',  hint:'AAC 256 kbps，感知透明音质，移动端与 Apple 生态首选',            size:'~4–8 MB'   },
  { id:'mp3',  hint:'MP3 VBR V0，通用性最广，兼容所有播放器，平均约 240 kbps',         size:'~5–9 MB'   },
  { id:'wav',  hint:'原始 PCM，无任何压缩，适合 DAW 与专业后期处理，体积最大',         size:'~40–60 MB' },
  { id:'aac',  hint:'纯 AAC 裸流 256 kbps，无容器封装，用于特定嵌入场景',             size:'~4–8 MB'   },
  { id:'opus', hint:'YouTube 原始 Opus 码流约 160 kbps，无需二次转码，音质/体积比最优', size:'~3–5 MB'  },
];
const VQ = ['4k','2k','1080p','720p','480p'];
const VF = ['mp4','mkv'];

export default function DownloadOptions({ mode, setMode, audioFormat, setAF, videoQuality, setVQ, videoFormat, setVF }) {
  const cur = AUDIO.find(f => f.id === audioFormat);

  return (
    <div className="card card-p">
      <p className="label">下载类型</p>
      <div className="tabs" style={{ maxWidth:250, marginBottom:20 }}>
        <button className={`tab ${mode==='audio'?'on':''}`} onClick={()=>setMode('audio')}>
          <Music2 size={12} style={{display:'inline',marginRight:5}}/>音频
        </button>
        <button className={`tab ${mode==='video'?'on':''}`} onClick={()=>setMode('video')}>
          <Video size={12} style={{display:'inline',marginRight:5}}/>视频
        </button>
      </div>

      {mode==='audio' && (
        <>
          <p className="label">输出格式</p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
            {AUDIO.map(f => (
              <button key={f.id} className={`chip ${audioFormat===f.id?'on':''}`} onClick={()=>setAF(f.id)}>
                {f.id.toUpperCase()}
              </button>
            ))}
          </div>
          {cur && (
            <div style={{
              display:'flex', alignItems:'flex-start', gap:10,
              padding:'9px 12px', background:'var(--surface-2)',
              borderRadius:'var(--r-sm)', border:'1px solid var(--border)',
            }}>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:12.5, color:'var(--t2)', lineHeight:1.5 }}>{cur.hint}</p>
              </div>
              <span style={{
                flexShrink:0, fontFamily:'var(--mono)', fontSize:11.5,
                color:'var(--t3)', background:'var(--surface-3)',
                padding:'2px 8px', borderRadius:4, whiteSpace:'nowrap',
              }}>{cur.size}</span>
            </div>
          )}
        </>
      )}

      {mode==='video' && (
        <div style={{ display:'flex', gap:32, flexWrap:'wrap' }}>
          <div>
            <p className="label">目标分辨率</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {VQ.map(q => (
                <button key={q} className={`chip ${videoQuality===q?'on':''}`} onClick={()=>setVQ(q)}>
                  {q.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">封装格式</p>
            <div style={{ display:'flex', gap:6 }}>
              {VF.map(f => (
                <button key={f} className={`chip ${videoFormat===f?'on':''}`} onClick={()=>setVF(f)}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{
        marginTop:14, display:'flex', alignItems:'center', gap:8,
        padding:'8px 12px', background:'rgba(6,182,212,0.05)',
        border:'1px solid rgba(6,182,212,0.12)', borderRadius:'var(--r-sm)',
        fontSize:12, color:'var(--t2)',
      }}>
        <Zap size={12} color="var(--cyan)" style={{flexShrink:0}}/>
        aria2c 16 并发连接加速 · 强制 IPv4 · 失败自动重试 5 次
      </div>
    </div>
  );
}
