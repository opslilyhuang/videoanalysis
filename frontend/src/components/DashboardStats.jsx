import { useMemo } from 'react';
import { Video, Star, FileText, TrendingUp, AlertCircle, BarChart3 } from 'lucide-react';
import { t } from '../i18n';

export function DashboardStats({ videos, filterSummary, failedCount, lang = 'zh' }) {
  const total = videos.length;
  const sCount = videos.filter((v) => v.Rank === 'S').length;
  const aCount = videos.filter((v) => v.Rank === 'A').length;
  const bCount = videos.filter((v) => v.Rank === 'B').length;
  const withTranscript = videos.filter((v) => v.Transcript === '有').length;

  const rankData = useMemo(() => [
    { key: 'S', count: sCount, color: 'var(--rank-s)' },
    { key: 'A', count: aCount, color: 'var(--rank-a)' },
    { key: 'B', count: bCount, color: 'var(--rank-b)' },
  ], [sCount, aCount, bCount]);

  const monthData = useMemo(() => {
    const byMonth = {};
    videos.forEach((v) => {
      const m = (v.Date || '').slice(0, 7) || (lang === 'zh' ? '未知' : 'Unknown');
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
    return Object.entries(byMonth)
      .filter(([k]) => k !== 'Unknown' && k !== '未知')
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([label, count]) => ({ label, count }));
  }, [videos, lang]);

  const viewsMonthData = useMemo(() => {
    const byMonth = {};
    videos.forEach((v) => {
      const m = (v.Date || '').slice(0, 7) || 'Unknown';
      if (m === 'Unknown') return;
      const views = Number(v.Views || 0);
      byMonth[m] = (byMonth[m] || 0) + views;
    });
    return Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([label, views]) => ({ label, views }));
  }, [videos]);

  const maxRank = Math.max(1, ...rankData.map((r) => r.count));
  const maxMonth = Math.max(1, ...monthData.map((m) => m.count));
  const maxViews = Math.max(1, ...viewsMonthData.map((m) => m.views));

  return (
    <div className="space-y-4">
      {filterSummary && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-medium text-[var(--muted)] mb-3">{t(lang, 'filterCounts')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-2xl font-semibold">{filterSummary.cat_20k_views ?? '-'}</span>
              <span className="text-sm text-[var(--muted)] ml-2">{t(lang, 'views20k')}</span>
            </div>
            <div>
              <span className="text-2xl font-semibold">{filterSummary.cat_2024_01 ?? '-'}</span>
              <span className="text-sm text-[var(--muted)] ml-2">{t(lang, 'since2024')}</span>
            </div>
            <div>
              <span className="text-2xl font-semibold">{filterSummary.cat_keywords ?? '-'}</span>
              <span className="text-sm text-[var(--muted)] ml-2">{t(lang, 'keywordMatch')}</span>
            </div>
            <div>
              <span className="text-2xl font-semibold">{filterSummary.filtered_total ?? '-'}</span>
              <span className="text-sm text-[var(--muted)] ml-2">{t(lang, 'filteredTotal')}</span>
            </div>
          </div>
          <p className="text-xs text-[var(--muted)] mt-2">{t(lang, 'channelTotal')}: {filterSummary.channel_total ?? '-'}</p>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          icon={Video}
          label="总视频数"
          value={total}
          sub={`S: ${sCount} / A: ${aCount} / B: ${bCount}`}
        />
        <StatCard
          icon={Star}
          label="S 级占比"
          value={total ? ((sCount / total) * 100).toFixed(1) : 0}
          suffix="%"
        />
        <StatCard
          icon={FileText}
          label="有字幕"
          value={withTranscript}
          sub={`${total ? ((withTranscript / total) * 100).toFixed(1) : 0}%`}
        />
        <StatCard
          icon={TrendingUp}
          label="A 级以上"
          value={sCount + aCount}
          sub={`${total ? (((sCount + aCount) / total) * 100).toFixed(1) : 0}%`}
        />
        <StatCard
          icon={AlertCircle}
          label="失败"
          value={failedCount ?? 0}
          sub="需重试"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-medium text-[var(--muted)] mb-3 flex items-center gap-2">
            <BarChart3 size={16} />
            {lang === 'zh' ? '等级分布' : 'Rank Distribution'}
          </h3>
          <div className="space-y-2">
            {rankData.map(({ key, count, color }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-6 text-sm font-medium">{key}</span>
                <div className="flex-1 h-6 bg-[var(--bg)] rounded overflow-hidden">
                  <div className="h-full rounded transition-all" style={{ width: `${(count / maxRank) * 100}%`, backgroundColor: color }} />
                </div>
                <span className="text-sm text-[var(--muted)] w-8">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-medium text-[var(--muted)] mb-3 flex items-center gap-2">
            <TrendingUp size={16} />
            {lang === 'zh' ? '按月视频数' : 'Videos/Month'}
          </h3>
          <div className="space-y-2 max-h-32 overflow-auto">
            {monthData.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{lang === 'zh' ? '无日期数据' : 'No date data'}</p>
            ) : (
              monthData.map(({ label, count }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-16 text-xs truncate">{label}</span>
                  <div className="flex-1 h-5 bg-[var(--bg)] rounded overflow-hidden">
                    <div className="h-full rounded bg-[var(--accent)]/60 transition-all" style={{ width: `${(count / maxMonth) * 100}%` }} />
                  </div>
                  <span className="text-xs text-[var(--muted)] w-6">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-medium text-[var(--muted)] mb-3 flex items-center gap-2">
            <TrendingUp size={16} />
            {lang === 'zh' ? '按月播放量' : 'Views/Month'}
          </h3>
          <div className="space-y-2 max-h-32 overflow-auto">
            {viewsMonthData.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{lang === 'zh' ? '无播放数据' : 'No views data'}</p>
            ) : (
              viewsMonthData.map(({ label, views }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-16 text-xs truncate">{label}</span>
                  <div className="flex-1 h-5 bg-[var(--bg)] rounded overflow-hidden">
                    <div className="h-full rounded bg-[var(--rank-s)]/60 transition-all" style={{ width: `${(views / maxViews) * 100}%` }} />
                  </div>
                  <span className="text-xs text-[var(--muted)] w-14 truncate" title={String(views)}>{(views / 1000).toFixed(0)}k</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, suffix = '' }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center gap-2 text-[var(--muted)] text-sm mb-1">
        <Icon size={16} />
        {label}
      </div>
      <div className="text-2xl font-semibold">
        {value}
        {suffix}
      </div>
      {sub && <div className="text-sm text-[var(--muted)] mt-1">{sub}</div>}
    </div>
  );
}
