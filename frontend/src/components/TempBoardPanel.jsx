import { useState } from 'react';
import { Upload, Plus, Trash2 } from 'lucide-react';
import { t } from '../i18n';
import { apiFetch } from '../utils/api';

const MAX_URLS = 5;

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

export function TempBoardPanel({ onConvert, loading, lang = 'zh' }) {
  const [urlList, setUrlList] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [converting, setConverting] = useState(false);
  const [msg, setMsg] = useState('');

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
        setMsg(lang === 'zh' ? `已启动转换 ${d.count} 个视频` : `Converting ${d.count} videos`);
        setUrlList([]);
        onConvert?.();
      } else {
        setMsg(d.detail || (lang === 'zh' ? '转换失败' : 'Convert failed'));
      }
    } catch (e) {
      setMsg(e.message || (lang === 'zh' ? '请求失败' : 'Request failed'));
    } finally {
      setConverting(false);
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

      {urlList.length > 0 && (
        <ul className="space-y-2 mb-3">
          {urlList.map((url, idx) => (
            <li
              key={idx}
              className="flex items-center gap-2 px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm"
            >
              <span className="flex-1 min-w-0 truncate text-[var(--muted)]">{url}</span>
              <button
                onClick={() => handleDelete(idx)}
                className="p-1 text-red-500 hover:bg-red-500/10 rounded shrink-0"
                title={t(lang, 'delete')}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--muted)] mb-3">
        {t(lang, 'tempBoardHint', { n: urlList.length, max: MAX_URLS })}
      </p>

      <div className="flex items-center gap-3">
        <button
          onClick={handleConfirm}
          disabled={converting || loading || urlList.length === 0}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {converting || loading ? t(lang, 'converting') : t(lang, 'tempBoardConfirm')}
        </button>
        {msg && <span className="text-sm text-[var(--muted)]">{msg}</span>}
      </div>
    </div>
  );
}
