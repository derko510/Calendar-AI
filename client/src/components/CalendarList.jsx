import { useEffect, useId, useRef, useState } from 'react';
import { Layers, Lock } from 'lucide-react';
import { getCalendarTone } from '../utils/eventColors';

/**
 * Compact "Calendars" menu: one checkbox per calendar with its colour, to show or hide it.
 * calendars: [{ id, summary, backgroundColor, writable }], visible: Set of shown ids, onToggle(id, show).
 */
const CalendarList = ({ calendars = [], visible, onToggle, className = '' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); rootRef.current?.querySelector('button')?.focus(); }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (calendars.length < 2) return null;
  const shown = calendars.filter(c => visible?.has(c.id)).length;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Calendars (${shown} of ${calendars.length} shown)`}
        title="Show or hide calendars"
        className="p-2 rounded-full text-muted hover:text-ink hover:bg-paper transition-colors"
      >
        <Layers size={17} />
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full mt-1 z-40 w-64 max-w-[calc(100vw-2rem)] max-h-[60dvh] overflow-y-auto scroll-quiet rounded-xl border border-line bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgba(29,28,26,0.35)]"
        >
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Calendars</p>
          <ul>
            {calendars.map(cal => {
              const tone = getCalendarTone(cal);
              const checked = !!visible?.has(cal.id);
              return (
                <li key={cal.id}>
                  <label className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-ink-soft cursor-pointer hover:bg-paper select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => onToggle?.(cal.id, e.target.checked)}
                      className="h-4 w-4 shrink-0 accent-[#3A3833]"
                    />
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
                    <span className="truncate flex-1 min-w-0">{cal.summary}</span>
                    {!cal.writable && <Lock className="w-3 h-3 shrink-0 text-muted" aria-label="Read-only" />}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CalendarList;
