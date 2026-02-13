import { Loader2, History } from 'lucide-react';
import { t } from '../i18n';

export function ProgressBar({ status, savedCount, lang = 'zh', onHistoryClick }) {
  if (!status) return null;

  const { current = 0, total = 0, status: st, phase = 'process' } = status;
  const isProcessing = st === 'processing' || st === 'filtering';

  // 任务完成时：以实际保存数量为准，避免与总视频数不一致
  const displayCurrent = !isProcessing && savedCount != null && phase === 'process' ? savedCount : current;
  const pct = total > 0 ? Math.round((displayCurrent / total) * 100) : 0;

  const phaseLabel = phase === 'filter' ? t(lang, 'filterProgress') : phase === 'whisper' ? t(lang, 'whisperProgress') : t(lang, 'processProgress');
  const statusLabel = st === 'filtering' ? t(lang, 'filtering') : st === 'processing' ? (phase === 'whisper' ? t(lang, 'whisperConverting') : t(lang, 'processing')) : t(lang, 'taskProgress');

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isProcessing && <Loader2 size={18} className="animate-spin text-[var(--accent)]" />}
          <span className="text-sm text-[var(--muted)]">
            {isProcessing ? statusLabel : phaseLabel}
          </span>
        </div>
        <span className="text-sm font-mono flex items-center gap-2">
          {displayCurrent} / {total}
          {!isProcessing && savedCount != null && phase === 'process' && (
            <span className="text-[var(--muted)] font-normal">({t(lang, 'saved')})</span>
          )}
          {onHistoryClick && (
            <button
              onClick={onHistoryClick}
              className="p-1 rounded hover:bg-white/10 text-[var(--muted)]"
              title={t(lang, 'processHistory')}
            >
              <History size={16} />
            </button>
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
