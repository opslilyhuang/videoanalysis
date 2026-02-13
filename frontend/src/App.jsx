import { useState } from 'react';
import { RefreshCw, Settings, Sun, Moon, Languages, Play, LogOut, ChevronDown, ChevronUp, FileText, BookOpen } from 'lucide-react';
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
import { FilterProvider } from './context/FilterContext';

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
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [statsExpanded, setStatsExpanded] = useState(true);
  const {
    dashboards,
    channelId,
    setChannelId,
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

  const isTempBoard = dashboards.find((d) => d.id === channelId)?.isTemp ?? false;
  const displayVideos = videos.length > 0 ? videos : (isTempBoard ? [] : MOCK_VIDEOS);
  const failedCount = failedVideos?.length ?? status?.failed_count ?? 0;
  const isAnalyzing = status?.status === 'processing' || status?.status === 'filtering';

  const leftPanel = (
    <div className="h-full overflow-auto p-6">
        <header className="flex flex-wrap items-center gap-4 mb-6">
        <h1 className="text-xl font-bold">{t(lang, 'title')}</h1>
        <button
          onClick={() => setGuideOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] text-sm text-[var(--muted)] hover:text-[var(--text)]"
          title={t(lang, 'usageGuide')}
        >
          <BookOpen size={16} />
          {t(lang, 'usageGuide')}
        </button>
        <div className="flex items-center gap-3 flex-wrap">
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
          <MessageCenter onUpdateClick={(id) => runAnalysis('full', null, id)} lang={lang} />
          <button
            onClick={() => runAnalysis('full')}
            disabled={loading || runAnalysisLoading || isAnalyzing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            title={t(lang, 'runAnalysisFull')}
          >
            <Play size={16} className={runAnalysisLoading || isAnalyzing ? 'animate-pulse' : ''} />
            {runAnalysisLoading || isAnalyzing ? t(lang, 'runAnalysisStarting') : t(lang, 'runAnalysis')}
          </button>
          <button
            onClick={() => runAnalysis('whisper-missing')}
            disabled={loading || runAnalysisLoading || isAnalyzing}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            title={t(lang, 'runAnalysisWhisper')}
          >
            <Play size={16} className={runAnalysisLoading || isAnalyzing ? 'animate-pulse' : ''} />
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
          <button
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-red-500/50 rounded-lg text-sm"
            title="退出登录"
          >
            <LogOut size={16} />
            退出
          </button>
        </div>
      </header>

      <div className="space-y-6">
        {isTempBoard && (
          <TempBoardPanel onConvert={refresh} loading={runAnalysisLoading} lang={lang} />
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
        {(!isTempBoard || displayVideos.length > 0) && (
          <VideoList
            videos={displayVideos}
            loading={loading}
            selectedVideo={selectedVideo}
            onVideoSelect={setSelectedVideo}
            lang={lang}
            dashboardId={channelId}
            onConvertSuccess={refresh}
            config={config}
          />
        )}
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

  const rightPanel = <RightSidebar selectedVideo={selectedVideo} videos={displayVideos} onMetaSaved={refresh} lang={lang} dashboardId={channelId} />;

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
