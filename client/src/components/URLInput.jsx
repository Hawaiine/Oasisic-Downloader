import { useRef } from 'react';
import { Search, X, AlertCircle } from 'lucide-react';

// SVG 波形 Logo (在顶栏用)
export function LogoIcon({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="30" height="30" rx="8" fill="#e5382b"/>
      <rect x="5"  y="14" width="2.5" height="3"  rx="1.25" fill="white" opacity="0.55"/>
      <rect x="9"  y="11" width="2.5" height="9"  rx="1.25" fill="white" opacity="0.75"/>
      <rect x="13" y="7"  width="2.5" height="17" rx="1.25" fill="white"/>
      <rect x="17" y="10" width="2.5" height="11" rx="1.25" fill="white" opacity="0.8"/>
      <rect x="21" y="13" width="2.5" height="5"  rx="1.25" fill="white" opacity="0.6"/>
      <rect x="25" y="14.5" width="2" height="2"  rx="1"   fill="white" opacity="0.4"/>
    </svg>
  );
}

export default function URLInput({ url, setUrl, onParse, loading, error }) {
  const inputRef = useRef(null);

  // 直接监听 input 的 paste 事件 — 最可靠的粘贴方式
  const handleNativePaste = (e) => {
    const text = e.clipboardData?.getData('text/plain') || '';
    if (text.trim()) {
      e.preventDefault();
      const clean = text.trim();
      setUrl(clean);
      if (/youtube\.com|youtu\.be/.test(clean)) {
        setTimeout(() => onParse(clean), 0);
      }
    }
  };

  return (
    <div className="card card-p">
      <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.4px', marginBottom: 4 }}>
        音频 / 视频下载
      </h1>
      <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 18, lineHeight: 1.5 }}>
        输入链接，一键提取最高码率音频或指定分辨率视频，自动写入元数据与封面图。
      </p>

      {/* 输入行 */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--r-md)',
        padding: '5px 5px 5px 14px',
        transition: 'border-color var(--dur), box-shadow var(--dur)',
      }}
      onFocusCapture={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--red-dim)'; }}
      onBlurCapture={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        {/* Link icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="var(--t3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0 }}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>

        <input
          ref={inputRef}
          value={url}
          onChange={e => setUrl(e.target.value)}
          onPaste={handleNativePaste}
          onKeyDown={e => e.key === 'Enter' && url.trim() && onParse(url.trim())}
          placeholder="粘贴 YouTube 或 YouTube Music 链接... (Ctrl+V)"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--t1)', fontFamily: 'var(--font)', fontSize: 14.5, padding: '9px 0',
          }}
          autoFocus
        />

        {url && (
          <button className="btn btn-ghost btn-sq-sm"
            onClick={() => { setUrl(''); inputRef.current?.focus(); }}>
            <X size={14}/>
          </button>
        )}

        <button
          className="btn btn-red"
          style={{ borderRadius: 'var(--r)', padding: '9px 18px' }}
          onClick={() => onParse(url.trim())}
          disabled={loading || !url.trim()}
        >
          {loading
            ? <span className="spin" style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%' }}/>
            : <Search size={14}/>
          }
          解析
        </button>
      </div>

      {/* 提示文字代替无效的「粘贴」按钮 */}
      <p style={{ marginTop: 8, fontSize: 11.5, color: 'var(--t3)' }}>
        在输入框内按 <kbd style={{ padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border-3)', fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--surface-3)' }}>Ctrl+V</kbd> 粘贴链接后自动解析
      </p>

      {error && (
        <div style={{
          marginTop: 10, padding: '9px 13px',
          background: 'var(--red-dim)', border: '1px solid rgba(229,56,43,0.18)',
          borderRadius: 'var(--r-sm)', color: 'var(--red)', fontSize: 12.5,
          display: 'flex', alignItems: 'flex-start', gap: 7,
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }}/>
          {error}
        </div>
      )}
    </div>
  );
}
