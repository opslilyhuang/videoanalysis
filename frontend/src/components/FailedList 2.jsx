import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Copy, ExternalLink } from 'lucide-react';
import { t } from '../i18n';

const RETRY_CMD = 'python palantir_analyzer.py --retry-failed';

export function FailedList({ failedVideos, lang = 'zh' }) {
  const [expanded, setExpanded] = useState(false);

  if (!failedVideos || failedVideos.length === 0) return null;

  const copyRetryCmd = () => {
    navigator.clipboard?.writeText(RETRY_CMD);
    setExpanded(true);
  };

  return (
    <div className="bg-[var(--surface)] border border-amber-500/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 text-left"
      >
        <div className="flex items-center gap-2">
          <AlertCircle size={20} className="text-amber-500" />
          <span className="font-medium">失败视频 ({failedVideos.length} 个)</span>
        </div>
        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-[var(--border)]">
          <div className="mt-3 p-3 bg-amber-500/10 rounded-lg flex items-center justify-between gap-4">
            <code className="text-sm flex-1 truncate">{RETRY_CMD}</code>
            <button
              onClick={copyRetryCmd}
              className="flex items-center gap-2 px-3 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded text-sm shrink-0"
            >
              <Copy size={14} />
              复制命令
            </button>
          </div>
          <p className="text-sm text-[var(--muted)] mt-2">在项目根目录运行上述命令，手动重新处理失败项</p>
          <div className="mt-4 space-y-2 max-h-60 overflow-auto">
            {failedVideos.map((v, i) => (
              <div
                key={v.video_id || i}
                className="flex items-center justify-between gap-4 py-2 border-b border-[var(--border)] last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{v.title || 'Unknown'}</div>
                  <div className="text-xs text-[var(--muted)] truncate">{v.error}</div>
                </div>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[var(--accent)] hover:text-[var(--accent-hover)]"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
