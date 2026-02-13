import { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, Loader2 } from 'lucide-react';
import { t } from '../i18n';
import { apiFetch } from '../utils/api';

const MAX_URLS = 5;
const POLL_INTERVAL = 4000;
const POLL_MAX = 90;

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

export function TempBoardPanel({ onConvert, loading, lang = 'zh', onCleanEmpty }) {
  const [urlList, setUrlList] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [converting, setConverting] = useState(false);
  const [pendingIds, setPendingIds] = useState([]);
  const [msg, setMsg] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const pollCountRef = useRef(0);

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
        const r = await apiFetch(`/api/temp-convert-status?video_ids=${pendingIds.join(',')}`);
        const d = await r.json();
        if (d.all_found) {
          setPendingIds([]);
          setUrlList([]);
          setMsg(lang === 'zh' ? '转换完成' : 'Convert completed');
          onConvert?.();
        } else {
          setMsg(lang === 'zh' ? `转换中… (${d.found?.length || 0}/${pendingIds.length})` : `Converting… (${d.found?.length || 0}/${pendingIds.length})`);
        }
      } catch {
        setMsg(lang === 'zh' ? '检查进度失败' : 'Status check failed');
      }
    };
    const timer = setInterval(check, POLL_INTERVAL);
    check();
    return () => clearInterval(timer);
  }, [pendingIds, onConvert, lang]);

  const handleConfirm = async () => {
    if (urlList.length === 0) {
      setMsg(lang === 'zh' ? '请先添加 1-5 个视频链接' : 'Add 1-5 video URLs first');
      return;
    }
    if (urlList.length > MAX_URLS) {
      setMsg(lang === 'zh' ? `最多 ${MAX_URLS} 个视频链接` : `Max ${MAX_URLS} video URLs`);
      return;
    }
    setConverting(true);
    setMsg('');
    try {
      const r = await apiFetch('/api/convert-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlList }),
      });
      const d = await r.json();
      if (r.ok) {
        const ids = d.video_ids || urlList.map(extractVideoId).filter(Boolean);
        setMsg(lang === 'zh' ? `已启动转换 ${d.count} 个视频，请稍候…` : `Converting ${d.count} videos…`);
        pollCountRef.current = 0;
        setPendingIds(ids);
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
      const r = await apiFetch('/api/temp-clean-empty', { method: 'POST' });
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
          disabled={converting || loading || urlList.length === 0 || pendingIds.length > 0}
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
      </div>
    </div>
  );
}
