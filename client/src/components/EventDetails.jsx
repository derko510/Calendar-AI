import { useState, useEffect } from 'react';
import { X, Clock, MapPin, AlignLeft, Video, ExternalLink, Pencil, Trash2, CalendarDays, Repeat, Users, Loader2, Lock } from 'lucide-react';
import LinkifiedText from './LinkifiedText';
import EventForm from './EventForm';
import { getEventTone } from '../utils/eventColors';
import { formatEventRange, getEventTitle, getJoinLinks, googleMapsUrl, isEventNow, isAllDayEvent } from '../utils/eventUtils';
import { splitLinks, safeHref } from '../utils/linkify';
import { formValuesFromEvent, buildEventChanges } from '../utils/eventForm';
import { canRsvp, getMyResponse } from '../utils/rsvp';

const Row = ({ icon, label, children }) => (
  <div className="flex gap-3 text-[14px] leading-relaxed text-ink-soft">
    <span className="mt-[3px] shrink-0 text-muted [&>svg]:w-4 [&>svg]:h-4" aria-hidden="true">{icon}</span>
    <div className="min-w-0 flex-1"><span className="sr-only">{label}: </span>{children}</div>
  </div>
);

const calendarLabel = (event) =>
  event.calendarName || event.organizer?.displayName || (event.calendarId && event.calendarId !== 'primary' ? event.calendarId : 'Primary calendar');

const responseLabel = { accepted: 'going', declined: 'declined', tentative: 'maybe', needsAction: 'no reply' };

const RSVP_OPTIONS = [['accepted', 'Yes'], ['tentative', 'Maybe'], ['declined', 'No']];

/**
 * Body of the event dialog: details view, edit form, and delete confirmation.
 * onUpdate(event, changes, { sendUpdates }) and onDelete(event, { sendUpdates }) are async and may throw.
 * onRespond(event, status) answers an invitation ('accepted' | 'tentative' | 'declined') and may throw.
 * With guests on the event, saving / deleting asks whether to email them.
 */
const EventDetails = ({ event, headingId, onClose, onUpdate, onDelete, onRespond }) => {
  const [mode, setMode] = useState('view'); // view | edit | confirmDelete
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [rsvpError, setRsvpError] = useState(null);
  const tone = getEventTone(event);
  const joinLinks = getJoinLinks(event);
  const writable = event.isWritable !== false;
  const recurring = !!(event.recurringEventId || event.recurrence);
  const htmlLink = safeHref(event.htmlLink);
  const location = (event.location || '').trim();
  const locationHasUrl = splitLinks(location).some(p => p.type === 'link');
  const attendees = (event.attendees || []).filter(a => !a.resource);
  const hasGuests = attendees.some(a => !a.self);
  // Invited to someone else's event: Google only lets the organiser (or guests, if allowed) change it
  const organiserOnly = writable && !!event.organizer && !event.organizer.self && !event.guestsCanModify;
  const canEdit = writable && !organiserOnly;
  const happeningNow = !isAllDayEvent(event) && isEventNow(event);

  // "e" edits, like Google Calendar (ignored while typing)
  useEffect(() => {
    if (mode !== 'view' || !canEdit) return undefined;
    const onKey = (e) => {
      if (e.key !== 'e' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      setMode('edit');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, canEdit]);

  if (mode === 'edit') {
    return (
      <EventForm
        heading="Edit event"
        headingId={headingId}
        initial={formValuesFromEvent(event)}
        submitLabel="Save"
        note={recurring ? 'Changes apply to this occurrence only.' : null}
        askNotify={hasGuests}
        onCancel={() => setMode('view')}
        onSubmit={async (values, options) => {
          const { changes, error: validation } = buildEventChanges(event, values);
          if (validation) throw new Error(validation);
          if (Object.keys(changes).length === 0) { setMode('view'); return; }
          await onUpdate(event, changes, options);
          setMode('view');
        }}
      />
    );
  }

  const myResponse = getMyResponse(event);
  const showRsvp = canRsvp(event);

  const handleRespond = async (status) => {
    setRsvpBusy(true);
    setRsvpError(null);
    try {
      await onRespond(event, status);
    } catch (err) {
      setRsvpError(err?.message || 'Could not update your response.');
    } finally {
      setRsvpBusy(false);
    }
  };

  const handleDelete = async (options = {}) => {
    setBusy(true);
    setError(null);
    try {
      await onDelete(event, options);
    } catch (err) {
      setError(err?.message || 'Could not delete this event.');
      setBusy(false);
    }
  };

  return (
    <div className="p-5">
      <div className="flex items-start gap-3">
        <span className={`mt-[9px] w-3 h-3 rounded-[4px] shrink-0 ${tone.dot}`} aria-hidden="true" />
        <h2 id={headingId} className="flex-1 min-w-0 font-serif text-[26px] leading-[1.1] text-ink break-words">
          {getEventTitle(event)}
        </h2>
        <div className="flex items-center gap-0.5 -mr-2 -mt-1 shrink-0">
          {canEdit && (
            <button type="button" onClick={() => setMode('edit')} aria-label="Edit event" title="Edit (e)" className="p-2 rounded-full text-muted hover:text-ink hover:bg-paper transition-colors">
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {writable && (
            <button type="button" onClick={() => setMode('confirmDelete')} aria-label="Delete event" title="Delete" className="p-2 rounded-full text-muted hover:text-accent hover:bg-accent-soft transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className="p-2 rounded-full text-muted hover:text-ink hover:bg-paper transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <Row icon={<Clock />} label="When">
          <span>{formatEventRange(event)}</span>
          {happeningNow && <span className="ml-2 inline-block rounded-full bg-accent-soft px-2 py-px text-[11px] font-medium text-[#6B2E17] align-middle">Happening now</span>}
          {recurring && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted"><Repeat className="w-3 h-3" aria-hidden="true" />Repeating event</span>
          )}
        </Row>

        {joinLinks.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-7">
            {joinLinks.map((link, i) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={i === 0
                  ? 'inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft transition-colors'
                  : 'inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-2 text-sm font-medium text-ink-soft hover:bg-paper transition-colors'}
              >
                {i === 0 ? <Video className="w-4 h-4" aria-hidden="true" /> : <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />}
                {link.label}
              </a>
            ))}
          </div>
        )}

        {location && (
          <Row icon={<MapPin />} label="Location">
            {locationHasUrl ? (
              <LinkifiedText text={location} />
            ) : (
              <a href={googleMapsUrl(location)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-[#CFC7B8] hover:decoration-current [overflow-wrap:anywhere]" title="Open in Google Maps">
                {location}
              </a>
            )}
          </Row>
        )}

        {event.description && (
          <Row icon={<AlignLeft />} label="Description">
            <div className="whitespace-pre-wrap [overflow-wrap:anywhere] max-h-64 overflow-y-auto scroll-quiet">
              <LinkifiedText text={event.description} />
            </div>
          </Row>
        )}

        {attendees.length > 0 && (
          <Row icon={<Users />} label="Guests">
            <div>{attendees.length} guest{attendees.length === 1 ? '' : 's'}</div>
            <ul className="mt-0.5 space-y-0.5 text-[13px] text-muted">
              {attendees.slice(0, 8).map(a => (
                <li key={a.email} className="truncate">
                  {a.displayName || a.email}{a.self ? ' (you)' : ''}
                  {a.responseStatus && <span className="text-muted"> · {responseLabel[a.responseStatus] || a.responseStatus}</span>}
                </li>
              ))}
              {attendees.length > 8 && <li>and {attendees.length - 8} more</li>}
            </ul>
          </Row>
        )}

        {showRsvp && (
          <div className="pl-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[14px] text-ink-soft">Going?</span>
              {RSVP_OPTIONS.map(([status, label]) => {
                const selected = myResponse === status;
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={selected}
                    disabled={rsvpBusy}
                    onClick={() => handleRespond(status)}
                    className={selected
                      ? 'rounded-full bg-ink px-3.5 py-1.5 text-sm font-medium text-paper hover:bg-ink-soft disabled:opacity-50 transition-colors'
                      : 'rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper disabled:opacity-50 transition-colors'}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {myResponse === 'needsAction' && <p className="mt-1.5 text-[13px] text-muted">You haven’t responded yet</p>}
            {rsvpError && <p role="alert" className="mt-1.5 text-sm text-[#6B2E17] font-medium">{rsvpError}</p>}
          </div>
        )}

        <Row icon={<CalendarDays />} label="Calendar">
          <span>{calendarLabel(event)}</span>
          {!writable && <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted"><Lock className="w-3 h-3" aria-hidden="true" />Read-only</span>}
          {organiserOnly && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted"><Lock className="w-3 h-3" aria-hidden="true" />Only the organiser can change this event</span>
          )}
        </Row>
      </div>

      {mode === 'confirmDelete' && (
        <div className="mt-5 rounded-xl border border-accent/30 bg-accent-soft/60 p-3.5" role="alertdialog" aria-label="Confirm delete">
          <p className="text-sm text-[#6B2E17]">
            Delete {recurring ? 'this occurrence of ' : ''}“{getEventTitle(event)}”? This can’t be undone.
          </p>
          {hasGuests && <p className="mt-1 text-sm text-[#6B2E17]">Email the guests that it’s cancelled?</p>}
          {error && <p role="alert" className="mt-1.5 text-sm text-[#6B2E17] font-medium">{error}</p>}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => { setMode('view'); setError(null); }} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper transition-colors">
              Keep it
            </button>
            {hasGuests && (
              <button type="button" onClick={() => handleDelete({ sendUpdates: 'none' })} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-surface px-3.5 py-1.5 text-sm font-medium text-[#6B2E17] hover:bg-paper disabled:opacity-50">
                Delete, don’t notify
              </button>
            )}
            <button type="button" data-autofocus onClick={() => handleDelete(hasGuests ? { sendUpdates: 'all' } : {})} disabled={busy} autoFocus className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {hasGuests ? 'Delete & notify' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {htmlLink && (
        <div className="mt-5 pt-4 border-t border-line">
          <a href={htmlLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            Open in Google Calendar
          </a>
        </div>
      )}
    </div>
  );
};

export default EventDetails;
