# 后端配合前端界面的修改说明

前端已实现，Python 脚本已完成以下调整以配合界面展示。

---

## 已完成的 4 处修改

### 1. 目录结构规范化

**修改：** `PalantirVideoAnalyzer.__init__` 增加 `data_dir` 和 `channel_id` 参数。

**效果：** 当设置 `data_dir="frontend/public/data"` 时，脚本会输出到：
```
frontend/public/data/palantirtech/
├── master_index.csv    # 供前端列表展示（含 Transcript 列）
├── config.json         # 供前端配置面板展示
├── status.json         # 供前端进度条展示
└── transcripts/        # 字幕文件（从主输出目录同步）
```

主输出仍为 `palantir_analysis/`（filtered_candidates、video_index 等）。

---

### 2. 引入 config.json

**修改：** 新增 `_write_config_json()`，在 `process_filtered_candidates` 结束时写入 `config.json`。

**格式示例：**
```json
{
  "keywords": { "AIP": 5, "Paragon": 5, "Demo": 2, ... },
  "thresholds": { "S": 85, "A": 70, "B": 0 },
  "weights": { "view": 0.4, "time": 0.3, "keyword": 0.3 }
}
```

**后续可选：** 如需从 config.json 读取关键词（替代硬编码），可增加 `load_config()`，在 `VideoScorer` 中优先使用配置文件中的关键词。

---

### 3. 增加 status.json

**修改：** 新增 `_write_status(current, total, status)`，在 `process_filtered_candidates` 中：
- 开始时：`status: "processing"`, `current: 0`
- 每处理一个视频：更新 `current`
- 结束时：`status: "idle"`, `current: total`

**格式：**
```json
{
  "current": 45,
  "total": 200,
  "status": "processing",
  "channel": "palantirtech",
  "updatedAt": "2025-02-13T12:00:00Z"
}
```

前端每 10 秒轮询该文件以更新进度条。

---

### 4. 生成 master_index.csv（含 Transcript 列）

**修改：** 新增 `_generate_master_index_csv()`，从 transcripts 解析元数据并生成：

| Rank | Score | Title | Date | Views | Transcript | URL |
|------|-------|-------|------|-------|------------|-----|
| A | 84 | Paragon 2025 | 2025-12-05 | 26142 | 有 | https://... |

前端读取该 CSV 作为数据源。

---

## 使用方式

```python
analyzer = PalantirVideoAnalyzer(
    output_dir="palantir_analysis",
    data_dir="frontend/public/data",  # 设为 None 则不同步到前端
    channel_id="palantirtech",
)
analyzer.filter_channel(CHANNEL_URL, limit=None)
analyzer.process_filtered_candidates(limit=None)
```

运行后启动前端：`cd frontend && npm run dev`，即可在界面中查看数据和配置。

---

## 可选：从 config.json 读取关键词

若希望前端修改配置后，Python 按新配置运行，可增加：

```python
def load_config(config_path: Path) -> Dict:
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

# 在 filter_channel / process 前：
config = load_config(self.data_dir / "config.json") if self.data_dir else {}
keywords = config.get("keywords", {})
# 将 keywords 传给 VideoScorer（需对 VideoScorer 做相应改造）
```

当前版本仍使用 Python 内硬编码的关键词，仅将配置写入 JSON 供前端展示。
