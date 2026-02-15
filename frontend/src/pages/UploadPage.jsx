import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Languages, LogIn } from 'lucide-react';
import { TempBoardPanel } from '../components/TempBoardPanel';
import { VideoList } from '../components/VideoList';
import { RightSidebar } from '../components/RightSidebar';
import { ResizableLayout } from '../components/ResizableLayout';
import { t } from '../i18n';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { FilterProvider } from '../context/FilterContext';

export function UploadPage() {
  const { theme, setTheme, lang, setLang } = useApp();
  const { isAuthenticated } = useAuth();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [transcriptRefetchTrigger, setTranscriptRefetchTrigger] = useState(0);
  const [guestRemaining, setGuestRemaining] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/master-index?dashboard_id=slim&_t=${Date.now()}`);
      if (!r.ok) {
        setVideos([]);
        return;
      }
      const rows = await r.json();
      let meta = {};
      try {
        const metaRes = await apiFetch(`/api/video-meta?dashboard_id=slim`);
        if (metaRes.ok) meta = await metaRes.json();
      } catch {}
      const getVid = (url) => (url || '').match(/[?&]v=([a-zA-Z0-9_-]{11})/)?.[1] || '';
      setVideos((rows || []).map((r, i) => {
        const vid = getVid(r.URL);
        const m = meta[vid] || {};
        return {
          ...r,
          Keywords: r.Keywords || (Array.isArray(m.keywords) ? m.keywords.join(', ') : (m.keywords || '')),
          Category: r.Category || r.category || m.category || '',
          _id: i,
        };
      }));
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGuestRemaining = useCallback(async () => {
    try {
      const r = await apiFetch('/api/guest-remaining');
      if (r.ok) {
        const d = await r.json();
        setGuestRemaining(d);
      }
    } catch {
      setGuestRemaining(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isAuthenticated) fetchGuestRemaining();
  }, [isAuthenticated, fetchGuestRemaining]);

  const onConvertComplete = useCallback(() => {
    refresh();
    if (!isAuthenticated) fetchGuestRemaining();
  }, [refresh, isAuthenticated, fetchGuestRemaining]);

  const handleTempDelete = async (videoId) => {
    const r = await apiFetch(`/api/temp-delete-video?video_id=${encodeURIComponent(videoId)}&dashboard_id=slim`, { method: 'POST' });
    if (r.ok) {
      refresh();
      if (!isAuthenticated) fetchGuestRemaining();
    }
  };

  const extractVideoId = (url) => (url || '').match(/[?&]v=([a-zA-Z0-9_-]{11})/)?.[1] || null;

  const leftPanel = (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="shrink-0 space-y-3 p-6 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{t(lang, 'slimEntry')}</h1>
            <Link
              to="/"
              className="text-sm text-[var(--muted)] hover:text-[var(--accent)]"
            >
              {t(lang, 'title')} →
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {!isAuthenticated && guestRemaining != null && guestRemaining.remaining_count >= 0 && (
              <span className="text-xs text-[var(--muted)]">
                {t(lang, 'remainingCount', { n: guestRemaining.remaining_count })} / {t(lang, 'remainingMinutes', { n: guestRemaining.remaining_minutes })}
              </span>
            )}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] text-sm"
            >
              <Languages size={16} className="inline mr-1" />
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            {!isAuthenticated && (
              <Link
                to="/"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm"
              >
                <LogIn size={16} />
                {t(lang, 'loginToUnlimit')}
              </Link>
            )}
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">{t(lang, 'slimEntryDesc')}</p>
      </header>
      <div className="flex-1 min-h-0 overflow-auto px-6 pb-6">
        <div className="space-y-6">
          <TempBoardPanel
            onConvert={onConvertComplete}
            onCleanEmpty={refresh}
            loading={false}
            lang={lang}
            onGuestLimitHit={fetchGuestRemaining}
            dashboardId="slim"
          />
          <VideoList
            videos={videos}
            loading={loading}
            selectedVideo={selectedVideo}
            onVideoSelect={setSelectedVideo}
            lang={lang}
            dashboardId="slim"
            onConvertSuccess={refresh}
            config={{}}
            scrollToVideoId={null}
            onScrolledToVideo={() => {}}
            isEmptyTemp={videos.length === 0 && !loading}
            onTranscriptConverted={() => setTranscriptRefetchTrigger((x) => x + 1)}
            viewMode="main"
            onViewModeChange={() => {}}
            favoritesCount={0}
            recycleCount={0}
            showFavoritesRecycle={false}
            onTempDelete={handleTempDelete}
          />
        </div>
      </div>
    </div>
  );

  const rightPanel = (
    <RightSidebar
      selectedVideo={selectedVideo}
      videos={videos}
      onMetaSaved={refresh}
      onSourceVideoClick={(videoId) => {
        const v = videos.find((x) => extractVideoId(x.URL) === videoId);
        if (v) setSelectedVideo(v);
      }}
      transcriptRefetchTrigger={transcriptRefetchTrigger}
      lang={lang}
      dashboardId="slim"
    />
  );

  return (
    <FilterProvider>
      <ResizableLayout left={leftPanel} right={rightPanel} />
    </FilterProvider>
  );
}
