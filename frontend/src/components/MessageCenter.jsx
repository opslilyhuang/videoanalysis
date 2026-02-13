import { useState, useEffect } from 'react';
import { Bell, X, RefreshCw } from 'lucide-react';
import { apiFetch } from '../utils/api';

export function MessageCenter({ onUpdateClick, lang = 'zh' }) {
  const [messages, setMessages] = useState([]);
  const [open, setOpen] = useState(false);

  const fetchMessages = async () => {
    try {
      const r = await apiFetch('/api/messages');
      if (r.ok) setMessages(await r.json());
    } catch {}
  };

  useEffect(() => {
    fetchMessages();
    const t = setInterval(fetchMessages, 60000);
    return () => clearInterval(t);
  }, []);

  const dismiss = async (id) => {
    try {
      await apiFetch(`/api/messages/${id}`, { method: 'PATCH' });
      setMessages((m) => m.filter((x) => x.id !== id));
    } catch {}
  };

  const unread = messages.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-auto bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-50">
            <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
              <span className="font-medium">消息中心</span>
              <button onClick={() => setOpen(false)} className="p-1">
                <X size={16} />
              </button>
            </div>
            <div className="p-2">
              {messages.length === 0 ? (
                <p className="text-sm text-[var(--muted)] py-4 text-center">暂无消息</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg border border-[var(--border)] mb-2 flex items-start justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{m.title}</p>
                      {m.createdAt && (
                        <p className="text-xs text-[var(--muted)] mt-0.5">
                          {new Date(m.createdAt).toLocaleString()}
                        </p>
                      )}
                      {m.type === 'new_videos' && onUpdateClick && (
                        <button
                          onClick={() => {
                            onUpdateClick(m.dashboard_id);
                            setOpen(false);
                          }}
                          className="mt-2 flex items-center gap-1 px-2 py-1 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded"
                        >
                          <RefreshCw size={12} />
                          立即更新
                        </button>
                      )}
                    </div>
                    <button onClick={() => dismiss(m.id)} className="p-1 text-[var(--muted)] hover:text-[var(--text)]">
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
