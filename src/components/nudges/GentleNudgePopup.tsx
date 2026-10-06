import { X } from 'lucide-react';
import { NUDGE_COPY, type InAppNudge, type NudgeAction } from '@/lib/nudges/in-app-nudge';

/**
 * The in-app gentle nudge: a small card over the app, in the founder note's
 * visual family, but its own component with its own rules. Mounted exactly
 * once, by GlobalGentleNudge, for the whole app.
 *
 *   * It never closes by itself — no timer of any kind. It stays until × or
 *     one of its buttons.
 *   * It is not modal: no backdrop, focus is not moved or trapped, and the
 *     rest of Home stays usable underneath.
 *   * It sits at the TOP of the screen, so it can never stack on the founder
 *     note, which uses the bottom.
 *   * Its entrance is a short fade that reduced-motion turns off.
 *
 * Purely presentational: what it says and where its buttons go are decided
 * in lib/nudges/in-app-nudge.ts.
 */

export const GENTLE_NUDGE_HEADING_ID = 'gentle-nudge-heading';

export interface GentleNudgePopupProps {
  nudge: InAppNudge | null;
  onDismiss: () => void;
  onAction: (action: NudgeAction) => void;
}

const GentleNudgePopup = ({ nudge, onDismiss, onAction }: GentleNudgePopupProps) => {
  if (!nudge) return null;

  return (
    // Full-width layer that ignores the pointer, so only the card takes taps.
    // Phones: just under the page header, well clear of the bottom navigation.
    // Desktop: the top-right corner, clear of the sidebar.
    <div
      data-testid="gentle-nudge"
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-[calc(4.75rem+env(safe-area-inset-top,0px))] sm:px-6 lg:justify-end lg:px-8 lg:pt-6"
    >
      <section
        role="region"
        aria-labelledby={GENTLE_NUDGE_HEADING_ID}
        data-variant={nudge.variant}
        className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card/95 text-card-foreground shadow-2xl backdrop-blur-lg animate-in fade-in-0 slide-in-from-top-2 duration-300 motion-reduce:animate-none"
      >
        {/* A calm accent, distinct from the founder note's blue-to-teal. */}
        <div aria-hidden="true" className="h-1 w-full bg-gradient-to-r from-purple-400 to-blue-500" />

        <button
          type="button"
          onClick={onDismiss}
          aria-label={NUDGE_COPY.close}
          className="absolute right-2 top-3 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
          <h2 id={GENTLE_NUDGE_HEADING_ID} className="pr-10 text-lg font-semibold text-foreground">
            {nudge.heading}
          </h2>
          <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{nudge.body}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAction(nudge.primary.action)}
              className="h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
            >
              {nudge.primary.label}
            </button>
            {nudge.secondary && (
              <button
                type="button"
                onClick={() => onAction(nudge.secondary!.action)}
                className="h-11 rounded-full border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
              >
                {nudge.secondary.label}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default GentleNudgePopup;
