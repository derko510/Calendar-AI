import { useState, useId } from 'react';
import { Loader2 } from 'lucide-react';
import { useDialogDirty } from '../hooks/useDialogGuard';

const inputBase = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted focus:border-[#CFC7B8] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';
// 16px on phones: iOS Safari zooms into any focused input smaller than that
const inputClass = `${inputBase} text-[16px] sm:text-[14px]`;
const labelClass = 'block text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-1';

/**
 * Create / edit form. `initial` comes from utils/eventForm (formValuesFromRange / formValuesFromEvent).
 * onSubmit(values, { sendUpdates }) may throw; its message is shown inline.
 * askNotify: the event has guests, so saving first asks whether to email them (sendUpdates all | none).
 * Unsaved changes are reported to the enclosing Dialog, which then confirms before Esc / backdrop close.
 */
const EventForm = ({ initial, heading, headingId, submitLabel = 'Save', onSubmit, onCancel, note, askNotify = false }) => {
  const [values, setValues] = useState(initial);
  const [baseline] = useState(() => JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notifyStep, setNotifyStep] = useState(false);
  const uid = useId();
  const dirty = JSON.stringify(values) !== baseline;
  useDialogDirty(dirty);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues(prev => {
      const next = { ...prev, [key]: value };
      // Moving the start date carries the end date along (keeps multi-day spans intact)
      if (key === 'startDate' && prev.startDate && prev.endDate && value) {
        const shift = new Date(`${value}T00:00:00`) - new Date(`${prev.startDate}T00:00:00`);
        const end = new Date(new Date(`${prev.endDate}T00:00:00`).getTime() + shift);
        if (!Number.isNaN(end.getTime())) {
          const pad = (n) => String(n).padStart(2, '0');
          next.endDate = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
        }
      }
      // Unticking "All day" on an all-day event: give it a sensible hour instead of midnight–midnight
      if (key === 'allDay' && !value && prev.startTime === prev.endTime) {
        next.startTime = '09:00';
        next.endTime = '10:00';
      }
      // Moving the start time keeps the duration
      if (key === 'startTime' && prev.startTime && prev.endTime && value && prev.startDate === prev.endDate) {
        const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        const duration = toMin(prev.endTime) - toMin(prev.startTime);
        if (duration > 0) {
          const endMin = toMin(value) + duration;
          if (endMin < 24 * 60) next.endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
        }
      }
      return next;
    });
  };

  const submit = async (options = {}) => {
    if (saving) return;
    setNotifyStep(false);
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values, options);
    } catch (err) {
      setError(err?.message || 'Something went wrong.');
      setSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (saving) return;
    if (askNotify && dirty) { setNotifyStep(true); return; }
    submit();
  };

  const onKeyDown = (e) => {
    // Ctrl/Cmd+Enter saves from anywhere in the form, including the description
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
  };

  return (
    <form onSubmit={handleSubmit} onKeyDown={onKeyDown} className="p-5 space-y-3.5" noValidate>
      <h2 id={headingId} className="font-serif text-[26px] leading-none text-ink">{heading}</h2>
      <div>
        <label htmlFor={`${uid}-title`} className="sr-only">Title</label>
        <input
          id={`${uid}-title`}
          data-autofocus
          autoFocus
          type="text"
          value={values.title}
          onChange={set('title')}
          placeholder="Add title"
          className={`${inputBase} text-[16px] font-medium`}
          autoComplete="off"
        />
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-ink-soft select-none cursor-pointer">
        <input type="checkbox" checked={values.allDay} onChange={set('allDay')} className="h-4 w-4 accent-[#C4502B]" />
        All day
      </label>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor={`${uid}-sd`} className={labelClass}>Starts</label>
          <input id={`${uid}-sd`} type="date" value={values.startDate} onChange={set('startDate')} className={inputClass} required />
        </div>
        {!values.allDay ? (
          <div>
            <label htmlFor={`${uid}-st`} className={labelClass}>&nbsp;<span className="sr-only">Start time</span></label>
            <input id={`${uid}-st`} type="time" step={300} value={values.startTime} onChange={set('startTime')} className={inputClass} required />
          </div>
        ) : <div />}
        <div>
          <label htmlFor={`${uid}-ed`} className={labelClass}>Ends</label>
          <input id={`${uid}-ed`} type="date" value={values.endDate} min={values.startDate} onChange={set('endDate')} className={inputClass} required />
        </div>
        {!values.allDay ? (
          <div>
            <label htmlFor={`${uid}-et`} className={labelClass}>&nbsp;<span className="sr-only">End time</span></label>
            <input id={`${uid}-et`} type="time" step={300} value={values.endTime} onChange={set('endTime')} className={inputClass} required />
          </div>
        ) : <div />}
      </div>

      <div>
        <label htmlFor={`${uid}-loc`} className={labelClass}>Location or link</label>
        <input id={`${uid}-loc`} type="text" value={values.location} onChange={set('location')} placeholder="Address, or a Meet / Zoom link" className={inputClass} autoComplete="off" />
      </div>
      <div>
        <label htmlFor={`${uid}-desc`} className={labelClass}>Description</label>
        <textarea id={`${uid}-desc`} rows={3} value={values.description} onChange={set('description')} placeholder="Notes, links…" className={`${inputClass} resize-y min-h-[72px]`} />
      </div>

      {note && <p className="text-xs text-muted">{note}</p>}
      {error && <p role="alert" className="text-sm text-[#6B2E17] border-l-2 border-accent pl-2.5">{error}</p>}

      {notifyStep ? (
        <div role="group" aria-label="Notify guests?" className="rounded-xl border border-line bg-paper p-3">
          <p className="text-sm text-ink">Email the guests about this change?</p>
          <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => setNotifyStep(false)} className="rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-ink hover:bg-surface transition-colors">
              Back
            </button>
            <button type="button" onClick={() => submit({ sendUpdates: 'none' })} className="rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper transition-colors">
              Don’t send
            </button>
            <button type="button" autoFocus onClick={() => submit({ sendUpdates: 'all' })} className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-paper hover:bg-ink-soft transition-colors">
              Send
            </button>
          </div>
        </div>
      ) : (
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-paper hover:bg-ink-soft disabled:opacity-50 transition-colors">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {submitLabel}
        </button>
      </div>
      )}
    </form>
  );
};

export default EventForm;
