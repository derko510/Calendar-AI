import { format, isToday } from 'date-fns';
import { getEventsForDate } from '../utils/dateUtils';
import { getEventTone } from '../utils/eventColors';

const DayView = ({
  currentDate,
  events,
  handleEventClick,
  handleEventContextMenu,
  deletingId
}) => {
  const dayEvents = getEventsForDate(events, currentDate);
  const isTodayDate = isToday(currentDate);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 border-b border-line flex items-baseline gap-3">
        <span className={`font-serif text-5xl leading-none ${isTodayDate ? 'text-accent' : 'text-ink'}`}>
          {format(currentDate, 'd')}
        </span>
        <span className="text-sm text-muted">
          {format(currentDate, 'EEEE, MMMM yyyy')}{isTodayDate ? ' · Today' : ''}
        </span>
      </div>
      <div className="flex-1 px-6 py-4 overflow-auto scroll-quiet">
        {dayEvents.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="font-serif italic text-2xl text-muted">Nothing planned.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {dayEvents.map((event, index) => {
              const tone = getEventTone(event);
              return (
                <li
                  key={`${event.id}-${index}`}
                  className={`group flex items-start gap-5 py-4 cursor-pointer ${deletingId === event.id ? 'opacity-40 pointer-events-none' : ''}`}
                  onClick={(e) => handleEventClick(event, e)}
                  onContextMenu={(e) => handleEventContextMenu?.(event, e)}
                >
                  <div className="w-20 shrink-0 pt-0.5 text-sm text-muted">
                    {event.start?.dateTime ? format(new Date(event.start.dateTime), 'h:mm a') : 'All day'}
                  </div>
                  <span className={`mt-2 w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium text-ink group-hover:underline underline-offset-4 decoration-line">
                      {event.summary}
                    </div>
                    {event.location && (
                      <div className="mt-0.5 text-sm text-muted truncate">{event.location}</div>
                    )}
                    {event.description && (
                      <div className="mt-1 text-sm text-ink-soft/80 line-clamp-2">
                        {event.description.replace(/<[^>]*>/g, ' ')}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DayView;
