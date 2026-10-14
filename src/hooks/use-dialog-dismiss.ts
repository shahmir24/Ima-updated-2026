import { useEffect, useRef, type RefObject } from 'react';

/** Whether a keydown should close the dialog. Pure, so the rule is testable without a DOM. */
export function shouldDismissOnKey(event: Pick<KeyboardEvent, 'key' | 'defaultPrevented'>, canDismiss: boolean): boolean {
  return event.key === 'Escape' && !event.defaultPrevented && canDismiss;
}

/**
 * Where Tab should land when it would leave a focus trap: the index to move
 * to, or null to let the browser move naturally (between two controls inside).
 * `current` is -1 when focus is on the panel itself or somewhere unknown.
 */
export function nextTrapIndex(count: number, current: number, shift: boolean): number | null {
  if (count === 0) return null;
  if (current === -1) return shift ? count - 1 : 0;
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return null;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keyboard-reachable controls inside `root`, in order. Hidden ones (e.g. a desktop-only button on a phone) are skipped. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
  );
}

/**
 * Floating layers that belong to the dialog although they render elsewhere in
 * the page (Radix popovers, e.g. the date and time pickers). Focus inside them
 * is allowed; the trap must not pull it back out.
 */
const NESTED_LAYER = '[data-radix-popper-content-wrapper]';

/** True from the `lg` breakpoint: the desktop dialog. */
export const isDesktopViewport = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;

/** Each open dialog panel and the control that opened it. */
const openers = new WeakMap<Element, HTMLElement>();

/**
 * The control that is opening a dialog right now. When that control sits in
 * another dialog that is closing to make way (Quick Capture's "Add manually"
 * opening the task form), it will be gone by the time this one closes, so the
 * outer dialog's own opener ("New Task") is used instead.
 */
function currentOpener(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  const host = active.closest('[role="dialog"]');
  return (host && openers.get(host)) || active;
}

/**
 * On open, focus moves into the dialog (the panel itself unless something in
 * it already has focus, e.g. an autofocused field) — never to a field, so no
 * phone keyboard pops up. On close, focus returns to whatever opened it.
 *
 * The opener is read while rendering the opening, before an autofocused field
 * inside the dialog can take focus and hide it.
 */
export function useDialogFocusReturn(open: boolean, panelRef: RefObject<HTMLElement>): void {
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current) openerRef.current = currentOpener();
  wasOpenRef.current = open;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const opener = openerRef.current;
    if (panel && opener) openers.set(panel, opener);
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    return () => {
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, panelRef]);
}

/**
 * Escape-to-close and focus handling for a hand-built dialog.
 *
 *   * Escape closes it, from anywhere on the page while it is open — but not
 *     when something nested inside already handled that Escape. Radix pickers
 *     (popover, calendar) close themselves on Escape and mark the event
 *     handled (`defaultPrevented`) in a capture-phase listener that runs
 *     before this one, so one Escape closes the picker and leaves the form
 *     open.
 *   * `canDismiss` false (e.g. while saving) ignores Escape entirely.
 *   * On open, focus moves to the dialog panel itself, not to a field, so no
 *     phone keyboard pops up. On close, focus returns to whatever opened it.
 *   * With `trapFocus` (checked on every key press, so a resized window is
 *     respected), Tab and Shift+Tab cycle inside the panel, and focus that
 *     lands behind the dialog is brought back to the control last used in it.
 *     Nested pickers keep their own focus and their own Tab handling.
 */
export function useDialogDismiss(options: {
  open: boolean;
  onDismiss: () => void;
  canDismiss: boolean;
  panelRef: RefObject<HTMLElement>;
  trapFocus?: () => boolean;
}): void {
  const { open, panelRef } = options;
  const dismissRef = useRef(options.onDismiss);
  dismissRef.current = options.onDismiss;
  const canDismissRef = useRef(options.canDismiss);
  canDismissRef.current = options.canDismiss;
  const trapRef = useRef(options.trapFocus);
  trapRef.current = options.trapFocus;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shouldDismissOnKey(event, canDismissRef.current)) return;
      event.preventDefault();
      dismissRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useDialogFocusReturn(open, panelRef);

  // Focus trap. Native, document-level listeners, so they also cover focus
  // that has fallen to the page body (a closed picker returns focus to a
  // trigger that cannot hold it). Keys and focus inside the portalled pickers
  // are left alone: they handle their own Tab.
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const trapping = () => panel.isConnected && !!trapRef.current?.();
    let lastInside: HTMLElement | null = null;

    // Where focus goes back to: the control last used, if it can still take
    // focus (Save is disabled while saving), else the first control, else the panel.
    const returnTarget = (): HTMLElement => {
      const items = focusableWithin(panel);
      if (lastInside && items.includes(lastInside)) return lastInside;
      return items[0] ?? panel;
    };

    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !trapping()) return;
      if (event.target instanceof Element && event.target.closest(NESTED_LAYER)) return;
      const active = document.activeElement as HTMLElement | null;
      event.preventDefault();
      if (!active || !panel.contains(active)) {
        returnTarget().focus();
        return;
      }
      const items = focusableWithin(panel);
      const index = items.indexOf(active);
      const edge = nextTrapIndex(items.length, index, event.shiftKey);
      if (items.length === 0) panel.focus({ preventScroll: true });
      else if (edge !== null) items[edge].focus();
      else items[index + (event.shiftKey ? -1 : 1)].focus();
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!trapping()) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (panel.contains(target)) {
        if (target instanceof HTMLElement && target !== panel) lastInside = target;
        return;
      }
      if (target instanceof Element && target.closest(NESTED_LAYER)) return;
      returnTarget().focus({ preventScroll: true });
    };

    // A picker that closes hands focus back to its trigger, which here is not
    // focusable, so focus falls to the page body (which fires no focusin).
    // Catch that and bring focus back into the dialog straight away.
    let pending: ReturnType<typeof setTimeout> | undefined;
    const onFocusOut = (event: FocusEvent) => {
      if (!trapping() || event.relatedTarget) return;
      const from = event.target;
      if (!(from instanceof Element) || !(panel.contains(from) || from.closest(NESTED_LAYER))) return;
      clearTimeout(pending);
      pending = setTimeout(() => {
        const active = document.activeElement;
        if (trapping() && (!active || active === document.body)) returnTarget().focus({ preventScroll: true });
      }, 0);
    };

    document.addEventListener('keydown', onTab);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      clearTimeout(pending);
      document.removeEventListener('keydown', onTab);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [open, panelRef]);
}
