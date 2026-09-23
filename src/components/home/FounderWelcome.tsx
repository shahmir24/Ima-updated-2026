import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * A short welcome note from the founder, shown over Home for beta users.
 *
 * Temporary, and deliberately light:
 *   * at most MAX_APPEARANCES times per browser, counted in localStorage — no
 *     database column, nothing tied to the account;
 *   * at most once per page load, so moving between Home and other screens
 *     does not bring it back and use up the three appearances in one sitting;
 *   * it closes itself after AUTO_DISMISS_MS, or earlier with ×;
 *   * it is not modal: no backdrop, no focus is moved or trapped, and
 *     everything outside the card stays usable.
 *
 * The countdown pauses while the pointer is over the card or focus is inside
 * it, so someone reading slowly — or with a screen reader — is not cut off
 * mid-sentence. It resumes with the time that was left.
 */

/** Namespaced so it cannot collide with Supabase's own keys or other features. */
export const FOUNDER_WELCOME_STORAGE_KEY = 'ima.founderWelcome.v1.appearances';
const MAX_APPEARANCES = 3;
const AUTO_DISMISS_MS = 8000;
/** Matches the `duration-300` transition below. */
const FADE_MS = 300;

/** Module scope: survives Home unmounting and remounting, resets on reload. */
let shownThisPageLoad = false;

/**
 * Null when storage cannot be used (blocked, or a private mode that throws).
 * Without a working count the note could appear on every load, so it is then
 * not shown at all.
 */
function readAppearances(): number | null {
  try {
    const raw = window.localStorage.getItem(FOUNDER_WELCOME_STORAGE_KEY);
    const count = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(count) && count >= 0 ? count : 0;
  } catch {
    return null;
  }
}

function writeAppearances(count: number): boolean {
  try {
    window.localStorage.setItem(FOUNDER_WELCOME_STORAGE_KEY, String(count));
    return true;
  } catch {
    return false;
  }
}

interface FounderWelcomeProps {
  /** The stored first name; blank or missing falls back to "Hey there!". */
  firstName?: string | null;
  /**
   * False until the profile has loaded (or failed to), so the greeting does
   * not appear as "Hey there!" and then change to the name.
   */
  ready: boolean;
}

const FounderWelcome = ({ firstName, ready }: FounderWelcomeProps) => {
  const headingId = useId();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);

  const remainingRef = useRef(AUTO_DISMISS_MS);
  const fadeTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  // Decide once whether this is an appearance, and count it only when it is.
  useEffect(() => {
    if (!ready || shownThisPageLoad) return;

    const count = readAppearances();
    if (count === null || count >= MAX_APPEARANCES) return;
    if (!writeAppearances(count + 1)) return;

    shownThisPageLoad = true;
    setMounted(true);
    // Rendered at opacity 0 first, then faded in on the next frame.
    frameRef.current = window.requestAnimationFrame(() => setVisible(true));
  }, [ready]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (fadeTimerRef.current !== null) return;
    fadeTimerRef.current = window.setTimeout(() => {
      fadeTimerRef.current = null;
      setMounted(false);
    }, FADE_MS);
  }, []);

  // The countdown. Runs only while shown and not paused; pausing keeps what
  // was left rather than starting over.
  useEffect(() => {
    if (!visible || paused) return;

    const startedAt = Date.now();
    const timer = window.setTimeout(dismiss, remainingRef.current);

    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [visible, paused, dismiss]);

  // Leaving Home mid-fade must not leave a timer or frame behind.
  useEffect(
    () => () => {
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    },
    []
  );

  if (!mounted) return null;

  const name = firstName?.trim();
  const greeting = name ? `Hey ${name}! 👋` : 'Hey there! 👋';

  return (
    // Full-viewport layer that ignores the pointer, so only the card itself
    // intercepts taps. Phones: above the bottom navigation. Desktop: a note in
    // the bottom-right corner, clear of the sidebar.
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:px-6 lg:justify-end lg:px-8 lg:pb-8"
      data-testid="founder-welcome"
    >
      <section
        role="region"
        aria-labelledby={headingId}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
        }}
        className={`pointer-events-auto relative flex w-full max-w-md max-h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom,0px))] flex-col overflow-hidden rounded-3xl border border-border bg-card/95 text-card-foreground shadow-2xl backdrop-blur-lg transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none lg:max-h-[calc(100dvh-4rem)] ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        {/* The Home badge gradient, as a thin accent rather than a banner. */}
        <div aria-hidden="true" className="h-1 w-full shrink-0 bg-gradient-to-r from-blue-500 to-teal-400" />

        <button
          type="button"
          onClick={dismiss}
          aria-label="Close welcome message"
          className="absolute right-2 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* Only the text scrolls, when a short phone cannot fit it all; × and
            the accent stay put. Focusable so the keyboard can scroll it too. */}
        <div
          tabIndex={0}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-5 pt-5 text-sm leading-relaxed text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6 sm:pb-6 sm:text-[15px]"
        >
          <h2 id={headingId} className="pr-10 text-lg font-semibold text-foreground">
            {greeting}
          </h2>
          <p>
            I’m Shahmir, the founder of iMA. Thanks for being one of the first people to try it.
          </p>
          <p>
            I built iMA around a simple problem: sometimes you know what you need to do, but actually
            starting is the hard part.
          </p>
          <p>
            iMA is your space. There isn’t someone sitting on the other side watching what you do or
            monitoring you while you use the app.
          </p>
          <p>
            This is an early beta, so I’d genuinely love to hear what helps, what feels confusing, and
            what you’d change.
          </p>
          <p className="text-foreground">Thanks for helping me build iMA 💙</p>
          <p className="pt-1">
            <span className="block font-medium text-foreground">Shahmir</span>
            <span className="block text-xs">Founder, iMA</span>
          </p>
        </div>
      </section>
    </div>
  );
};

export default FounderWelcome;
