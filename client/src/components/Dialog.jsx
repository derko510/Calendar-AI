import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DialogGuardContext } from '../hooks/useDialogGuard';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: traps Tab focus, closes on Esc or backdrop click, and gives focus back
 * to whatever was focused before it opened. Renders as a bottom sheet on phones.
 * A form inside can mark itself dirty (hooks/useDialogGuard); then Esc / backdrop ask
 * "Discard changes?" inline instead of closing.
 */
const Dialog = ({ open, onClose, labelledBy, children, className = '', initialFocusRef }) => {
  const panelRef = useRef(null);
  const keepRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dirtyRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const confirmingRef = useRef(false);
  confirmingRef.current = confirming;

  const guard = useMemo(() => ({
    setDirty: (dirty) => {
      dirtyRef.current = dirty;
      if (!dirty) setConfirming(false);
    }
  }), []);

  const requestClose = () => {
    if (dirtyRef.current) setConfirming(true);
    else onCloseRef.current?.();
  };
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  const discard = () => {
    dirtyRef.current = false;
    setConfirming(false);
    onCloseRef.current?.();
  };

  useEffect(() => {
    if (confirming) keepRef.current?.focus({ preventScroll: true });
  }, [confirming]);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const panel = panelRef.current;
    const first = initialFocusRef?.current || panel?.querySelector('[data-autofocus]') || panel?.querySelector(FOCUSABLE) || panel;
    first?.focus({ preventScroll: true });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        if (confirmingRef.current) setConfirming(false); // Esc on the prompt = keep editing
        else requestCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) { e.preventDefault(); return; }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === firstItem || !panel.contains(document.activeElement))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      dirtyRef.current = false;
      setConfirming(false);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus?.({ preventScroll: true });
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" data-dialog-open>
      <div className="absolute inset-0 bg-ink/25 animate-[fadeIn_120ms_ease-out]" onClick={() => requestCloseRef.current()} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`relative w-full sm:max-w-md max-h-[88dvh] overflow-y-auto scroll-quiet bg-surface border border-line rounded-t-2xl sm:rounded-2xl shadow-[0_24px_48px_-16px_rgba(29,28,26,0.35)] focus:outline-none animate-[riseIn_160ms_ease-out] ${className}`}
      >
        {confirming && (
          <div role="alertdialog" aria-label="Discard changes?" className="sticky top-0 z-10 px-3 pt-3">
            <div className="rounded-xl border border-accent/30 bg-accent-soft px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-sm">
              <p className="text-sm font-medium text-[#6B2E17]">Discard unsaved changes?</p>
              <div className="flex gap-2">
                <button ref={keepRef} type="button" onClick={() => setConfirming(false)} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper transition-colors">
                  Keep editing
                </button>
                <button type="button" onClick={discard} className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:brightness-95">
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
        <DialogGuardContext.Provider value={guard}>
          {children}
        </DialogGuardContext.Provider>
      </div>
    </div>,
    document.body
  );
};

export default Dialog;
