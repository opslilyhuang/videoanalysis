import { useState, useEffect, useCallback } from 'react';
import { FileText, MessageSquare, Sparkles, Send, Volume2, Square, Trash2, RefreshCw, Copy, Download } from 'lucide-react';

const CHAT_MAX_ROUNDS = 10;
import { t } from '../i18n';
import { apiFetch } from '../utils/api';

function extractVideoId(url) {
  if (!url) return null;
  const m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** 将字幕文本按段落拆分，长段落按句子再分（支持中英文） */
function splitIntoParagraphs(text) {
  if (!text || !text.trim()) return [];
  const byNewline = text.trim().split(/\n\n+/).filter(Boolean);
  if (byNewline.length > 1) return byNewline;
  const single = byNewline[0] || text.trim();
  if (single.length <= 500) return [single];
  const sentences = single.match(/[^。！？.!?]+[。！？.!?]+(?:\s|$)/g) || single.match(/[^\n]+/g) || [single];
  const paras = [];
  let buf = '';
  const maxLen = 400;
  for (const s of sentences) {
    if (buf.length + s.length > maxLen && buf) {
      paras.push(buf.trim());
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf.trim()) paras.push(buf.trim());
  return paras.length ? paras : [single];
}

export function RightSidebar({ selectedVideo, videos, onMetaSaved, onSourceVideoClick, transcriptRefetchTrigger = 0, lang = 'zh', dashboardId = 'palantirtech' }) {
  const [transcript, setTranscript] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [transcriptViewMode, setTranscriptViewMode] = useState('original');
  const [translatedZh, setTranslatedZh] = useState(null);
  const [translatedParas, setTranslatedParas] = useState(null);
  const [transcriptError, setTranscriptError] = useState(null);
  const [loadingTranslate, setLoadingTranslate] = useState(false);
  const [ttsLang, setTtsLang] = useState('en'); // en | zh
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatScope, setChatScope] = useState('all');
  const [chatCategory, setChatCategory] = useState('A');
  const [rightTab, setRightTab] = useState('transcript'); // 'transcript' | 'chat'
  const [transcriptSearch, setTranscriptSearch] = useState('');

  const videoId = selectedVideo ? extractVideoId(selectedVideo.URL) : null;

  const fetchTranscript = useCallback(() => {
    if (!videoId) return;
    setLoadingTranscript(true);
    setTranscript(null);
    setTranscriptError(null);
    setSummary(null);
    setTranslatedZh(null);
    setTranslatedParas(null);
    setTranscriptViewMode('original');
    apiFetch(`/api/transcript/${videoId}?dashboard_id=${dashboardId}&_t=${Date.now()}`)
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) {
          let msg = `HTTP ${r.status}`;
          try {
            const err = JSON.parse(text);
            if (err?.detail) msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
          } catch {}
          setTranscriptError(msg);
          return null;
        }
        setTranscriptError(null);
        try {
          return JSON.parse(text);
        } catch (e) {
          setTranscriptError('Invalid response');
          return null;
        }
      })
      .then((data) => {
        setTranscript(data);
        setLoadingTranscript(false);
        if (data?.transcript && data.transcript.length > 100 && !data.transcript.includes('NO TRANSCRIPT')) {
          setLoadingSummary(true);
          apiFetch('/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: data.transcript }),
          })
            .then((r) => r.json())
            .then(async (d) => {
              setSummary(d.summary);
              setLoadingSummary(false);
              if (videoId && (d.keywords?.length || d.category)) {
                await apiFetch(`/api/save-video-meta?dashboard_id=${dashboardId}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    video_id: videoId,
                    keywords: d.keywords || [],
                    category: d.category || '',
                  }),
                }).catch(() => {});
                onMetaSaved?.();
              }
            })
            .catch(() => setLoadingSummary(false));
        } else {
          setSummary(null);
        }
      })
      .catch((err) => {
        setTranscriptError(err?.message || t(lang, 'requestFailed'));
        setLoadingTranscript(false);
      });
  }, [videoId, dashboardId, lang]);

  useEffect(() => {
    if (!videoId) {
      setTranscript(null);
      setSummary(null);
      setTranslatedZh(null);
      setTranslatedParas(null);
      setTranscriptViewMode('original');
      return;
    }
    fetchTranscript();
  }, [videoId, transcriptRefetchTrigger, fetchTranscript]);

  const sendChat = async () => {
    const q = input.trim();
    if (!q || sending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setSending(true);
    try {
      const historyForApi = messages
        .slice(-CHAT_MAX_ROUNDS * 2)
        .map((m) => ({ role: m.role, content: m.content }));
      const body = {
        query: q,
        scope: chatScope,
        category: chatScope === 'category' ? chatCategory : undefined,
        video_ids: chatScope === 'selected' && videoId ? [videoId] : undefined,
        dashboard_id: dashboardId,
        history: historyForApi,
      };
      const r = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      const sources = Array.isArray(data.sources) && data.sources.length > 0 ? data.sources : undefined;
      setMessages((m) => [...m, { role: 'assistant', content: data.answer || data.detail || t(lang, 'requestFailed'), sources }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `${t(lang, 'error')}: ${e.message}` }]);
    } finally {
      setSending(false);
    }
  };

  const rawText = transcript?.transcript || '';
  const needsTranslation = transcriptViewMode === 'zh' || transcriptViewMode === 'bilingual';
  const hasContent = rawText && rawText.length > 50 && !rawText.includes('NO TRANSCRIPT');

  const fallbackFullTranslate = useCallback(() => {
    apiFetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rawText, target: 'zh' }),
    })
      .then((r) => r.json())
      .then((d) => {
        const full = (d.translated || '').trim();
        setTranslatedZh(full);
        const paras = splitIntoParagraphs(rawText);
        const transParas = splitIntoParagraphs(full);
        if (transParas.length >= paras.length) {
          setTranslatedParas(transParas.slice(0, paras.length));
        } else if (transParas.length > 1) {
          setTranslatedParas(transParas);
        } else if (full) {
          const n = paras.length;
          const size = Math.ceil(full.length / n);
          const chunks = [];
          for (let i = 0; i < n; i++) {
            chunks.push(full.slice(i * size, (i + 1) * size).trim());
          }
          setTranslatedParas(chunks);
        } else {
          setTranslatedParas([]);
        }
      })
      .catch(() => {});
  }, [rawText]);

  const requestTranslation = useCallback(() => {
    if (!hasContent || loadingTranslate) return;
    const needBilingual = transcriptViewMode === 'bilingual';
    const needZh = transcriptViewMode === 'zh';
    if (needBilingual && translatedParas != null) return;
    if (needZh && translatedZh != null) return;
    setLoadingTranslate(true);
    if (needBilingual) {
      const paras = splitIntoParagraphs(rawText);
      apiFetch('/api/translate-paragraphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paragraphs: paras }),
      })
        .then((r) => r.json())
        .then((d) => {
          const arr = Array.isArray(d.translated) ? d.translated : [];
          if (arr.length >= paras.length) {
            setTranslatedParas(arr.slice(0, paras.length));
            setTranslatedZh(arr.join('\n\n'));
          } else if (arr.length > 0) {
            setTranslatedParas(arr);
            setTranslatedZh(arr.join('\n\n'));
          } else {
            fallbackFullTranslate();
          }
        })
        .catch(() => fallbackFullTranslate())
        .finally(() => setLoadingTranslate(false));
    } else {
      apiFetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText, target: 'zh' }),
      })
        .then((r) => r.json())
        .then((d) => {
          setTranslatedZh(d.translated || '');
        })
        .catch(() => {})
        .finally(() => setLoadingTranslate(false));
    }
  }, [hasContent, translatedZh, translatedParas, loadingTranslate, rawText, transcriptViewMode]);

  useEffect(() => {
    if (!hasContent || !needsTranslation || loadingTranslate) return;
    if (transcriptViewMode === 'bilingual' && translatedParas != null) return;
    if (transcriptViewMode === 'zh' && translatedZh != null) return;
    requestTranslation();
  }, [videoId, hasContent, needsTranslation, transcriptViewMode, translatedZh, translatedParas, loadingTranslate, requestTranslation]);

  const getTranscriptForExport = (langMode) => {
    if (!rawText) return '';
    if (langMode === 'original' || langMode === 'en') return rawText;
    if (langMode === 'zh') return translatedZh || rawText;
    if (langMode === 'bilingual') {
      const origParas = splitIntoParagraphs(rawText);
      const transArr = Array.isArray(translatedParas) ? translatedParas : [];
      return origParas.map((o, i) => (transArr[i] ? `${o}\n【中】${transArr[i]}` : o)).join('\n\n');
    }
    return rawText;
  };

  const handleExportTranscript = (format, langMode) => {
    const text = getTranscriptForExport(langMode);
    if (!text) return;
    const title = (selectedVideo?.Title || 'transcript').replace(/[^\w\s\u4e00-\u9fa5-]/g, '').slice(0, 50);
    const ext = format === 'md' ? 'md' : 'txt';
    const content = format === 'md' ? `# ${selectedVideo?.Title || 'Transcript'}\n\n${text}` : text;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const formatParagraphWithHighlightAndTimestamps = (text) => {
    if (!text || typeof text !== 'string') return text;
    let out = text;
    const url = selectedVideo?.URL || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
    if (url && /\d{1,2}:\d{2}/.test(out)) {
      out = out.replace(/(?:\[)?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\])?/g, (m, h, min, sec) => {
        const s = (parseInt(h, 10) || 0) * 3600 + (parseInt(min, 10) || 0) * 60 + (parseInt(sec, 10) || 0);
        const href = `${url}${url.includes('?') ? '&' : '?'}t=${s}`;
        return `<a href="${href}" target="_blank" rel="noopener" class="text-[var(--accent)] hover:underline">${m}</a>`;
      });
    }
    if (transcriptSearch && transcriptSearch.trim()) {
      const esc = transcriptSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(${esc})`, 'gi'), '<mark class="bg-amber-500/40 rounded px-0.5">$1</mark>');
    }
    return out;
  };

  const renderParagraph = (content) => {
    const html = formatParagraphWithHighlightAndTimestamps(String(content));
    if (html !== content || transcriptSearch || /\d{1,2}:\d{2}/.test(content)) {
      return <span dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return content;
  };

  const renderTranscriptContent = () => {
    if (!rawText) return <p className="text-[var(--muted)]">{t(lang, 'noTranscript')}</p>;
    if (transcriptViewMode === 'original' || transcriptViewMode === 'en') {
      const paras = splitIntoParagraphs(rawText);
      return paras.map((p, i) => (
        <div key={i} className="mb-3 last:mb-0 flex items-start gap-2 group">
          <p className="flex-1 leading-relaxed">{renderParagraph(p)}</p>
          <button onClick={() => navigator.clipboard?.writeText(p)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--accent)]/20 text-[var(--muted)]" title={t(lang, 'copyToClipboard')}><Copy size={12} /></button>
        </div>
      ));
    }
    if (transcriptViewMode === 'zh') {
      if (loadingTranslate) return (
        <div className="flex flex-col items-center justify-center py-8 text-[var(--muted)]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)] mb-3"></div>
          <p>{t(lang, 'loading')}</p>
          <p className="text-xs mt-2">内容较多，翻译需要一些时间，请耐心等待...</p>
        </div>
      );
      const text = translatedZh || rawText;
      const paras = splitIntoParagraphs(text);
      return paras.map((p, i) => (
        <div key={i} className="mb-3 last:mb-0 flex items-start gap-2 group">
          <p className="flex-1 leading-relaxed">{renderParagraph(p)}</p>
          <button onClick={() => navigator.clipboard?.writeText(p)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--accent)]/20 text-[var(--muted)]" title={t(lang, 'copyToClipboard')}><Copy size={12} /></button>
        </div>
      ));
    }
    if (transcriptViewMode === 'bilingual') {
      if (loadingTranslate) return (
        <div className="flex flex-col items-center justify-center py-8 text-[var(--muted)]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)] mb-3"></div>
          <p>{t(lang, 'loading')}</p>
          <p className="text-xs mt-2">内容较多，翻译需要一些时间，请耐心等待...</p>
        </div>
      );
      const origParas = splitIntoParagraphs(rawText);
      const transArr = Array.isArray(translatedParas) ? translatedParas : [];
      return origParas.map((orig, i) => (
        <div key={i} className="mb-4 last:mb-0">
          <div className="flex items-start gap-2 group">
            <p className="flex-1 mb-1.5 leading-relaxed">{renderParagraph(orig)}</p>
            <button onClick={() => navigator.clipboard?.writeText(orig)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--accent)]/20 text-[var(--muted)]" title={t(lang, 'copyToClipboard')}><Copy size={12} /></button>
          </div>
          {transArr[i] && (
            <div className="flex items-start gap-2 group">
              <p className="flex-1 text-[var(--muted)] text-sm leading-relaxed pl-2 border-l-2 border-[var(--accent)]/40">{renderParagraph(transArr[i])}</p>
              <button onClick={() => navigator.clipboard?.writeText(transArr[i])} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--accent)]/20 text-[var(--muted)]" title={t(lang, 'copyToClipboard')}><Copy size={12} /></button>
            </div>
          )}
        </div>
      ));
    }
    return null;
  };

  const speakText = (text, lang) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 5000));
    u.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
    u.rate = 0.9;
    u.onend = () => setTtsPlaying(false);
    u.onerror = () => setTtsPlaying(false);
    window.speechSynthesis.speak(u);
    setTtsPlaying(true);
  };

  const handleTtsPlay = () => {
    if (ttsPlaying) {
      window.speechSynthesis?.cancel();
      setTtsPlaying(false);
      return;
    }
    const textToSpeak = ttsLang === 'zh' ? (translatedZh || '') : rawText;
    if (!textToSpeak || textToSpeak.includes('NO TRANSCRIPT')) return;
    if (ttsLang === 'zh' && !translatedZh && hasContent) {
      setTranscriptViewMode('zh');
      setLoadingTranslate(true);
      apiFetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: rawText, target: 'zh' }) })
        .then((r) => r.json())
        .then((d) => {
          const tr = d?.translated || '';
          setTranslatedZh(tr);
          if (tr) speakText(tr, 'zh');
        })
        .catch(() => {})
        .finally(() => setLoadingTranslate(false));
    } else {
      speakText(textToSpeak, ttsLang);
    }
  };

  return (
    <aside className="w-full h-full flex flex-col border-l border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* 切换：字幕总结 / 智能问答 */}
      <div className="shrink-0 flex border-b border-[var(--border)]">
        <button
          onClick={() => setRightTab('transcript')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            rightTab === 'transcript'
              ? 'bg-[var(--accent)]/20 text-[var(--accent)] border-b-2 border-[var(--accent)]'
              : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-white/5'
          }`}
        >
          <FileText size={16} />
          {t(lang, 'transcriptSummary')}
        </button>
        <button
          onClick={() => setRightTab('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            rightTab === 'chat'
              ? 'bg-[var(--accent)]/20 text-[var(--accent)] border-b-2 border-[var(--accent)]'
              : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-white/5'
          }`}
        >
          <MessageSquare size={16} />
          {t(lang, 'aiChat')}
        </button>
      </div>

      {/* 字幕面板 */}
      <div className={`flex-1 min-h-0 flex flex-col overflow-hidden ${rightTab !== 'transcript' ? 'hidden' : ''}`}>
        <div className="flex items-center justify-between gap-2 p-4 pb-2 text-[var(--muted)] text-sm shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={16} />
            {t(lang, 'transcriptSummary')}
          </div>
          {selectedVideo && (
            <button
              type="button"
              onClick={() => fetchTranscript()}
              disabled={loadingTranscript}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
              title={t(lang, 'refreshTranscript')}
            >
              <RefreshCw size={12} className={loadingTranscript ? 'animate-spin' : ''} />
              {t(lang, 'refreshTranscript')}
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-4 pb-4">
        {!selectedVideo ? (
          <p className="text-sm text-[var(--muted)]">{t(lang, 'clickVideoForTranscript')}</p>
        ) : loadingTranscript ? (
          <p className="text-sm text-[var(--muted)]">{t(lang, 'loading')}</p>
        ) : transcript ? (
          <div className="space-y-4">
              {loadingSummary ? (
                <p className="text-sm text-[var(--muted)] flex items-center gap-2">
                  <Sparkles size={14} className="animate-pulse" /> {t(lang, 'generatingSummary')}
                </p>
              ) : summary ? (
                <div className="p-3 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-[var(--accent)]">📋 {t(lang, 'summary')}</span>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(summary); }}
                      className="p-1.5 rounded hover:bg-[var(--accent)]/20 text-[var(--accent)]"
                      title={t(lang, 'copyToClipboard')}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{summary}</p>
                </div>
              ) : transcript.transcript?.includes('NO TRANSCRIPT') ? (
                <p className="text-sm text-amber-500">{t(lang, 'noTranscript')}</p>
              ) : null}
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <input
                    type="text"
                    placeholder={t(lang, 'transcriptSearchPlaceholder')}
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    className="px-2 py-1 text-xs bg-[var(--bg)] border border-[var(--border)] rounded w-28"
                  />
                  <span className="text-xs font-medium text-[var(--muted)]">{t(lang, 'detailedTranscript')}</span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(getTranscriptForExport(transcriptViewMode))}
                    className="p-1.5 rounded hover:bg-[var(--accent)]/20 text-[var(--muted)] hover:text-[var(--accent)]"
                    title={t(lang, 'copyToClipboard')}
                  >
                    <Copy size={14} />
                  </button>
                  <div className="relative group">
                    <button
                      className="p-1.5 rounded hover:bg-[var(--accent)]/20 text-[var(--muted)] hover:text-[var(--accent)]"
                      title={t(lang, 'exportTranscript')}
                    >
                      <Download size={14} />
                    </button>
                    <div className="hidden group-hover:block absolute left-0 top-full mt-1 z-10 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg p-2 min-w-[160px]">
                      <div className="text-xs text-[var(--muted)] mb-1">{t(lang, 'exportTranscript')}</div>
                      <div className="grid grid-cols-2 gap-0.5 text-xs">
                        {['original', 'zh', 'bilingual'].map((lm) => (
                          ['txt', 'md'].map((fmt) => (
                            <button key={`${lm}-${fmt}`} onClick={() => handleExportTranscript(fmt, lm)} className="px-2 py-1 text-left hover:bg-[var(--bg)] rounded">
                              {fmt.toUpperCase()} · {lm === 'original' ? t(lang, 'transcriptEn') : lm === 'zh' ? t(lang, 'transcriptZh') : t(lang, 'transcriptBilingual')}
                            </button>
                          ))
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {['original', 'zh', 'bilingual'].map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          setTranscriptViewMode(m);
                          if ((m === 'zh' || m === 'bilingual') && hasContent && !loadingTranslate) {
                            requestTranslation();
                          }
                        }}
                        className={`px-2 py-1 text-xs rounded ${
                          transcriptViewMode === m
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--accent)]'
                        }`}
                      >
                        {m === 'original' ? t(lang, 'transcriptEn') : m === 'zh' ? t(lang, 'transcriptZh') : t(lang, 'transcriptBilingual')}
                      </button>
                    ))}
                  </div>
                  {hasContent && (
                    <div className="flex items-center gap-2 ml-auto">
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="radio" name="tts" checked={ttsLang === 'en'} onChange={() => setTtsLang('en')} />
                        {t(lang, 'transcriptEn')}
                      </label>
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="radio" name="tts" checked={ttsLang === 'zh'} onChange={() => setTtsLang('zh')} />
                        {t(lang, 'transcriptZh')}
                      </label>
                      <button
                        onClick={handleTtsPlay}
                        className="p-1.5 rounded bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30 text-[var(--accent)]"
                        title={t(lang, 'ttsPlay')}
                      >
                        {ttsPlaying ? <Square size={14} /> : <Volume2 size={14} />}
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-sm leading-relaxed p-3 rounded bg-[var(--bg)] border border-[var(--border)]">
                  {renderTranscriptContent()}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-amber-500">{t(lang, 'transcriptNotFound')}</p>
              {transcriptError && (
                <p className="text-xs text-[var(--muted)] break-all">{transcriptError}</p>
              )}
              <p className="text-xs text-[var(--muted)]">
                {transcriptError && (transcriptError.includes('Failed to fetch') || transcriptError.includes('fetch'))
                  ? t(lang, 'transcriptBackendHint')
                  : t(lang, 'transcriptRefreshHint')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 智能问答面板 */}
      <div className={`flex-1 min-h-0 flex flex-col overflow-hidden p-4 ${rightTab !== 'chat' ? 'hidden' : ''}`}>
        <div className="flex items-center justify-between gap-2 mb-3 text-[var(--muted)] text-sm shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} />
            {t(lang, 'aiChat')}
            <span className="text-xs opacity-75">({t(lang, 'chatMaxRounds', { n: CHAT_MAX_ROUNDS })})</span>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-red-500/50 hover:text-red-400"
              title={t(lang, 'clearChat')}
            >
              <Trash2 size={14} />
              {t(lang, 'clearChat')}
            </button>
          )}
        </div>
        <div className="flex gap-2 mb-2 shrink-0">
            <select
              value={chatScope}
              onChange={(e) => setChatScope(e.target.value)}
              className="px-2 py-1.5 text-xs bg-[var(--bg)] border border-[var(--border)] rounded"
            >
              <option value="all">{t(lang, 'scopeAll')}</option>
              <option value="selected">{t(lang, 'scopeCurrent')}</option>
              <option value="category">{t(lang, 'scopeCategory')}</option>
              <option value="free">{t(lang, 'scopeFree')}</option>
            </select>
            {chatScope === 'category' && (
              <select
                value={chatCategory}
                onChange={(e) => setChatCategory(e.target.value)}
                className="px-2 py-1.5 text-xs bg-[var(--bg)] border border-[var(--border)] rounded"
              >
                <option value="S">{t(lang, 'rankSLevel')}</option>
                <option value="A">{t(lang, 'rankALevel')}</option>
                <option value="B">{t(lang, 'rankBLevel')}</option>
              </select>
            )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto space-y-2 mb-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`p-2 rounded text-sm ${
                  m.role === 'user'
                    ? 'bg-[var(--accent)]/20 ml-4'
                    : 'bg-[var(--bg)] border border-[var(--border)] mr-4'
                }`}
              >
                <span className="text-[var(--muted)] text-xs">{m.role === 'user' ? t(lang, 'me') : t(lang, 'ai')}</span>
                <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
                {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[var(--border)]">
                    <span className="text-xs text-[var(--muted)]">{t(lang, 'sources')}: </span>
                    <span className="flex flex-wrap gap-x-2 gap-y-1">
                      {m.sources.map((s, j) => (
                        <button
                          key={j}
                          type="button"
                          onClick={() => onSourceVideoClick?.(s.video_id)}
                          className={`text-xs hover:underline ${s.video_id === videoId ? 'text-[var(--accent)] font-medium' : 'text-[var(--accent)] hover:text-[var(--accent-hover)]'}`}
                        >
                          {s.title || s.video_id}{s.video_id === videoId ? ` (${lang === 'zh' ? '当前' : 'current'})` : ''}
                        </button>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            ))}
        </div>
        <div className="flex flex-wrap gap-1 mb-2 shrink-0">
          {(lang === 'zh' ? ['总结要点', '提取金句', '核心观点有哪些？', '产品功能有哪些？', '客户案例概览'] : ['Summarize key points', 'Extract key quotes', 'What are the main arguments?', 'What product features?', 'Customer case overview']).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setInput(q)}
              className="px-2 py-1 text-xs rounded bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--muted)] hover:text-[var(--text)]"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex gap-2 shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
              placeholder={t(lang, 'askPlaceholder')}
              className="flex-1 px-3 py-2 text-sm bg-[var(--bg)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <button
              onClick={sendChat}
              disabled={sending || !input.trim()}
              className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 rounded-lg"
            >
              <Send size={16} />
            </button>
        </div>
      </div>
    </aside>
  );
}
