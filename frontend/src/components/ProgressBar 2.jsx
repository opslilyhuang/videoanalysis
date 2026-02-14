import { Loader2 } from 'lucide-react';
import { t } from '../i18n';

export function ProgressBar({ status, savedCount, lang = 'zh' }) {
  if (!status) return null;

  const { current = 0, total = 0, status: st, phase = 'process' } = status;
  const isProcessing = st === 'processing' || st === 'filtering';

  // 任务完成时：以实际保存数量为准，避免与总视频数不一致
  const displayCurrent = !isProcessing && savedCount != null && phase === 'process' ? savedCount : current;
  const pct = total > 0 ? Math.round((displayCurrent / total) * 100) : 0;

  const phaseLabel = phase === 'filter' ? '筛选进度' : '处理进度';
  const statusLabel = st === 'filtering' ? '正在筛选...' : st === 'processing' ? '正在处理...' : '任务进度';

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isProcessing && <Loader2 size={18} className="animate-spin text-[var(--accent)]" />}
          <span className="text-sm text-[var(--muted)]">
            {isProcessing ? statusLabel : phaseLabel}
          </span>
        </div>
        <span className="text-sm font-mono">
          {displayCurrent} / {total}
          {!isProcessing && savedCount != null && phase === 'process' && (
            <span className="text-[var(--muted)] font-normal ml-1">(已保存)</span>
          )}
        </span>
      </div>
      <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
