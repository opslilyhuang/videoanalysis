import { useState, useEffect } from 'react';
import { X, History } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { t } from '../i18n';

export function ProgressHistoryModal({ open, onClose, dashboardId = 'palantirtech', lang = 'zh' }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (open) {
      apiFetch(`/api/status-history?dashboard_id=${dashboardId}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setHistory)
        .catch(() => setHistory([]));
    }
  }, [open, dashboardId]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <History size={20} />
                {t(lang, 'processHistory')}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-[var(--muted)] text-center py-8">暂无历史记录</p>
              ) : (
                [...history].reverse().map((h, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-lg bg-[var(--bg)] border border-[var(--border)]"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--muted)]">
                        {h.phase_label || (h.phase === 'filter' ? t(lang, 'filterProgress') : t(lang, 'processProgress'))}
                      </span>
                      <span className="text-[var(--muted)]">
                        {h.completedAt
                          ? new Date(h.completedAt).toLocaleString()
                          : h.updatedAt
                          ? new Date(h.updatedAt).toLocaleString()
                          : '-'}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-4 text-sm">
                      <span>
                        {h.current} / {h.total}
                      </span>
                      {h.failed_count > 0 && (
                        <span className="text-amber-500">{t(lang, 'failed')}: {h.failed_count}</span>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)]"
                        style={{
                          width: h.total > 0 ? `${Math.round((h.current / h.total) * 100)}%` : '0%',
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
