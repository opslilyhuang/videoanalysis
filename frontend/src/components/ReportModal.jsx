import { useState, useEffect, useCallback } from 'react';
import { FileText, X, Loader2, History, FileDown, Trash2 } from 'lucide-react';
import { t, getViewsOptions } from '../i18n';
import { apiFetch } from '../utils/api';
import { useFilters } from '../context/FilterContext';
import { applyVideoFilters } from '../utils/filterVideos';

const REPORT_TEMPLATE_PREVIEW = `# Palantir 视频分析智能报告

## 一、报告概述
## 二、筛选范围说明
## 三、核心观点提炼
## 四、产品/功能分析
## 五、客户案例洞察
## 六、趋势与建议
## 附录：参考视频列表`;

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function reportStatusLabel(status, lang) {
  const map = {
    pending: lang === 'zh' ? '待开始' : 'Pending',
    processing: lang === 'zh' ? '进行中' : 'Processing',
    completed: lang === 'zh' ? '已完成' : 'Completed',
    failed: lang === 'zh' ? '生成失败' : 'Failed',
  };
  return map[status] || status;
}

function downloadReportAsPdf(reportText, title = '智能报告') {
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) return;
  win.document.write(`
<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6;color:#333}
h1{font-size:1.5em}h2{font-size:1.2em}pre{white-space:pre-wrap;font-family:inherit}
@media print{body{margin:0}}</style></head><body>
<pre>${reportText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 300);
}

export function ReportModal({ open, onClose, dashboardId, lang = 'zh', videos = [], config }) {
  const { filters: contextFilters } = useFilters();
  const [tab, setTab] = useState('generate'); // 'generate' | 'history'
  const [mode, setMode] = useState('filter');
  const [customPrompt, setCustomPrompt] = useState('');
  const [nlQuery, setNlQuery] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingReport, setViewingReport] = useState(null);
  const [reportFilters, setReportFilters] = useState({
    search: '',
    searchInKeywords: false,
    rankFilter: '',
    rankFilterMulti: '',
    transcriptFilter: '',
    categoryFilter: '',
    dateFrom: '',
    dateTo: '',
    viewsMin: 0,
    viewsMax: 0,
  });

  const fetchHistory = useCallback(async () => {
    if (!dashboardId) return;
    setHistoryLoading(true);
    try {
      const r = await apiFetch(`/api/report/history?dashboard_id=${dashboardId}`);
      if (r.ok) {
        const data = await r.json();
        setHistory(Array.isArray(data) ? data : []);
      }
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => {
    if (open) {
      setReportFilters({
        search: contextFilters.search || '',
        searchInKeywords: contextFilters.searchInKeywords || false,
        rankFilter: contextFilters.rankFilter || '',
        rankFilterMulti: contextFilters.rankFilterMulti || '',
        transcriptFilter: contextFilters.transcriptFilter || '',
        categoryFilter: contextFilters.categoryFilter || '',
        dateFrom: contextFilters.dateFrom || '',
        dateTo: contextFilters.dateTo || '',
        viewsMin: contextFilters.viewsMin ?? 0,
        viewsMax: contextFilters.viewsMax ?? 0,
      });
      if (tab === 'history') fetchHistory();
    }
  }, [open, contextFilters, tab, fetchHistory]);

  // 有进行中/待开始时轮询历史
  const hasPending = history.some((h) => h.status === 'pending' || h.status === 'processing');
  useEffect(() => {
    if (!open || !hasPending || !dashboardId) return;
    const id = setInterval(fetchHistory, 2000);
    return () => clearInterval(id);
  }, [open, hasPending, dashboardId, fetchHistory]);

  const filteredCount = applyVideoFilters(videos, reportFilters, config?.keywords).length;

  const handleGenerate = async () => {
    setError(null);
    if (mode === 'nl' && !nlQuery.trim()) {
      setError(t(lang, 'reportNlRequired'));
      return;
    }
    setGenerating(true);
    try {
      const body = {
        mode,
        dashboard_id: dashboardId,
        custom_prompt: customPrompt.slice(0, 1000) || undefined,
        nl_query: mode === 'nl' ? nlQuery.trim() : undefined,
        filters: mode === 'filter' ? reportFilters : undefined,
      };
      const r = await apiFetch('/api/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        let msg = data.detail || data.error || '生成失败';
        if (r.status === 404 || msg === 'Not Found') {
          msg = lang === 'zh'
            ? '接口未找到。请：① 运行 python api.py ② 在 frontend/.env 添加 VITE_API_BASE=http://localhost:8000 并重启前端'
            : 'API not found. Run python api.py, add VITE_API_BASE=http://localhost:8000 to frontend/.env, restart frontend';
        }
        throw new Error(msg);
      }
      await fetchHistory();
      setTab('history');  // 切到历史报告，显示新记录（待开始/进行中）
    } catch (e) {
      setError(e.message || t(lang, 'requestFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const handleViewReport = async (id) => {
    try {
      const r = await apiFetch(`/api/report/${id}?dashboard_id=${dashboardId}`);
      if (r.ok) {
        const data = await r.json();
        setViewingReport(data);
      }
    } catch {
      setError(t(lang, 'requestFailed'));
    }
  };

  const handleDownloadPdf = async (id, reportText, title) => {
    if (reportText) {
      downloadReportAsPdf(reportText, title);
      return;
    }
    try {
      const r = await apiFetch(`/api/report/${id}?dashboard_id=${dashboardId}`);
      if (r.ok) {
        const data = await r.json();
        downloadReportAsPdf(data.report, data.title || title);
      }
    } catch {
      setError(t(lang, 'requestFailed'));
    }
  };

  const handleDeleteReport = async (id) => {
    if (!confirm(lang === 'zh' ? '确定删除此报告？' : 'Delete this report?')) return;
    try {
      const res = await apiFetch(`/api/report/${id}?dashboard_id=${dashboardId}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory((h) => h.filter((x) => x.id !== id));
        if (viewingReport?.id === id) setViewingReport(null);
      }
    } catch {
      setError(t(lang, 'requestFailed'));
    }
  };

  const handleClose = () => {
    setViewingReport(null);
    setError(null);
    setCustomPrompt('');
    setNlQuery('');
    setTab('generate');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">{t(lang, 'reportGenerate')}</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setTab('generate'); setViewingReport(null); }}
              className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'generate' && !viewingReport ? 'bg-[var(--accent)]/30 text-[var(--accent)]' : 'hover:bg-white/10'}`}
            >
              {t(lang, 'reportGenerate')}
            </button>
            <button
              onClick={() => { setTab('history'); setViewingReport(null); fetchHistory(); }}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${tab === 'history' && !viewingReport ? 'bg-[var(--accent)]/30 text-[var(--accent)]' : 'hover:bg-white/10'}`}
            >
              <History size={14} />
              {t(lang, 'reportHistory')}
            </button>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {viewingReport ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setViewingReport(null)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--text)]"
                >
                  ← {lang === 'zh' ? '返回列表' : 'Back'}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownloadPdf(viewingReport.id, viewingReport.report, viewingReport.title)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30 text-[var(--accent)]"
                  >
                    <FileDown size={14} />
                    {t(lang, 'reportDownloadPdf')}
                  </button>
                  <button
                    onClick={() => handleDeleteReport(viewingReport.id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-500/20 hover:bg-red-500/30 text-red-400"
                  >
                    <Trash2 size={14} />
                    {t(lang, 'reportDelete')}
                  </button>
                </div>
              </div>
              <div className="text-xs text-[var(--muted)] mb-2">
                {viewingReport.title} · {formatDate(viewingReport.created_at)}
              </div>
              <div className="p-4 rounded-lg bg-[var(--bg)] border border-[var(--border)] overflow-auto max-h-[50vh]">
                {viewingReport.report ? (
                  <pre className="text-sm leading-relaxed whitespace-pre-wrap font-sans">{viewingReport.report}</pre>
                ) : (
                  <p className="text-[var(--muted)]">{viewingReport.error || (lang === 'zh' ? '报告内容加载中或生成失败' : 'Loading or failed')}</p>
                )}
              </div>
            </div>
          ) : tab === 'history' ? (
            <div>
              {historyLoading ? (
                <div className="flex items-center gap-2 text-[var(--muted)] py-8">
                  <Loader2 size={18} className="animate-spin" />
                  {t(lang, 'loading')}
                </div>
              ) : history.length === 0 ? (
                <p className="text-[var(--muted)] py-8">{t(lang, 'reportNoHistory')}</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--accent)]/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{h.title || t(lang, 'reportFilterReport')}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                            h.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                            h.status === 'processing' || h.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                            h.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-[var(--bg)] text-[var(--muted)]'
                          }`}>
                            {h.status === 'processing' || h.status === 'pending' ? (
                              <span className="flex items-center gap-1">
                                <Loader2 size={12} className="animate-spin" />
                                {reportStatusLabel(h.status, lang)}
                              </span>
                            ) : (
                              reportStatusLabel(h.status, lang)
                            )}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--muted)] mt-0.5">
                          {formatDate(h.created_at)}
                          {h.selected_count > 0 && ` · ${h.selected_count} ${lang === 'zh' ? '个视频' : 'videos'}`}
                          {h.status === 'failed' && h.error && ` · ${h.error}`}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-2">
                        {h.status === 'completed' && (
                          <>
                            <button
                              onClick={() => handleViewReport(h.id)}
                              className="px-2 py-1 text-xs rounded bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30 text-[var(--accent)]"
                            >
                              {t(lang, 'reportView')}
                            </button>
                            <button
                              onClick={() => handleDownloadPdf(h.id, null, h.title)}
                              className="px-2 py-1 text-xs rounded hover:bg-white/10"
                              title={t(lang, 'reportDownloadPdf')}
                            >
                              <FileDown size={14} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDeleteReport(h.id)}
                          className="px-2 py-1 text-xs rounded hover:bg-red-500/20 text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="reportMode"
                    checked={mode === 'filter'}
                    onChange={() => setMode('filter')}
                  />
                  <span className="text-sm">{t(lang, 'reportModeFilter')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="reportMode"
                    checked={mode === 'nl'}
                    onChange={() => setMode('nl')}
                  />
                  <span className="text-sm">{t(lang, 'reportModeNl')}</span>
                </label>
              </div>

              {mode === 'filter' && (
                <>
                  <div className="text-sm text-[var(--muted)]">
                    {t(lang, 'reportModeFilterDesc')}
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--muted)]">{t(lang, 'reportFilterConditions')}</span>
                      <span className="text-sm font-medium text-[var(--accent)]">
                        {t(lang, 'reportMatchCount', { n: filteredCount })}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        placeholder={t(lang, 'searchPlaceholder')}
                        value={reportFilters.search}
                        onChange={(e) => setReportFilters((f) => ({ ...f, search: e.target.value }))}
                        className="px-2 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded w-40"
                      />
                      <select
                        value={reportFilters.categoryFilter}
                        onChange={(e) => setReportFilters((f) => ({ ...f, categoryFilter: e.target.value }))}
                        className="px-2 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded"
                      >
                        <option value="">{t(lang, 'categoryAll')}</option>
                        <option value="产品介绍">{t(lang, 'categoryProduct')}</option>
                        <option value="非产品介绍">{t(lang, 'categoryNonProduct')}</option>
                        <option value="其他">{t(lang, 'categoryOther')}</option>
                      </select>
                      <select
                        value={reportFilters.rankFilter}
                        onChange={(e) => setReportFilters((f) => ({ ...f, rankFilter: e.target.value }))}
                        className="px-2 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded"
                      >
                        <option value="">{t(lang, 'rankAll')}</option>
                        <option value="S">S</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                      </select>
                      <select
                        value={reportFilters.rankFilterMulti}
                        onChange={(e) => setReportFilters((f) => ({ ...f, rankFilterMulti: e.target.value }))}
                        className="px-2 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded"
                      >
                        <option value="">{t(lang, 'rankFilter')}</option>
                        <option value="S+">{t(lang, 'rankSOnly')}</option>
                        <option value="A+">{t(lang, 'rankAAbove')}</option>
                        <option value="B+">{t(lang, 'rankBAbove')}</option>
                      </select>
                      <select
                        value={reportFilters.transcriptFilter}
                        onChange={(e) => setReportFilters((f) => ({ ...f, transcriptFilter: e.target.value }))}
                        className="px-2 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded"
                      >
                        <option value="">{t(lang, 'transcriptAll')}</option>
                        <option value="有">{t(lang, 'transcriptHas')}</option>
                        <option value="youtube">{t(lang, 'transcriptNative')}</option>
                        <option value="whisper">{t(lang, 'transcriptWhisperFilter')}</option>
                        <option value="无">{t(lang, 'transcriptNo')}</option>
                      </select>
                      <input
                        type="month"
                        value={reportFilters.dateFrom}
                        onChange={(e) => setReportFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                        className="px-2 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded w-36"
                      />
                      <span className="text-[var(--muted)]">-</span>
                      <input
                        type="month"
                        value={reportFilters.dateTo}
                        onChange={(e) => setReportFilters((f) => ({ ...f, dateTo: e.target.value }))}
                        className="px-2 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded w-36"
                      />
                      <select
                        value={reportFilters.viewsMin}
                        onChange={(e) => setReportFilters((f) => ({ ...f, viewsMin: Number(e.target.value) }))}
                        className="px-2 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded w-24"
                      >
                        {getViewsOptions(lang).map(([val, lbl]) => (
                          <option key={`min-${val}`} value={val}>{val === 0 ? t(lang, 'viewsAny') : lbl}</option>
                        ))}
                      </select>
                      <select
                        value={reportFilters.viewsMax}
                        onChange={(e) => setReportFilters((f) => ({ ...f, viewsMax: Number(e.target.value) }))}
                        className="px-2 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded w-24"
                      >
                        {getViewsOptions(lang).map(([val, lbl]) => (
                          <option key={`max-${val}`} value={val}>{val === 0 ? t(lang, 'viewsAny') : lbl}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[var(--muted)] mb-2">{t(lang, 'reportTemplate')}</div>
                    <pre className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-xs overflow-auto max-h-32 whitespace-pre-wrap">
                      {REPORT_TEMPLATE_PREVIEW}
                    </pre>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)]">{t(lang, 'reportCustomPrompt')} (1000{t(lang, 'reportChars')})</label>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      maxLength={1000}
                      placeholder={t(lang, 'reportCustomPromptPlaceholder')}
                      className="mt-1 w-full px-3 py-2 text-sm bg-[var(--bg)] border border-[var(--border)] rounded-lg resize-none h-24"
                    />
                    <div className="text-xs text-[var(--muted)] mt-1">{customPrompt.length}/1000</div>
                  </div>
                </>
              )}

              {mode === 'nl' && (
                <>
                  <div className="text-sm text-[var(--muted)]">
                    {t(lang, 'reportModeNlDesc')}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)]">{t(lang, 'reportNlQuery')}</label>
                    <textarea
                      value={nlQuery}
                      onChange={(e) => setNlQuery(e.target.value)}
                      placeholder={t(lang, 'reportNlQueryPlaceholder')}
                      className="mt-1 w-full px-3 py-2 text-sm bg-[var(--bg)] border border-[var(--border)] rounded-lg resize-none h-32"
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={generating || (mode === 'filter' && filteredCount === 0)}
                  className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  {generating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  {generating ? t(lang, 'reportGenerating') : t(lang, 'reportGenerateBtn')}
                </button>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm"
                >
                  {t(lang, 'close')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
