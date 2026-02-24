import { X, History } from 'lucide-react';
import { t } from '../i18n';

const CHANGELOG_ZH = [
  {
    version: 'v2.3.0',
    date: '2026-02-23',
    title: 'Ontologize 看板 & 翻译性能飞跃',
    features: [
      { icon: '📊', title: 'Ontologize 看板', desc: '新增 Ontologize 频道看板，包含 96 个视频；支持多看板系统：Palantir、Ontologize、临时上传、极简上传' },
      { icon: '⚡', title: '翻译性能飞跃', desc: '使用 5 线程并发翻译，速度提升约 5 倍；22 段翻译从 1-2 分钟缩短至 10-20 秒' },
      { icon: '🔧', title: '分段翻译策略', desc: '统一使用分段翻译（每段 1500 字符），彻底解决长视频中文翻译被截断的问题' },
      { icon: '🎨', title: '加载体验优化', desc: '新增旋转加载动画和友好提示文本，翻译等待时提供更好的视觉反馈' },
    ],
    tech: ['后端：ThreadPoolExecutor 并发翻译', '优化：分段翻译避免 token 限制', '配置：多看板动态路由支持'],
  },
  {
    version: 'v2.2.0',
    date: '2026-02-22',
    title: '视频上传功能',
    features: [
      { icon: '📤', title: '临时上传看板', desc: '支持用户上传 YouTube 链接进行分析；API: /api/convert-videos；数据路径: frontend/public/data/temp/' },
      { icon: '🚀', title: '极简上传看板', desc: '简化版上传界面；数据路径: frontend/public/data/slim/' },
      { icon: '📝', title: '批量上传', desc: '支持一次上传多个视频链接；实时显示处理进度；友好的错误信息展示' },
    ],
  },
  {
    version: 'v2.1.0',
    date: '2026-02-15',
    title: '系统稳定性改进',
    features: [
      { icon: '🔒', title: 'SSL 证书优化', desc: '本地环境不再验证 BibiGPT API SSL 证书，提升开发体验' },
      { icon: '🛡️', title: 'API 安全性', desc: '修复 BibiGPT API 解析问题和潜在安全隐患' },
    ],
    tech: ['Commit: 42b447a', 'Commit: 2c18dab'],
  },
  {
    version: 'v2.0.0',
    date: '2026-02-14',
    title: 'Palantir 视频分析系统',
    features: [
      { icon: '🎯', title: 'YouTube 频道分析', desc: '自动获取 Palantir 频道视频，实现智能分析、评分、分类' },
      { icon: '📊', title: '视频评分系统', desc: 'Score = V_score × 0.4 + T_score × 0.3 + K_score × 0.3；S/A/B 等级分类' },
      { icon: '🎬', title: '多级字幕提取', desc: 'YouTube API → yt-dlp → BibiGPT → Whisper；支持中英文双语字幕' },
      { icon: '🤖', title: '智能报告生成', desc: '基于视频内容生成 AI 分析报告；支持自定义报告模板' },
    ],
    tech: ['后端：FastAPI + yt-dlp + OpenAI/DeepSeek', '前端：React + Vite + TailwindCSS', '字幕：Whisper + BibiGPT'],
  },
  {
    version: 'v1.6.0',
    date: '2025-02-15',
    title: '极简上传 & 字幕增强',
    features: [
      { icon: '🚀', title: '极简上传入口', desc: '访问 /upload 无需登录即可使用；游客每日 5 个视频，登录后无限制；适合快速获取字幕并导出到 NotebookLM' },
      { icon: '📥', title: '多选下载字幕', desc: '勾选视频后一键下载：合并 TXT/MD 或 ZIP 包；每行支持复制/下载单条字幕；批量删除、导出 CSV' },
      { icon: '📋', title: '字幕体验增强', desc: '摘要/字幕一键复制；导出 TXT 或 Markdown（原/中/双语）；时间戳点击跳转；搜索词高亮；单段复制' },
      { icon: '📅', title: '时间筛选快捷', desc: '日期范围支持近 1 周/1 月/3 月/1 年快捷按钮' },
      { icon: '🤖', title: '智能问答增强', desc: '追问链式对话；引用来源高亮；常用问题模板（总结要点、提取金句、核心观点等）' },
      { icon: '📊', title: '报告与统计', desc: '报告支持导出 PDF 或 Markdown；统计面板新增等级分布、按月视频数、按月播放量图表' },
      { icon: '🛡️', title: '稳定性优化', desc: 'API 自动重试（5xx、网络错误）；弹窗支持 Esc 关闭；可访问性改进' },
    ],
  },
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
    tech: ['后端：FastAPI + Python 3.11', '前端：React + Vite + Tailwind', '部署：Nginx 反向代理 + systemd'],
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
    version: 'v2.3.0',
    date: '2026-02-23',
    title: 'Ontologize Dashboard & Translation Boost',
    features: [
      { icon: '📊', title: 'Ontologize Dashboard', desc: 'Added Ontologize channel dashboard with 96 videos; multi-dashboard system: Palantir, Ontologize, Temp Upload, Slim Upload' },
      { icon: '⚡', title: 'Translation Performance Boost', desc: '5-thread concurrent translation, ~5x faster; 22-segment translation reduced from 1-2 min to 10-20 sec' },
      { icon: '🔧', title: 'Segmented Translation', desc: 'Unified segmented translation (1500 chars per segment); completely fixes Chinese translation truncation for long videos' },
      { icon: '🎨', title: 'Loading UX', desc: 'Added spinner animation and friendly text prompts for better visual feedback during translation' },
    ],
    tech: ['Backend: ThreadPoolExecutor concurrent translation', 'Optimization: Segmented translation avoids token limits', 'Config: Multi-dashboard dynamic routing'],
  },
  {
    version: 'v2.2.0',
    date: '2026-02-22',
    title: 'Video Upload Feature',
    features: [
      { icon: '📤', title: 'Temp Upload Dashboard', desc: 'Users can upload YouTube links for analysis; API: /api/convert-videos; data path: frontend/public/data/temp/' },
      { icon: '🚀', title: 'Slim Upload Dashboard', desc: 'Simplified upload interface; data path: frontend/public/data/slim/' },
      { icon: '📝', title: 'Batch Upload', desc: 'Support uploading multiple video links at once; real-time progress display; friendly error messages' },
    ],
  },
  {
    version: 'v2.1.0',
    date: '2026-02-15',
    title: 'System Stability Improvements',
    features: [
      { icon: '🔒', title: 'SSL Certificate Optimization', desc: 'Local environment no longer validates BibiGPT API SSL certificates for better dev experience' },
      { icon: '🛡️', title: 'API Security', desc: 'Fixed BibiGPT API parsing issues and potential security risks' },
    ],
    tech: ['Commit: 42b447a', 'Commit: 2c18dab'],
  },
  {
    version: 'v2.0.0',
    date: '2026-02-14',
    title: 'Palantir Video Analysis System',
    features: [
      { icon: '🎯', title: 'YouTube Channel Analysis', desc: 'Auto-fetch Palantir channel videos for intelligent analysis, scoring, and classification' },
      { icon: '📊', title: 'Video Scoring System', desc: 'Score = V_score × 0.4 + T_score × 0.3 + K_score × 0.3; S/A/B tier classification' },
      { icon: '🎬', title: 'Multi-tier Transcript Extraction', desc: 'YouTube API → yt-dlp → BibiGPT → Whisper; supports Chinese/English bilingual subtitles' },
      { icon: '🤖', title: 'Smart Report Generation', desc: 'AI-powered analysis reports based on video content; supports custom report templates' },
    ],
    tech: ['Backend: FastAPI + yt-dlp + OpenAI/DeepSeek', 'Frontend: React + Vite + TailwindCSS', 'Subtitles: Whisper + BibiGPT'],
  },
  {
    version: 'v1.6.0',
    date: '2025-02-15',
    title: 'Quick Upload & Transcript Enhancements',
    features: [
      { icon: '🚀', title: 'Quick Upload Entry', desc: 'Visit /upload without login; guests 5 videos/day, unlimited when logged in; ideal for NotebookLM export' },
      { icon: '📥', title: 'Batch Download Transcripts', desc: 'Multi-select → merge TXT/MD or ZIP; per-row copy/download; batch delete, export CSV' },
      { icon: '📋', title: 'Transcript Experience', desc: 'One-click copy summary/transcript; export TXT or Markdown (original/zh/bilingual); timestamp jump; search highlight; copy single paragraph' },
      { icon: '📅', title: 'Date Filter Shortcuts', desc: 'Quick buttons: last 1w/1m/3m/1y' },
      { icon: '🤖', title: 'AI Chat Enhancements', desc: 'Multi-turn follow-up; citation highlight; preset question templates (summarize, extract quotes, key points)' },
      { icon: '📊', title: 'Reports & Stats', desc: 'Export reports as PDF or Markdown; rank distribution, videos/month, views/month charts' },
      { icon: '🛡️', title: 'Stability', desc: 'API auto-retry for 5xx and network errors; Esc to close modals; accessibility improvements' },
    ],
  },
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
    tech: ['Backend: FastAPI + Python 3.11', 'Frontend: React + Vite + Tailwind', 'Deployment: Nginx + systemd'],
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
