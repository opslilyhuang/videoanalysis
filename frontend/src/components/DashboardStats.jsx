import { Video, Star, FileText, TrendingUp, AlertCircle } from 'lucide-react';
import { t } from '../i18n';

export function DashboardStats({ videos, filterSummary, failedCount, lang = 'zh' }) {
  const total = videos.length;
  const sCount = videos.filter((v) => v.Rank === 'S').length;
  const aCount = videos.filter((v) => v.Rank === 'A').length;
  const bCount = videos.filter((v) => v.Rank === 'B').length;
  const withTranscript = videos.filter((v) => v.Transcript === '有').length;

  // 分类统计：产品介绍=关键词匹配数，非产品=全量-产品-其他，其他=其他类
  const categoryProduct = filterSummary?.cat_keywords ?? videos.filter((v) => (v.Category || v.category || '') === '产品介绍').length;
  const categoryOther = videos.filter((v) => (v.Category || v.category || '') === '其他').length;
  const categoryNonProduct = Math.max(0, total - categoryProduct - categoryOther);
  const uncategorized = total - categoryProduct - categoryNonProduct - categoryOther;

  return (
    <div className="space-y-4">
      {filterSummary && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-medium text-[var(--muted)] mb-3">{t(lang, 'filterCounts')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
            <div>
              <span className="text-2xl font-semibold">{filterSummary.cat_others ?? categoryOther ?? '-'}</span>
              <span className="text-sm text-[var(--muted)] ml-2">{t(lang, 'catOthers')}</span>
            </div>
          </div>
          <p className="text-xs text-[var(--muted)] mt-2">{t(lang, 'channelTotal')}: {filterSummary.channel_total ?? '-'}</p>
        </div>
      )}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <h3 className="text-sm font-medium text-[var(--muted)] mb-3">{t(lang, 'categoryStats')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-xl font-semibold">{categoryProduct}</span>
            <span className="text-sm text-[var(--muted)] ml-2">{t(lang, 'categoryProduct')}</span>
          </div>
          <div>
            <span className="text-xl font-semibold">{categoryNonProduct}</span>
            <span className="text-sm text-[var(--muted)] ml-2">{t(lang, 'categoryNonProduct')}</span>
          </div>
          <div>
            <span className="text-xl font-semibold">{categoryOther}</span>
            <span className="text-sm text-[var(--muted)] ml-2">{t(lang, 'categoryOther')}</span>
          </div>
          {uncategorized > 0 && (
            <div>
              <span className="text-xl font-semibold">{uncategorized}</span>
              <span className="text-sm text-[var(--muted)] ml-2">{t(lang, 'uncategorized')}</span>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          icon={Video}
          label={t(lang, 'totalVideos')}
          value={total}
          sub={`S: ${sCount} / A: ${aCount} / B: ${bCount}`}
        />
        <StatCard
          icon={Star}
          label={t(lang, 'sLevelRatio')}
          value={total ? ((sCount / total) * 100).toFixed(1) : 0}
          suffix="%"
        />
        <StatCard
          icon={FileText}
          label={t(lang, 'hasTranscript')}
          value={withTranscript}
          sub={`${total ? ((withTranscript / total) * 100).toFixed(1) : 0}%`}
        />
        <StatCard
          icon={TrendingUp}
          label={t(lang, 'aboveA')}
          value={sCount + aCount}
          sub={`${total ? (((sCount + aCount) / total) * 100).toFixed(1) : 0}%`}
        />
        <StatCard
          icon={AlertCircle}
          label={t(lang, 'failed')}
          value={failedCount ?? 0}
          sub={t(lang, 'retryHint')}
        />
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
