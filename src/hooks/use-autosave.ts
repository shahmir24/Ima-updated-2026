import { useCallback, useEffect, useRef } from 'react';

/** How long to wait after the last keystroke before writing a text field. */
const DEFAULT_DELAY_MS = 800;

export interface AutoSave<TPatch extends object> {
  /** Write immediately — for switches, selects and other discrete choices. */
  saveNow: (patch: TPatch) => void;
  /** Write once the user stops typing, merging patches until then. */
  saveSoon: (patch: TPatch) => void;
}

/**
 * Auto-save for a screen that has no Save button.
 *
 * Profile & Settings has no save control of any kind, and adding one would be
 * a redesign — so each control persists its own change as it is made. Patches
 * are column-scoped and merged while pending, so editing two text fields in
 * quick succession writes both rather than dropping one.
 *
 * Saves are triggered from the change handlers, never from an effect watching
 * form state. That distinction matters: an effect would also fire on the
 * initial render and on hydration, writing empty defaults over the values
 * just loaded from the database.
 */
export function useAutoSave<TPatch extends object>(
  save: (patch: TPatch) => Promise<unknown>,
  delayMs = DEFAULT_DELAY_MS
): AutoSave<TPatch> {
  const pendingRef = useRef<Partial<TPatch>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Held in a ref so a new closure each render does not restart the timer.
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const patch = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(patch).length === 0) return;

    void saveRef.current(patch as TPatch);
  }, []);

  const saveNow = useCallback(
    (patch: TPatch) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      flush();
    },
    [flush]
  );

  const saveSoon = useCallback(
    (patch: TPatch) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, delayMs);
    },
    [flush, delayMs]
  );

  // Flush whatever is pending when the screen goes away. Without this, typing
  // a name and immediately tapping Back loses the last keystrokes.
  useEffect(() => () => flush(), [flush]);

  return { saveNow, saveSoon };
}
