import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink, FileText, FileQuestion, Mic, X } from 'lucide-react';
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

export function VideoList({ videos, loading, selectedVideo, onVideoSelect, lang = 'zh', dashboardId, onConvertSuccess, config, scrollToVideoId, onScrolledToVideo, isEmptyTemp, onTranscriptConverted }) {
  const { setFilters } = useFilters();
  const { leftPct } = useLayout();
  const keywords = config?.keywords && Object.keys(config.keywords).length > 0 ? Object.keys(config.keywords) : PRODUCT_KEYWORDS;
  const [search, setSearch] = useState('');
  const [searchInKeywords, setSearchInKeywords] = useState(false);
  const [rankFilter, setRankFilter] = useState('');
  const [transcriptFilter, setTranscriptFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewsMin, setViewsMin] = useState(0);
  const [viewsMax, setViewsMax] = useState(0);
  const [rankFilterMulti, setRankFilterMulti] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [overlayVideo, setOverlayVideo] = useState(null); // { videoId, title } 仅点击视频时显示
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

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
    if (rankFilter) list = list.filter((v) => v.Rank === rankFilter);
    if (rankFilterMulti) {
      if (rankFilterMulti === 'S+') list = list.filter((v) => v.Rank === 'S');
      else if (rankFilterMulti === 'A+') list = list.filter((v) => ['S', 'A'].includes(v.Rank));
      else if (rankFilterMulti === 'B+') list = list.filter((v) => ['S', 'A', 'B'].includes(v.Rank));
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
    if (dateFrom) list = list.filter((v) => (v.Date || '').slice(0, 7) >= dateFrom.slice(0, 7));
    if (dateTo) list = list.filter((v) => (v.Date || '').slice(0, 7) <= dateTo.slice(0, 7));
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
  }, [videos, search, searchInKeywords, rankFilter, rankFilterMulti, transcriptFilter, categoryFilter, dateFrom, dateTo, viewsMin, viewsMax, sortBy, sortAsc, keywords]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [search, rankFilter, transcriptFilter, categoryFilter, dateFrom, dateTo, viewsMin, viewsMax, pageSize]);

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
      rankFilter,
      rankFilterMulti,
      transcriptFilter,
      categoryFilter,
      dateFrom,
      dateTo,
      viewsMin,
      viewsMax,
    });
  }, [search, searchInKeywords, rankFilter, rankFilterMulti, transcriptFilter, categoryFilter, dateFrom, dateTo, viewsMin, viewsMax, setFilters]);

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
        <select value={rankFilter} onChange={(e) => setRankFilter(e.target.value)} className="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm">
          <option value="">{t(lang, 'rankAll')}</option>
          <option value="S">S</option>
          <option value="A">A</option>
          <option value="B">B</option>
        </select>
        <select value={rankFilterMulti} onChange={(e) => setRankFilterMulti(e.target.value)} className="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm">
          <option value="">{t(lang, 'rankFilter')}</option>
          <option value="S+">{t(lang, 'rankSOnly')}</option>
          <option value="A+">{t(lang, 'rankAAbove')}</option>
          <option value="B+">{t(lang, 'rankBAbove')}</option>
        </select>
        <input type="month" placeholder={t(lang, 'dateFrom')} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-2 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm w-32" />
        <span className="text-[var(--muted)]">-</span>
        <input type="month" placeholder={t(lang, 'dateTo')} value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-2 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm w-32" />
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
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {[
            { key: 'date', labelKey: 'sortDate' },
            { key: 'score', labelKey: 'sortScore' },
            { key: 'views', labelKey: 'sortViews' },
            { key: 'rank', labelKey: 'sortRank' },
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
        <span className="text-sm text-[var(--muted)] ml-auto">{t(lang, 'perPage')}</span>
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

function VideoRow({ video, lang = 'zh', expanded, onToggle, isSelected, onSelect, onVideoClick, dashboardId, onConvertSuccess, onTranscriptConverted }) {
  const rankColor = RANK_COLORS[video.Rank] || 'var(--muted)';
  const vid = extractVideoId(video.URL);
  const [converting, setConverting] = useState(false);

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

  return (
    <div
      className={`bg-[var(--surface)] border rounded-lg overflow-hidden transition-all ${
        expanded ? 'border-[var(--accent)]' : isSelected ? 'border-[var(--accent)]/50' : 'border-[var(--border)]'
      }`}
    >
      <button
        onClick={() => { onToggle(); onSelect?.(); }}
        className="w-full text-left px-4 py-3 flex items-center gap-4 hover:bg-white/5"
      >
        <span
          className="w-8 h-8 rounded flex items-center justify-center font-bold text-sm text-black"
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
                  {dashboardId && dashboardId !== 'temp' && (
                    <button
                      onClick={handleConvert}
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
        {expanded ? (
          <ChevronUp size={20} className="text-[var(--muted)] shrink-0" />
        ) : (
          <ChevronDown size={20} className="text-[var(--muted)] shrink-0" />
        )}
      </button>
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
