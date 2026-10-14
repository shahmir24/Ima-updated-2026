import React from 'react';

interface FocusSessionPanelProps {
  round: number;
  flows: number;
  flowsCompleted: number;
  focusMinutes: number;
  breakMinutes: number;
  /** The settings: the shared settings list, or a note while locked. */
  children: React.ReactNode;
}

/**
 * Desktop only: the session at a glance and its settings, beside the timer.
 * Display only — every value comes from the app-wide timer, and the settings
 * are the same rows the phone's floating panel shows.
 */
const FocusSessionPanel = ({ round, flows, flowsCompleted, focusMinutes, breakMinutes, children }: FocusSessionPanelProps) => (
  <aside aria-label="This session" className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
    <section>
      <h2 className="text-sm font-medium text-white/60">This session</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-white/60">Round</dt>
          <dd className="font-medium text-white">
            {round} of {flows}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-white/60">Focus</dt>
          <dd className="font-medium text-white">{focusMinutes} min</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-white/60">Break</dt>
          <dd className="font-medium text-white">{breakMinutes} min</dd>
        </div>
      </dl>
      {/* One dot per round; filled once that round's focus block is done. */}
      <div className="mt-4 flex flex-wrap gap-2" aria-hidden="true">
        {Array.from({ length: flows }, (_, index) => (
          <span
            key={index}
            className={`h-2 w-2 rounded-full ${index < flowsCompleted ? 'bg-blue-300' : 'bg-white/15'}`}
          />
        ))}
      </div>
    </section>

    <section>
      <h2 className="text-sm font-medium text-white/60">Settings</h2>
      <p className="mt-1 text-xs text-white/40">While the timer runs, a new length applies from the next block.</p>
      <div className="mt-3">{children}</div>
    </section>
  </aside>
);

export default FocusSessionPanel;
