import { useState, useEffect } from 'react';
import { Settings, X, Save } from 'lucide-react';
import { t } from '../i18n';

export function ConfigPanel({ config, appConfig, onSaveAppConfig, open, onClose, lang = 'zh' }) {
  const keywords = (config || {}).keywords || {};
  const thresholds = (config || {}).thresholds || {};
  const weights = (config || {}).weights || {};
  const [autoWhisper, setAutoWhisper] = useState(!!appConfig?.autoWhisperConvert);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  useEffect(() => {
    setAutoWhisper(!!appConfig?.autoWhisperConvert);
  }, [appConfig?.autoWhisperConvert, open]);

  useEffect(() => {
    if (!saveMsg) return;
    const t = setTimeout(() => setSaveMsg(null), 2500);
    return () => clearTimeout(t);
  }, [saveMsg]);

  const handleSaveAppConfig = async () => {
    if (!onSaveAppConfig) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const ok = await onSaveAppConfig({ autoWhisperConvert: autoWhisper });
      setSaveMsg(ok ? 'ok' : 'err');
    } catch (e) {
      setSaveMsg('err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-[var(--surface)] border-l border-[var(--border)] z-50 shadow-xl transform transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={20} />
            <h2 className="font-semibold">{t(lang, 'configTitle')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg"
            aria-label={t(lang, 'close')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 overflow-auto max-h-[calc(100vh-60px)] space-y-6">
          <Section title={t(lang, 'autoWhisperConvert')} desc={t(lang, 'autoWhisperConvertDesc')}>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input
                  type="checkbox"
                  checked={autoWhisper}
                  onChange={(e) => setAutoWhisper(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
                />
                <span className="text-sm">{t(lang, 'autoWhisperConvert')}</span>
              </label>
              <button
                onClick={handleSaveAppConfig}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 rounded-lg"
              >
                <Save size={14} />
                {saving ? t(lang, 'saving') : t(lang, 'save')}
              </button>
            </div>
            {saveMsg === 'ok' && (
              <p className="mt-2 text-sm text-emerald-500">{t(lang, 'saveSuccess')}</p>
            )}
            {saveMsg === 'err' && (
              <p className="mt-2 text-sm text-red-500">{t(lang, 'saveFailed')}</p>
            )}
          </Section>
          {config && (
            <>
              <Section title={t(lang, 'keywordWeights')} desc={t(lang, 'keywordWeightsDesc')}>
                <div className="space-y-2">
                  {Object.entries(keywords).map(([kw, score]) => (
                    <div
                      key={kw}
                      className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0"
                    >
                      <code className="text-[var(--accent)]">{kw}</code>
                      <span className="text-[var(--muted)]">{score} {t(lang, 'points')}</span>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title={t(lang, 'rankThresholds')} desc={t(lang, 'rankThresholdsDesc')}>
                <div className="space-y-2">
                  {Object.entries(thresholds).map(([rank, minScore]) => (
                    <div
                      key={rank}
                      className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0"
                    >
                      <span
                        className="font-bold"
                        style={{
                          color: rank === 'S' ? 'var(--rank-s)' : rank === 'A' ? 'var(--rank-a)' : 'var(--rank-b)',
                        }}
                      >
                        {rank}{t(lang, 'rankLevel')}
                      </span>
                      <span>≥ {minScore}</span>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title={t(lang, 'weightDistribution')} desc={t(lang, 'weightDistributionDesc')}>
                <div className="space-y-2">
                  {Object.entries(weights).map(([dim, w]) => (
                    <div
                      key={dim}
                      className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0"
                    >
                      <span>{dim === 'view' ? t(lang, 'weightView') : dim === 'time' ? t(lang, 'weightTime') : t(lang, 'weightKeyword')}</span>
                      <span>{(w * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}
          <p className="text-xs text-[var(--muted)]">
            {t(lang, 'configHint')}
          </p>
        </div>
      </aside>
    </>
  );
}

function Section({ title, desc, children }) {
  return (
    <div>
      <h3 className="font-medium mb-1">{title}</h3>
      <p className="text-sm text-[var(--muted)] mb-3">{desc}</p>
      {children}
    </div>
  );
}
