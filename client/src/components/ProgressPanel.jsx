import { useState } from 'react';
import { Download, ChevronDown, ChevronUp, HardDrive, X } from 'lucide-react';

function FI({ label, v }) {
  return (
    <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11.5, color:'var(--t3)' }}>
      <span style={{ color:'var(--t4)' }}>{label}:</span>
      <span style={{ color:'var(--t2)' }}>{v}</span>
    </span>
  );
}

const STATUS = {
  pending:    { label:'排队中',   color:'var(--t3)',    bg:'var(--surface-3)' },
  running:    { label:'下载中',   color:'var(--cyan)',  bg:'rgba(6,182,212,0.1)' },
  converting: { label:'处理中',   color:'var(--yellow)',bg:'rgba(245,158,11,0.1)' },
  done:       { label:'已完成',   color:'var(--green)', bg:'rgba(34,197,94,0.1)' },
  error:      { label:'失败',     color:'var(--red)',   bg:'rgba(229,56,43,0.1)' },
};

export default function ProgressPanel({
  status, progress, speed, eta,
  logs = [], downloadUrl, fileName, fileSize, duration,
  taskId,          // for cancel
  onCancel,        // cancel callback
}) {
  const [showLog, setShowLog] = useState(false);
  const isDone  = status === 'done';
  const isError = status === 'error';
  const isBusy  = ['pending','running','converting'].includes(status);
  const cfg     = STATUS[status] || STATUS.pending;
  const pct     = Math.round(progress || 0);

  return (
    <div className="card card-p">
      {/* Status row */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        {/* Spinning indicator or done icon */}
        <div style={{
          width:32, height:32, borderRadius:'50%', flexShrink:0,
          background: cfg.bg,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          {isBusy && (
            <span className="spin" style={{
              width:14, height:14, display:'block',
              border:`2px solid ${cfg.color}40`,
              borderTopColor: cfg.color,
              borderRadius:'50%',
            }}/>
          )}
          {isDone  && <span style={{ fontSize:16 }}>✓</span>}
          {isError && <span style={{ fontSize:16 }}>✗</span>}
        </div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontSize:13, fontWeight:600, color: cfg.color }}>{cfg.label}</span>
            {isBusy && (
              <span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--t2)' }}>
                {pct}%
                {speed && speed !== '-' && <span style={{ color:'var(--t3)', marginLeft:8 }}>{speed}</span>}
                {eta   && eta   !== '-' && <span style={{ color:'var(--t3)', marginLeft:4 }}>ETA {eta}</span>}
              </span>
            )}
            {isDone && fileSize && (
              <span className="badge bdg-muted" style={{ gap:4 }}>
                <HardDrive size={10}/>{fileSize}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {!isError && (
            <div className="prog prog-md" style={{ height:5 }}>
              <div
                className="prog-fill"
                style={{
                  width: `${isDone ? 100 : pct}%`,
                  transition: 'width .4s ease',
                  background: isError ? 'var(--red)' :
                              isDone  ? 'var(--green)' :
                              status === 'converting' ? 'var(--yellow)' :
                              'var(--red)',
                }}
              />
            </div>
          )}
        </div>

        {/* Cancel button (only while running) */}
        {isBusy && onCancel && taskId && (
          <button
            onClick={() => onCancel(taskId)}
            className="btn btn-ghost btn-sq-sm"
            title="取消下载"
            style={{ color:'var(--red)', flexShrink:0 }}
          >
            <X size={14}/>
          </button>
        )}

        {/* Log toggle */}
        <button
          className="btn btn-ghost btn-sq-sm"
          onClick={() => setShowLog(v => !v)}
          style={{ color:'var(--t3)', flexShrink:0 }}
          title={showLog ? '折叠日志' : '展开日志'}
        >
          {showLog ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
        </button>
      </div>

      {/* Log panel */}
      {showLog && (
        <div className="log-box" style={{ marginBottom: isDone ? 14 : 0 }}>
          {logs.length === 0
            ? <span className="log-line" style={{ color:'var(--t4)' }}>等待日志...</span>
            : logs.slice(-80).map((l, i) => (
                <span key={i} className={`log-line ${l.type || 'log'}`}>
                  {l.text || l}
                </span>
              ))
          }
        </div>
      )}

      {/* Done: download + file info */}
      {isDone && downloadUrl && (
        <div style={{ paddingTop: 12, borderTop:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <a href={downloadUrl} download={fileName} className="btn btn-red btn-sm">
              <Download size={13}/> 保存文件
            </a>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {fileName  && <FI label="文件名" v={fileName}/>}
              {fileSize  && <FI label="大小"   v={fileSize}/>}
              {duration  && <FI label="时长"   v={duration}/>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
