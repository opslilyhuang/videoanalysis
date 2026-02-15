#!/usr/bin/env python3
"""
Palantir 视频分析 API
- 获取字幕内容
- 大模型总结
- 对话问答（支持单篇/多篇/分类/自由查询）
- 运行分析脚本（支持进度条实时状态）
"""
import os
import re
import json
import subprocess
import sys
import base64
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# 项目根目录（api.py 所在目录），确保从正确路径加载 .env
PROJECT_ROOT = Path(__file__).parent
load_dotenv(PROJECT_ROOT / ".env")
DATA_BASE = PROJECT_ROOT / "frontend" / "public" / "data"


def get_data_dir(dashboard_id: str = "palantirtech") -> Path:
    return DATA_BASE / dashboard_id


def get_transcripts_dir(dashboard_id: str = "palantirtech") -> Path:
    return get_data_dir(dashboard_id) / "transcripts"


def get_reports_dir(dashboard_id: str = "palantirtech") -> Path:
    p = DATA_BASE / "reports" / dashboard_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def _save_report(dashboard_id: str, payload: dict) -> str:
    report_id = str(uuid.uuid4())[:8]
    path = get_reports_dir(dashboard_id) / f"{report_id}.json"
    payload["id"] = report_id
    payload["created_at"] = datetime.now().isoformat()
    if "status" not in payload:
        payload["status"] = "completed"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return report_id


def _update_report(report_id: str, dashboard_id: str, updates: dict):
    """更新已有报告内容"""
    path = get_reports_dir(dashboard_id) / f"{report_id}.json"
    if not path.exists():
        return
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data.update(updates)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _list_reports(dashboard_id: str) -> List[dict]:
    d = get_reports_dir(dashboard_id)
    out = []
    for f in sorted(d.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            with open(f, encoding="utf-8") as fp:
                data = json.load(fp)
            out.append({
                "id": data.get("id"),
                "title": data.get("title", ""),
                "created_at": data.get("created_at", ""),
                "mode": data.get("mode", ""),
                "selected_count": data.get("selected_count", 0),
                "status": data.get("status", "completed"),  # pending | processing | completed | failed
                "error": data.get("error"),
            })
        except Exception:
            pass
    return out


def _get_report(report_id: str, dashboard_id: str) -> Optional[dict]:
    path = get_reports_dir(dashboard_id) / f"{report_id}.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _delete_report(report_id: str, dashboard_id: str) -> bool:
    path = get_reports_dir(dashboard_id) / f"{report_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False


VALID_AUTH = base64.b64encode(b"admin:admin@2026").decode()

# 游客可访问的 API 路径（无需登录，极简模式需字幕/总结/翻译/问答）
GUEST_ALLOWED_PREFIXES = (
    "/api/convert-videos",
    "/api/convert-transcript",
    "/api/temp-convert-status",
    "/api/temp-clean-empty",
    "/api/temp-delete-video",
    "/api/temp-delete-videos",
    "/api/transcript",
    "/api/transcript-ready",
    "/api/dashboards",
    "/api/guest-remaining",
    "/api/video-meta",
    "/api/master-index",
    "/api/summarize",
    "/api/chat",
    "/api/translate",
    "/api/translate-paragraphs",
    "/api/save-video-meta",
)

# 配额设置
# 游客：5次/天 或 80分钟/天（按15分钟/次预估）
GUEST_DAILY_LIMIT_COUNT = 5
GUEST_DAILY_LIMIT_MINUTES = 80
VIDEO_DURATION_ESTIMATE = 15  # 每次转换预估15分钟

# 登录用户：20次/天 或 300分钟/天
AUTH_DAILY_LIMIT_COUNT = 20
AUTH_DAILY_LIMIT_MINUTES = 300

# 存储格式: "ip:yyyy-mm-dd" -> {"count": int, "minutes": int}
# 对于登录用户: "user:yyyy-mm-dd" -> {"count": int, "minutes": int}
_guest_usage: dict[str, dict[str, int]] = {}


def _get_user_key(request: Request) -> tuple[str, bool]:
    """
    返回 (用户标识, 是否为登录用户)
    游客: "ip:yyyy-mm-dd", False
    登录用户: "user:yyyy-mm-dd", True
    """
    if _is_authenticated(request):
        today = datetime.now().strftime("%Y-%m-%d")
        return f"user:{today}", True
    else:
        ip = request.client.host if request.client else "unknown"
        today = datetime.now().strftime("%Y-%m-%d")
        return f"{ip}:{today}", False


def _get_guest_key(request: Request) -> str:
    """兼容旧代码，返回游客 key"""
    key, _ = _get_user_key(request)
    return key


def _check_quota_limit(request: Request) -> tuple[bool, int, int]:
    """
    返回 (是否可继续, 今日已用次数, 今日已用分钟数)
    同时检查次数和时长限制，任一超限即不可继续
    """
    key, is_auth = _get_user_key(request)
    usage = _guest_usage.get(key, {"count": 0, "minutes": 0})

    if is_auth:
        # 登录用户限制
        limit_count = AUTH_DAILY_LIMIT_COUNT
        limit_minutes = AUTH_DAILY_LIMIT_MINUTES
    else:
        # 游客限制
        limit_count = GUEST_DAILY_LIMIT_COUNT
        limit_minutes = GUEST_DAILY_LIMIT_MINUTES

    count_ok = usage["count"] < limit_count
    minutes_ok = usage["minutes"] < limit_minutes
    can_continue = count_ok and minutes_ok

    return can_continue, usage["count"], usage["minutes"]


def _check_guest_limit(request: Request) -> tuple[bool, int]:
    """兼容旧代码，仅检查游客次数限制"""
    key, is_auth = _get_user_key(request)
    if is_auth:
        return True, 0  # 登录用户无限制（旧逻辑）
    usage = _guest_usage.get(key, {"count": 0, "minutes": 0})
    return usage["count"] < GUEST_DAILY_LIMIT_COUNT, usage["count"]


def _inc_usage(request: Request, count_delta: int = 1, minutes_delta: int = VIDEO_DURATION_ESTIMATE) -> dict[str, int]:
    """
    增加使用量
    返回更新后的使用情况 {"count": int, "minutes": int}
    """
    key, _ = _get_user_key(request)
    if key not in _guest_usage:
        _guest_usage[key] = {"count": 0, "minutes": 0}
    _guest_usage[key]["count"] += count_delta
    _guest_usage[key]["minutes"] += minutes_delta
    return _guest_usage[key]


def _inc_guest_usage(request: Request, delta: int = 1) -> int:
    """兼容旧代码，仅增加次数"""
    key, _ = _get_user_key(request)
    if key not in _guest_usage:
        _guest_usage[key] = {"count": 0, "minutes": 0}
    _guest_usage[key]["count"] += delta
    return _guest_usage[key]["count"]


def _is_authenticated(request: Request) -> bool:
    token = request.headers.get("X-Auth-Token") or request.headers.get("Authorization", "").replace("Bearer ", "")
    return token == VALID_AUTH


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/api/") and request.method != "OPTIONS":
            if _is_authenticated(request):
                return await call_next(request)
            allowed = any(request.url.path == p or request.url.path.startswith(p) for p in GUEST_ALLOWED_PREFIXES)
            if not allowed:
                return JSONResponse({"detail": "未授权，请先登录"}, status_code=401)
        return await call_next(request)


app = FastAPI(title="Palantir Video Analysis API")
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_video_id(url: str) -> Optional[str]:
    m = re.search(r"[?&]v=([a-zA-Z0-9_-]{11})", url or "")
    return m.group(1) if m else None


def load_transcript_index(dashboard_id: str = "palantirtech"):
    path = get_data_dir(dashboard_id) / "transcript_index.json"
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def regen_transcript_index(dashboard_id: str = "palantirtech") -> dict:
    """重新生成 transcript_index.json，同一视频若有多个 transcript 文件则优先选用有实际内容的"""
    transcripts_path = get_transcripts_dir(dashboard_id)
    index: dict[str, tuple[str, bool]] = {}
    for txt_path in sorted(transcripts_path.glob("*.txt")):
        try:
            raw = txt_path.read_text(encoding="utf-8")
            for line in raw.split("\n"):
                if line.strip().startswith("URL:"):
                    url = line.split(":", 1)[1].strip()
                    m = re.search(r"[?&]v=([a-zA-Z0-9_-]{11})", url)
                    if m:
                        vid = m.group(1)
                        has_content = "NO TRANSCRIPT AVAILABLE" not in raw
                        if vid not in index or (has_content and not index[vid][1]):
                            index[vid] = (txt_path.name, has_content)
                    break
        except Exception:
            pass
    out = {vid: fn for vid, (fn, _) in index.items()}
    path = get_data_dir(dashboard_id) / "transcript_index.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    return out


def _find_best_transcript_file(video_id: str, dashboard_id: str = "palantirtech") -> str | None:
    """返回该视频最合适的 transcript 文件名（优先有实际内容的文件）。若无可读字幕则返回 None。
    若通过扫描找到比索引更好的文件，会更新 transcript_index 以便后续请求更快。
    temp 看板若无对应文件则回退到 palantirtech 目录查找（兼容历史数据）。"""
    transcripts_path = get_transcripts_dir(dashboard_id)
    index = load_transcript_index(dashboard_id)
    candidate = index.get(video_id)
    if candidate:
        path = transcripts_path / candidate
        if not path.exists() and dashboard_id == "temp":
            path = get_transcripts_dir("palantirtech") / candidate
        if path.exists():
            raw = path.read_text(encoding="utf-8")
            if "NO TRANSCRIPT AVAILABLE" not in raw:
                return candidate
    # 索引指向空内容或无，扫描 transcripts 查找有内容的同视频文件
    def _scan_dir(scan_path: Path) -> str | None:
        for txt_path in sorted(scan_path.glob("*.txt")):
            try:
                raw = txt_path.read_text(encoding="utf-8")
                if "NO TRANSCRIPT AVAILABLE" in raw:
                    continue
                for line in raw.split("\n"):
                    if line.strip().startswith("URL:"):
                        url = line.split(":", 1)[1].strip()
                        m = re.search(r"[?&]v=([a-zA-Z0-9_-]{11})", url)
                        if m and m.group(1) == video_id:
                            return txt_path.name
                        break
            except Exception:
                pass
        return None

    found = _scan_dir(transcripts_path)
    if found:
        index[video_id] = found
        idx_path = get_data_dir(dashboard_id) / "transcript_index.json"
        try:
            with open(idx_path, "w", encoding="utf-8") as f:
                json.dump(index, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
        return found
    if dashboard_id == "temp":
        found = _scan_dir(get_transcripts_dir("palantirtech"))
        if found:
            return found
    return None


def read_transcript_content(filename: str, dashboard_id: str = "palantirtech") -> tuple[str, str]:
    """返回 (metadata_section, transcript_text)。temp 看板若无该文件则回退到 palantirtech 读取（兼容历史数据）。"""
    path = get_transcripts_dir(dashboard_id) / filename
    if not path.exists() and dashboard_id == "temp":
        path = get_transcripts_dir("palantirtech") / filename
    if not path.exists():
        return "", ""
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    if "TRANSCRIPT" in raw and "=" * 80 in raw:
        parts = raw.split("TRANSCRIPT")
        if len(parts) >= 2:
            meta = parts[0].strip()
            transcript = parts[1].split("=" * 80, 1)[-1].strip() if "=" * 80 in parts[1] else parts[1].strip()
            return meta, transcript
    return "", raw


def load_master_index(dashboard_id: str = "palantirtech") -> List[dict]:
    import csv
    path = get_data_dir(dashboard_id) / "master_index.csv"
    if not path.exists():
        return []
    rows = []
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            r["_video_id"] = get_video_id(r.get("URL", ""))
            rows.append(r)
    return rows


@app.get("/api/master-index")
def api_master_index(dashboard_id: str = "temp"):
    """获取临时/极简看板的视频列表，用于前端刷新（与 temp-convert-status 同数据源）"""
    if dashboard_id not in ("temp", "slim"):
        dashboard_id = "temp"
    return load_master_index(dashboard_id)


def call_deepseek(messages: list, max_tokens: int = 2000, model: str = "deepseek-chat") -> str:
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY 未配置，请在 .env 中设置")
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
        r = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
        )
        return r.choices[0].message.content or ""
    except Exception as e:
        err_msg = str(e).lower()
        # 若 reasoner 返回 404/Not Found，给出更明确的提示
        if "not found" in err_msg or "404" in err_msg:
            raise HTTPException(
                status_code=503,
                detail="AI 模型暂时不可用（deepseek-reasoner），请稍后重试或联系管理员检查 API 配置"
            )
        raise HTTPException(status_code=500, detail=str(e))


def _call_deepseek_with_fallback(messages: list, max_tokens: int = 2000, prefer_reasoner: bool = False) -> str:
    """优先使用 reasoner，失败时回退到 chat"""
    if prefer_reasoner:
        try:
            return call_deepseek(messages, max_tokens=max_tokens, model="deepseek-reasoner")
        except HTTPException:
            pass  # 回退到 chat
    return call_deepseek(messages, max_tokens=max_tokens, model="deepseek-chat")


# --- API Routes ---


class RunAnalysisRequest(BaseModel):
    mode: Optional[str] = "full"  # "full" | "filter-only" | "whisper-missing" | "retry-failed" | "process-others"
    limit: Optional[int] = None
    dashboard_id: Optional[str] = "palantirtech"


@app.post("/api/run-analysis")
def run_analysis(request: RunAnalysisRequest, background_tasks: BackgroundTasks):
    """
    在后台运行分析脚本，前端通过轮询 status.json 获取实时进度
    """
    script = PROJECT_ROOT / "palantir_analyzer.py"
    if not script.exists():
        raise HTTPException(status_code=500, detail="palantir_analyzer.py 未找到")

    mode = request.mode or "full"
    limit = request.limit
    dashboard_id = request.dashboard_id or "palantirtech"

    app_config_path = DATA_BASE / "app_config.json"
    auto_whisper = False
    if app_config_path.exists():
        try:
            with open(app_config_path, encoding="utf-8") as f:
                cfg = json.load(f)
                auto_whisper = cfg.get("autoWhisperConvert", False)
        except Exception:
            pass

    cmd = [sys.executable, str(script), "--dashboard", dashboard_id]
    if mode == "filter-only":
        cmd.append("--filter-only")
    elif mode == "whisper-missing":
        cmd.append("--whisper-missing")
    elif mode == "retry-failed":
        cmd.append("--retry-failed")
    elif mode == "process-others":
        cmd.append("--process-others")
    if limit is not None and limit > 0:
        cmd.extend(["--limit", str(limit)])
    if mode == "full" and auto_whisper:
        cmd.append("--auto-whisper")

    def _run():
        try:
            subprocess.run(
                cmd,
                cwd=str(PROJECT_ROOT),
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
                capture_output=False,
            )
        except Exception as e:
            print(f"run_analysis error: {e}")

    background_tasks.add_task(_run)
    return {"ok": True, "message": "分析已启动，请查看进度条", "mode": mode}


@app.get("/api/status")
def get_status(dashboard_id: str = "palantirtech"):
    """获取分析脚本的实时状态（供前端进度条使用）"""
    path = get_data_dir(dashboard_id) / "status.json"
    if not path.exists():
        return {"current": 0, "total": 0, "status": "idle", "phase": "process", "failed_count": 0}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"current": 0, "total": 0, "status": "idle", "phase": "process", "failed_count": 0}


@app.get("/api/transcript-ready/{video_id}")
def transcript_ready(video_id: str, dashboard_id: str = "palantirtech"):
    """检查该视频的字幕是否已生成并可用（用于转换完成后的轮询）"""
    filename = _find_best_transcript_file(video_id, dashboard_id)
    return {"ready": bool(filename)}


@app.get("/api/transcript/{video_id}")
def get_transcript(video_id: str, dashboard_id: str = "palantirtech"):
    """根据 video_id 获取字幕内容。自动优先选用有实际内容的文件（即使 transcript_index 指向空文件）"""
    filename = _find_best_transcript_file(video_id, dashboard_id)
    if not filename:
        raise HTTPException(
            status_code=404,
            detail="未找到该视频的字幕。请确认视频已成功转换"
        )
    meta, transcript = read_transcript_content(filename, dashboard_id)
    return {"metadata": meta, "transcript": transcript, "filename": filename}


@app.get("/api/transcript/by-url")
def get_transcript_by_url(url: str):
    vid = get_video_id(url)
    if not vid:
        raise HTTPException(status_code=400, detail="无效的 URL")
    return get_transcript(vid)


@app.post("/api/regen-transcript-index")
def api_regen_transcript_index(dashboard_id: str = "palantirtech"):
    """重新生成 transcript_index.json，修复同一视频多个 transcript 文件时指向空内容文件的问题"""
    regen_transcript_index(dashboard_id)
    return {"ok": True, "message": "已重新生成 transcript_index"}


class SummarizeRequest(BaseModel):
    text: str


class SaveVideoMetaRequest(BaseModel):
    video_id: str
    keywords: Optional[List[str]] = None
    category: Optional[str] = None


@app.post("/api/save-video-meta")
def save_video_meta(request: SaveVideoMetaRequest, dashboard_id: str = "palantirtech"):
    """保存视频元数据（关键词、分类）"""
    path = get_data_dir(dashboard_id) / "video_meta.json"
    meta = {}
    if path.exists():
        with open(path, encoding="utf-8") as f:
            meta = json.load(f)
    vid = request.video_id
    if vid not in meta:
        meta[vid] = {}
    if request.keywords is not None:
        meta[vid]["keywords"] = request.keywords
    if request.category is not None:
        meta[vid]["category"] = request.category
    with open(path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    return {"ok": True}


@app.get("/api/video-meta")
def get_video_meta(dashboard_id: str = "palantirtech"):
    """获取全部视频元数据"""
    path = get_data_dir(dashboard_id) / "video_meta.json"
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@app.post("/api/summarize")
def summarize(request: SummarizeRequest):
    """对大段文字生成摘要，并提取关键词"""
    text = (request.text or "").strip()
    if not text or len(text) < 50:
        return {"summary": "内容过短，无法生成有效摘要。", "keywords": []}
    msg = f"""请对以下视频字幕内容：
1. 生成简洁的中文摘要（约 150-300 字），突出核心观点和关键信息
2. 提取 5-10 个英文关键词，用逗号分隔，便于检索
3. 判断分类：若内容以产品/平台功能演示、教程、案例介绍为主，填「产品介绍」；否则填「非产品介绍」

---
{text[:12000]}
---

请按以下格式回复：
【摘要】
（摘要内容）

【关键词】
keyword1, keyword2, keyword3, ...

【分类】
产品介绍 或 非产品介绍
"""
    raw = call_deepseek([{"role": "user", "content": msg}], max_tokens=1000)
    summary = ""
    keywords = []
    category = ""
    if "【摘要】" in raw:
        p1 = raw.split("【摘要】", 1)[1]
        parts = p1.split("【关键词】", 1)
        summary = parts[0].strip()
        if len(parts) > 1:
            p2 = parts[1].split("【分类】", 1)
            kw_str = p2[0].strip()
            keywords = [k.strip() for k in kw_str.replace("\n", ",").split(",") if k.strip()][:10]
            if len(p2) > 1:
                cat = p2[1].strip()
                category = "产品介绍" if "产品介绍" in cat else "非产品介绍"
    else:
        summary = raw.strip()
    return {"summary": summary, "keywords": keywords, "category": category or "非产品介绍"}


CHAT_MAX_ROUNDS = 10  # 多轮对话最多保留的轮数（每轮 = 1 用户问题 + 1 助手回答）


class ChatHistoryItem(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    query: str
    video_ids: Optional[List[str]] = None
    scope: Optional[str] = None
    category: Optional[str] = None
    dashboard_id: Optional[str] = "palantirtech"
    history: Optional[List[ChatHistoryItem]] = None


@app.post("/api/chat")
def chat(request: ChatRequest):
    """对话：在选定范围内搜索相关内容并回答"""
    query = (request.query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="请输入问题")

    dashboard_id = request.dashboard_id or "palantirtech"
    index = load_transcript_index(dashboard_id)
    master = load_master_index(dashboard_id)

    # 确定要搜索的视频
    video_ids = set()
    if request.video_ids and len(request.video_ids) > 0:
        video_ids = set(request.video_ids)
    elif request.scope == "all" or not request.scope:
        video_ids = set(index.keys())
    elif request.scope == "category" and request.category:
        for row in master:
            if row.get("Rank") == request.category and row.get("_video_id"):
                video_ids.add(row["_video_id"])
        if not video_ids:
            video_ids = set(index.keys())
    else:
        video_ids = set(index.keys())

    # 收集相关字幕（简单关键词匹配 + 全量兜底）
    contexts = []
    query_lower = query.lower()
    for vid in list(video_ids)[:50]:  # 最多 50 个
        fn = index.get(vid)
        if not fn:
            continue
        _, text = read_transcript_content(fn, dashboard_id)
        if not text or "NO TRANSCRIPT" in text[:200]:
            continue
        # 简单相关性：包含查询词则优先
        score = sum(1 for w in query_lower.split() if len(w) > 2 and w in text.lower())
        contexts.append((score, vid, text[:4000]))

    contexts.sort(key=lambda x: -x[0])
    if not contexts:
        contexts = [(0, vid, read_transcript_content(index[vid], dashboard_id)[1][:4000]) for vid in list(index.keys())[:10] if index.get(vid)]

    combined = "\n\n---\n\n".join([f"[视频 {c[1]}]\n{c[2]}" for c in contexts[:15]])

    vid_to_title = {r.get("_video_id", ""): (r.get("Title") or r.get("URL", "")) for r in master if r.get("_video_id")}
    used_vids = list(dict.fromkeys([c[1] for c in contexts[:15] if c[1]]))
    sources = [
        {"video_id": vid, "title": vid_to_title.get(vid) or vid}
        for vid in used_vids
    ]

    system = """你是 Palantir 视频内容的分析助手。基于提供的字幕摘录回答问题，回答要准确、简洁。若内容中无相关信息，请如实说明。支持多轮追问，可结合上下文回答。"""
    user_with_context = f"""参考以下视频字幕内容回答用户问题。若需要可结合你的知识补充，但请注明。

【字幕摘录】
{combined[:25000]}

【用户问题】
{query}
"""
    messages_for_llm = [{"role": "system", "content": system}]
    # 多轮历史：最多 CHAT_MAX_ROUNDS 轮
    if request.history:
        valid = [h for h in request.history if h.role in ("user", "assistant") and (h.content or "").strip()]
        last_n = valid[-(CHAT_MAX_ROUNDS * 2) :]  # 每轮 2 条
        for h in last_n:
            messages_for_llm.append({"role": h.role, "content": (h.content or "").strip()})
    messages_for_llm.append({"role": "user", "content": user_with_context})

    answer = call_deepseek(messages_for_llm, max_tokens=2000)
    return {"answer": answer.strip(), "sources_count": len(contexts), "sources": sources}


# --- 扩展 API ---

@app.get("/api/app-config")
def get_app_config():
    path = DATA_BASE / "app_config.json"
    if not path.exists():
        return {"autoWhisperConvert": True, "checkNewVideosSchedule": ["08:00", "20:00"]}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if "autoWhisperConvert" not in data:
        data["autoWhisperConvert"] = True
    return data


class AppConfigBody(BaseModel):
    autoWhisperConvert: Optional[bool] = None
    checkNewVideosSchedule: Optional[List[str]] = None


@app.post("/api/app-config")
def save_app_config(body: AppConfigBody):
    path = DATA_BASE / "app_config.json"
    data = {}
    if path.exists():
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    if body.autoWhisperConvert is not None:
        data["autoWhisperConvert"] = body.autoWhisperConvert
    if body.checkNewVideosSchedule is not None:
        data["checkNewVideosSchedule"] = body.checkNewVideosSchedule
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return {"ok": True}


@app.get("/api/dashboards")
def get_dashboards():
    path = DATA_BASE / "dashboards.json"
    if not path.exists():
        return [{"id": "palantirtech", "name": "Palantir", "channelId": "palantirtech", "channelUrl": "https://www.youtube.com/@palantirtech", "isTemp": False}]
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class DashboardBody(BaseModel):
    id: str
    name: str
    channelId: Optional[str] = None
    channelUrl: Optional[str] = None
    isTemp: Optional[bool] = False


@app.post("/api/dashboards")
def add_dashboard(body: DashboardBody):
    path = DATA_BASE / "dashboards.json"
    boards = []
    if path.exists():
        with open(path, encoding="utf-8") as f:
            boards = json.load(f)
    boards.append(body.model_dump())
    with open(path, "w", encoding="utf-8") as f:
        json.dump(boards, f, ensure_ascii=False, indent=2)
    return {"ok": True}


@app.get("/api/messages")
def get_messages():
    path = DATA_BASE / "messages.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@app.patch("/api/messages/{msg_id}")
def dismiss_message(msg_id: str):
    path = DATA_BASE / "messages.json"
    if not path.exists():
        return {"ok": True}
    msgs = []
    with open(path, encoding="utf-8") as f:
        msgs = json.load(f)
    msgs = [m for m in msgs if m.get("id") != msg_id]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(msgs, f, ensure_ascii=False, indent=2)
    return {"ok": True}


class CheckNewVideosBody(BaseModel):
    dashboard_id: str = "palantirtech"


def _do_check_new_videos(dashboard_id: str) -> dict:
    """检查频道是否有新视频，有则加入消息中心。返回 {ok, new_count, error?}"""
    import yt_dlp
    boards_path = DATA_BASE / "dashboards.json"
    if not boards_path.exists():
        return {"ok": True, "new_count": 0}
    with open(boards_path, encoding="utf-8") as f:
        boards = json.load(f)
    board = next((b for b in boards if b.get("id") == dashboard_id), None)
    if not board or board.get("isTemp"):
        return {"ok": True, "new_count": 0}
    channel_url = (board.get("channelUrl") or "").rstrip("/")
    if not channel_url.endswith("/videos"):
        channel_url = channel_url + "/videos"
    existing = set()
    master = load_master_index(dashboard_id)
    for r in master:
        vid = r.get("_video_id") or get_video_id(r.get("URL", ""))
        if vid:
            existing.add(vid)
    try:
        ydl = yt_dlp.YoutubeDL({"quiet": True, "extract_flat": "in_playlist"})
        res = ydl.extract_info(channel_url, download=False)
        new_ids = []
        for e in (res.get("entries") or []):
            if e and e.get("id") and e["id"] not in existing:
                new_ids.append(e["id"])
        if new_ids:
            path = DATA_BASE / "messages.json"
            msgs = []
            if path.exists():
                with open(path, encoding="utf-8") as f:
                    msgs = json.load(f)
            msgs.append({
                "id": f"new_{dashboard_id}_{new_ids[0]}_{int(__import__('time').time())}",
                "type": "new_videos",
                "dashboard_id": dashboard_id,
                "title": f"频道 {board.get('name', dashboard_id)} 有 {len(new_ids)} 个新视频",
                "count": len(new_ids),
                "createdAt": __import__("datetime").datetime.now().isoformat(),
            })
            with open(path, "w", encoding="utf-8") as f:
                json.dump(msgs, f, ensure_ascii=False, indent=2)
        return {"ok": True, "new_count": len(new_ids)}
    except Exception as e:
        return {"ok": False, "error": str(e), "new_count": 0}


@app.post("/api/check-new-videos")
def check_new_videos(body: CheckNewVideosBody):
    """检查频道是否有新视频，有则加入消息中心"""
    return _do_check_new_videos(body.dashboard_id or "palantirtech")


@app.get("/api/status-history")
def get_status_history(dashboard_id: str = "palantirtech"):
    path = get_data_dir(dashboard_id) / "status_history.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class TranslateRequest(BaseModel):
    text: str
    target: str = "zh"  # zh | en


@app.post("/api/translate")
def translate_text(request: TranslateRequest):
    """翻译文本，用于双语字幕"""
    text = (request.text or "").strip()
    if not text or len(text) < 10:
        return {"translated": ""}
    target = "中文" if request.target == "zh" else "English"
    msg = f"将以下英文翻译成{target}，只输出翻译结果，不要其他说明：\n\n{text[:8000]}"
    out = call_deepseek([{"role": "user", "content": msg}], max_tokens=2000)
    return {"translated": out.strip()}


class TranslateParagraphsRequest(BaseModel):
    paragraphs: List[str]


@app.post("/api/translate-paragraphs")
def translate_paragraphs(request: TranslateParagraphsRequest):
    """按段落翻译，用于双语字幕的段落级对应展示。逐段调用翻译确保一一对应。"""
    paras = [p.strip() for p in (request.paragraphs or []) if p.strip()]
    if not paras:
        return {"translated": []}
    results = []
    for p in paras:
        if not p:
            results.append("")
            continue
        msg = f"将以下英文翻译成中文，只输出翻译结果，不要其他说明：\n\n{p[:2000]}"
        try:
            out = call_deepseek([{"role": "user", "content": msg}], max_tokens=1500)
            results.append(out.strip() if out else "")
        except Exception:
            results.append("")
    return {"translated": results}


class ConvertVideosRequest(BaseModel):
    urls: List[str]
    dashboard_id: Optional[str] = "temp"  # "temp"=主应用临时上传, "slim"=极简上传


@app.post("/api/convert-transcript/{video_id}")
def convert_single_transcript(video_id: str, background_tasks: BackgroundTasks, dashboard_id: str = "palantirtech"):
    """对单个无字幕视频执行 Whisper 转换"""
    script = PROJECT_ROOT / "palantir_analyzer.py"
    if not script.exists():
        raise HTTPException(status_code=500, detail="palantir_analyzer.py 未找到")

    def _run():
        try:
            subprocess.run(
                [sys.executable, str(script), "--whisper-one", video_id, "--dashboard", dashboard_id],
                cwd=str(PROJECT_ROOT),
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
                capture_output=False,
            )
        except Exception as e:
            print(f"convert_single error: {e}")

    background_tasks.add_task(_run)
    return {"ok": True, "message": "转换已启动", "video_id": video_id}


@app.get("/api/guest-remaining")
def guest_remaining(http_req: Request):
    """
    获取今日剩余配额（次数和分钟数）
    返回：{"remaining_count": int, "remaining_minutes": int, "limit_count": int, "limit_minutes": int, "used_count": int, "used_minutes": int}
    登录用户返回 -1 表示无限制
    """
    if _is_authenticated(http_req):
        return {
            "remaining_count": -1,
            "remaining_minutes": -1,
            "limit_count": AUTH_DAILY_LIMIT_COUNT,
            "limit_minutes": AUTH_DAILY_LIMIT_MINUTES,
            "used_count": 0,
            "used_minutes": 0
        }

    key, _ = _get_user_key(http_req)
    usage = _guest_usage.get(key, {"count": 0, "minutes": 0})
    remaining_count = max(0, GUEST_DAILY_LIMIT_COUNT - usage["count"])
    remaining_minutes = max(0, GUEST_DAILY_LIMIT_MINUTES - usage["minutes"])

    return {
        "remaining_count": remaining_count,
        "remaining_minutes": remaining_minutes,
        "limit_count": GUEST_DAILY_LIMIT_COUNT,
        "limit_minutes": GUEST_DAILY_LIMIT_MINUTES,
        "used_count": usage["count"],
        "used_minutes": usage["minutes"]
    }


@app.post("/api/convert-videos")
def convert_temp_videos(body: ConvertVideosRequest, http_req: Request, background_tasks: BackgroundTasks):
    """
    临时转换 1-5 个视频链接（临时/极简看板用）
    登录用户：20次/天 或 300分钟/天
    游客：5次/天 或 80分钟/天（每次按15分钟计）
    任一上限先到即停止
    """
    urls = [u.strip() for u in (body.urls or []) if u.strip()][:5]
    if not urls:
        raise HTTPException(status_code=400, detail="请提供 1-5 个 YouTube 视频链接")
    vids = [get_video_id(u) for u in urls]
    if any(not v for v in vids):
        raise HTTPException(status_code=400, detail="包含无效的视频链接")

    # 检查配额
    can_continue, used_count, used_minutes = _check_quota_limit(http_req)
    if not can_continue:
        is_auth = _is_authenticated(http_req)
        if is_auth:
            raise HTTPException(
                status_code=429,
                detail=f"登录用户每日限 {AUTH_DAILY_LIMIT_COUNT} 个视频或 {AUTH_DAILY_LIMIT_MINUTES} 分钟，今日已用 {used_count} 次、{used_minutes} 分钟"
            )
        else:
            raise HTTPException(
                status_code=429,
                detail=f"游客每日限 {GUEST_DAILY_LIMIT_COUNT} 个视频或 {GUEST_DAILY_LIMIT_MINUTES} 分钟，今日已用 {used_count} 次、{used_minutes} 分钟，请登录后获得更高配额"
            )

    # 检查单次请求数量是否会超限
    key, is_auth = _get_user_key(http_req)
    usage = _guest_usage.get(key, {"count": 0, "minutes": 0})
    new_count = usage["count"] + len(vids)
    new_minutes = usage["minutes"] + len(vids) * VIDEO_DURATION_ESTIMATE

    if is_auth:
        if new_count > AUTH_DAILY_LIMIT_COUNT or new_minutes > AUTH_DAILY_LIMIT_MINUTES:
            raise HTTPException(
                status_code=429,
                detail=f"本次请求 {len(vids)} 个视频会超限（次数：{usage['count']}/{AUTH_DAILY_LIMIT_COUNT}，时长：{usage['minutes']}/{AUTH_DAILY_LIMIT_MINUTES}分钟）"
            )
    else:
        if new_count > GUEST_DAILY_LIMIT_COUNT or new_minutes > GUEST_DAILY_LIMIT_MINUTES:
            raise HTTPException(
                status_code=429,
                detail=f"本次请求 {len(vids)} 个视频会超限（次数：{usage['count']}/{GUEST_DAILY_LIMIT_COUNT}，时长：{usage['minutes']}/{GUEST_DAILY_LIMIT_MINUTES}分钟），请登录后获得更高配额"
            )

    script = PROJECT_ROOT / "palantir_analyzer.py"
    if not script.exists():
        raise HTTPException(status_code=500, detail="palantir_analyzer.py 未找到")
    vid_str = ",".join(vids)

    # 增加使用量（次数 + 预估时长）
    _inc_usage(http_req, count_delta=len(vids), minutes_delta=len(vids) * VIDEO_DURATION_ESTIMATE)

    storage = (body.dashboard_id or "temp").strip() or "temp"
    if storage not in ("temp", "slim"):
        storage = "temp"

    def _run():
        try:
            subprocess.run(
                [sys.executable, str(script), "--convert-urls", vid_str, "--dashboard", storage],
                cwd=str(PROJECT_ROOT),
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
                capture_output=False,
            )
        except Exception as e:
            print(f"convert_videos error: {e}")

    background_tasks.add_task(_run)
    return {"ok": True, "message": f"已启动转换 {len(vids)} 个视频", "count": len(vids), "video_ids": vids}


@app.get("/api/temp-convert-status")
def temp_convert_status(video_ids: str = "", dashboard_id: str = "temp"):
    """检查临时看板中是否已包含指定视频 ID，用于轮询转换进度。dashboard_id: temp=主应用, slim=极简上传"""
    ids = [v.strip() for v in video_ids.split(",") if v.strip()]
    if not ids:
        return {"all_found": True, "found": []}
    storage = (dashboard_id or "temp").strip() or "temp"
    if storage not in ("temp", "slim"):
        storage = "temp"
    temp_dir = get_data_dir(storage)
    csv_path = temp_dir / "master_index.csv"
    if not csv_path.exists():
        return {"all_found": False, "found": []}
    import csv
    existing = set()
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            vid = get_video_id(row.get("URL", row.get("url", "")))
            if vid:
                existing.add(vid)
    found = [v for v in ids if v in existing]
    return {"all_found": len(found) == len(ids), "found": found}


@app.post("/api/temp-clean-empty")
def temp_clean_empty(dashboard_id: str = "temp"):
    """清理临时看板中的空记录。dashboard_id: temp=主应用, slim=极简上传"""
    storage = (dashboard_id or "temp").strip() or "temp"
    if storage not in ("temp", "slim"):
        storage = "temp"
    temp_dir = get_data_dir(storage)
    csv_path = temp_dir / "master_index.csv"
    if not csv_path.exists():
        return {"ok": True, "removed": 0}
    import csv
    rows = []
    removed = 0
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        for row in reader:
            url = row.get("URL", "").strip()
            title = (row.get("Title") or "").strip()
            vid = get_video_id(url)
            if not url or not vid or not title:
                removed += 1
                continue
            rows.append(row)
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    # 同时更新 transcript_index
    idx_path = temp_dir / "transcript_index.json"
    if idx_path.exists():
        try:
            with open(idx_path, encoding="utf-8") as fp:
                idx = json.load(fp)
            valid_vids = {get_video_id(r.get("URL", "")) for r in rows}
            idx = {k: v for k, v in idx.items() if k in valid_vids}
            with open(idx_path, "w", encoding="utf-8") as fp:
                json.dump(idx, fp, ensure_ascii=False, indent=2)
        except Exception:
            pass
    return {"ok": True, "removed": removed}


@app.post("/api/temp-delete-video")
def temp_delete_video(video_id: str, dashboard_id: str = "temp"):
    """从临时上传列表中移除指定视频。dashboard_id: temp=主应用, slim=极简上传"""
    vid = (video_id or "").strip()
    if not vid or len(vid) != 11:
        raise HTTPException(status_code=400, detail="invalid video_id")
    storage = (dashboard_id or "temp").strip() or "temp"
    if storage not in ("temp", "slim"):
        storage = "temp"
    temp_dir = get_data_dir(storage)
    csv_path = temp_dir / "master_index.csv"
    if not csv_path.exists():
        return {"ok": True}
    import csv
    rows = []
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        for row in reader:
            if get_video_id(row.get("URL", "")) != vid:
                rows.append(row)
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    idx_path = temp_dir / "transcript_index.json"
    if idx_path.exists():
        try:
            with open(idx_path, encoding="utf-8") as fp:
                idx = json.load(fp)
            idx.pop(vid, None)
            with open(idx_path, "w", encoding="utf-8") as fp:
                json.dump(idx, fp, ensure_ascii=False, indent=2)
        except Exception:
            pass
    return {"ok": True}


class TempDeleteVideosRequest(BaseModel):
    video_ids: List[str]
    dashboard_id: Optional[str] = "temp"


@app.post("/api/temp-delete-videos")
def temp_delete_videos(request: TempDeleteVideosRequest):
    """批量从临时上传列表移除视频。dashboard_id: temp=主应用, slim=极简上传"""
    ids = [v.strip() for v in (request.video_ids or []) if v.strip() and len(v.strip()) == 11]
    if not ids:
        return {"ok": True, "deleted": 0}
    storage = (request.dashboard_id or "temp").strip() or "temp"
    if storage not in ("temp", "slim"):
        storage = "temp"
    temp_dir = get_data_dir(storage)
    csv_path = temp_dir / "master_index.csv"
    if not csv_path.exists():
        return {"ok": True, "deleted": 0}
    import csv
    ids_set = set(ids)
    rows = []
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        for row in reader:
            if get_video_id(row.get("URL", "")) not in ids_set:
                rows.append(row)
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    idx_path = temp_dir / "transcript_index.json"
    if idx_path.exists():
        try:
            with open(idx_path, encoding="utf-8") as fp:
                idx = json.load(fp)
            for vid in ids:
                idx.pop(vid, None)
            with open(idx_path, "w", encoding="utf-8") as fp:
                json.dump(idx, fp, ensure_ascii=False, indent=2)
        except Exception:
            pass
    return {"ok": True, "deleted": len(ids)}


# --- 智能报告生成 ---

REPORT_TEMPLATE = """# Palantir 视频分析智能报告

## 一、报告概述
- 筛选范围：视频数量、分类、等级、时间跨度、播放量区间
- 报告主题与核心结论摘要（2-3 句）

## 二、筛选范围说明
- 纳入视频数量及筛选条件
- 按等级/分类分布概览

## 三、核心观点提炼
- 基于字幕内容提炼 3-5 个关键观点
- 每点简明扼要，注明主要来源视频

## 四、产品/功能分析
- 涉及 AIP、Foundry、Paragon 等产品的功能描述
- 演示场景与用例总结

## 五、客户案例洞察
- 重点客户案例的核心信息
- 业务价值与落地效果

## 六、趋势与建议
- 行业/产品趋势观察
- 对竞品分析或学习重点的建议

## 附录：参考视频列表
- 按等级/日期排序的视频标题、链接、发布时间、播放量"""


PRODUCT_KEYWORDS = ["AIPCon", "Foundrycon", "Paragon", "Pipeline", "AIP", "Foundry", "Gotham", "Apollo", "Demo", "Tutorial", "Workshop", "Case Study", "Bootcamp", "How to", "Guide"]


def _apply_filters(master: List[dict], filters: dict, dashboard_id: str = "palantirtech") -> List[dict]:
    """按筛选条件过滤视频，逻辑与前端 VideoList 一致。产品介绍=关键词匹配，非产品=全量-产品-其他"""
    lst = list(master)
    f = filters or {}
    # 加载 video_meta 获取 Keywords
    meta = {}
    try:
        meta_path = get_data_dir(dashboard_id) / "video_meta.json"
        if meta_path.exists():
            with open(meta_path, encoding="utf-8") as fp:
                meta = json.load(fp)
    except Exception:
        pass
    config_kw = {}
    try:
        cfg_path = get_data_dir(dashboard_id) / "config.json"
        if cfg_path.exists():
            with open(cfg_path, encoding="utf-8") as fp:
                cfg = json.load(fp)
                config_kw = cfg.get("keywords") or {}
    except Exception:
        pass
    keywords = list(config_kw.keys()) if config_kw else PRODUCT_KEYWORDS

    def _text(v):
        kw_str = ""
        if v.get("_video_id") and v["_video_id"] in meta:
            kw = meta[v["_video_id"]].get("keywords")
            if isinstance(kw, list):
                kw_str = " ".join(str(k) for k in kw)
            elif kw:
                kw_str = str(kw)
        return ((v.get("Title") or "") + " " + (v.get("Keywords") or kw_str)).lower()

    def _is_product(v):
        return any(kw.lower() in _text(v) for kw in keywords)

    if f.get("search"):
        q = f["search"].lower()
        in_kw = f.get("searchInKeywords", False)
        lst = [v for v in lst if (v.get("Title") or "").lower().find(q) >= 0 or
               (in_kw and _text(v).find(q) >= 0)]
    if f.get("rankFilter"):
        lst = [v for v in lst if v.get("Rank") == f["rankFilter"]]
    if f.get("rankFilterMulti"):
        rfm = f["rankFilterMulti"]
        if rfm == "S+":
            lst = [v for v in lst if v.get("Rank") == "S"]
        elif rfm == "A+":
            lst = [v for v in lst if v.get("Rank") in ("S", "A")]
        elif rfm == "B+":
            lst = [v for v in lst if v.get("Rank") in ("S", "A", "B")]
    if f.get("transcriptFilter"):
        tf = f["transcriptFilter"]
        if tf == "有":
            lst = [v for v in lst if v.get("Transcript") == "有"]
        elif tf == "无":
            lst = [v for v in lst if v.get("Transcript") == "无"]
        elif tf == "whisper":
            lst = [v for v in lst if v.get("Transcript") == "有" and
                   (v.get("TranscriptSource") or "").lower() == "whisper"]
        elif tf == "youtube":
            lst = [v for v in lst if v.get("Transcript") == "有" and
                   (v.get("TranscriptSource") or "").lower() != "whisper"]
    if f.get("categoryFilter"):
        cf = f["categoryFilter"]
        if cf == "产品介绍":
            lst = [v for v in lst if _is_product(v)]
        elif cf == "其他":
            lst = [v for v in lst if (v.get("Category") or v.get("category") or "") == "其他"]
        elif cf == "非产品介绍":
            lst = [v for v in lst if not _is_product(v) and (v.get("Category") or v.get("category") or "") != "其他"]
        else:
            lst = [v for v in lst if (v.get("Category") or v.get("category") or "") == cf]
    if f.get("dateFrom"):
        lst = [v for v in lst if (v.get("Date") or "")[:7] >= (f["dateFrom"] or "")[:7]]
    if f.get("dateTo"):
        lst = [v for v in lst if (v.get("Date") or "")[:7] <= (f["dateTo"] or "")[:7]]
    if f.get("viewsMin") and int(f.get("viewsMin") or 0) > 0:
        lst = [v for v in lst if int(v.get("Views") or 0) >= int(f["viewsMin"])]
    if f.get("viewsMax") and int(f.get("viewsMax") or 0) > 0:
        lst = [v for v in lst if int(v.get("Views") or 0) <= int(f["viewsMax"])]
    return lst


def _rank_videos_by_query(videos: List[dict], query: str) -> List[dict]:
    """按用户需求对视频做相关性预排序：关键词命中越多、等级越高、播放量越大，得分越高"""
    q_lower = (query or "").lower().strip()
    q_words = set(re.findall(r"[a-zA-Z0-9\u4e00-\u9fff]+", q_lower)) - {"的", "了", "在", "是", "和", "与", "或", "等", "a", "an", "the", "of", "in", "on"}
    q_words = {w for w in q_words if len(w) > 1}
    rank_score = {"S": 3, "A": 2, "B": 1}
    scored = []
    for v in videos:
        title = (v.get("Title") or "").lower()
        cat = (v.get("Category") or "").lower()
        text = f"{title} {cat}"
        hits = sum(1 for w in q_words if w in text)
        rk = rank_score.get((v.get("Rank") or ""), 0)
        views = int(v.get("Views") or 0)
        score = hits * 100 + rk * 10 + min(views // 10000, 10)
        scored.append((score, v))
    scored.sort(key=lambda x: -x[0])
    return [v for _, v in scored]


def _load_transcripts_for_videos(video_ids: List[str], dashboard_id: str, max_chars_per_video: int = 4000) -> dict:
    """加载视频字幕，每段截断以避免超出上下文"""
    index = load_transcript_index(dashboard_id)
    result = {}
    for vid in video_ids:
        fn = index.get(vid)
        if not fn:
            continue
        _, text = read_transcript_content(fn, dashboard_id)
        if text and "NO TRANSCRIPT" not in (text[:200] or ""):
            result[vid] = (text or "")[:max_chars_per_video]
    return result


def _batch_summarize_transcripts(videos: List[dict], transcripts: dict, max_chars_per_video: int = 3000) -> dict:
    """为多个视频的字幕批量生成摘要（150-300字/视频），减少传入报告模型的 token 量"""
    items = []
    for i, v in enumerate(videos[:25], 1):  # 最多 25 个
        vid = v.get("_video_id")
        txt = (transcripts.get(vid) or "")[:max_chars_per_video]
        if not txt:
            continue
        title = v.get("Title", "")
        items.append((i, vid, title, txt))
    if not items:
        return {}
    # 构建批量摘要请求：每个视频用【视频N】分隔
    parts = []
    for i, vid, title, txt in items:
        parts.append(f"【视频{i}】{title}\n{txt}")
    combined = "\n\n---\n\n".join(parts)
    # 单次调用生成所有摘要
    msg = f"""以下是一组视频的字幕内容。请为每个视频生成简洁的中文摘要（150-300字），突出核心观点、关键信息、产品/案例要点。

{combined[:60000]}

请按以下格式回复，每个视频的摘要以【摘要N】开头：
【摘要1】
（视频1的摘要内容）

【摘要2】
（视频2的摘要内容）
..."""
    raw = call_deepseek([{"role": "user", "content": msg}], max_tokens=6000)
    # 解析摘要
    result = {}
    for i, vid, _, _ in items:
        pat = rf"【摘要{i}】\s*\n(.*?)(?=【摘要\d+】|$)"
        m = re.search(pat, raw, re.DOTALL)
        summary = (m.group(1).strip() if m else "")[:800]
        if summary:
            result[vid] = summary
        else:
            # 兜底：取该视频对应部分的简要描述
            result[vid] = "（摘要解析失败，请参考标题）"
    return result


class ReportGenerateRequest(BaseModel):
    mode: str  # "filter" | "nl"
    dashboard_id: Optional[str] = "palantirtech"
    filters: Optional[dict] = None
    custom_prompt: Optional[str] = None  # 模式1：用户附加内容，1000字内
    nl_query: Optional[str] = None  # 模式2：自然语言需求


def _do_generate_report(report_id: str, dashboard_id: str, req: dict):
    """后台执行报告生成"""
    try:
        _update_report(report_id, dashboard_id, {"status": "processing"})
        master = load_master_index(dashboard_id)
        if not master:
            _update_report(report_id, dashboard_id, {"status": "failed", "error": "无视频数据"})
            return
        mode = req.get("mode", "filter")
        selected_videos = []
        if mode == "filter":
            selected_videos = _apply_filters(master, req.get("filters") or {}, dashboard_id)
        elif mode == "nl":
            nlq = (req.get("nl_query") or "").strip()
            if not nlq:
                _update_report(report_id, dashboard_id, {"status": "failed", "error": "请输入自然语言需求"})
                return
            ranked = _rank_videos_by_query(master, nlq)
            candidates = ranked[:120]
            video_list_text = "\n".join([
                f"- {r.get('_video_id')} | {r.get('Title', '')} | {r.get('Date', '')} | Rank:{r.get('Rank')} | Views:{r.get('Views')} | Category:{r.get('Category', '')}"
                for r in candidates
            ])
            select_prompt = f"""你是一个视频分析助手。用户需求：{nlq}

以下是按相关性预排序的视频列表（格式：video_id | 标题 | 日期 | 等级 | 播放量 | 分类），靠前的更相关：
{video_list_text}

请根据用户需求，选出最相关的若干视频（建议 10-20 个）。按相关性从高到低排序，每行一个 video_id，不要其他说明。"""
            selected_ids_str = _call_deepseek_with_fallback(
                [{"role": "user", "content": select_prompt}],
                max_tokens=2000,
                prefer_reasoner=True
            )
            selected_ids = re.findall(r"[a-zA-Z0-9_-]{11}", selected_ids_str)
            master_by_id = {r.get("_video_id"): r for r in master if r.get("_video_id")}
            selected_videos = [master_by_id[vid] for vid in selected_ids if vid in master_by_id]

        if not selected_videos:
            err = "未找到与需求匹配的视频" if mode == "nl" else "筛选后无匹配视频"
            _update_report(report_id, dashboard_id, {"status": "failed", "error": err})
            return

        video_ids = [v.get("_video_id") for v in selected_videos if v.get("_video_id")]
        transcripts = _load_transcripts_for_videos(video_ids, dashboard_id)
        videos_with_transcript = [v for v in selected_videos if v.get("_video_id") in transcripts]
        if not videos_with_transcript:
            _update_report(report_id, dashboard_id, {"status": "failed", "error": "所选视频均无字幕"})
            return

        # 先对每个视频生成摘要，再传入报告模型，减少 token
        summaries = _batch_summarize_transcripts(videos_with_transcript, transcripts)
        materials = []
        for v in videos_with_transcript[:30]:
            vid = v.get("_video_id")
            summary = summaries.get(vid) or transcripts.get(vid, "")[:500]  # 无摘要则截断原文兜底
            materials.append(f"""
### [{v.get('Title', '')}]
- 日期: {v.get('Date', '')} | 等级: {v.get('Rank')} | 播放量: {v.get('Views')} | 分类: {v.get('Category', '')}
- URL: {v.get('URL', '')}

摘要：
{summary}
""")
        combined = "\n---\n".join(materials)
        custom = (req.get("custom_prompt") or "").strip()[:1000]
        user_instruction = f"\n\n用户额外要求：{custom}" if custom else ""
        prompt = f"""请基于以下 Palantir 频道视频的摘要与元信息，按照以下模版结构生成一份中文智能分析报告。
{user_instruction}

报告模版结构：
{REPORT_TEMPLATE}

---
以下是选中视频的摘要与元信息（供你分析）：
{combined[:30000]}

请直接输出完整报告，使用 Markdown 格式。"""

        report_text = call_deepseek([{"role": "user", "content": prompt}], max_tokens=8000)
        report_text = report_text.strip()
        titles = [v.get("Title", "") for v in videos_with_transcript[:20]]
        title = (req.get("nl_query") or "").strip()[:80] if mode == "nl" else "筛选条件报告"
        _update_report(report_id, dashboard_id, {
            "status": "completed",
            "report": report_text,
            "selected_count": len(selected_videos),
            "with_transcript_count": len(videos_with_transcript),
            "video_titles": titles,
            "title": title or "智能报告",
        })
    except Exception as e:
        _update_report(report_id, dashboard_id, {"status": "failed", "error": str(e)[:200]})


@app.post("/api/report/generate")
def generate_report(request: ReportGenerateRequest, background_tasks: BackgroundTasks):
    """智能报告生成：立即返回 id，后台异步生成。历史报告可查看状态。"""
    dashboard_id = request.dashboard_id or "palantirtech"
    master = load_master_index(dashboard_id)
    if not master:
        raise HTTPException(status_code=400, detail="无视频数据")

    # 快速校验
    if request.mode == "nl":
        if not (request.nl_query or request.nl_query.strip()):
            raise HTTPException(status_code=400, detail="请输入自然语言需求")
    elif request.mode == "filter":
        selected = _apply_filters(master, request.filters or {}, dashboard_id)
        if not selected:
            raise HTTPException(status_code=400, detail="筛选后无匹配视频，请放宽条件")
        video_ids = [v.get("_video_id") for v in selected if v.get("_video_id")]
        transcripts = _load_transcripts_for_videos(video_ids, dashboard_id)
        if not any(v.get("_video_id") in transcripts for v in selected):
            raise HTTPException(status_code=400, detail="所选视频均无字幕，无法生成报告")

    title = (request.nl_query or "").strip()[:80] if request.mode == "nl" else "筛选条件报告"
    payload = {
        "status": "pending",
        "title": title or "智能报告",
        "mode": request.mode,
        "dashboard_id": dashboard_id,
        "selected_count": 0,
    }
    report_id = _save_report(dashboard_id, payload)
    req = {
        "mode": request.mode,
        "filters": request.filters,
        "nl_query": request.nl_query,
        "custom_prompt": request.custom_prompt,
    }
    background_tasks.add_task(_do_generate_report, report_id, dashboard_id, req)
    saved = _get_report(report_id, dashboard_id)
    return {
        "id": report_id,
        "status": "pending",
        "title": payload["title"],
        "created_at": saved.get("created_at", ""),
    }


@app.get("/api/report/history")
def list_reports(dashboard_id: str = "palantirtech"):
    """报告历史列表"""
    return _list_reports(dashboard_id)


@app.get("/api/report/{report_id}")
def get_report(report_id: str, dashboard_id: str = "palantirtech"):
    """获取单个报告详情"""
    r = _get_report(report_id, dashboard_id)
    if not r:
        raise HTTPException(status_code=404, detail="报告不存在")
    return r


@app.delete("/api/report/{report_id}")
def delete_report(report_id: str, dashboard_id: str = "palantirtech"):
    """删除报告"""
    if not _delete_report(report_id, dashboard_id):
        raise HTTPException(status_code=404, detail="报告不存在")
    return {"ok": True}


@app.on_event("startup")
def startup():
    """启动时注册定时任务：每天 8:00 和 20:00 检查新视频"""
    import threading
    import time
    import datetime as dt

    def _loop():
        last_run = {}
        while True:
            try:
                now = dt.datetime.now()
                h, m = now.hour, now.minute
                key = f"{now.date()}_{h}"
                if h in (8, 20) and m < 30 and last_run.get(key) is None:
                    try:
                        r = _do_check_new_videos("palantirtech")
                        if r.get("new_count", 0) > 0:
                            print(f"[Scheduler] 发现 {r['new_count']} 个新视频，已加入消息中心")
                    except Exception as e:
                        print(f"[Scheduler] check_new_videos: {e}")
                    last_run[key] = True
            except Exception:
                pass
            time.sleep(900)  # 每 15 分钟检查一次

    t = threading.Thread(target=_loop, daemon=True)
    t.start()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
