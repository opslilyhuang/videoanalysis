import { X, BookOpen } from 'lucide-react';
import { t } from '../i18n';

const GUIDE_ZH = [
  { title: '🎯 核心功能', content: '分析油管频道视频，支持智能评分、提取字幕、生成报告。' },
  { title: '📊 视频列表', content: '按等级(S/A/B)、分类、日期、播放量筛选；点击展开看元数据，点击视频放大播放；右侧查看字幕与总结。' },
  { title: '🔊 字幕与朗读', content: '支持英语/中文/双语切换；可勾选中文或英文进行语音朗读（TTS）。' },
  { title: '🤖 智能问答', content: '基于全部或当前视频的字幕，用自然语言提问，获取 AI 回答。' },
  { title: '📝 智能报告', content: '两种模式：① 按筛选条件选视频生成报告 ② 自然语言描述需求，AI 自动选视频生成。可附加自定义说明。' },
  { title: '⚙️ 运行分析', content: '完整流程 / 仅筛选 / Whisper 转录无字幕 / 重试失败。统计面板可一键展开收起。' },
  { title: '💡 小贴士', content: '展开行查看元数据，点击视频可放大至左侧播放；右侧可滚动字幕、AI 对话，视频不随鼠标移入移出而暂停。' },
];

const GUIDE_EN = [
  { title: '🎯 Core Features', content: 'Analyze Palantir channel videos with smart scoring, transcript extraction, and report generation for competitive research and NotebookLM.' },
  { title: '📊 Video List', content: 'Filter by rank (S/A/B), category, date, views; expand for metadata, click video to enlarge; view transcript & summary on the right.' },
  { title: '🔊 Transcript & TTS', content: 'Switch between English/Chinese/bilingual; select Chinese or English for voice playback.' },
  { title: '🤖 AI Chat', content: 'Ask questions in natural language based on all or current video transcripts.' },
  { title: '📝 Smart Report', content: 'Two modes: ① Filter-based selection ② Natural language description for AI to select videos. Add custom instructions.' },
  { title: '⚙️ Run Analysis', content: 'Full pipeline / Filter only / Whisper for no-subtitle / Retry failed. Stats panel can collapse.' },
  { title: '💡 Tip', content: 'Expand a row for metadata, click the video to enlarge; scroll transcript and use AI chat on the right—video won\'t pause when mouse moves.' },
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
