import { X, BookOpen } from 'lucide-react';
import { t } from '../i18n';

const GUIDE_ZH = [
  { title: '🎯 核心功能', content: '分析油管频道视频，支持智能评分、提取字幕、生成报告。支持临时上传：粘贴链接即可获取字幕，可导出到 NotebookLM 等工具。' },
  { title: '🚀 极简上传', content: '点击「极简上传」或访问 /upload，无需登录即可使用。游客每日限 5 个视频；登录后无限制。粘贴 1–5 个 YouTube 链接，一键转换获取字幕。' },
  { title: '📊 视频列表', content: '按等级(S/A/B)、分类、日期、播放量筛选；日期支持快捷（近1周/1月/3月/1年）或自定义；点击展开看元数据，点击视频放大播放；右侧查看字幕与总结。' },
  { title: '📋 字幕体验', content: '英语/中文/双语切换；一键复制摘要/字幕；支持 TXT 或 Markdown 导出（原/中/双语）。若含时间戳可点击跳转到对应播放位置；搜索词高亮；每段支持复制单段原文或译文。' },
  { title: '📥 临时上传下载', content: '多选后「下载选中字幕」：合并 TXT/MD 或 ZIP 包。每行可一键复制或下载该视频字幕。批量删除、导出 CSV 元数据。' },
  { title: '🔊 朗读', content: '可勾选中文或英文进行语音朗读（TTS）。' },
  { title: '🤖 智能问答', content: '支持追问链式对话；回答中引用字幕时，来源会标注「(当前)」并可在右侧高亮对应片段。提供常用问题模板：总结要点、提取金句、核心观点等。' },
  { title: '📝 智能报告', content: '按筛选条件或自然语言描述生成报告。支持导出 PDF（打印）或 Markdown 下载。统计面板含等级分布、按月视频数、按月播放量图表。' },
  { title: '⚙️ 运行分析', content: '完整流程 / 仅筛选 / Whisper 转录无字幕 / 重试失败。统计面板可一键展开收起。' },
  { title: '💡 小贴士', content: '展开行查看元数据；视频可放大至左侧播放；右侧可滚动字幕、AI 对话；API 具备自动重试，网络抖动更稳定。' },
];

const GUIDE_EN = [
  { title: '🎯 Core Features', content: 'Analyze YouTube channel videos with smart scoring, transcript extraction, and report generation. Temp upload: paste links to get transcripts, export to NotebookLM or other tools.' },
  { title: '🚀 Quick Upload', content: 'Click "Quick Upload" or visit /upload—no login required. Guests: 5 videos/day; logged-in users: unlimited. Paste 1–5 YouTube links to convert and get transcripts.' },
  { title: '📊 Video List', content: 'Filter by rank, category, date, views. Date shortcuts: last 1w/1m/3m/1y or custom range. Expand for metadata, click video to enlarge; view transcript & summary on the right.' },
  { title: '📋 Transcript Experience', content: 'English/Chinese/bilingual; one-click copy summary/transcript; export as TXT or Markdown (original/zh/bilingual). Click timestamps to jump; search highlight; copy single paragraph.' },
  { title: '📥 Temp Download', content: 'Multi-select → "Download selected transcripts": merge TXT/MD or ZIP. Per-row copy/download buttons. Batch delete, export CSV metadata.' },
  { title: '🔊 TTS', content: 'Select Chinese or English for voice playback.' },
  { title: '🤖 AI Chat', content: 'Multi-turn follow-up; when citing transcript, source shows "(current)" and highlights in right panel. Preset templates: summarize, extract quotes, key points, etc.' },
  { title: '📝 Smart Report', content: 'Filter-based or natural language generation. Export to PDF (print) or Markdown. Stats: rank distribution, videos/month, views/month charts.' },
  { title: '⚙️ Run Analysis', content: 'Full pipeline / Filter only / Whisper for no-subtitle / Retry failed. Stats panel can collapse.' },
  { title: '💡 Tip', content: 'Expand row for metadata; video enlarges on left; transcript and AI chat on right. API auto-retry for stability.' },
];

export function UsageGuide({ open, onClose, lang = 'zh' }) {
  if (!open) return null;
  const items = lang === 'zh' ? GUIDE_ZH : GUIDE_EN;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">{t(lang, 'usageGuide')}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-5">
          {items.map((item, i) => (
            <div key={i}>
              <h3 className="text-sm font-semibold text-[var(--accent)] mb-1">{item.title}</h3>
              <p className="text-sm text-[var(--muted)] leading-relaxed">{item.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
