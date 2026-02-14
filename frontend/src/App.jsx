import { useState, useEffect } from 'react';
import { RefreshCw, Settings, Sun, Moon, Languages, Play, LogOut, ChevronDown, ChevronUp, FileText, BookOpen, History } from 'lucide-react';
import { useData } from './hooks/useData';
import { useApp } from './context/AppContext';
import { useAuth } from './context/AuthContext';
import { t } from './i18n';
import { LoginPage } from './components/LoginPage';
import { MessageCenter } from './components/MessageCenter';
import { ProgressHistoryModal } from './components/ProgressHistoryModal';
import { TempBoardPanel } from './components/TempBoardPanel';
import { DashboardStats } from './components/DashboardStats';
import { VideoList } from './components/VideoList';
import { ConfigPanel } from './components/ConfigPanel';
import { ProgressBar } from './components/ProgressBar';
import { FailedList } from './components/FailedList';
import { RightSidebar } from './components/RightSidebar';
import { ResizableLayout } from './components/ResizableLayout';
import { ReportModal } from './components/ReportModal';
import { UsageGuide } from './components/UsageGuide';
import { ChangelogModal } from './components/ChangelogModal';
import { FilterProvider } from './context/FilterContext';
import { useFavoritesRecycle } from './context/FavoritesRecycleContext';
import { apiFetch } from './utils/api';

function App() {
  const { isAuthenticated, login, logout } = useAuth();
  const { theme, setTheme, lang, setLang } = useApp();

  if (!isAuthenticated) {
    return <LoginPage onLogin={login} />;
  }
  const [configOpen, setConfigOpen] = useState(false);
  const [progressHistoryOpen, setProgressHistoryOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [whisperConfirmOpen, setWhisperConfirmOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [scrollToVideoId, setScrollToVideoId] = useState(null);
  const [transcriptRefetchTrigger, setTranscriptRefetchTrigger] = useState(0);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState('main'); // 'main' | 'favorites' | 'recycle'

  const { toggleFavorite, moveToRecycle, restoreFromRecycle, removeFromRecycle, isFavorite, isRecycled, isPermanentlyDeleted, favoritesCount, recycleCount } = useFavoritesRecycle();
  const extractVideoId = (url) => (url || '').match(/[?&]v=([a-zA-Z0-9_-]{11})/)?.[1] || null;
  const {
    dashboards,
    channelId,
    setChannelId,
    videosChannelId,
    videos,
    config,
    appConfig,
    saveAppConfig,
    status,
    filterSummary,
    failedVideos,
    loading,
    refresh,
    runAnalysis,
    runAnalysisLoading,
  } = useData();

  const isTempBoard = channelId === 'temp' || (dashboards.find((d) => d.id === channelId)?.isTemp ?? false);
  const videosBelongToCurrentBoard = videosChannelId === channelId;
  const baseVideos = videosBelongToCurrentBoard ? videos : (isTempBoard ? [] : MOCK_VIDEOS);
  const displayVideos = (() => {
    if (isTempBoard || !channelId) return baseVideos;
    const getVid = (v) => extractVideoId(v.URL);
    if (viewMode === 'favorites') {
      return baseVideos.filter((v) => isFavorite(channelId, getVid(v)) && !isPermanentlyDeleted(channelId, getVid(v)));
    }
    if (viewMode === 'recycle') {
      return baseVideos.filter((v) => isRecycled(channelId, getVid(v)));
    }
    return baseVideos.filter((v) => !isRecycled(channelId, getVid(v)) && !isPermanentlyDeleted(channelId, getVid(v)));
  })();
  const failedCount = failedVideos?.length ?? status?.failed_count ?? 0;
  const isAnalyzing = status?.status === 'processing' || status?.status === 'filtering';

  useEffect(() => {
    if (isTempBoard) setViewMode('main');
  }, [isTempBoard]);

  const handleTempDelete = async (videoId) => {
    const r = await apiFetch(`/api/temp-delete-video?video_id=${encodeURIComponent(videoId)}`, { method: 'POST' });
    if (r.ok) refresh();
  };

  const leftPanel = (
    <div className="h-full flex flex-col overflow-hidden">
        <header className="shrink-0 space-y-3 p-6 pb-4">
        {/* 第一行：标题 + 使用指南 + 主题/语言/消息/退出 */}
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-xl font-bold">{t(lang, 'title')}</h1>
          <button
            onClick={() => setGuideOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] text-sm text-[var(--muted)] hover:text-[var(--text)]"
            title={t(lang, 'usageGuide')}
          >
            <BookOpen size={16} />
            {t(lang, 'usageGuide')}
          </button>
          <button
            onClick={() => setChangelogOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] text-sm text-[var(--muted)] hover:text-[var(--text)]"
            title={t(lang, 'changelog')}
          >
            <History size={16} />
            {t(lang, 'changelog')}
          </button>
          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]"
              title={theme === 'dark' ? 'Light' : 'Dark'}
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
            <MessageCenter onUpdateClick={(id) => runAnalysis('full', null, id)} lang={lang} />
            <button
              onClick={logout}
              className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-red-500/50 text-sm"
              title="退出登录"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        {/* 第二行：看板选择、收藏、回收站、运行、刷新、报告、配置 */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={isTempBoard ? '' : channelId}
            onChange={(e) => { const v = e.target.value; if (v) setChannelId(v); }}
            className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <option value="">{t(lang, 'selectBoard')}</option>
            {dashboards.filter((d) => !d.isTemp).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setChannelId('temp')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              isTempBoard
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-[var(--surface)] border-[var(--border)] hover:border-violet-500 hover:text-violet-400'
            }`}
          >
            {t(lang, 'tempBoard')}
          </button>
          <button
            onClick={() => runAnalysis('full')}
            disabled
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 cursor-not-allowed"
            title={t(lang, 'runAnalysisFull')}
          >
            <Play size={16} />
            {t(lang, 'runAnalysis')}
          </button>
          <button
            onClick={() => setWhisperConfirmOpen(true)}
            disabled
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 cursor-not-allowed"
            title={t(lang, 'runAnalysisWhisper')}
          >
            <Play size={16} />
            {t(lang, 'runAnalysisWhisper')}
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {t(lang, 'refresh')}
          </button>
          <button
            onClick={() => setReportOpen(true)}
            disabled={isTempBoard}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] rounded-lg text-sm disabled:opacity-50"
            title={t(lang, 'reportGenerate')}
          >
            <FileText size={16} />
            {t(lang, 'reportGenerate')}
          </button>
          <button
            onClick={() => setConfigOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] rounded-lg text-sm"
          >
            <Settings size={16} />
            {t(lang, 'config')}
          </button>
        </div>
        </header>

      <div className="flex-1 min-h-0 overflow-auto px-6 pb-6">
        <div className="space-y-6">
        {isTempBoard && (
          <TempBoardPanel onConvert={refresh} onCleanEmpty={refresh} loading={runAnalysisLoading} lang={lang} />
        )}
        {!isTempBoard && (
          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <button
              onClick={() => setStatsExpanded((e) => !e)}
              className="w-full flex items-center justify-between px-4 py-3 bg-[var(--surface)] hover:bg-white/5 text-left"
            >
              <span className="text-sm font-medium text-[var(--muted)]">
                {t(lang, 'statsAndProgress')}
              </span>
              {statsExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            {statsExpanded && (
              <div className="space-y-6 p-4 pt-0 border-t border-[var(--border)]">
                <DashboardStats videos={displayVideos} filterSummary={filterSummary} failedCount={failedCount} lang={lang} />
                <ProgressBar
                  status={status}
                  savedCount={displayVideos.length}
                  lang={lang}
                  onHistoryClick={() => setProgressHistoryOpen(true)}
                />
                <FailedList failedVideos={failedVideos} lang={lang} />
              </div>
            )}
          </div>
        )}
        <VideoList
            videos={displayVideos}
            loading={loading}
            selectedVideo={selectedVideo}
            onVideoSelect={setSelectedVideo}
            lang={lang}
            dashboardId={channelId}
            onConvertSuccess={refresh}
            config={config}
            scrollToVideoId={scrollToVideoId}
            onScrolledToVideo={() => setScrollToVideoId(null)}
            isEmptyTemp={isTempBoard && displayVideos.length === 0}
            onTranscriptConverted={() => setTranscriptRefetchTrigger((t) => t + 1)}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            favoritesCount={favoritesCount}
            recycleCount={recycleCount}
            showFavoritesRecycle={!isTempBoard}
            onTempDelete={isTempBoard ? handleTempDelete : undefined}
            onFavorite={toggleFavorite}
            onRecycle={moveToRecycle}
            onRestore={restoreFromRecycle}
            onRemoveFromRecycle={removeFromRecycle}
            isFavorite={isFavorite}
            isRecycled={isRecycled}
          />
        </div>
      </div>
      <ProgressHistoryModal
        open={progressHistoryOpen}
        onClose={() => setProgressHistoryOpen(false)}
        dashboardId={channelId}
        lang={lang}
      />

      <ConfigPanel config={config} appConfig={appConfig} onSaveAppConfig={saveAppConfig} open={configOpen} onClose={() => setConfigOpen(false)} lang={lang} />
    </div>
  );

  const handleSourceVideoClick = (videoId) => {
    const v = displayVideos.find((x) => extractVideoId(x.URL) === videoId);
    if (v) setSelectedVideo(v);
    setScrollToVideoId(videoId);
  };

  const rightPanel = <RightSidebar selectedVideo={selectedVideo} videos={displayVideos} onMetaSaved={refresh} onSourceVideoClick={handleSourceVideoClick} transcriptRefetchTrigger={transcriptRefetchTrigger} lang={lang} dashboardId={channelId} />;

  return (
    <FilterProvider>
      <ResizableLayout
        left={leftPanel}
        right={rightPanel}
      />
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        dashboardId={channelId}
        lang={lang}
        videos={displayVideos}
        config={config}
      />
      <UsageGuide open={guideOpen} onClose={() => setGuideOpen(false)} lang={lang} />
      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} lang={lang} />
      {whisperConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-3">{t(lang, 'whisperConfirmTitle')}</h3>
            <p className="text-sm text-[var(--muted)] mb-6">
              {t(lang, 'whisperConfirmMsg', { n: displayVideos.filter((v) => v.Transcript === '无').length })}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setWhisperConfirmOpen(false)}
                className="px-4 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--accent)] text-sm"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                onClick={async () => {
                  setWhisperConfirmOpen(false);
                  await runAnalysis('whisper-missing');
                }}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium"
              >
                {t(lang, 'confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </FilterProvider>
  );
}

// Mock 数据：当后端无数据时用于预览
const MOCK_VIDEOS = [
  { Rank: 'A', Score: 84, Title: 'Paragon 2025', Date: '2025-12-05', Views: 26142, Transcript: '有', URL: '#' },
  { Rank: 'A', Score: 76, Title: 'Alex Karp Opening Remarks | Paragon 2025', Date: '2025-12-05', Views: 17642, Transcript: '有', URL: '#' },
  { Rank: 'B', Score: 58, Title: 'Palantir and the NHS | UK Stories', Date: '2026-01-30', Views: 6436, Transcript: '无', URL: '#' },
  { Rank: 'A', Score: 84, Title: 'Palantir Ontology Overview', Date: '2025-11-17', Views: 45750, Transcript: '有', URL: '#' },
  { Rank: 'B', Score: 66, Title: 'Holiday Greetings from Palantir CEO Alex Karp', Date: '2025-12-18', Views: 26800, Transcript: '有', URL: '#' },
].map((v, i) => ({ ...v, _id: i }));

export default App;
