import { useState, useRef, useCallback, useEffect } from 'react';
import { LayoutProvider } from '../context/LayoutContext';

const MIN_LEFT = 360;
const MIN_RIGHT = 400;
const DEFAULT_LEFT_PCT = 55;

export function ResizableLayout({ left, right }) {
  const [leftPct, setLeftPct] = useState(() => {
    try {
      const s = localStorage.getItem('vedioanalysis_left_pct');
      return s ? Math.max(20, Math.min(80, Number(s))) : DEFAULT_LEFT_PCT;
    } catch {
      return DEFAULT_LEFT_PCT;
    }
  });
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    const pct = (e.clientX / window.innerWidth) * 100;
    const clamped = Math.max(20, Math.min(80, pct));
    setLeftPct(clamped);
    try {
      localStorage.setItem('vedioanalysis_left_pct', String(clamped));
    } catch {}
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <LayoutProvider leftPct={leftPct}>
    <div className="flex w-full h-screen overflow-hidden">
      <div
        className="shrink-0 h-full overflow-hidden relative flex flex-col"
        style={{ width: `${leftPct}%`, minWidth: MIN_LEFT }}
      >
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleMouseDown}
        className="w-1 shrink-0 bg-[var(--border)] hover:bg-[var(--accent)] cursor-col-resize transition-colors group"
        style={{ minWidth: 4 }}
      >
        <div className="w-1 h-full group-hover:bg-[var(--accent)]" />
      </div>
      <div
        className="flex-1 min-w-0 h-full overflow-hidden shrink-0 flex flex-col"
        style={{ minWidth: MIN_RIGHT }}
      >
        {right}
      </div>
    </div>
    </LayoutProvider>
  );
}
