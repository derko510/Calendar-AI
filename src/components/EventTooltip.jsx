import { format, isSameDay } from 'date-fns';
import { Clock, MapPin } from 'lucide-react';
import { getEventTone } from '../utils/eventColors';

const WIDTH = 300;
const GAP = 8;
const EDGE = 12;

// Google descriptions are HTML; keep line breaks, drop tags, and collapse runs of blank lines
const descriptionText = (html = '') => {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  doc.querySelectorAll('p, div, li').forEach(block => block.append('\n'));
  const lines = (doc.body.textContent || '').split('\n').map(line => line.trim());
  return lines
    .filter((line, i) => line || (i > 0 && lines[i - 1]))
    .join('\n')
    .trim();
};

const whenText = (event) => {
  const start = new Date(event.start?.dateTime || event.start?.date || event.start);
  if (Number.isNaN(start.getTime())) return '';
  if (!event.start?.dateTime) return `${format(start, 'EEE, MMM d')} · All day`;
  const end = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(start.getTime() + 60 * 60 * 1000);
  const endText = isSameDay(start, end) ? format(end, 'h:mm a') : format(end, 'EEE h:mm a');
  return `${format(start, 'EEE, MMM d')} · ${format(start, 'h:mm a')} – ${endText}`;
};

/**
 * Hover card for a calendar event. `hovered` is { event, rect } from the event element, or null.
 */
const EventTooltip = ({ hovered }) => {
  if (!hovered) return null;
  const { event, rect } = hovered;

  // Above the event when there's room, otherwise below; always inside the viewport
  const above = rect.top > 220;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - WIDTH / 2, EDGE),
    window.innerWidth - WIDTH - EDGE
  );
  const top = above ? rect.top - GAP : rect.bottom + GAP;
  const description = descriptionText(event.description);

  return (
    <div
      role="tooltip"
      className="fixed z-50 pointer-events-none rounded-xl border border-line bg-surface shadow-[0_12px_32px_-12px_rgba(29,28,26,0.35)] px-3.5 py-3 text-ink"
      style={{ left, top, width: WIDTH, transform: above ? 'translateY(-100%)' : undefined }}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${getEventTone(event).dot}`} />
        <p className="text-[13.5px] font-medium leading-snug line-clamp-2">
          {event.summary || 'Untitled event'}
        </p>
      </div>

      <div className="mt-2 space-y-1 pl-4 text-xs text-ink-soft">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 shrink-0 text-muted" />
          <span>{whenText(event)}</span>
        </div>
        {event.location && (
          <div className="flex items-start gap-1.5">
            <MapPin className="mt-[2px] h-3 w-3 shrink-0 text-muted" />
            <span className="line-clamp-2 break-words">{event.location}</span>
          </div>
        )}
      </div>

      {description && (
        <p className="mt-2.5 border-t border-line pt-2.5 pl-4 text-xs leading-relaxed text-muted whitespace-pre-line line-clamp-4 break-words">
          {description}
        </p>
      )}
    </div>
  );
};

export default EventTooltip;
