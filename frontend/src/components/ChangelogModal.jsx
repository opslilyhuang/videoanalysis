import { X, History } from 'lucide-react';
import { t } from '../i18n';

const CHANGELOG_ZH = [
  {
    version: 'v1.5.0',
    date: '2025-02-15',
    title: '多轮问答 & 收藏系统',
    features: [
      { icon: '🤖', title: '多轮问答功能', desc: '支持连续追问上下文，AI 可记住对话历史，用户可针对同一视频进行深度追问和分析' },
      { icon: '⭐', title: '收藏与回收站', desc: '用户可收藏重要视频便于后续查看；误删除视频可从回收站恢复，提升数据安全性' },
      { icon: '🎨', title: '交互体验优化', desc: '视频列表展示优化，支持快速筛选；字幕加载和显示性能提升；报告生成功能增强' },
      { icon: '🚀', title: '部署配置优化', desc: '新增标准化 Nginx 部署配置文件，自动化部署流程优化，提升运维效率' },
    ],
    tech: ['后端：FastAPI + Python 3.11', '前端：React + Vite + Ant Design', '部署：Nginx 反向代理 + systemd'],
  },
  {
    version: 'v1.4.0',
    date: '2025-02-10',
    title: '智能报告升级',
    features: [
      { icon: '📝', title: '自然语言生成', desc: '支持用自然语言描述需求，AI 自动筛选视频并生成报告' },
      { icon: '🎯', title: '自定义说明', desc: '生成报告时可附加自定义说明，满足特定需求' },
    ],
  },
  {
    version: 'v1.3.0',
    date: '2025-02-05',
    title: '智能问答系统',
    features: [
      { icon: '🔮', title: 'AI 对话', desc: '基于全部或当前视频的字幕，用自然语言提问，获取 AI 回答' },
      { icon: '💡', title: '上下文理解', desc: 'AI 可理解视频内容并提供精准回答' },
    ],
  },
  {
    version: 'v1.2.0',
    date: '2025-01-28',
    title: '字幕与 TTS',
    features: [
      { icon: '🔊', title: '多语言字幕', desc: '支持英语/中文/双语切换' },
      { icon: '🗣️', title: '语音朗读', desc: '勾选中文或英文进行语音朗读（TTS）' },
    ],
  },
  {
    version: 'v1.1.0',
    date: '2025-01-20',
    title: '智能评分系统',
    features: [
      { icon: '📊', title: '三维评分模型', desc: '基于播放量、时效性、业务相关度的智能评分' },
      { icon: '🏆', title: '等级判定', desc: 'S/A/B 三级分类，便于优先级排序' },
    ],
  },
  {
    version: 'v1.0.0',
    date: '2025-01-10',
    title: '系统上线',
    features: [
      { icon: '🎉', title: '核心功能', desc: '视频列表、字幕提取、基础报告生成' },
    ],
  },
];

const CHANGELOG_EN = [
  {
    version: 'v1.5.0',
    date: '2025-02-15',
    title: 'Multi-turn Chat & Favorites',
    features: [
      { icon: '🤖', title: 'Multi-turn Q&A', desc: 'AI remembers conversation context for in-depth video analysis' },
      { icon: '⭐', title: 'Favorites & Recycle Bin', desc: 'Bookmark important videos and restore deleted ones from recycle bin' },
      { icon: '🎨', title: 'UX Improvements', desc: 'Better video list filtering, faster subtitle loading, enhanced reports' },
      { icon: '🚀', title: 'Deployment Optimization', desc: 'Standardized Nginx config and automated deployment' },
    ],
    tech: ['Backend: FastAPI + Python 3.11', 'Frontend: React + Vite + Ant Design', 'Deployment: Nginx + systemd'],
  },
  {
    version: 'v1.4.0',
    date: '2025-02-10',
    title: 'Smart Report Upgrade',
    features: [
      { icon: '📝', title: 'Natural Language Generation', desc: 'Describe requirements in natural language, AI selects videos and generates reports' },
      { icon: '🎯', title: 'Custom Instructions', desc: 'Add custom notes when generating reports for specific needs' },
    ],
  },
  {
    version: 'v1.3.0',
    date: '2025-02-05',
    title: 'AI Chat System',
    features: [
      { icon: '🔮', title: 'AI Conversation', desc: 'Ask questions based on video transcripts and get AI answers' },
      { icon: '💡', title: 'Context Understanding', desc: 'AI understands video content and provides accurate answers' },
    ],
  },
  {
    version: 'v1.2.0',
    date: '2025-01-28',
    title: 'Subtitle & TTS',
    features: [
      { icon: '🔊', title: 'Multi-language Subtitles', desc: 'Switch between English/Chinese/Bilingual' },
      { icon: '🗣️', title: 'Voice Playback', desc: 'Text-to-speech support for selected language' },
    ],
  },
  {
    version: 'v1.1.0',
    date: '2025-01-20',
    title: 'Smart Scoring System',
    features: [
      { icon: '📊', title: '3D Scoring Model', desc: 'Smart scoring based on views, recency, and relevance' },
      { icon: '🏆', title: 'Rank Classification', desc: 'S/A/B tier classification for prioritization' },
    ],
  },
  {
    version: 'v1.0.0',
    date: '2025-01-10',
    title: 'System Launch',
    features: [
      { icon: '🎉', title: 'Core Features', desc: 'Video list, transcript extraction, basic report generation' },
    ],
  },
];

export function ChangelogModal({ open, onClose, lang = 'zh' }) {
  if (!open) return null;
  const items = lang === 'zh' ? CHANGELOG_ZH : CHANGELOG_EN;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <History size={20} className="text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">{t(lang, 'changelog')}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-6">
            {items.map((item, i) => (
              <div key={i} className="border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] transition-colors">
                {/* Version Header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-2.5 py-1 bg-[var(--accent)] text-white text-sm font-bold rounded-full">
                    {item.version}
                  </span>
                  <span className="text-xs text-[var(--muted)]">{item.date}</span>
                  <h3 className="font-semibold text-[var(--text)]">{item.title}</h3>
                </div>

                {/* Features List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  {item.features.map((feature, fi) => (
                    <div key={fi} className="flex items-start gap-2">
                      <span className="text-lg">{feature.icon}</span>
                      <div>
                        <h4 className="text-sm font-medium text-[var(--text)]">{feature.title}</h4>
                        <p className="text-xs text-[var(--muted)] leading-relaxed">{feature.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tech Stack */}
                {item.tech && (
                  <div className="mt-3 pt-3 border-t border-[var(--border)]">
                    <p className="text-xs text-[var(--muted)] mb-1.5">技术栈 / Tech Stack</p>
                    <div className="flex flex-wrap gap-1.5">
                      {item.tech.map((tech, ti) => (
                        <span key={ti} className="px-2 py-1 bg-[var(--bg-hover)] text-[var(--muted)] text-xs rounded">
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
