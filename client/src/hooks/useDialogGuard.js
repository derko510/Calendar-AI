import { createContext, useContext, useEffect } from 'react';

// Lets a form inside <Dialog> say it has unsaved changes, so Esc / a backdrop click asks first.
export const DialogGuardContext = createContext(null);

/** Report `dirty` to the enclosing Dialog (no-op outside one). Cleared when the form unmounts. */
export const useDialogDirty = (dirty) => {
  const guard = useContext(DialogGuardContext);
  useEffect(() => {
    if (!guard) return undefined;
    guard.setDirty(dirty);
    return () => guard.setDirty(false);
  }, [guard, dirty]);
};
