"""
Palantir YouTube Video Analysis & Transcript Extraction System
Target: Strategic competitive analysis for NotebookLM
"""

import os
import sys
from dotenv import load_dotenv
load_dotenv()
import re
import json
import time
import logging
import requests
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Literal
from dataclasses import dataclass

import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound

# 配置日志
import os
# 检测运行环境
LOG_PATH = '/opt/vedioanalysis/transcript_extraction.log' if os.path.exists('/opt/vedioanalysis') else 'transcript_extraction.log'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class TranscriptResult:
    """字幕提取结果"""
    text: str
    source: Literal["bibigpt_api", "youtube_api", "yt_dlp", "whisper_api", "whisper_local"]
    language: str
    duration_ms: int
    success: bool = True
    error: Optional[str] = None

class TranscriptExtractionStats:
    """字幕提取统计"""
    def __init__(self):
        self.stats = {
            "bibigpt_api": {"success": 0, "failure": 0},
            "youtube_api": {"success": 0, "failure": 0},
            "yt_dlp": {"success": 0, "failure": 0},
            "whisper_api": {"success": 0, "failure": 0},
            "whisper_local": {"success": 0, "failure": 0},
        }

    def record(self, source: str, success: bool):
        if source in self.stats:
            if success:
                self.stats[source]["success"] += 1
            else:
                self.stats[source]["failure"] += 1

    def get_report(self) -> dict:
        total_success = sum(s["success"] for s in self.stats.values())
        total_failure = sum(s["failure"] for s in self.stats.values())
        total = total_success + total_failure

        return {
            **self.stats,
            "total": total,
            "success_rate": f"{total_success/total*100:.1f}%" if total > 0 else "N/A"
        }

# 全局统计实例
extraction_stats = TranscriptExtractionStats()


class VideoScorer:
    """
    视频综合价值评分系统
    Score = V_score × 0.4 + T_score × 0.3 + K_score × 0.3
    """

    # 核心业务关键词
    CORE_KEYWORDS = ['AIPCon', 'Foundrycon', 'Paragon', 'Pipeline', 'AIP', 'Foundry', 'Gotham', 'Apollo']
    # 次要关键词
    SECONDARY_KEYWORDS = ['Demo', 'Tutorial', 'Workshop', 'Case Study', 'Bootcamp', 'How to', 'Guide']

    @staticmethod
    def check_keywords(title: str, description: str) -> Tuple[bool, List[str]]:
        """
        检查是否包含关键词，返回 (是否匹配, 匹配的关键词列表)
        """
        text = (title + " " + description).lower()
        matched = []

        for keyword in VideoScorer.CORE_KEYWORDS + VideoScorer.SECONDARY_KEYWORDS:
            if keyword.lower() in text:
                matched.append(keyword)

        return len(matched) > 0, matched

    @staticmethod
    def get_view_score(view_count: int) -> float:
        """
        播放量得分 - 权重 40%
        使用区间映射避免长尾效应
        """
        if view_count >= 100000:
            return 100.0
        elif view_count >= 50000:
            return 80.0
        elif view_count >= 20000:
            return 60.0
        else:
            return 40.0

    @staticmethod
    def get_time_score(publish_date: str) -> float:
        """
        时效性得分 - 权重 30%
        越新分数越高
        """
        try:
            # ISO 8601 format: 2024-03-15T10:00:00Z
            date_obj = datetime.fromisoformat(publish_date.replace('Z', '+00:00'))
            year = date_obj.year
            month = date_obj.month

            if year >= 2025:
                return 100.0
            elif year == 2024:
                return 80.0 if month >= 7 else 60.0
            else:
                return 30.0
        except:
            return 40.0  # 默认分数

    @staticmethod
    def get_keyword_score(title: str, description: str) -> float:
        """
        核心业务相关度 - 权重 30%
        """
        text = (title + " " + description).lower()

        # 检查核心关键词
        for keyword in VideoScorer.CORE_KEYWORDS:
            if keyword.lower() in text:
                return 100.0

        # 检查次要关键词
        for keyword in VideoScorer.SECONDARY_KEYWORDS:
            if keyword.lower() in text:
                return 70.0

        return 40.0

    @classmethod
    def calculate_score(cls, video_data: Dict) -> float:
        """
        计算综合得分 (0-100)
        """
        v_score = cls.get_view_score(video_data.get('view_count', 0))
        t_score = cls.get_time_score(video_data.get('upload_date', ''))
        k_score = cls.get_keyword_score(
            video_data.get('title', ''),
            video_data.get('description', '')
        )

        total_score = (v_score * 0.4) + (t_score * 0.3) + (k_score * 0.3)

        return round(total_score, 2)


class RankAssigner:
    """等级判定系统"""

    @staticmethod
    def get_rank(score: float) -> str:
        """
        S级 (Strategic): Score >= 85
        A级 (Active): 70 <= Score < 85
        B级 (Basic): Score < 70
        """
        if score >= 85:
            return 'S'
        elif score >= 70:
            return 'A'
        else:
            return 'B'


class PalantirVideoAnalyzer:
    """
    Palantir YouTube 频道分析器
    使用 yt-dlp 获取元数据，youtube-transcript-api 获取字幕
    """

    PALANTIR_CHANNEL_ID = "UCfwP各自的tqhWG5jX9SP"  # 将在运行时替换

    def __init__(self, output_dir: str = "output", data_dir: Optional[str] = None, channel_id: str = "palantirtech"):
        """
        output_dir: 主输出目录（transcripts、video_index.csv 等）
        data_dir: 可选，前端数据目录。设为 "frontend/public/data" 时，会同步输出 master_index.csv、config.json、status.json 到 data_dir/channel_id/
        channel_id: 频道 ID，用于 data_dir 下的子目录名
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.data_dir = Path(data_dir) / channel_id if data_dir else None
        self.channel_id = channel_id
        if self.data_dir:
            self.data_dir.mkdir(parents=True, exist_ok=True)

        # 创建子目录
        self.transcripts_dir = self.output_dir / "transcripts"
        self.transcripts_dir.mkdir(exist_ok=True)

        # yt-dlp 配置
        self.ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }

    def fetch_channel_videos(self, channel_url: str, limit: Optional[int] = None) -> List[Dict]:
        """
        获取频道视频列表
        """
        print(f"📡 正在获取频道视频列表: {channel_url}")

        # 使用 /videos URL 格式以获取完整的视频列表
        if '/@' in channel_url or '/channel/' in channel_url or '/c/' in channel_url:
            # 如果是频道主页，添加 /videos
            if not channel_url.endswith('/videos'):
                channel_url = channel_url.rstrip('/') + '/videos'

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': 'in_playlist',  # 快速获取列表
            'playlistend': limit,  # 限制数量
        }

        videos = []

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                result = ydl.extract_info(channel_url, download=False)

                if 'entries' in result:
                    for entry in result['entries']:
                        if entry is None:
                            continue

                        video_id = entry.get('id')
                        if not video_id or not video_id.startswith(('video:', '')):
                            # 跳过非视频条目
                            if video_id and video_id.startswith('UC'):
                                continue

                        # 确保 video_id 是纯净的 ID
                        if video_id and video_id.startswith('video:'):
                            video_id = video_id.replace('video:', '')

                        if not video_id or len(video_id) != 11:
                            continue

                        videos.append({
                            'video_id': video_id,
                            'url': f"https://www.youtube.com/watch?v={video_id}",
                            'title': entry.get('title', 'Unknown'),
                            'duration': entry.get('duration'),
                        })

                        if limit and len(videos) >= limit:
                            break

        except Exception as e:
            print(f"❌ 获取频道视频失败: {e}")
            return []

        print(f"✅ 找到 {len(videos)} 个视频")
        return videos

    def fetch_video_details(self, video_url: str) -> Optional[Dict]:
        """
        获取单个视频的详细信息
        """
        ydl_opts = self.ydl_opts.copy()

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)

                return {
                    'video_id': info.get('id'),
                    'url': info.get('webpage_url'),
                    'title': info.get('title'),
                    'description': info.get('description', ''),
                    'view_count': info.get('view_count', 0),
                    'upload_date': info.get('upload_date', ''),  # YYYYMMDD
                    'duration': info.get('duration'),
                    'channel': info.get('channel'),
                    'thumbnail': info.get('thumbnail'),
                }
        except Exception as e:
            print(f"❌ 获取视频详情失败 {video_url}: {e}")
            return None

    def get_transcript(self, video_id: str, timeout_ms: int = 10000) -> Optional[str]:
        """
        获取视频字幕（智能 fallback 策略）

        Args:
            video_id: YouTube 视频 ID
            timeout_ms: 前几种方法的超时时间（毫秒）

        Returns:
            字幕文本，如果所有方法都失败则返回 None

        Fallback 策略（根据运行环境自动调整）：

        【本地环境 - 可访问 YouTube】
            1. YouTube Transcript API (10秒超时，免费)
            2. yt-dlp 下载字幕 (10秒超时，免费)
            3. BibiGPT API (10秒超时，需要 API token)
            4. Whisper 转录 (3-5分钟，本地 faster-whisper，免费)

        【云环境 - 无法访问 YouTube】
            1. BibiGPT API (10秒超时，需要 API token，无需访问 YouTube)
            2. Whisper 转录 (3-5分钟，本地 faster-whisper，免费)

        注意：YouTube API 和 yt-dlp 在云环境会被跳过（因为网络不可达）
        """
        start_time = time.time()
        logger.info(f"开始提取字幕: {video_id}")

        # 检测运行环境
        can_access_youtube = self._can_access_youtube()

        if can_access_youtube:
            # 本地环境：优先使用免费的 YouTube API/yt-dlp，不使用 BibiGPT
            logger.info(f"[本地环境] 使用策略: YouTube API → yt-dlp → OpenAI Whisper → 本地 Whisper")

            # 方法1: YouTube Transcript API（免费）
            result = self._try_youtube_transcript_api(video_id, timeout_ms)
            if result and result.success:
                logger.info(f"✓ YouTube API 成功: {video_id} (耗时: {result.duration_ms}ms)")
                extraction_stats.record("youtube_api", True)
                return result.text

            # 方法2: yt-dlp 下载字幕（免费）
            result = self._try_yt_dlp_subtitles(video_id, timeout_ms)
            if result and result.success:
                logger.info(f"✓ yt-dlp 成功: {video_id} (耗时: {result.duration_ms}ms)")
                extraction_stats.record("yt_dlp", True)
                return result.text

            # 方法3: OpenAI Whisper API（需要 OPENAI_API_KEY，不消耗 BibiGPT）
            logger.warning(f"前两种方法失败，尝试 OpenAI Whisper: {video_id}")
            result = self._try_whisper_transcription(video_id)
            if result and result.success:
                logger.info(f"✓ Whisper 成功: {video_id} (耗时: {result.duration_ms}ms)")
                extraction_stats.record(result.source, True)
                return result.text

        else:
            # 云环境：跳过 YouTube API/yt-dlp（网络不可达），直接使用 BibiGPT
            logger.info(f"[云环境] 使用策略: BibiGPT → Whisper（跳过 YouTube API/yt-dlp）")

            # 方法1: BibiGPT API（需要 token，无需访问 YouTube，使用更长超时）
            # 对于长视频（5分钟以上），BibiGPT处理可能需要1-3分钟
            result = self._try_bibigpt_api(video_id, 180000)  # 3分钟超时（原来是30秒）
            if result and result.success:
                logger.info(f"✓ BibiGPT API 成功: {video_id} (耗时: {result.duration_ms}ms)")
                extraction_stats.record("bibigpt_api", True)
                return result.text

        # 最后兜底：Whisper 转录（本地，免费，但耗时较长）
        logger.warning(f"前述方法失败，使用本地 Whisper: {video_id}")
        result = self._try_whisper_transcription(video_id)
        if result and result.success:
            logger.info(f"✓ Whisper 成功: {video_id} (耗时: {result.duration_ms}ms)")
            extraction_stats.record(result.source, True)
            return result.text

        # 所有方法都失败
        total_time = int((time.time() - start_time) * 1000)
        logger.error(f"✗ 所有方法都失败: {video_id} (总耗时: {total_time}ms)")
        extraction_stats.record("whisper_local", False)
        return None

    def _try_bibigpt_api(self, video_id: str, timeout_ms: int) -> Optional[TranscriptResult]:
        """
        方法0: 使用 BibiGPT API 获取字幕（修正版）
        使用 /api/v1/summarizeWithConfig 端点 + includeDetail 参数
        """
        start_time = time.time()
        api_token = os.getenv("BIBIGPT_API_TOKEN")

        if not api_token:
            logger.info("BibiGPT API token 未配置，跳过")
            return None

        try:
            url = "https://api.bibigpt.co/api/v1/summarizeWithConfig"
            youtube_url = f"https://www.youtube.com/watch?v={video_id}"

            # 尝试多种语言（优先中文，其次英文）
            languages = ["zh-CN", "en-US", "auto"]

            for lang in languages:
                try:
                    payload = {
                        "url": youtube_url,
                        "promptConfig": {
                            "outputLanguage": lang,
                            "isRefresh": True  # 强制刷新缓存
                        },
                        "includeDetail": True  # 关键：包含详细字幕数据
                    }

                    response = requests.post(
                        url,
                        json=payload,
                        headers={
                            "Authorization": f"Bearer {api_token}",
                            "Content-Type": "application/json"
                        },
                        timeout=timeout_ms / 1000
                    )

                    if response.status_code == 200:
                        data = response.json()

                        # 检查返回的数据结构
                        if "detail" in data:
                            detail = data["detail"]

                            # 从 subtitlesArray 提取字幕（BibiGPT 返回的字幕格式）
                            if "subtitlesArray" in detail:
                                subtitles = detail["subtitlesArray"]

                                if isinstance(subtitles, list) and len(subtitles) > 0:
                                    # 合并所有字幕片段
                                    subtitle_text = "\n".join([
                                        seg.get("text", "")
                                        for seg in subtitles
                                        if seg.get("text", "").strip()
                                    ])

                                    if subtitle_text.strip() and len(subtitle_text) > 10:  # 降低长度限制
                                        duration_ms = int((time.time() - start_time) * 1000)
                                        logger.info(f"BibiGPT 返回 {len(subtitles)} 个字幕片段，文本长度: {len(subtitle_text)}")
                                        return TranscriptResult(
                                            text=subtitle_text.strip(),
                                            source="bibigpt_api",
                                            language=lang,
                                            duration_ms=duration_ms
                                        )
                                    else:
                                        logger.warning(f"BibiGPT 返回字幕文本过短: {len(subtitle_text)} 字符")
                            else:
                                logger.warning(f"BibiGPT 响应中缺少 subtitlesArray 字段。detail keys: {list(detail.keys())[:10]}")
                        else:
                            logger.warning(f"BibiGPT 响应中缺少 detail 字段。data keys: {list(data.keys())}")

                except requests.exceptions.Timeout:
                    logger.warning(f"BibiGPT API 超时 (lang={lang}): {video_id}")
                    continue
                except Exception as e:
                    logger.warning(f"BibiGPT API 失败 (lang={lang}): {video_id} - {str(e)}")
                    continue

            extraction_stats.record("bibigpt_api", False)
            return None

        except Exception as e:
            logger.warning(f"BibiGPT API 异常: {video_id} - {str(e)}")
            extraction_stats.record("bibigpt_api", False)
            return None

    def _clean_bibigpt_subtitle(self, subtitle_data: str) -> str:
        """清理 BibiGPT 返回的字幕数据"""
        if isinstance(subtitle_data, str):
            # 如果是纯文本，直接返回
            return subtitle_data.strip()
        elif isinstance(subtitle_data, dict):
            # 如果是字典，提取文本内容
            if "text" in subtitle_data:
                return subtitle_data["text"].strip()
            elif "segments" in subtitle_data:
                # 合并分段字幕
                return "\n".join([seg.get("text", "") for seg in subtitle_data["segments"]])
        elif isinstance(subtitle_data, list):
            # 如果是列表，合并文本
            return "\n".join([item.get("text", str(item)) for item in subtitle_data])

        return str(subtitle_data).strip()

    def _try_youtube_transcript_api(self, video_id: str, timeout_ms: int) -> Optional[TranscriptResult]:
        """方法1: 使用 YouTube Transcript API"""
        start_time = time.time()
        try:
            import signal

            def timeout_handler(signum, frame):
                raise TimeoutError("YouTube API 超时")

            # 设置超时
            signal.signal(signal.SIGALRM, timeout_handler)
            signal.setitimer(signal.ITIMER_REAL, timeout_ms / 1000)

            try:
                api = YouTubeTranscriptApi()
                transcript_list = api.list(video_id)

                # 语言优先级
                languages = ['zh-Hans', 'zh', 'en', 'en-US', 'en-GB']

                for lang in languages:
                    try:
                        transcript = transcript_list.find_transcript([lang])
                        text = self._format_transcript(transcript.fetch())
                        duration_ms = int((time.time() - start_time) * 1000)
                        return TranscriptResult(
                            text=text,
                            source="youtube_api",
                            language=lang,
                            duration_ms=duration_ms
                        )
                    except NoTranscriptFound:
                        try:
                            transcript = transcript_list.find_generated_transcript([lang])
                            text = self._format_transcript(transcript.fetch())
                            duration_ms = int((time.time() - start_time) * 1000)
                            return TranscriptResult(
                                text=text,
                                source="youtube_api",
                                language=lang,
                                duration_ms=duration_ms
                            )
                        except:
                            continue

                # 尝试任何可用字幕
                for transcript_obj in transcript_list:
                    text = self._format_transcript(transcript_obj.fetch())
                    duration_ms = int((time.time() - start_time) * 1000)
                    return TranscriptResult(
                        text=text,
                        source="youtube_api",
                        language="unknown",
                        duration_ms=duration_ms
                    )

            except TimeoutError:
                logger.warning(f"YouTube API 超时: {video_id}")
                extraction_stats.record("youtube_api", False)
                return None
            finally:
                signal.alarm(0)  # 取消超时

        except TranscriptsDisabled:
            logger.info(f"字幕被禁用: {video_id}")
            extraction_stats.record("youtube_api", False)
            return None
        except Exception as e:
            logger.warning(f"YouTube API 失败: {video_id} - {str(e)}")
            extraction_stats.record("youtube_api", False)
            return None

    def _try_yt_dlp_subtitles(self, video_id: str, timeout_ms: int) -> Optional[TranscriptResult]:
        """方法2: 使用 yt-dlp 下载字幕"""
        start_time = time.time()
        temp_dir = self.output_dir / '.temp_subs'
        temp_dir.mkdir(exist_ok=True)

        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'writesubtitles': True,
                'writeautomaticsub': True,
                'subtitleslangs': ['zh-Hans', 'zh', 'en', 'en-US', 'en-GB'],
                'skip_download': True,
                'subtitlesformat': 'vtt',
                'outtmpl': f'{temp_dir}/%(id)s.%(ext)s',
            }

            # 使用 subprocess 添加超时控制
            import subprocess
            cmd = [
                sys.executable, '-m', 'yt_dlp',
                '--write-sub', '--write-auto-sub',
                '--sub-langs', 'zh-Hans,zh,en,en-US,en-GB',
                '--skip-download',
                '--sub-format', 'vtt',
                '-o', f'{temp_dir}/%(id)s.%(ext)s',
                f'https://www.youtube.com/watch?v={video_id}'
            ]

            try:
                result = subprocess.run(
                    cmd,
                    timeout=timeout_ms / 1000,
                    capture_output=True,
                    text=True
                )
            except subprocess.TimeoutExpired:
                logger.warning(f"yt-dlp 超时: {video_id}")
                extraction_stats.record("yt_dlp", False)
                return None

            # 查找下载的字幕文件
            for lang in ['zh-Hans', 'zh', 'en', 'en-US', 'en-GB']:
                for ext in ['.vtt', '.en.vtt', '.zh.vtt']:
                    sub_file = temp_dir / f'{video_id}.{ext}'
                    if sub_file.exists():
                        text = self._parse_vtt(sub_file)
                        if text:
                            # 清理临时文件
                            sub_file.unlink(missing_ok=True)
                            duration_ms = int((time.time() - start_time) * 1000)
                            return TranscriptResult(
                                text=text,
                                source="yt_dlp",
                                language=lang,
                                duration_ms=duration_ms
                            )

            # 尝试任何 .vtt 文件
            for vtt_file in temp_dir.glob(f'{video_id}*.vtt'):
                text = self._parse_vtt(vtt_file)
                if text:
                    vtt_file.unlink(missing_ok=True)
                    duration_ms = int((time.time() - start_time) * 1000)
                    return TranscriptResult(
                        text=text,
                        source="yt_dlp",
                        language="unknown",
                        duration_ms=duration_ms
                    )

            extraction_stats.record("yt_dlp", False)
            return None

        except Exception as e:
            logger.warning(f"yt-dlp 失败: {video_id} - {str(e)}")
            extraction_stats.record("yt_dlp", False)
            return None

    def _try_whisper_transcription(self, video_id: str) -> Optional[TranscriptResult]:
        """方法3: 使用 Whisper 转录"""
        start_time = time.time()
        transcript = self._transcribe_with_whisper(video_id)

        if transcript:
            duration_ms = int((time.time() - start_time) * 1000)
            # 判断使用的是 API 还是本地
            api_key = os.getenv("OPENAI_API_KEY")
            source = "whisper_api" if api_key else "whisper_local"

            return TranscriptResult(
                text=transcript,
                source=source,
                language="en",  # Whisper 默认英文
                duration_ms=duration_ms
            )

        extraction_stats.record("whisper_local", False)
        return None

    def get_extraction_stats(self) -> dict:
        """获取字幕提取统计报告"""
        return extraction_stats.get_report()

    def _transcribe_with_whisper(self, video_id: str) -> Optional[str]:
        """
        转录无字幕视频。优先使用 OpenAI Whisper API（需 OPENAI_API_KEY），
        否则使用本地 faster-whisper（需 ffmpeg，pip install faster-whisper）。
        """
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            return self._transcribe_whisper_api(video_id, api_key)
        return self._transcribe_whisper_local(video_id)

    def _transcribe_whisper_api(self, video_id: str, api_key: str) -> Optional[str]:
        """使用 OpenAI Whisper API 转录"""
        temp_audio_dir = self.output_dir / ".temp_audio"
        temp_audio_dir.mkdir(exist_ok=True)
        base_path = temp_audio_dir / video_id
        try:
            import shutil
            has_ffmpeg = bool(shutil.which("ffmpeg"))
            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio[ext=mp3]/bestaudio",
            }
            if has_ffmpeg:
                ydl_opts["postprocessors"] = [{"key": "FFmpegExtractAudio", "preferredcodec": "m4a"}]
                ydl_opts["outtmpl"] = str(base_path)
            else:
                ydl_opts["outtmpl"] = str(base_path) + ".%(ext)s"

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

            audio_path = None
            for ext in (".m4a", ".webm", ".mp3", ".mp4", ".mpeg", ".mpga", ".wav"):
                p = base_path.with_suffix(ext)
                if p.exists():
                    audio_path = p
                    break
            if not audio_path:
                for f in temp_audio_dir.glob(f"{video_id}.*"):
                    if f.suffix.lower() in (".m4a", ".webm", ".mp3", ".mp4", ".mpeg", ".mpga", ".wav"):
                        audio_path = f
                        break
            if not audio_path or not audio_path.exists():
                return None

            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            with open(audio_path, "rb") as f:
                resp = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                    language="en",
                )
            text = (resp.text or "").strip()
            audio_path.unlink(missing_ok=True)
            return text if text else None
        except Exception as e:
            err_msg = str(e).lower()
            if "invalid_api_key" in err_msg or "authentication" in err_msg:
                print(f"   ⚠️ OPENAI_API_KEY 无效，请检查 .env 配置")
            else:
                print(f"   ⚠️ Whisper API 转录失败: {e}")
            return None

    _whisper_model_cache = None
    _can_access_youtube_cache = None

    def _can_access_youtube(self, timeout_ms: int = 5000) -> bool:
        """
        检测当前环境是否能访问 YouTube
        本地环境：可以访问 → 使用 YouTube API/yt-dlp/OpenAI Whisper
        云环境：无法访问 → 使用 BibiGPT/Whisper
        """
        if PalantirVideoAnalyzer._can_access_youtube_cache is not None:
            return PalantirVideoAnalyzer._can_access_youtube_cache

        try:
            import socket
            import urllib.request
            import ssl

            # 方法1: 尝试 HTTP 请求（忽略 SSL 证书验证）
            try:
                ssl_context = ssl._create_unverified_context()
                response = urllib.request.urlopen('https://www.youtube.com', timeout=timeout_ms/1000, context=ssl_context)
                if response.status == 200:
                    PalantirVideoAnalyzer._can_access_youtube_cache = True
                    logger.info("✓ 检测到可以访问 YouTube（本地环境），优先使用 YouTube API/yt-dlp")
                    return True
            except:
                pass

            # 方法2: socket 连接（备用）
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout_ms / 1000)
            result = sock.connect_ex(("www.youtube.com", 443))
            sock.close()

            # 某些环境下 socket 返回非0但实际可访问
            # 如果 socket 失败，假设无法访问
            can_access = (result == 0)
            PalantirVideoAnalyzer._can_access_youtube_cache = can_access

            if can_access:
                logger.info("✓ 检测到可以访问 YouTube（本地环境），优先使用 YouTube API/yt-dlp")
            else:
                logger.info("✗ 检测到无法访问 YouTube（云环境），使用 BibiGPT → Whisper")

            return can_access
        except Exception as e:
            logger.warning(f"网络检测失败: {e}，假设无法访问 YouTube")
            PalantirVideoAnalyzer._can_access_youtube_cache = False
            return False

    def _transcribe_whisper_local(self, video_id: str) -> Optional[str]:
        """使用本地 faster-whisper 转录（需 ffmpeg 用于音频提取）"""
        import shutil
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            print("   ⚠️ 请安装: pip install faster-whisper")
            return None

        has_ffmpeg = bool(shutil.which("ffmpeg"))
        temp_audio_dir = self.output_dir / ".temp_audio"
        temp_audio_dir.mkdir(exist_ok=True)
        base_path = temp_audio_dir / video_id
        try:
            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio[ext=mp3]/bestaudio",
            }
            if has_ffmpeg:
                ydl_opts["postprocessors"] = [{"key": "FFmpegExtractAudio", "preferredcodec": "m4a"}]
                ydl_opts["outtmpl"] = str(base_path)
            else:
                ydl_opts["outtmpl"] = str(base_path) + ".%(ext)s"
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

            audio_path = None
            for ext in (".m4a", ".webm", ".mp3", ".mp4", ".opus"):
                p = base_path.with_suffix(ext)
                if p.exists():
                    audio_path = p
                    break
            if not audio_path:
                for f in temp_audio_dir.glob(f"{video_id}.*"):
                    if f.suffix.lower() in (".m4a", ".mp3", ".webm", ".opus", ".mp4"):
                        audio_path = f
                        break

            if not audio_path or not audio_path.exists():
                return None

            if PalantirVideoAnalyzer._whisper_model_cache is None:
                # 使用 CPU 模式（faster-whisper 默认）
                PalantirVideoAnalyzer._whisper_model_cache = WhisperModel("base", device="cpu", compute_type="int8")
            model = PalantirVideoAnalyzer._whisper_model_cache

            segments, info = model.transcribe(str(audio_path), language="en", beam_size=5)
            text = "".join([seg.text for seg in segments]).strip()
            audio_path.unlink(missing_ok=True)
            return text if text else None
        except Exception as e:
            if "ffmpeg" in str(e).lower() or "ffprobe" in str(e).lower():
                print(f"   ⚠️ 需要 ffmpeg")
            else:
                print(f"   ⚠️ 本地 Whisper 转录失败: {e}")
            return None

    def _parse_vtt(self, vtt_file: Path) -> Optional[str]:
        """
        解析 VTT 字幕文件为纯文本
        """
        try:
            import webvtt
            captions = webvtt.read(str(vtt_file))
            full_text = []
            for caption in captions:
                text = caption.text.strip()
                # 移除 VTT 标签
                text = re.sub(r'<[^>]+>', '', text)
                if text:
                    full_text.append(text)

            return ' '.join(full_text)
        except ImportError:
            # 如果没有 webvtt 库，使用简单解析
            with open(vtt_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()

            full_text = []
            for line in lines:
                line = line.strip()
                # 跳过 VTT 头部、时间戳和空行
                if (line.startswith('WEBVTT') or
                    '-->' in line or
                    line.startswith('NOTE') or
                    not line):
                    continue

                # 移除 HTML 标签
                line = re.sub(r'<[^>]+>', '', line)
                if line:
                    full_text.append(line)

            return ' '.join(full_text)
        except Exception:
            return None

    def _format_transcript(self, transcript_data) -> str:
        """
        格式化字幕为连续文本
        支持 dict 和 FetchedTranscriptSnippet 对象
        """
        full_text = []
        for entry in transcript_data:
            # 兼容两种格式：dict 和对象
            if isinstance(entry, dict):
                text = entry.get('text', '').strip()
            else:
                # FetchedTranscriptSnippet 对象
                text = str(entry.text).strip()

            if text:
                full_text.append(text)

        return ' '.join(full_text)

    def sanitize_filename(self, filename: str) -> str:
        """
        清理文件名，移除非法字符
        """
        # 移除或替换非法字符
        filename = re.sub(r'[<>:"/\\|?*]', '', filename)
        # 限制长度
        if len(filename) > 200:
            filename = filename[:200]

        return filename.strip()

    def save_transcript(self, video_data: Dict, transcript: Optional[str], rank: str, score: float, has_transcript: bool = True, category: str = "", source: str = ""):
        """
        保存字幕为独立文本文件
        文件名格式: [等级]_[日期]_[标题].txt
        如果没有字幕，仍然保存元数据并标记 NO TRANSCRIPT AVAILABLE
        重要：若目标文件已存在且含实际字幕（如 Whisper 转换结果），则不覆盖，避免后续流程破坏已有数据
        """
        # 解析日期
        upload_date = video_data.get('upload_date', '')
        try:
            if upload_date:
                date_obj = datetime.strptime(upload_date, '%Y%m%d')
                formatted_date = date_obj.strftime('%Y-%m-%d')
            else:
                formatted_date = 'Unknown'
        except:
            formatted_date = 'Unknown'

        # 构建文件名
        title = self.sanitize_filename(video_data.get('title', 'Unknown'))
        filename = f"[{rank}]_{formatted_date}_{title}.txt"
        filepath = self.transcripts_dir / filename

        # 若目标文件已存在且含实际字幕（如 Whisper 结果），不覆盖，避免后续流程破坏
        if not has_transcript and filepath.exists():
            try:
                existing = filepath.read_text(encoding='utf-8')
                if 'NO TRANSCRIPT AVAILABLE' not in existing:
                    print(f"  跳过覆盖（保留已有字幕）: {filename}")
                    return
            except Exception:
                pass

        # 构建元数据头
        transcript_status = "Available" if has_transcript else "NOT AVAILABLE"
        metadata_header = f"""{'=' * 80}
METADATA
{'=' * 80}
Title: {video_data.get('title')}
URL: {video_data.get('url')}
Published: {formatted_date}
View Count: {(video_data.get('view_count') or 0):,}
Duration: {video_data.get('duration') or 0} seconds
Score: {score}/100
Rank: {rank} ({self._get_rank_description(rank)})
Transcript: {transcript_status}
Category: {category or ''}
Source: {source or 'youtube'}

{'=' * 80}
TRANSCRIPT
{'=' * 80}

"""

        # 写入文件
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(metadata_header)
            if transcript:
                f.write(transcript)
            else:
                f.write("NO TRANSCRIPT AVAILABLE\n\n")
                f.write("This video does not have captions or subtitles available on YouTube.\n")
                f.write("To obtain the transcript, you would need to:\n")
                f.write("1. Use a speech-to-text service (e.g., OpenAI Whisper) on the downloaded audio\n")
                f.write("2. Manually transcribe the content\n")
                f.write(f"\nVideo URL: {video_data.get('url')}\n")

        status_icon = "💾" if has_transcript else "📋"
        print(f"{status_icon} 已保存: {filename} ({'有字幕' if has_transcript else '无字幕'})")

    def _get_rank_description(self, rank: str) -> str:
        """获取等级描述"""
        descriptions = {
            'S': 'Strategic - 战略级研究对象',
            'A': 'Active - 高参考价值',
            'B': 'Basic - 基础背景资料'
        }
        return descriptions.get(rank, 'Unknown')

    def filter_channel(self, channel_url: str, limit: Optional[int] = None) -> List[Dict]:
        """
        阶段 1：先筛选出符合三类条件的视频，不获取字幕
        输出: filtered_candidates.json, filtered_candidates.csv
        返回: 符合条件的视频列表
        """
        print("\n" + "=" * 80)
        print("📋 阶段 1：筛选符合条件的数据")
        print("=" * 80 + "\n")
        print("筛选条件（符合任一即保留）:")
        print("   1️⃣  播放量 >= 20,000")
        print("   2️⃣  发布日期 >= 2024年1月")
        print("   3️⃣  包含关键词 (AIPCon, Paragon, Demo, Tutorial等)")
        print()

        videos = self.fetch_channel_videos(channel_url, limit)
        if not videos:
            print("❌ 未找到任何视频")
            return []

        candidates: List[Dict] = []
        cat_20k = set()   # video_id 集合，用于去重统计
        cat_2024 = set()
        cat_keywords_set = set()

        self._write_status(0, len(videos), "filtering", phase="filter")

        for idx, video in enumerate(videos, 1):
            video_id = video['video_id']
            print(f"[{idx}/{len(videos)}] 检查: {video['title'][:50]}...")
            self._write_status(idx, len(videos), "filtering", phase="filter")

            details = self.fetch_video_details(video['url'])
            if not details:
                continue

            view_count = details.get('view_count', 0)
            upload_date = details.get('upload_date', '')
            title = details.get('title', '')
            description = details.get('description', '')

            meets_20k = view_count >= 20000
            meets_2024 = False
            if upload_date and len(upload_date) >= 6:
                try:
                    meets_2024 = int(upload_date[:6]) >= 202401
                except ValueError:
                    pass
            has_kw, matched = VideoScorer.check_keywords(title, description)
            meets_keywords = has_kw

            if meets_20k:
                cat_20k.add(video_id)
            if meets_2024:
                cat_2024.add(video_id)
            if meets_keywords:
                cat_keywords_set.add(video_id)

            if meets_20k or meets_2024 or meets_keywords:
                score = VideoScorer.calculate_score(details)
                rank = RankAssigner.get_rank(score)
                candidates.append({
                    **details,
                    'score': score,
                    'rank': rank,
                    'matched_criteria': {
                        '20k_views': meets_20k,
                        'since_2024': meets_2024,
                        'keywords': meets_keywords,
                        'keywords_list': matched,
                    }
                })
                print(f"   ✓ 符合条件 [{'20K' if meets_20k else ''}{'2024' if meets_2024 else ''}{'关键词' if meets_keywords else ''}]")

        # 保存筛选结果
        filter_file = self.output_dir / "filtered_candidates.json"
        with open(filter_file, 'w', encoding='utf-8') as f:
            json.dump(candidates, f, ensure_ascii=False, indent=2)
        print(f"\n💾 已保存筛选结果: {filter_file}")

        # CSV
        import csv
        csv_file = self.output_dir / "filtered_candidates.csv"
        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            w.writerow(['Rank', 'Score', 'Title', 'Date', 'Views', '20K+', '2024+', 'Keywords', 'URL'])
            for c in candidates:
                w.writerow([
                    c['rank'],
                    c['score'],
                    c.get('title', '')[:80],
                    c.get('upload_date', ''),
                    c.get('view_count', 0),
                    '✓' if c['matched_criteria']['20k_views'] else '',
                    '✓' if c['matched_criteria']['since_2024'] else '',
                    ','.join(c['matched_criteria']['keywords_list'][:3]) if c['matched_criteria']['keywords_list'] else '',
                    c.get('url', ''),
                ])
        print(f"💾 已保存 CSV: {csv_file}")

        # 统计报告
        print("\n" + "=" * 80)
        print("📊 筛选完成 - 三类数据统计")
        print("=" * 80)
        print(f"\n频道总视频数: {len(videos)}")
        print(f"\n三类分别符合的数量（可重复）:")
        print(f"  📺 播放量 20K+: {len(cat_20k)}")
        print(f"  📅 2024年1月+: {len(cat_2024)}")
        print(f"  🔑 关键词匹配: {len(cat_keywords_set)}")
        print(f"\n去重后需处理的视频总数: {len(candidates)}")
        print(f"\n下一步: 运行 process_filtered_candidates() 获取字幕")
        print("=" * 80 + "\n")

        self._write_status(len(videos), len(videos), "idle", phase="filter")

        # 保存三类数量到 filter_summary.json 供前端展示
        summary = {
            "channel_total": len(videos),
            "cat_20k_views": len(cat_20k),
            "cat_2024_01": len(cat_2024),
            "cat_keywords": len(cat_keywords_set),
            "filtered_total": len(candidates),
            "updated_at": datetime.now().isoformat() + "Z",
        }
        self._write_filter_summary(summary)

        return candidates

    def process_filtered_candidates(self, limit: Optional[int] = None):
        """
        阶段 2：仅对已筛选出的视频获取字幕并保存
        从 filtered_candidates.json 读取，不重新请求频道
        """
        filter_file = self.output_dir / "filtered_candidates.json"
        if not filter_file.exists():
            print("❌ 未找到 filtered_candidates.json，请先运行 filter_channel()")
            return

        with open(filter_file, 'r', encoding='utf-8') as f:
            candidates = json.load(f)

        to_process = candidates[:limit] if limit else candidates
        total = len(to_process)
        print(f"\n📝 阶段 2：处理 {total} 个已筛选视频（获取字幕）\n")

        stats = {'S': 0, 'A': 0, 'B': 0, 'with_transcript': 0, 'without_transcript': 0, 'failed': 0}
        failed_list: List[Dict] = []

        self._write_status(0, total, "processing", failed_count=0)

        for idx, details in enumerate(to_process, 1):
            video_id = details.get('video_id')
            title = details.get('title', 'Unknown')
            print(f"[{idx}/{total}] {title[:50]}...")

            self._write_status(idx, total, "processing", failed_count=len(failed_list))

            try:
                transcript = self.get_transcript(video_id)
                has_transcript = transcript is not None
                rank = details.get('rank', 'B')
                score = details.get('score', 0)

                self.save_transcript(details, transcript, rank, score, has_transcript)

                stats[rank] += 1
                if has_transcript:
                    stats['with_transcript'] += 1
                else:
                    stats['without_transcript'] += 1
            except Exception as e:
                stats['failed'] += 1
                failed_list.append({
                    **details,
                    'error': str(e),
                    'rank': details.get('rank', 'B'),
                    'score': details.get('score', 0),
                })
                print(f"   ❌ 失败: {e}")

        self._write_status(total, total, "idle", failed_count=stats['failed'])
        self._write_failed_videos(failed_list)
        self._write_frontend_output(stats)

        print("\n" + "=" * 80)
        print("📊 字幕处理完成")
        print("=" * 80)
        print(f"  已处理: {total} | 有字幕: {stats['with_transcript']} | 无字幕: {stats['without_transcript']} | 失败: {stats['failed']}")
        if failed_list:
            print(f"\n  失败项已保存，重新处理请运行: python palantir_analyzer.py --retry-failed")
        print("=" * 80 + "\n")

    def _write_filter_summary(self, summary: Dict):
        """写入 filter_summary.json 供前端展示三类数量"""
        paths = [self.output_dir / "filter_summary.json"]
        if self.data_dir:
            paths.append(self.data_dir / "filter_summary.json")
        for path in paths:
            try:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(summary, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"⚠️  写入 filter_summary.json 失败: {e}")

    def _update_filter_summary_cat_others(self):
        """从 master_index 统计 cat_others 并更新 filter_summary"""
        import csv
        path = self.data_dir / "master_index.csv" if self.data_dir else None
        if not path or not path.exists():
            return
        others_count = 0
        try:
            with open(path, encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if (row.get("Category") or row.get("category") or "").strip() == "其他":
                        others_count += 1
        except Exception:
            return
        summary_path = self.data_dir / "filter_summary.json"
        if not summary_path.exists():
            return
        try:
            with open(summary_path, encoding="utf-8") as f:
                summary = json.load(f)
        except Exception:
            return
        summary["cat_others"] = others_count
        summary["updated_at"] = datetime.now().isoformat() + "Z"
        self._write_filter_summary(summary)

    def _write_failed_videos(self, failed_list: List[Dict]):
        """保存失败视频列表"""
        failed_file = self.output_dir / "failed_videos.json"
        try:
            with open(failed_file, "w", encoding="utf-8") as f:
                json.dump(failed_list, f, ensure_ascii=False, indent=2)
            if failed_list:
                print(f"💾 失败项已保存: {failed_file}")
        except Exception as e:
            print(f"⚠️  写入 failed_videos.json 失败: {e}")
        if self.data_dir:
            dst = self.data_dir / "failed_videos.json"
            try:
                with open(dst, "w", encoding="utf-8") as f:
                    json.dump(failed_list, f, ensure_ascii=False, indent=2)
            except Exception:
                pass

    def _write_status(self, current: int, total: int, status: str, phase: str = "process", failed_count: int = 0):
        """写入 status.json 供前端进度条读取，完成时追加到 status_history"""
        if not self.data_dir:
            return
        path = self.data_dir / "status.json"
        data = {
            "current": current,
            "total": total,
            "status": status,
            "phase": phase,
            "failed_count": failed_count,
            "channel": self.channel_id,
            "updatedAt": datetime.now().isoformat() + "Z",
        }
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            if status == "idle" and total > 0:
                hist_path = self.data_dir / "status_history.json"
                hist = []
                if hist_path.exists():
                    with open(hist_path, encoding="utf-8") as f:
                        hist = json.load(f)
                phase_label = "筛选" if phase == "filter" else ("Whisper转换" if phase == "whisper" else "处理")
                hist.append({
                    **data,
                    "completedAt": datetime.now().isoformat() + "Z",
                    "phase_label": phase_label,
                })
                if len(hist) > 100:
                    hist = hist[-100:]
                with open(hist_path, "w", encoding="utf-8") as f:
                    json.dump(hist, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"⚠️  写入 status.json 失败: {e}")

    def _write_config_json(self):
        """写入 config.json 供前端配置面板读取"""
        if not self.data_dir:
            return
        path = self.data_dir / "config.json"
        data = {
            "keywords": {k: 5 for k in VideoScorer.CORE_KEYWORDS}
            | {k: 2 for k in VideoScorer.SECONDARY_KEYWORDS},
            "thresholds": {"S": 85, "A": 70, "B": 0},
            "weights": {"view": 0.4, "time": 0.3, "keyword": 0.3},
        }
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"⚠️  写入 config.json 失败: {e}")

    def _write_frontend_output(self, stats: Dict):
        """生成前端所需的 master_index.csv、config.json、transcript_index.json，并同步 transcripts"""
        if not self.data_dir:
            return
        self._write_config_json()
        self._generate_master_index_csv()
        self._generate_transcript_index()
        # 同步 transcripts 到 data_dir 供前端访问
        dst = self.data_dir / "transcripts"
        dst.mkdir(exist_ok=True)
        import shutil
        for f in self.transcripts_dir.glob("*.txt"):
            try:
                shutil.copy2(f, dst / f.name)
            except Exception as e:
                print(f"⚠️  复制 {f.name} 失败: {e}")

    def _generate_master_index_csv(self):
        """生成 master_index.csv（含 Transcript 列）供前端读取"""
        import csv

        path = self.data_dir / "master_index.csv"
        rows = []

        for txt_file in self.transcripts_dir.glob("*.txt"):
            try:
                with open(txt_file, "r", encoding="utf-8") as f:
                    lines = f.readlines()[:25]
                rank, score, title, date, views, url, transcript, category, transcript_source = "Unknown", 0, "Unknown", "Unknown", 0, "", "无", "", "youtube"
                for line in lines:
                    line = line.strip()
                    if line.startswith("Rank:"):
                        rank = line.split(":")[1].strip()[0]
                    elif line.startswith("Score:"):
                        score = line.split(":")[1].strip().replace("/100", "").strip()
                    elif line.startswith("Title:"):
                        title = line.split(":", 1)[1].strip()
                    elif line.startswith("Published:"):
                        date = line.split(":", 1)[1].strip()
                    elif line.startswith("View Count:"):
                        views = line.split(":")[1].strip().replace(",", "")
                    elif line.startswith("URL:"):
                        url = line.split(":", 1)[1].strip()
                    elif "Transcript:" in line:
                        transcript = "有" if "Available" in line else "无"
                    elif line.startswith("Category:"):
                        category = line.split(":", 1)[1].strip()
                    elif line.startswith("Source:"):
                        transcript_source = line.split(":", 1)[1].strip().lower()
                rows.append([rank, score, title, date, views, transcript, category, url, transcript_source])
            except Exception as e:
                print(f"⚠️  解析 {txt_file} 失败: {e}")

        try:
            with open(path, "w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                w.writerow(["Rank", "Score", "Title", "Date", "Views", "Transcript", "Category", "URL", "TranscriptSource"])
                w.writerows(rows)
            print(f"📊 已生成前端索引: {path}")
        except Exception as e:
            print(f"⚠️  写入 master_index.csv 失败: {e}")

    def _generate_transcript_index(self):
        """生成 transcript_index.json: video_id -> filename，供 API 按 video_id 查找。
        同一视频若有多个 transcript 文件（如先无字幕占位、后 Whisper 转换），优先选用有实际内容的文件。"""
        import re
        path = self.data_dir / "transcript_index.json"
        index = {}  # video_id -> (filename, has_content)
        for txt_file in sorted(self.transcripts_dir.glob("*.txt")):
            try:
                with open(txt_file, "r", encoding="utf-8") as f:
                    raw = f.read()
                for line in raw.split("\n"):
                    if line.strip().startswith("URL:"):
                        url = line.split(":", 1)[1].strip()
                        m = re.search(r"[?&]v=([a-zA-Z0-9_-]{11})", url)
                        if m:
                            vid = m.group(1)
                            has_content = "NO TRANSCRIPT AVAILABLE" not in raw
                            if vid not in index or (has_content and not index[vid][1]):
                                index[vid] = (txt_file.name, has_content)
                        break
            except Exception:
                pass
        out = {vid: fn for vid, (fn, _) in index.items()}
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"⚠️  写入 transcript_index.json 失败: {e}")

    def _sync_transcripts_to_data_dir(self):
        """同步 transcripts 到 data_dir 并更新 master_index、transcript_index（供 Whisper 增量同步）"""
        if not self.data_dir:
            return
        import shutil
        dst = self.data_dir / "transcripts"
        dst.mkdir(exist_ok=True)
        for f in self.transcripts_dir.glob("*.txt"):
            try:
                shutil.copy2(f, dst / f.name)
            except Exception:
                pass
        self._generate_master_index_csv()
        self._generate_transcript_index()

    def analyze_channel(self, channel_url: str, limit: Optional[int] = None):
        """
        完整分析流程
        符合以下任一条件的视频将被保存：
        1. 播放量 >= 20,000
        2. 发布日期 >= 2024年1月
        3. 包含关键词
        """
        print("\n" + "=" * 80)
        print("🚀 Palantir YouTube 频道分析系统启动")
        print("=" * 80 + "\n")
        print("📋 筛选条件（符合任一即保存）:")
        print("   1️⃣  播放量 >= 20,000")
        print("   2️⃣  发布日期 >= 2024年1月")
        print("   3️⃣  包含关键词 (AIPCon, Paragon, Demo, Tutorial等)")
        print()

        # 1. 获取视频列表
        videos = self.fetch_channel_videos(channel_url, limit)
        if not videos:
            print("❌ 未找到任何视频")
            return

        # 统计信息
        stats = {
            'S': 0,
            'A': 0,
            'B': 0,
            'with_transcript': 0,
            'without_transcript': 0,
            'total_processed': 0,
            'saved': 0,
            'skipped': 0,
            # 分类统计
            'cat_20k_views': 0,      # 播放量20K+
            'cat_2024_01': 0,         # 2024年1月+
            'cat_keywords': 0,          # 关键词匹配
        }

        # 2. 遍历处理每个视频
        for idx, video in enumerate(videos, 1):
            video_id = video['video_id']
            print(f"\n[{idx}/{len(videos)}] 处理: {video['title']}")

            # 获取详细信息
            details = self.fetch_video_details(video['url'])
            if not details:
                continue

            stats['total_processed'] += 1

            # 计算评分
            score = VideoScorer.calculate_score(details)

            # 判定等级
            rank = RankAssigner.get_rank(score)

            print(f"   📊 评分: {score}/100 | 等级: {rank}")

            # 检查是否符合三类条件
            view_count = details.get('view_count', 0)
            upload_date = details.get('upload_date', '')
            title = details.get('title', '')
            description = details.get('description', '')

            # 条件1: 播放量 >= 20,000
            meets_view_threshold = view_count >= 20000

            # 条件2: 发布日期 >= 2024年1月
            meets_date_threshold = False
            if upload_date and len(upload_date) >= 6:
                try:
                    year_month = int(upload_date[:6])  # YYYYMM
                    meets_date_threshold = year_month >= 202401
                except:
                    pass

            # 条件3: 关键词匹配
            has_keywords, matched_keywords = VideoScorer.check_keywords(title, description)
            meets_keyword_threshold = has_keywords

            # 判断是否符合任一条件
            should_save = meets_view_threshold or meets_date_threshold or meets_keyword_threshold

            # 更新分类统计
            if meets_view_threshold:
                stats['cat_20k_views'] += 1
            if meets_date_threshold:
                stats['cat_2024_01'] += 1
            if meets_keyword_threshold:
                stats['cat_keywords'] += 1

            if not should_save:
                print(f"   ⏭️  跳过 (不符合任何筛选条件)")
                stats['skipped'] += 1
                continue

            print(f"   ✓ 符合条件: "
                  f"{'[20K+播放]' if meets_view_threshold else ''}"
                  f"{'[2024+]' if meets_date_threshold else ''}"
                  f"{'[关键词]' if meets_keyword_threshold else ''}")

            # 获取字幕
            transcript = self.get_transcript(video_id)
            has_transcript = transcript is not None

            # 保存结果（即使没有字幕也保存元数据）
            self.save_transcript(details, transcript, rank, score, has_transcript)

            stats[rank] += 1
            stats['saved'] += 1
            if has_transcript:
                stats['with_transcript'] += 1
            else:
                stats['without_transcript'] += 1

        # 3. 输出统计报告
        print("\n" + "=" * 80)
        print("📊 分析完成统计")
        print("=" * 80)
        print(f"\n处理进度:")
        print(f"  总视频数: {stats['total_processed']}/{len(videos)}")
        print(f"  已保存: {stats['saved']}")
        print(f"  已跳过: {stats['skipped']}")

        print(f"\n等级分布:")
        print(f"  S 级 (战略级): {stats['S']}")
        print(f"  A 级 (高价值): {stats['A']}")
        print(f"  B 级 (基础): {stats['B']}")

        print(f"\n字幕状态:")
        print(f"  有字幕: {stats['with_transcript']}")
        print(f"  无字幕: {stats['without_transcript']}")

        print(f"\n分类统计 (可重复计数):")
        print(f"  📺 播放量 20K+: {stats['cat_20k_views']}")
        print(f"  📅 2024年1月+: {stats['cat_2024_01']}")
        print(f"  🔑 关键词匹配: {stats['cat_keywords']}")

        print(f"\n📁 输出目录: {self.output_dir.absolute()}")
        print("=" * 80 + "\n")

        # 4. 生成 CSV 索引文件和分类报告
        self.generate_summary_csv()
        self.generate_category_report(stats)

    def generate_summary_csv(self):
        """
        生成 CSV 索引文件
        """
        import csv

        csv_file = self.output_dir / "video_index.csv"

        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Rank', 'Score', 'Title', 'Date', 'Views', 'URL'])

            # 遍历所有 txt 文件
            for txt_file in self.transcripts_dir.glob('*.txt'):
                try:
                    with open(txt_file, 'r', encoding='utf-8') as tf:
                        lines = tf.readlines()

                        # 解析元数据
                        rank = 'Unknown'
                        score = 0
                        title = 'Unknown'
                        date = 'Unknown'
                        views = 0
                        url = ''

                        for line in lines[:20]:  # 只读取前20行（元数据部分）
                            line = line.strip()
                            if line.startswith('Rank:'):
                                rank = line.split(':')[1].strip()[0]  # 提取等级字母
                            elif line.startswith('Score:'):
                                score = line.split(':')[1].strip().replace('/100', '')
                            elif line.startswith('Title:'):
                                title = line.split(':', 1)[1].strip()
                            elif line.startswith('Published:'):
                                date = line.split(':', 1)[1].strip()
                            elif line.startswith('View Count:'):
                                views = line.split(':')[1].strip().replace(',', '')
                            elif line.startswith('URL:'):
                                url = line.split(':', 1)[1].strip()

                        writer.writerow([rank, score, title, date, views, url])

                except Exception as e:
                    print(f"⚠️  处理文件 {txt_file} 失败: {e}")

        print(f"📊 已生成索引文件: {csv_file}")

    def generate_category_report(self, stats: Dict):
        """
        生成分类报告文件
        """
        report_file = self.output_dir / "category_report.md"

        with open(report_file, 'w', encoding='utf-8') as f:
            f.write("# Palantir YouTube 频道分析报告\n\n")
            f.write(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")

            f.write("## 📊 总体统计\n\n")
            f.write(f"- **总处理视频数**: {stats['total_processed']}\n")
            f.write(f"- **已保存视频数**: {stats['saved']}\n")
            f.write(f"- **已跳过视频数**: {stats['skipped']}\n\n")

            f.write("## 🎯 等级分布\n\n")
            f.write(f"| 等级 | 描述 | 数量 |\n")
            f.write(f"|------|------|------|\n")
            f.write(f"| **S** | Strategic - 战略级研究对象 | {stats['S']} |\n")
            f.write(f"| **A** | Active - 高参考价值 | {stats['A']} |\n")
            f.write(f"| **B** | Basic - 基础背景资料 | {stats['B']} |\n\n")

            f.write("## 📝 字幕状态\n\n")
            if stats['saved'] > 0:
                f.write(f"- **有字幕**: {stats['with_transcript']} ({stats['with_transcript']/stats['saved']*100:.1f}%)\n")
                f.write(f"- **无字幕**: {stats['without_transcript']} ({stats['without_transcript']/stats['saved']*100:.1f}%)\n\n")
            else:
                f.write(f"- **有字幕**: {stats['with_transcript']}\n")
                f.write(f"- **无字幕**: {stats['without_transcript']}\n\n")
            f.write("> ⚠️  注意：无字幕的视频已保存元数据，可通过语音转文字服务获取完整内容\n\n")

            f.write("## 📂 分类统计（可重复计数）\n\n")
            f.write("视频可能同时满足多个条件，因此总数可能超过实际保存数量。\n\n")
            f.write(f"| 分类条件 | 数量 |\n")
            f.write(f"|----------|------|\n")
            f.write(f"| 📺 播放量 ≥ 20,000 | {stats['cat_20k_views']} |\n")
            f.write(f"| 📅 发布日期 ≥ 2024年1月 | {stats['cat_2024_01']} |\n")
            f.write(f"| 🔑 包含关键词 | {stats['cat_keywords']} |\n\n")

            f.write("## 🔑 关键词列表\n\n")
            f.write("**核心关键词**: AIPCon, Foundrycon, Paragon, Pipeline, AIP, Foundry, Gotham, Apollo\n\n")
            f.write("**次要关键词**: Demo, Tutorial, Workshop, Case Study, Bootcamp, How to, Guide\n\n")

            f.write("---\n\n")
            f.write("## 📂 输出文件\n\n")
            f.write(f"- **视频脚本**: `transcripts/` 目录\n")
            f.write(f"- **索引文件**: `video_index.csv` (可用 Excel 打开)\n")
            f.write(f"- **分类报告**: `category_report.md` (本文件)\n\n")

        print(f"📄 已生成分类报告: {report_file}")

    def retry_failed(self):
        """
        仅重新处理失败的视频
        从 failed_videos.json 读取，逐个重试
        """
        failed_file = self.output_dir / "failed_videos.json"
        if not failed_file.exists():
            print("❌ 未找到 failed_videos.json，没有失败项需要重试")
            return

        with open(failed_file, "r", encoding="utf-8") as f:
            failed_list = json.load(f)

        if not failed_list:
            print("✅ 没有失败项需要重试")
            return

        print(f"\n📝 重新处理 {len(failed_list)} 个失败视频\n")
        still_failed: List[Dict] = []

        for idx, details in enumerate(failed_list, 1):
            video_id = details.get("video_id")
            title = details.get("title", "Unknown")
            print(f"[{idx}/{len(failed_list)}] {title[:50]}...")

            try:
                transcript = self.get_transcript(video_id)
                has_transcript = transcript is not None
                rank = details.get("rank", "B")
                score = details.get("score", 0)
                self.save_transcript(details, transcript, rank, score, has_transcript)
                print(f"   ✓ 成功")
            except Exception as e:
                still_failed.append({**details, "error": str(e)})
                print(f"   ❌ 仍失败: {e}")

        self._write_failed_videos(still_failed)
        if self.data_dir:
            self._write_config_json()
            self._generate_master_index_csv()
        print(f"\n✅ 重试完成: 成功 {len(failed_list) - len(still_failed)}, 仍失败 {len(still_failed)}")

    def _read_existing_category(self, video_id: str, video_url: str) -> str:
        """从已有 transcript 文件中读取 Category，用于 Whisper 重写时保留"""
        vid = video_id or ""
        if not vid and video_url:
            import re
            m = re.search(r"[?&]v=([a-zA-Z0-9_-]{11})", video_url or "")
            vid = m.group(1) if m else ""
        if not vid:
            return ""
        for txt_file in self.transcripts_dir.glob("*.txt"):
            try:
                with open(txt_file, "r", encoding="utf-8") as f:
                    content = f.read()
                    if vid not in content:
                        continue
                    for line in content.split("\n"):
                        if line.strip().startswith("Category:"):
                            return line.split(":", 1)[1].strip()
            except Exception:
                pass
        return ""

    def process_whisper_missing(self, limit: Optional[int] = None):
        """仅对当前无字幕的视频使用 Whisper 转录（需 ffmpeg），自动保存"""
        import csv
        csv_path = self.data_dir / "master_index.csv" if self.data_dir else None
        if not csv_path or not csv_path.exists():
            csv_path = self.output_dir / "filtered_candidates.csv"
        if not csv_path.exists():
            print("❌ 未找到 master_index.csv 或 filtered_candidates.json，请先运行完整流程")
            return
        with open(csv_path, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        # 从 master_index 找 Transcript=无 的，直接处理全部（不依赖 filtered_candidates）
        need_whisper = [r for r in rows if r.get("Transcript") == "无"]
        if not need_whisper:
            print("✅ 没有需要 Whisper 转录的视频")
            self._write_status(0, 0, "idle", phase="whisper", failed_count=0)
            return
        vid_pat = re.compile(r"[?&]v=([a-zA-Z0-9_-]{11})")
        to_process = []
        for r in need_whisper:
            url = r.get("URL", r.get("url", ""))
            m = vid_pat.search(url or "")
            vid = m.group(1) if m else ""
            if vid:
                to_process.append({
                    "video_id": vid,
                    "title": r.get("Title", r.get("title", "Unknown")),
                    "url": url,
                    "rank": r.get("Rank", "B"),
                    "score": r.get("Score", 0),
                    "category": r.get("Category", ""),
                })
        to_process = (to_process[:limit] if limit else to_process)
        print(f"\n📝 对 {len(to_process)} 个无字幕视频使用 Whisper 语音转文字（需 ffmpeg）\n")
        self._write_status(0, len(to_process), "processing", phase="whisper", failed_count=0)
        for idx, details in enumerate(to_process, 1):
            vid = details.get("video_id")
            title = details.get("title", "Unknown")
            print(f"[{idx}/{len(to_process)}] {title[:50]}...")
            self._write_status(idx, len(to_process), "processing", phase="whisper")
            transcript = self._transcribe_with_whisper(vid)
            rank = details.get("rank", "B")
            score = details.get("score", 0)
            # 保留已有分类，不覆盖为「其他」
            existing_cat = self._read_existing_category(details.get("video_id", ""), details.get("url", ""))
            if not existing_cat:
                existing_cat = details.get("category", "")
            self.save_transcript(details, transcript, rank, score, transcript is not None, category=existing_cat or "", source="whisper" if transcript else "")
            if self.data_dir and transcript:
                self._sync_transcripts_to_data_dir()
        self._write_status(len(to_process), len(to_process), "idle", phase="whisper")
        if self.data_dir:
            self._sync_transcripts_to_data_dir()
        print("\n✅ Whisper 转录完成")

    def process_others(self, channel_url: str, limit: Optional[int] = None):
        """处理三类之外的剩余视频，分类为「其他」"""
        filter_file = self.output_dir / "filtered_candidates.json"
        if not filter_file.exists():
            print("❌ 需要先运行 filter_channel 生成 filtered_candidates.json")
            return
        with open(filter_file, encoding="utf-8") as f:
            candidates = json.load(f)
        existing_ids = {c.get("video_id") for c in candidates if c.get("video_id")}

        videos = self.fetch_channel_videos(channel_url, limit)
        if not videos:
            print("❌ 未获取到视频列表")
            return

        others = [v for v in videos if v.get("video_id") and v["video_id"] not in existing_ids]
        if not others:
            print("✅ 没有「其他」类视频需要处理")
            return

        print(f"\n📝 处理 {len(others)} 个「其他」类视频（三类之外）\n")
        self._write_status(0, len(others), "processing", phase="process", failed_count=0)

        for idx, video in enumerate(others, 1):
            details = self.fetch_video_details(video["url"])
            if not details:
                continue
            self._write_status(idx, len(others), "processing", phase="process")

            score = VideoScorer.calculate_score(details)
            rank = RankAssigner.get_rank(score)
            transcript = self.get_transcript(details["video_id"])
            has_transcript = transcript is not None

            self.save_transcript(details, transcript, rank, score, has_transcript, category="其他")

        self._write_status(len(others), len(others), "idle", phase="process")
        if self.data_dir:
            self._generate_master_index_csv()
            self._generate_transcript_index()
            import shutil
            dst = self.data_dir / "transcripts"
            dst.mkdir(exist_ok=True)
            for f in self.transcripts_dir.glob("*.txt"):
                try:
                    shutil.copy2(f, dst / f.name)
                except Exception:
                    pass
            self._update_filter_summary_cat_others()
        print(f"\n✅ 「其他」类处理完成: {len(others)} 个视频")


def main():
    """
    主函数 - 两阶段流程：
    1. 先筛选出符合三类的视频（filter_channel）→ 输出三类数量
    2. 再按需处理筛选结果（process_filtered_candidates）

    命令行:
      python palantir_analyzer.py           # 完整流程：筛选 + 处理
      python palantir_analyzer.py --filter-only   # 仅筛选，输出三类数量后退出
      python palantir_analyzer.py --retry-failed  # 仅重试失败项
    """
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--filter-only", action="store_true", help="仅执行筛选，输出三类数量后退出")
    parser.add_argument("--retry-failed", action="store_true", help="仅重试失败的视频")
    parser.add_argument("--whisper-missing", action="store_true", help="仅对无字幕视频用 Whisper 转录（需 ffmpeg）")
    parser.add_argument("--process-others", action="store_true", help="处理三类之外的剩余视频，分类为「其他」")
    parser.add_argument("--whisper-one", type=str, default=None, help="对单个视频 ID 执行 Whisper 转换")
    parser.add_argument("--dashboard", type=str, default="palantirtech", help="看板 ID")
    parser.add_argument("--convert-urls", type=str, default=None, help="临时转换多个视频 ID，逗号分隔，最多 5 个")
    parser.add_argument("--auto-whisper", action="store_true", help="完整流程后自动对无字幕视频执行 Whisper 转换")
    parser.add_argument("--limit", type=int, default=None, help="限制处理数量（测试用）")
    args = parser.parse_args()

    channel_id = args.dashboard
    # 从 dashboards.json 解析当前看板的频道 URL，若无则用 Palantir 默认
    channel_url = "https://www.youtube.com/@palantirtech"
    if channel_id not in ("temp", "slim"):
        dashboards_path = Path("frontend/public/data/dashboards.json")
        if dashboards_path.exists():
            try:
                boards = json.load(dashboards_path.open(encoding="utf-8"))
                board = next((b for b in boards if b.get("id") == channel_id), None)
                if board and board.get("channelUrl"):
                    channel_url = (board["channelUrl"] or "").rstrip("/")
            except Exception:
                pass
    # 临时看板在各自分支内单独建 analyzer；palantir 沿用 palantir_analysis，其余看板用 data/{id}
    if channel_id in ("temp", "slim"):
        output_dir = "palantir_analysis"
    elif channel_id == "palantirtech":
        output_dir = "palantir_analysis"
    else:
        output_dir = str(Path("frontend/public/data") / channel_id)
    analyzer = PalantirVideoAnalyzer(
        output_dir=output_dir,
        data_dir="frontend/public/data",
        channel_id=channel_id,
    )

    if args.whisper_one:
        vid = args.whisper_one
        if channel_id in ("temp", "slim"):
            dash_dir = Path("frontend/public/data") / channel_id
            analyzer_whisper = PalantirVideoAnalyzer(output_dir=str(dash_dir), data_dir="frontend/public/data", channel_id=channel_id)
            for old_f in analyzer_whisper.transcripts_dir.glob("*.txt"):
                try:
                    if vid in old_f.read_text(encoding="utf-8"):
                        old_f.unlink()
                        break
                except Exception:
                    pass
            details = analyzer_whisper.fetch_video_details(f"https://www.youtube.com/watch?v={vid}")
            if not details:
                details = {"video_id": vid, "url": f"https://www.youtube.com/watch?v={vid}", "title": "Unknown", "rank": "B", "score": 0}
            else:
                details["rank"] = RankAssigner.get_rank(VideoScorer.calculate_score(details))
                details["score"] = VideoScorer.calculate_score(details)
            analyzer_whisper._write_status(0, 1, "processing", phase="whisper", failed_count=0)
            transcript = analyzer_whisper._transcribe_with_whisper(vid)
            analyzer_whisper.save_transcript(details, transcript, details.get("rank", "B"), details.get("score", 0), transcript is not None, category=details.get("category", "其他"), source="whisper" if transcript else "")
            analyzer_whisper._write_status(1, 1, "idle", phase="whisper")
            if analyzer_whisper.data_dir:
                analyzer_whisper._generate_master_index_csv()
                analyzer_whisper._generate_transcript_index()
                import shutil
                dst = analyzer_whisper.data_dir / "transcripts"
                dst.mkdir(exist_ok=True)
                for f in analyzer_whisper.transcripts_dir.glob("*.txt"):
                    try:
                        shutil.copy2(f, dst / f.name)
                    except Exception:
                        pass
            print(f"✅ {channel_id} 看板单视频 Whisper 转换完成")
        else:
            filter_file = analyzer.output_dir / "filtered_candidates.json"
            if not filter_file.exists():
                print("❌ 需要先运行完整流程")
                return
            analyzer._write_status(0, 1, "processing", phase="whisper", failed_count=0)
            with open(filter_file, encoding="utf-8") as f:
                candidates = json.load(f)
            details = next((c for c in candidates if c.get("video_id") == vid), None)
            if not details:
                details = {"video_id": vid, "url": f"https://www.youtube.com/watch?v={vid}", "title": "Unknown", "rank": "B", "score": 0}
            transcript = analyzer._transcribe_with_whisper(vid)
            analyzer.save_transcript(details, transcript, details.get("rank", "B"), details.get("score", 0), transcript is not None, category="")
            analyzer._write_status(1, 1, "idle", phase="whisper")
            if analyzer.data_dir:
                analyzer._sync_transcripts_to_data_dir()
            print("✅ 单视频转换完成")
        return

    if args.convert_urls:
        channel_id = args.dashboard if args.dashboard in ("temp", "slim") else "temp"
        temp_data_dir = Path("frontend/public/data") / channel_id
        temp_data_dir.mkdir(parents=True, exist_ok=True)
        # 使用 data_dir 作为 output_dir，使字幕直接保存到 frontend/public/data/temp/transcripts/
        # 供 API 的 get_transcript 从同一路径读取
        analyzer_temp = PalantirVideoAnalyzer(output_dir=str(temp_data_dir), data_dir="frontend/public/data", channel_id=channel_id)
        vids = [v.strip() for v in args.convert_urls.split(",") if v.strip()][:5]
        for vid in vids:
            details = analyzer_temp.fetch_video_details(f"https://www.youtube.com/watch?v={vid}")
            if not details:
                details = {"video_id": vid, "url": f"https://www.youtube.com/watch?v={vid}", "title": "Temp", "rank": "B", "score": 0}
            else:
                details["rank"] = RankAssigner.get_rank(VideoScorer.calculate_score(details))
                details["score"] = VideoScorer.calculate_score(details)
            transcript = analyzer_temp.get_transcript(vid)
            analyzer_temp.save_transcript(details, transcript, details.get("rank", "B"), details.get("score", 0), transcript is not None, category="其他")
        if analyzer_temp.data_dir:
            analyzer_temp._generate_master_index_csv()
            analyzer_temp._generate_transcript_index()
        print(f"✅ 临时转换完成: {len(vids)} 个视频，字幕已保存至 {temp_data_dir / 'transcripts'}")
        return

    if args.retry_failed:
        analyzer.retry_failed()
        return

    if args.whisper_missing:
        analyzer.process_whisper_missing(limit=args.limit)
        return

    if args.process_others:
        analyzer.process_others(channel_url, limit=args.limit)
        return

    # 阶段 1：先筛选
    analyzer.filter_channel(channel_url, limit=args.limit)

    if args.filter_only:
        print("\n✅ 筛选完成，三类数量已输出。执行完整流程请去掉 --filter-only")
        return

    # 阶段 2：处理筛选结果
    print("\n▶ 开始处理（获取字幕）...\n")
    analyzer.process_filtered_candidates(limit=args.limit)

    if args.auto_whisper:
        print("\n▶ 对无字幕视频执行 Whisper 转换...\n")
        analyzer.process_whisper_missing(limit=args.limit)


if __name__ == "__main__":
    main()
