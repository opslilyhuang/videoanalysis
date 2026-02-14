import { useState, useEffect, useCallback } from 'react';
import { FileText, MessageSquare, Sparkles, Send, Volume2, Square, Trash2, RefreshCw } from 'lucide-react';

const CHAT_MAX_ROUNDS = 10;
import { t } from '../i18n';
import { apiFetch } from '../utils/api';

function extractVideoId(url) {
  if (!url) return null;
  const m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function RightSidebar({ selectedVideo, videos, onMetaSaved, onSourceVideoClick, transcriptRefetchTrigger = 0, lang = 'zh', dashboardId = 'palantirtech' }) {
  const [transcript, setTranscript] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [transcriptViewMode, setTranscriptViewMode] = useState('original');
  const [translatedZh, setTranslatedZh] = useState(null);
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

  const videoId = selectedVideo ? extractVideoId(selectedVideo.URL) : null;

  const fetchTranscript = useCallback(() => {
    if (!videoId) return;
    setLoadingTranscript(true);
    setTranscript(null);
    setTranscriptError(null);
    setSummary(null);
    setTranslatedZh(null);
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

  const requestTranslation = useCallback(() => {
    if (!hasContent || translatedZh != null || loadingTranslate) return;
    setLoadingTranslate(true);
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
  }, [hasContent, translatedZh, loadingTranslate, rawText]);

  useEffect(() => {
    if (!hasContent || !needsTranslation || translatedZh != null || loadingTranslate) return;
    requestTranslation();
  }, [videoId, hasContent, needsTranslation, translatedZh, loadingTranslate, requestTranslation]);

  const displayTranscript = () => {
    if (!rawText) return '无内容';
    if (transcriptViewMode === 'original' || transcriptViewMode === 'en') return rawText;
    if (transcriptViewMode === 'zh') {
      if (loadingTranslate) return t(lang, 'loading');
      return translatedZh || rawText;
    }
    if (transcriptViewMode === 'bilingual') {
      if (loadingTranslate) return t(lang, 'loading');
      if (!translatedZh) return rawText;
      const origParas = rawText.split(/\n\n+/).filter(Boolean);
      const transParas = translatedZh.split(/\n\n+/).filter(Boolean);
      const pairs = origParas.map((o, i) => ({ orig: o, trans: transParas[i] || '' }));
      return pairs.map((p) => `${p.orig}\n${p.trans ? `【中】${p.trans}\n` : ''}`).join('\n');
    }
    return rawText;
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
                  <div className="text-xs font-medium text-[var(--accent)] mb-2">📋 {t(lang, 'summary')}</div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{summary}</p>
                </div>
              ) : transcript.transcript?.includes('NO TRANSCRIPT') ? (
                <p className="text-sm text-amber-500">{t(lang, 'noTranscript')}</p>
              ) : null}
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-medium text-[var(--muted)]">{t(lang, 'detailedTranscript')}</span>
                  <div className="flex gap-1">
                    {['original', 'zh', 'bilingual'].map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          setTranscriptViewMode(m);
                          if ((m === 'zh' || m === 'bilingual') && hasContent && !translatedZh && !loadingTranslate) {
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
                <div className="text-sm leading-relaxed p-3 rounded bg-[var(--bg)] border border-[var(--border)] whitespace-pre-wrap">
                  {displayTranscript()}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-amber-500">{t(lang, 'transcriptNotFound')}</p>
              {transcriptError && (
                <p className="text-xs text-[var(--muted)] break-all">{transcriptError}</p>
              )}
              <p className="text-xs text-[var(--muted)]">{t(lang, 'transcriptRefreshHint')}</p>
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
                          className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] hover:underline"
                        >
                          {s.title || s.video_id}
                        </button>
                      ))}
                    </span>
                  </div>
                )}
              </div>
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
