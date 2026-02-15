import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink, FileText, FileQuestion, Mic, X, Star, Trash2, RotateCcw, Download, Copy, Loader2 } from 'lucide-react';
import JSZip from 'jszip';
import { t, getViewsOptions } from '../i18n';
import { useFilters } from '../context/FilterContext';
import { useLayout } from '../context/LayoutContext';

const RANK_COLORS = { S: 'var(--rank-s)', A: 'var(--rank-a)', B: 'var(--rank-b)' };
const PAGE_SIZES = [10, 20, 50];

function extractVideoId(url) {
  if (!url) return null;
  const m = (url || '').match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

const PRODUCT_KEYWORDS = ['AIPCon', 'Foundrycon', 'Paragon', 'Pipeline', 'AIP', 'Foundry', 'Gotham', 'Apollo', 'Demo', 'Tutorial', 'Workshop', 'Case Study', 'Bootcamp', 'How to', 'Guide'];

export function VideoList({ videos, loading, selectedVideo, onVideoSelect, lang = 'zh', dashboardId, onConvertSuccess, config, scrollToVideoId, onScrolledToVideo, isEmptyTemp, onTranscriptConverted, viewMode = 'main', onViewModeChange, favoritesCount = 0, recycleCount = 0, showFavoritesRecycle = false, onTempDelete, onFavorite, onRecycle, onRestore, onRemoveFromRecycle, isFavorite, isRecycled }) {
  const { setFilters } = useFilters();
  const { leftPct } = useLayout();
  const keywords = config?.keywords && Object.keys(config.keywords).length > 0 ? Object.keys(config.keywords) : PRODUCT_KEYWORDS;
  const [search, setSearch] = useState('');
  const [searchInKeywords, setSearchInKeywords] = useState(false);
  const [transcriptFilter, setTranscriptFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewsMin, setViewsMin] = useState(0);
  const [viewsMax, setViewsMax] = useState(0);
  const [sortBy, setSortBy] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [overlayVideo, setOverlayVideo] = useState(null); // { videoId, title } 仅点击视频时显示
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [batchDownloadOpen, setBatchDownloadOpen] = useState(false);

  const isTempWithDelete = (dashboardId === 'temp' || dashboardId === 'slim') && onTempDelete;

  const handleBatchDownloadTranscripts = async (mode, format) => {
    if (!dashboardId || selectedIds.size === 0) return;
    setBatchDownloadOpen(false);
    setBatchDownloading(true);
    const { apiFetch } = await import('../utils/api');
    const ids = [...selectedIds];
    const selectedVideos = filtered.filter((v) => ids.includes(extractVideoId(v.URL)));
    const results = [];
    for (const v of selectedVideos) {
      const vid = extractVideoId(v.URL);
      if (!vid) continue;
      try {
        const r = await apiFetch(`/api/transcript/${vid}?dashboard_id=${dashboardId}`);
        if (r.ok) {
          const d = await r.json();
          const text = d.transcript || '';
          results.push({ vid, title: (v.Title || vid).replace(/[^\w\s\u4e00-\u9fa5-]/g, '').slice(0, 50), text });
        }
      } catch {}
    }
    try {
      if (mode === 'merged') {
        const sep = '\n\n' + '='.repeat(80) + '\n\n';
        const body = results.map((r) => `# ${r.title}\n\n${r.text}`).join(sep);
        const content = format === 'md' ? body : results.map((r) => r.text).join(sep);
        const ext = format === 'md' ? 'md' : 'txt';
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `transcripts.${ext}`;
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        const zip = new JSZip();
        const ext = format === 'md' ? 'md' : 'txt';
        for (const r of results) {
          const content = format === 'md' ? `# ${r.title}\n\n${r.text}` : r.text;
          zip.file(`${r.title}.${ext}`, content);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'transcripts.zip';
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } finally {
      setBatchDownloading(false);
    }
  };

  const filtered = useMemo(() => {
    let list = [...videos];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((v) => {
        const matchTitle = (v.Title || '').toLowerCase().includes(q);
        if (matchTitle) return true;
        if (searchInKeywords && (v.Keywords || ''))
          return (v.Keywords || '').toLowerCase().includes(q);
        return matchTitle;
      });
    }
    if (transcriptFilter === '有') list = list.filter((v) => v.Transcript === '有');
    else if (transcriptFilter === '无') list = list.filter((v) => v.Transcript === '无');
    else if (transcriptFilter === 'whisper') list = list.filter((v) => v.Transcript === '有' && (v.TranscriptSource || '').toLowerCase() === 'whisper');
    else if (transcriptFilter === 'youtube') list = list.filter((v) => v.Transcript === '有' && (v.TranscriptSource || '').toLowerCase() !== 'whisper');
    if (categoryFilter) {
      if (categoryFilter === '产品介绍') {
        list = list.filter((v) => {
          const text = ((v.Title || '') + ' ' + (v.Keywords || '')).toLowerCase();
          return keywords.some((kw) => text.includes(kw.toLowerCase()));
        });
      } else if (categoryFilter === '其他') {
        list = list.filter((v) => (v.Category || v.category || '') === '其他');
      } else if (categoryFilter === '非产品介绍') {
        list = list.filter((v) => {
          const text = ((v.Title || '') + ' ' + (v.Keywords || '')).toLowerCase();
          const isProduct = keywords.some((kw) => text.includes(kw.toLowerCase()));
          return !isProduct && (v.Category || v.category || '') !== '其他';
        });
      } else {
        list = list.filter((v) => (v.Category || v.category || '') === categoryFilter);
      }
    }
    if (dateFrom) {
      const from = dateFrom.slice(0, 10);
      list = list.filter((v) => {
        const d = (v.Date || '').slice(0, 10) || (v.Date || '').slice(0, 7);
        return d && d !== 'Unknown' && d >= from;
      });
    }
    if (dateTo) {
      const to = dateTo.slice(0, 10);
      list = list.filter((v) => {
        const d = (v.Date || '').slice(0, 10) || (v.Date || '').slice(0, 7);
        return d && d !== 'Unknown' && d <= to;
      });
    }
    if (viewsMin && Number(viewsMin) > 0) list = list.filter((v) => Number(v.Views || 0) >= Number(viewsMin));
    if (viewsMax && Number(viewsMax) > 0) list = list.filter((v) => Number(v.Views || 0) <= Number(viewsMax));
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') {
        cmp = (a.Date || '').localeCompare(b.Date || '');
      } else if (sortBy === 'score') {
        cmp = parseFloat(a.Score || 0) - parseFloat(b.Score || 0);
      } else if (sortBy === 'views') {
        cmp = parseInt(a.Views || 0, 10) - parseInt(b.Views || 0, 10);
      } else if (sortBy === 'rank') {
        const order = { S: 3, A: 2, B: 1 };
        cmp = (order[a.Rank] || 0) - (order[b.Rank] || 0);
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [videos, search, searchInKeywords, transcriptFilter, categoryFilter, dateFrom, dateTo, viewsMin, viewsMax, sortBy, sortAsc, keywords]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [search, transcriptFilter, categoryFilter, dateFrom, dateTo, viewsMin, viewsMax, pageSize]);

  useEffect(() => {
    if (!scrollToVideoId || !onScrolledToVideo) return;
    const idx = filtered.findIndex((v) => extractVideoId(v.URL) === scrollToVideoId);
    if (idx < 0) {
      onScrolledToVideo();
      return;
    }
    const targetPage = Math.floor(idx / pageSize) + 1;
    setPage(targetPage);
  }, [scrollToVideoId, onScrolledToVideo, filtered, pageSize]);

  useEffect(() => {
    if (!scrollToVideoId || !onScrolledToVideo) return;
    const inPage = paginated.some((v) => extractVideoId(v.URL) === scrollToVideoId);
    if (!inPage) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-video-id="${scrollToVideoId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      onScrolledToVideo();
    }, 50);
    return () => clearTimeout(timer);
  }, [scrollToVideoId, onScrolledToVideo, paginated]);

  useEffect(() => {
    setFilters({
      search,
      searchInKeywords,
      transcriptFilter,
      categoryFilter,
      dateFrom,
      dateTo,
      viewsMin,
      viewsMax,
    });
  }, [search, searchInKeywords, transcriptFilter, categoryFilter, dateFrom, dateTo, viewsMin, viewsMax, setFilters]);

  const toggleSort = (key) => {
    if (sortBy === key) setSortAsc((a) => !a);
    else setSortBy(key);
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-[var(--muted)]">{t(lang, 'loading')}</div>
    );
  }

  if (isEmptyTemp) {
    return (
      <div className="border border-[var(--border)] rounded-lg p-8 text-center">
        <p className="text-[var(--muted)]">{t(lang, 'tempEmptyHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
            <input
              type="text"
              placeholder={t(lang, 'searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)] whitespace-nowrap">
            <input type="checkbox" checked={searchInKeywords} onChange={(e) => setSearchInKeywords(e.target.checked)} />
            {t(lang, 'searchInKeywords')}
          </label>
          <select value={transcriptFilter} onChange={(e) => setTranscriptFilter(e.target.value)} className="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm">
            <option value="">{t(lang, 'transcriptAll')}</option>
            <option value="有">{t(lang, 'transcriptHas')}</option>
            <option value="youtube">{t(lang, 'transcriptNative')}</option>
            <option value="whisper">{t(lang, 'transcriptWhisperFilter')}</option>
            <option value="无">{t(lang, 'transcriptNo')}</option>
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm">
            <option value="">{t(lang, 'categoryAll')}</option>
            <option value="产品介绍">{t(lang, 'categoryProduct')}</option>
            <option value="非产品介绍">{t(lang, 'categoryNonProduct')}</option>
            <option value="其他">{t(lang, 'categoryOther')}</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-sm text-[var(--muted)]">{t(lang, 'dateRange')}</span>
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { days: 7, key: 'dateRange1w' },
              { days: 30, key: 'dateRange1m' },
              { days: 90, key: 'dateRange3m' },
              { days: 365, key: 'dateRange1y' },
            ].map(({ days, key }) => {
              const to = new Date();
              const from = new Date(to);
              from.setDate(from.getDate() - days);
              const fromStr = from.toISOString().slice(0, 10);
              const toStr = to.toISOString().slice(0, 10);
              const active = dateFrom === fromStr && dateTo === toStr;
              return (
                <button
                  key={key}
                  onClick={() => { setDateFrom(fromStr); setDateTo(toStr); }}
                  className={`px-2 py-1.5 text-xs rounded ${active ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]'}`}
                >
                  {t(lang, key)}
                </button>
              );
            })}
          </div>
          <input type="date" placeholder={t(lang, 'dateFrom')} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-2 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm w-36" />
          <span className="text-[var(--muted)]">-</span>
          <input type="date" placeholder={t(lang, 'dateTo')} value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-2 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm w-36" />
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-sm text-[var(--muted)]">{t(lang, 'viewsMin')}</span>
          <select value={viewsMin} onChange={(e) => setViewsMin(Number(e.target.value))} className="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm w-24">
            {getViewsOptions(lang).map(([val, lbl]) => (
              <option key={`min-${val}`} value={val}>{val === 0 ? t(lang, 'viewsAny') : lbl}</option>
            ))}
          </select>
          <span className="text-sm text-[var(--muted)]">{t(lang, 'viewsMax')}</span>
          <select value={viewsMax} onChange={(e) => setViewsMax(Number(e.target.value))} className="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm w-24">
            {getViewsOptions(lang).map(([val, lbl]) => (
              <option key={`max-${val}`} value={val}>{val === 0 ? t(lang, 'viewsAny') : lbl}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {[
            { key: 'date', labelKey: 'sortDate' },
            { key: 'score', labelKey: 'sortScore' },
            { key: 'views', labelKey: 'sortViews' },
          ].map(({ key, labelKey }) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={`px-3 py-2 rounded-lg text-sm ${
                sortBy === key
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]'
              }`}
            >
              {t(lang, labelKey)}
              {sortBy === key && (sortAsc ? <ChevronUp size={12} className="inline ml-1" /> : <ChevronDown size={12} className="inline ml-1" />)}
            </button>
          ))}
        </div>
        {isTempWithDelete && (
          <div className="flex items-center gap-2 mr-2">
            <button
              onClick={() => setSelectedIds(new Set(paginated.map((v) => extractVideoId(v.URL)).filter(Boolean)))}
              className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]"
            >
              {t(lang, 'selectAll')}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]"
            >
              {t(lang, 'clearSelection')}
            </button>
            <button
              onClick={async () => {
                if (selectedIds.size === 0 || !window.confirm(t(lang, 'tempBatchDeleteConfirm', { n: selectedIds.size }))) return;
                const { apiFetch } = await import('../utils/api');
                const r = await apiFetch('/api/temp-delete-videos', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ video_ids: [...selectedIds], dashboard_id: dashboardId }),
                });
                if (r.ok) {
                  setSelectedIds(new Set());
                  onConvertSuccess?.();
                }
              }}
              disabled={selectedIds.size === 0}
              className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-500 hover:bg-red-500/30 disabled:opacity-50"
            >
              {t(lang, 'tempBatchDelete', { n: selectedIds.size })}
            </button>
            <div className="relative">
              <button
                onClick={() => setBatchDownloadOpen((o) => !o)}
                disabled={selectedIds.size === 0 || batchDownloading}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-50"
              >
                {batchDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {t(lang, 'tempDownloadTranscripts')}
              </button>
              {batchDownloadOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBatchDownloadOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 py-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-20 min-w-[140px]">
                    <button onClick={() => handleBatchDownloadTranscripts('merged', 'txt')} className="w-full px-3 py-2 text-left text-xs hover:bg-white/10">
                      {t(lang, 'tempDownloadMerged')} (TXT)
                    </button>
                    <button onClick={() => handleBatchDownloadTranscripts('merged', 'md')} className="w-full px-3 py-2 text-left text-xs hover:bg-white/10">
                      {t(lang, 'tempDownloadMerged')} (MD)
                    </button>
                    <button onClick={() => handleBatchDownloadTranscripts('zip', 'txt')} className="w-full px-3 py-2 text-left text-xs hover:bg-white/10">
                      {t(lang, 'tempDownloadZip')} (TXT)
                    </button>
                    <button onClick={() => handleBatchDownloadTranscripts('zip', 'md')} className="w-full px-3 py-2 text-left text-xs hover:bg-white/10">
                      {t(lang, 'tempDownloadZip')} (MD)
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => {
                const headers = ['Rank', 'Score', 'Title', 'Date', 'Views', 'Transcript', 'Category', 'URL'];
                const row = (v) => headers.map((h) => `"${String(v[h] || '').replace(/"/g, '""')}"`).join(',');
                const csv = [headers.join(','), ...filtered.map(row)].join('\n');
                const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'temp_upload_list.csv';
                a.click();
                URL.revokeObjectURL(a.href);
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]"
            >
              <Download size={12} />
              {t(lang, 'tempExportCsv')}
            </button>
          </div>
        )}
        {showFavoritesRecycle && (
          <div className="flex items-center gap-2 ml-auto mr-2">
            <button
              onClick={() => onViewModeChange?.(viewMode === 'favorites' ? 'main' : 'favorites')}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1 ${
                viewMode === 'favorites'
                  ? 'bg-amber-500/20 text-amber-600 border-amber-500/50'
                  : 'bg-[var(--surface)] border-[var(--border)] hover:border-amber-500/50'
              }`}
              title={t(lang, 'favorites')}
            >
              <Star size={14} fill={viewMode === 'favorites' ? 'currentColor' : 'none'} />
              {t(lang, 'favorites')}
              {favoritesCount > 0 && <span className="text-xs opacity-75">({favoritesCount})</span>}
            </button>
            <button
              onClick={() => onViewModeChange?.(viewMode === 'recycle' ? 'main' : 'recycle')}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1 ${
                viewMode === 'recycle'
                  ? 'bg-red-500/20 text-red-500 border-red-500/50'
                  : 'bg-[var(--surface)] border-[var(--border)] hover:border-red-500/50'
              }`}
              title={t(lang, 'recycleBin')}
            >
              <Trash2 size={14} />
              {t(lang, 'recycleBin')}
              {recycleCount > 0 && <span className="text-xs opacity-75">({recycleCount})</span>}
            </button>
          </div>
        )}
        <span className={`text-sm text-[var(--muted)] ${showFavoritesRecycle ? '' : 'ml-auto'}`}>{t(lang, 'perPage')}</span>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-2 py-1 bg-[var(--surface)] border border-[var(--border)] rounded text-sm">
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-sm text-[var(--muted)]">{t(lang, 'items')}</span>
      </div>

      <div className="space-y-1">
        {paginated.map((v) => (
          <div key={v._id} data-video-id={extractVideoId(v.URL)}>
            <VideoRow
            video={v}
            lang={lang}
            isSelected={selectedVideo && extractVideoId(selectedVideo.URL) === extractVideoId(v.URL)}
            onSelect={() => onVideoSelect?.(v)}
            expanded={expandedId === v._id}
            onToggle={() => setExpandedId(expandedId === v._id ? null : v._id)}
            onVideoClick={(videoId, title) => setOverlayVideo({ videoId, title })}
            dashboardId={dashboardId}
            onConvertSuccess={onConvertSuccess}
            onTranscriptConverted={onTranscriptConverted}
            viewMode={viewMode}
            onTempDelete={onTempDelete}
            isTempWithDelete={isTempWithDelete}
            selectedIds={selectedIds}
            onToggleSelect={(vid) => setSelectedIds((s) => {
              const next = new Set(s);
              if (next.has(vid)) next.delete(vid);
              else next.add(vid);
              return next;
            })}
            onFavorite={onFavorite}
            onRecycle={onRecycle}
            onRestore={onRestore}
            onRemoveFromRecycle={onRemoveFromRecycle}
            isFavorite={isFavorite}
            isRecycled={isRecycled}
          />
          </div>
        ))}
      </div>
      {overlayVideo && createPortal(
        <VideoOverlay
          videoId={overlayVideo.videoId}
          title={overlayVideo.title}
          onClose={() => setOverlayVideo(null)}
          leftPct={leftPct}
        />,
        document.body
      )}

      <div className="flex items-center justify-between pt-4">
        <span className="text-sm text-[var(--muted)]">
          {t(lang, 'totalPage', { n: filtered.length, p: page, t: totalPages })}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-2 rounded bg-[var(--surface)] border border-[var(--border)] disabled:opacity-50 hover:border-[var(--accent)]"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-2 rounded bg-[var(--surface)] border border-[var(--border)] disabled:opacity-50 hover:border-[var(--accent)]"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-12 text-[var(--muted)]">{t(lang, 'noMatch')}</div>
      )}
    </div>
  );
}

const CONVERT_POLL_INTERVAL = 5000;
const CONVERT_POLL_MAX = 120;

function InlineCopyButton({ vid, dashboardId, lang, title }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async (e) => {
    e.stopPropagation();
    if (!vid || !dashboardId || loading) return;
    setLoading(true);
    try {
      const { apiFetch } = await import('../utils/api');
      const r = await apiFetch(`/api/transcript/${vid}?dashboard_id=${dashboardId}`);
      if (r.ok) {
        const d = await r.json();
        await navigator.clipboard?.writeText(d.transcript || '');
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <button onClick={handleClick} disabled={loading} className="p-1.5 rounded hover:bg-[var(--accent)]/20 text-[var(--muted)] hover:text-[var(--accent)] disabled:opacity-50" title={title}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
    </button>
  );
}

function InlineDownloadButton({ video, vid, dashboardId, lang, title }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async (e) => {
    e.stopPropagation();
    if (!vid || !dashboardId || loading) return;
    setLoading(true);
    try {
      const { apiFetch } = await import('../utils/api');
      const r = await apiFetch(`/api/transcript/${vid}?dashboard_id=${dashboardId}`);
      if (r.ok) {
        const d = await r.json();
        const text = d.transcript || '';
        const name = ((video?.Title || vid).replace(/[^\w\s\u4e00-\u9fa5-]/g, '') || 'transcript').slice(0, 50) + '.txt';
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <button onClick={handleClick} disabled={loading} className="p-1.5 rounded hover:bg-[var(--accent)]/20 text-[var(--muted)] hover:text-[var(--accent)] disabled:opacity-50" title={title}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
    </button>
  );
}

function VideoRow({ video, lang = 'zh', expanded, onToggle, isSelected, onSelect, onVideoClick, dashboardId, onConvertSuccess, onTranscriptConverted, viewMode = 'main', onTempDelete, isTempWithDelete, selectedIds, onToggleSelect, onFavorite, onRecycle, onRestore, onRemoveFromRecycle, isFavorite, isRecycled }) {
  const rankColor = RANK_COLORS[video.Rank] || 'var(--muted)';
  const vid = extractVideoId(video.URL || video.url);
  const [converting, setConverting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const showFavRecycle = dashboardId && dashboardId !== 'temp' && (onFavorite || onRecycle || onRestore || onRemoveFromRecycle);
  const showTempDelete = (dashboardId === 'temp' || dashboardId === 'slim') && onTempDelete;

  const handleConvert = async (e) => {
    e.stopPropagation();
    if (!vid || !dashboardId || converting) return;
    if (!window.confirm(t(lang, 'convertSingleConfirm'))) return;
    setConverting(true);
    try {
      const { apiFetch } = await import('../utils/api');
      const r = await apiFetch(`/api/convert-transcript/${vid}?dashboard_id=${dashboardId}`, { method: 'POST' });
      if (!r.ok) return;
      for (let i = 0; i < CONVERT_POLL_MAX; i++) {
        await new Promise((resolve) => setTimeout(resolve, CONVERT_POLL_INTERVAL));
        const sr = await apiFetch(`/api/transcript-ready/${vid}?dashboard_id=${dashboardId}`);
        const sd = sr.ok ? await sr.json() : {};
        if (sd.ready) {
          onConvertSuccess?.();
          onTranscriptConverted?.();
          break;
        }
      }
    } finally {
      setConverting(false);
    }
  };

  const handleDeleteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!vid) return;
    if (deleting) return;
    if (!window.confirm(t(lang, 'tempDeleteConfirm'))) return;
    setDeleting(true);
    Promise.resolve(onTempDelete?.(vid)).finally(() => setDeleting(false));
  };

  return (
    <div
      className={`bg-[var(--surface)] border rounded-lg overflow-hidden transition-all ${
        expanded ? 'border-[var(--accent)]' : isSelected ? 'border-[var(--accent)]/50' : 'border-[var(--border)]'
      }`}
    >
      <div className="flex items-center gap-4 px-4 py-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => { onToggle(); onSelect?.(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); onSelect?.(); } }}
          className="flex-1 min-w-0 flex items-center gap-4 hover:bg-white/5 -m-3 p-3 rounded cursor-pointer"
        >
          {isTempWithDelete && vid && (
            <input
              type="checkbox"
              checked={selectedIds?.has(vid) || false}
              onChange={(e) => { e.stopPropagation(); onToggleSelect?.(vid); }}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            />
          )}
          <span
            className="w-8 h-8 rounded flex items-center justify-center font-bold text-sm text-black shrink-0"
            style={{ backgroundColor: rankColor }}
          >
            {video.Rank}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{video.Title}</div>
            <div className="text-sm text-[var(--muted)] flex gap-4 mt-0.5">
              <span>{video.Date}</span>
              <span>Score: {video.Score}</span>
              <span>Views: {Number(video.Views || 0).toLocaleString()}</span>
              <span className="flex items-center gap-2">
                {video.Transcript === '有' ? (
                  (video.TranscriptSource || '').toLowerCase() === 'whisper' ? (
                    <Mic size={14} className="text-violet-500" title={t(lang, 'transcriptWhisper')} />
                  ) : (
                    <FileText size={14} className="text-green-500" title={t(lang, 'transcriptHas')} />
                  )
                ) : (
                  <>
                    <FileQuestion size={14} className="text-amber-500" />
                    {dashboardId && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleConvert(e); }}
                        disabled={converting}
                        className="px-2 py-0.5 text-xs rounded bg-amber-500/20 text-amber-600 hover:bg-amber-500/30 disabled:opacity-50"
                      >
                        {converting ? '...' : t(lang, 'convertTranscript')}
                      </button>
                    )}
                  </>
                )}
                {video.Transcript === '有' ? t(lang, 'transcriptHas') : t(lang, 'transcriptNo')}
              </span>
            </div>
          </div>
          {showFavRecycle && (
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              {viewMode === 'recycle' ? (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRestore?.(dashboardId, vid); }}
                    className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-500"
                    title={t(lang, 'restoreFromRecycle')}
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); window.confirm(lang === 'zh' ? '确定彻底删除？' : 'Delete permanently?') && onRemoveFromRecycle?.(dashboardId, vid); }}
                    className="p-1.5 rounded hover:bg-red-500/20 text-red-500"
                    title={t(lang, 'removeFromRecycle')}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onFavorite?.(dashboardId, vid); }}
                    className={`p-1.5 rounded hover:bg-amber-500/20 ${(isFavorite && isFavorite(dashboardId, vid)) ? 'text-amber-500' : 'text-[var(--muted)]'}`}
                    title={(isFavorite && isFavorite(dashboardId, vid)) ? t(lang, 'favoriteRemove') : t(lang, 'favoriteAdd')}
                  >
                    <Star size={16} fill={(isFavorite && isFavorite(dashboardId, vid)) ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRecycle?.(dashboardId, vid); }}
                    className="p-1.5 rounded hover:bg-red-500/20 text-[var(--muted)] hover:text-red-500"
                    title={t(lang, 'moveToRecycle')}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          )}
          {expanded ? (
            <ChevronUp size={20} className="text-[var(--muted)] shrink-0" />
          ) : (
            <ChevronDown size={20} className="text-[var(--muted)] shrink-0" />
          )}
        </div>
        {showTempDelete && (
          <div className="flex items-center gap-1 shrink-0">
            {video.Transcript === '有' && (
              <>
                <InlineCopyButton vid={vid} dashboardId={dashboardId} lang={lang} title={t(lang, 'tempCopyRow')} />
                <InlineDownloadButton video={video} vid={vid} dashboardId={dashboardId} lang={lang} title={t(lang, 'tempDownloadRow')} />
              </>
            )}
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={deleting || !vid}
              className="p-1.5 rounded hover:bg-red-500/20 text-red-500 disabled:opacity-50 shrink-0"
              title={t(lang, 'tempDeleteFromList')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-[var(--border)] mt-0 pt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
            <MetaItem label={t(lang, 'labelTitle')} value={video.Title} />
            <MetaItem label={t(lang, 'labelDate')} value={video.Date} />
            <MetaItem label={t(lang, 'labelScore')} value={video.Score} />
            <MetaItem label={t(lang, 'labelRank')} value={video.Rank} />
            <MetaItem label={t(lang, 'labelViews')} value={Number(video.Views || 0).toLocaleString()} />
            <MetaItem label={t(lang, 'labelTranscript')} value={video.Transcript === '有' ? ((video.TranscriptSource || '').toLowerCase() === 'whisper' ? t(lang, 'transcriptWhisper') : t(lang, 'transcriptHas')) : t(lang, 'transcriptNo')} />
          </div>
          {video.URL && (() => {
            const vid = (video.URL || '').match(/[?&]v=([a-zA-Z0-9_-]{11})/)?.[1];
            return vid ? (
              <div
                className="mb-3 rounded-lg overflow-hidden bg-black aspect-video max-w-md cursor-pointer hover:ring-2 hover:ring-[var(--accent)] transition-shadow relative"
                onClick={(e) => { e.stopPropagation(); onVideoClick?.(vid, video.Title); }}
                title={t(lang, 'videoClickToExpand')}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${vid}`}
                  title={video.Title}
                  className="w-full h-full pointer-events-none"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : null;
          })()}
          <a
            href={video.URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-3 text-[var(--accent)] hover:text-[var(--accent-hover)] text-sm"
          >
            <ExternalLink size={16} />
            {t(lang, 'openYoutube')}
          </a>
        </div>
      )}
    </div>
  );
}

function MetaItem({ label, value }) {
  return (
    <div>
      <span className="text-[var(--muted)]">{label}: </span>
      <span>{value}</span>
    </div>
  );
}

/** 视频放大覆盖左侧面板，带透明遮罩；置于 fixed 层，右侧可交互，视频不中断 */
function VideoOverlay({ videoId, title, onClose, leftPct = 55 }) {
  return (
    <div
      className="fixed top-0 bottom-0 left-0 z-40 flex items-center justify-center"
      style={{ width: `${leftPct}%` }}
    >
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="relative z-10 w-full h-full flex items-center justify-center p-6">
        <div
          className="w-full max-w-4xl aspect-video rounded-lg overflow-hidden shadow-2xl bg-black"
          onClick={(e) => e.stopPropagation()}
        >
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title={title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-20 p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white"
        title={title}
      >
        <X size={20} />
      </button>
    </div>
  );
}
