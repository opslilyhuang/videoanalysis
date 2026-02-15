import { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, Loader2 } from 'lucide-react';
import { t } from '../i18n';
import { apiFetch } from '../utils/api';

const MAX_URLS = 5;
const POLL_INTERVAL = 4000;
const POLL_MAX = 90;

// localStorage keys
const STORAGE_KEY_URLS = `tempboard_urls_`;
const STORAGE_KEY_PENDING = `tempboard_pending_`;
const STORAGE_KEY_TIMESTAMP = `tempboard_timestamp_`;

function parseVideoUrls(text) {
  return text
    .trim()
    .split(/[\n,\s]+/)
    .map((u) => u.trim())
    .filter((u) => u && u.includes('youtube'));
}

function isValidYoutubeUrl(url) {
  return /youtube\.com\/watch\?v=/.test(url) || /youtu\.be\//.test(url);
}

function extractVideoId(url) {
  const m = (url || '').match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function TempBoardPanel({ onConvert, loading, lang = 'zh', onCleanEmpty, onGuestLimitHit, dashboardId = 'temp' }) {
  const [urlList, setUrlList] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [converting, setConverting] = useState(false);
  const [pendingIds, setPendingIds] = useState([]);
  const [msg, setMsg] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const pollCountRef = useRef(0);
  const restoringRef = useRef(false);

  // 从 localStorage 恢复状态
  useEffect(() => {
    const storageKey = STORAGE_KEY_PENDING + dashboardId;
    const timestampKey = STORAGE_KEY_TIMESTAMP + dashboardId;

    try {
      const savedPending = localStorage.getItem(storageKey);
      const savedTimestamp = localStorage.getItem(timestampKey);

      if (savedPending && savedTimestamp) {
        const timestamp = parseInt(savedTimestamp, 10);
        const now = Date.now();
        // 如果超过 10 分钟，认为已过期
        if (now - timestamp > 10 * 60 * 1000) {
          localStorage.removeItem(storageKey);
          localStorage.removeItem(timestampKey);
          return;
        }

        const pending = JSON.parse(savedPending);
        if (pending.length > 0) {
          restoringRef.current = true;
          setPendingIds(pending);
          setMsg(lang === 'zh' ? '检测到后台转换任务，正在恢复…' : 'Restoring background tasks…');
          setTimeout(() => {
            restoringRef.current = false;
          }, 1000);
        }
      }
    } catch (e) {
      console.error('Failed to restore state:', e);
    }
  }, [dashboardId, lang]);

  // 保存状态到 localStorage
  useEffect(() => {
    if (restoringRef.current) return;
    const storageKey = STORAGE_KEY_PENDING + dashboardId;
    const timestampKey = STORAGE_KEY_TIMESTAMP + dashboardId;

    try {
      if (pendingIds.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(pendingIds));
        localStorage.setItem(timestampKey, Date.now().toString());
      } else {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(timestampKey);
      }
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }, [pendingIds, dashboardId]);

  const handleAdd = () => {
    const parsed = parseVideoUrls(inputValue);
    const valid = parsed.filter(isValidYoutubeUrl);
    const invalid = parsed.filter((u) => !isValidYoutubeUrl(u));
    if (invalid.length) {
      setMsg(lang === 'zh' ? '请粘贴有效的 YouTube 视频链接' : 'Paste valid YouTube video URLs');
      return;
    }
    const combined = [...urlList, ...valid].slice(0, MAX_URLS);
    setUrlList(combined);
    setInputValue('');
    setMsg('');
  };

  const handleDelete = (idx) => {
    setUrlList((prev) => prev.filter((_, i) => i !== idx));
    setMsg('');
  };

  useEffect(() => {
    if (pendingIds.length === 0) return;
    const check = async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > POLL_MAX) {
        setPendingIds([]);
        setUrlList([]);
        setMsg(lang === 'zh' ? '转换超时，请手动刷新查看' : 'Timeout, please refresh manually');
        return;
      }
      try {
        const r = await apiFetch(`/api/temp-convert-status?video_ids=${pendingIds.join(',')}&dashboard_id=${encodeURIComponent(dashboardId)}`);
        const d = await r.json();
        if (d.all_found) {
          setPendingIds([]);
          setUrlList([]);
          setMsg(lang === 'zh' ? '转换完成' : 'Convert completed');
          onConvert?.();
          setTimeout(() => onConvert?.(), 500);
        } else {
          setMsg(lang === 'zh' ? `转换中… (${d.found?.length || 0}/${pendingIds.length})` : `Converting… (${d.found?.length || 0}/${pendingIds.length})`);
        }
      } catch {
        setMsg(lang === 'zh' ? '检查进度失败' : 'Status check failed');
      }
    };
    check();
    const timer = setInterval(check, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [pendingIds, onConvert, lang, dashboardId]);

  const handleConfirm = async () => {
    // 若未点添加，尝试从输入框解析
    let urlsToConvert = urlList.length > 0 ? [...urlList] : parseVideoUrls(inputValue).filter(isValidYoutubeUrl);
    if (urlsToConvert.length === 0) {
      setMsg(lang === 'zh' ? '请先添加 1-5 个视频链接，或粘贴链接后直接点确定转换' : 'Add 1-5 video URLs or paste links and click convert');
      return;
    }
    if (urlsToConvert.length > MAX_URLS) {
      urlsToConvert = urlsToConvert.slice(0, MAX_URLS);
    }
    setConverting(true);
    setMsg(lang === 'zh' ? '正在提交…' : 'Submitting…');
    try {
      const r = await apiFetch('/api/convert-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlsToConvert, dashboard_id: dashboardId }),
      });
      const d = await r.json();
      if (r.ok) {
        const ids = d.video_ids || urlsToConvert.map(extractVideoId).filter(Boolean);
        setMsg(lang === 'zh' ? `已启动转换 ${d.count} 个视频，约需 1–2 分钟，请稍候…` : `Converting ${d.count} videos, ~1-2 min, please wait…`);
        pollCountRef.current = 0;
        setPendingIds(ids);
        onGuestLimitHit?.();
      } else if (r.status === 429) {
        setMsg(d.detail || (lang === 'zh' ? '游客今日已用完，请登录' : 'Guest limit reached, please login'));
        onGuestLimitHit?.();
      } else {
        setMsg(d.detail || (lang === 'zh' ? '转换失败' : 'Convert failed'));
      }
    } catch (e) {
      setMsg(e.message || (lang === 'zh' ? '请求失败' : 'Request failed'));
    } finally {
      setConverting(false);
    }
  };

  const handleCleanEmpty = async () => {
    if (cleaning) return;
    setCleaning(true);
    setMsg('');
    try {
      const r = await apiFetch(`/api/temp-clean-empty?dashboard_id=${encodeURIComponent(dashboardId)}`, { method: 'POST' });
      const d = await r.json();
      if (r.ok && d.removed > 0) {
        setMsg(lang === 'zh' ? `已清理 ${d.removed} 条空记录` : `Cleaned ${d.removed} empty records`);
        onConvert?.();
      } else if (r.ok) {
        setMsg(lang === 'zh' ? '暂无空记录' : 'No empty records');
      }
    } catch (e) {
      setMsg(e.message || (lang === 'zh' ? '清理失败' : 'Clean failed'));
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="text-sm font-medium text-[var(--muted)] mb-3">{t(lang, 'tempBoard')}</h3>
      <p className="text-sm text-[var(--muted)] mb-3">{t(lang, 'tempBoardDesc')}</p>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t(lang, 'tempBoardInputPlaceholder')}
          className="flex-1 px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          onClick={handleAdd}
          disabled={urlList.length >= MAX_URLS || !inputValue.trim()}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          title={t(lang, 'tempBoardUpload')}
        >
          <Upload size={18} />
          {t(lang, 'tempBoardUpload')}
        </button>
      </div>

      {(urlList.length > 0 || pendingIds.length > 0) && (
        <ul className="space-y-2 mb-3">
          {urlList.map((url, idx) => (
            <li
              key={idx}
              className="flex items-center gap-2 px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm"
            >
              {pendingIds.length > 0 && (
                <Loader2 size={14} className="animate-spin text-[var(--accent)] shrink-0" />
              )}
              <span className="flex-1 min-w-0 truncate text-[var(--muted)]">{url}</span>
              {pendingIds.length === 0 && (
                <button
                  onClick={() => handleDelete(idx)}
                  className="p-1 text-red-500 hover:bg-red-500/10 rounded shrink-0"
                  title={t(lang, 'delete')}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--muted)] mb-3">
        {t(lang, 'tempBoardHint', { n: urlList.length, max: MAX_URLS })}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleConfirm}
          disabled={converting || loading || (urlList.length === 0 && !parseVideoUrls(inputValue).filter(isValidYoutubeUrl).length) || pendingIds.length > 0}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {(converting || loading || pendingIds.length > 0) ? t(lang, 'converting') : t(lang, 'tempBoardConfirm')}
        </button>
        {onCleanEmpty && (
          <button
            onClick={handleCleanEmpty}
            disabled={cleaning || loading}
            className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-amber-500/50 text-amber-600 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {cleaning ? t(lang, 'converting') : t(lang, 'tempCleanEmpty')}
          </button>
        )}
        {msg && <span className="text-sm text-[var(--muted)]">{msg}</span>}
        {pendingIds.length > 0 && (
          <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border border-amber-200 dark:border-amber-800">
            💡 {t(lang, 'backgroundConvertHint')}
          </span>
        )}
      </div>
    </div>
  );
}
