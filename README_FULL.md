# Palantir 视频分析系统

完整的视频分析、转录和 AI 问答系统

## 🎯 功能特性

### 1️⃣ 数据筛选
- 📺 **播放量 20K+**: 不限时间，全部获取
- 📅 **2024年1月+**: 不限播放量，全部获取
- 🔑 **关键词匹配**: AIPCon, Paragon, Demo, Tutorial 等

### 2️⃣ 字幕获取
- ✅ 使用 youtube-transcript-api 获取已有字幕
- 🎙️ 使用 Whisper 自动转录无字幕视频
- 💾 自动保存到 JSON 数据文件

### 3️⃣ AI 总结
- 🤖 使用 DeepSeek API 生成字幕总结
- 📝 智能提取核心内容、产品功能、技术要点
- 🎯 突出关键信息（产品名称、架构、应用场景）

### 4️⃣ 智能问答
- 📝 **单篇问答**: 针对当前视频提问
- 📚 **多篇问答**: 选择多个视频后统一提问
- 📂 **分类提问**: 按等级筛选后提问
- 💬 **自由提问**: 基于所有有字幕视频自由发问
- 🔍 上下文感知: 自动引用对应视频内容回答

---

## 📁 项目结构

```
vedioanalysis/
├── api_server.py           # FastAPI 后端服务
├── index.html              # React 前端页面
├── start.sh                # 一键启动脚本
├── requirements.txt         # Python 依赖
├── palantir_analyzer.py    # 原分析脚本
└── palantir_analysis/       # 数据输出目录
    ├── filtered_candidates.json    # 345个视频数据
    ├── filtered_candidates.csv     # Excel 可打开
    ├── filter_summary.json       # 三类统计
    ├── transcripts/             # 字幕文本文件
    └── video_index.csv          # 视频索引
```

---

## 🚀 快速开始

### 方法 1: 一键启动（推荐）

```bash
chmod +x start.sh
./start.sh
```

自动完成：
1. 安装依赖
2. 启动后端 API (http://localhost:8000)
3. 打开浏览器

### 方法 2: 手动启动

#### 1. 安装依赖
```bash
source venv/bin/activate
pip install -r requirements.txt
```

#### 2. 启动后端 API
```bash
source venv/bin/activate
python api_server.py
```

#### 3. 访问页面
- **API 文档**: http://localhost:8000/docs
- **前端页面**: http://localhost:8000/
- **数据接口**: http://localhost:8000/api/

---

## 🌐 API 端点

### GET /api/videos
获取所有筛选出的视频列表

**响应**: `VideoData[]`

```json
[
  {
    "video_id": "xxx",
    "title": "视频标题",
    "url": "https://...",
    "published": "2024-03-15",
    "view_count": 125000,
    "score": 87.5,
    "rank": "A",
    "transcript": "完整字幕文本...",
    "summary": "AI 总结文本...",
    "matched_criteria": {
      "20k_views": true,
      "since_2024": true,
      "keywords": ["Paragon", "Demo"]
    }
  }
]
```

### POST /api/transcribe/{video_id}
使用 Whisper 转录单个视频（需要 ffmpeg）

**请求**: 无

**响应**:
```json
{
  "status": "success",
  "video_id": "xxx",
  "transcript": "转录的字幕文本..."
}
```

### POST /api/summarize
批量总结视频字幕（使用 DeepSeek）

**请求**:
```json
{
  "video_ids": ["id1", "id2", ...],
  "mode": "single"  // single | multi | category | free
}
```

**响应**:
```json
{
  "status": "success",
  "summarized": 5,
  "total": 10
}
```

### POST /api/question
基于视频字幕回答问题（使用 DeepSeek）

**请求**:
```json
{
  "video_id": "xxx",
  "question": "问题内容",
  "context_mode": "single"  // single | multi | category | free
}
```

**响应**:
```json
{
  "status": "success",
  "video_id": "xxx",
  "question": "问题内容",
  "answer": "AI 回答内容..."
}
```

---

## 📊 数据统计（当前）

| 指标 | 数量 |
|------|------|
| **频道总视频** | 404 |
| **筛选总数（去重）** | 345 (85.4%) |
| **📺 播放量 20K+** | 115 |
| **📅 2024年1月+** | 206 |
| **🔑 关键词匹配** | 218 |

---

## 🔧 配置说明

### DeepSeek API Key
在 `api_server.py` 中配置：
```python
DEEPSEEK_API_KEY = "sk-a90f63d032f642ebaf2d0a87e5714998"
```

### Whisper 模型
默认使用 `base` 模型，适合快速转录。可更改为：
- `tiny` - 最快但准确度较低
- `small` - 平衡速度和准确度
- `medium` - 更高准确度
- `large` - 最高准确度但速度慢

```python
model = whisper.load_model('small')  # 改为 small 模型
```

---

## 💡 使用流程

### 场景 1: 查看 AI 总结
1. 打开 http://localhost:8000/
2. 点击任意视频卡片
3. 如果有 AI 总结，会显示在字幕上方
4. 如需重新总结，可点击「重新总结」按钮（TODO）

### 场景 2: 单篇问答
1. 选择一个视频
2. 右侧切换到「📝 单篇问答」模式
3. 在输入框输入问题
4. 点击发送，AI 基于该视频字幕回答

### 场景 3: 多篇对比问答
1. 先批量选择视频（使用等级或字幕筛选）
2. 右侧切换到「📚 多篇问答」模式
3. 提问后，AI 会综合多个视频内容回答

### 场景 4: 转录无字幕视频
1. 找到无字幕视频（显示「🎙️ 转录」按钮）
2. 点击按钮开始 Whisper 转录
3. 等待转录完成（按钮会显示加载状态）
4. 转录完成后自动保存并可查看完整字幕

---

## ⚙️ 常见问题

### Q: Whisper 转录需要 ffmpeg
**A**: 是的，需要先安装 ffmpeg：
```bash
# macOS
brew install ffmpeg

# 或下载静态二进制
# https://evermeet.cx/ffmpeg/getrelease/0
```

### Q: 转录很慢
**A**:
- Whisper `base` 模型约 1-2 分钟/10 分钟视频
- 可改用 `small` 或 `tiny` 模型加快速度
- 或使用 GPU 加速（需要安装 CUDA 版本）

### Q: DeepSeek API 调用失败
**A**: 检查：
1. API Key 是否正确
2. 网络连接是否正常
3. API 额度是否用尽（每分钟有限制）

### Q: 浏览器不自动打开
**A**: 手动访问 http://localhost:8000/

---

## 📝 更新日志

### v2.0 (2025-02-13)
- ✅ 添加 Whisper 转录功能
- ✅ 集成 DeepSeek API
- ✅ 创建完整前端 UI
- ✅ 支持多种问答模式
- ✅ 实时字幕和总结展示

---

## 🎓 数据来源

- **YouTube**: Palantir 官方频道
- **频道 URL**: https://www.youtube.com/@palantirtech
- **筛选数据**: Cursor 生成的 filtered_candidates.json (345 个视频)

---

**Made with ❤️ for competitive intelligence analysis**
