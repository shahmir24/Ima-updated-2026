
import React from 'react';
import { BarChart3, CheckCircle2, CircleSlash, Percent } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import PageWorkspace from '@/components/layout/PageWorkspace';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import { Button } from '@/components/ui/button';
import { useFocusStats } from '@/hooks/use-focus-stats';
import type { FocusStatsGroup, FocusStatsSummary } from '@/lib/focus/focus-stats';

/**
 * Statistics, from recorded focus sessions only.
 *
 * Every number here is read from focus_sessions — Focus Timer and Body Double
 * sessions alike — and nothing is invented. Completed and abandoned sessions
 * are shown apart, with the focus minutes each actually earned (focus_seconds,
 * which excludes pauses). Sessions still in progress are counted nowhere,
 * including the completion rate.
 */
const WORKSPACE = 'max-w-4xl';

const minutesLabel = (minutes: number) => `${minutes} focus ${minutes === 1 ? 'minute' : 'minutes'}`;
const sessionsLabel = (sessions: number) => `${sessions === 1 ? 'session' : 'sessions'}`;

const GroupCard = ({
  title,
  group,
  icon: Icon,
  accent
}: {
  title: string;
  group: FocusStatsGroup;
  icon: typeof CheckCircle2;
  accent: string;
}) => (
  <section aria-label={title} className="bg-white/5 rounded-2xl p-6 text-left">
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="text-white text-base font-semibold">{title}</h2>
    </div>
    <p className="text-white text-3xl font-semibold">
      {group.sessions} <span className="text-white/60 text-sm font-normal">{sessionsLabel(group.sessions)}</span>
    </p>
    <p className="text-white/70 text-sm mt-1">{minutesLabel(group.focusMinutes)}</p>
  </section>
);

const StatsSummary = ({ summary }: { summary: FocusStatsSummary }) => (
  <div data-testid="focus-stats" className="w-full grid gap-4 sm:grid-cols-3">
    <GroupCard title="Completed" group={summary.completed} icon={CheckCircle2} accent="bg-emerald-500/20 text-emerald-300" />
    <GroupCard title="Abandoned" group={summary.abandoned} icon={CircleSlash} accent="bg-orange-500/20 text-orange-300" />
    <section aria-label="Completion rate" className="bg-white/5 rounded-2xl p-6 text-left">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/20 text-blue-300">
          <Percent className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="text-white text-base font-semibold">Completion rate</h2>
      </div>
      <p className="text-white text-3xl font-semibold">
        {summary.completionRate === null ? '—' : `${summary.completionRate}%`}
      </p>
      <p className="text-white/70 text-sm mt-1">
        of {summary.endedSessions} ended {sessionsLabel(summary.endedSessions)}
      </p>
    </section>
  </div>
);

const Message = ({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) => (
  <div className="w-full max-w-md flex min-h-[16rem] flex-col justify-center bg-white/5 rounded-2xl p-8 mx-auto">
    <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4">
      <BarChart3 className="h-8 w-8 text-blue-300" />
    </div>
    <h2 className="text-white text-lg font-semibold mb-2">{title}</h2>
    <p className="text-white/70 text-sm leading-relaxed">{body}</p>
    {children}
  </div>
);

const Stats = () => {
  const stats = useFocusStats();

  let content: React.ReactNode;
  if (stats.isPending) {
    content = <Message title="Loading your stats" body="Fetching your focus sessions…" />;
  } else if (stats.isError) {
    content = (
      <Message title="Stats couldn't load" body="We couldn't reach your focus sessions just now. Nothing has been lost.">
        <Button variant="secondary" className="mt-4 self-center" onClick={() => void stats.refetch()}>
          Try again
        </Button>
      </Message>
    );
  } else if (!stats.data || stats.data.endedSessions === 0) {
    content = (
      <Message
        title="No activity stats yet"
        body="Finish or end a Focus Timer or Body Double session and it will show up here."
      />
    );
  } else {
    content = <StatsSummary summary={stats.data} />;
  }

  return (
    // pb-20 keeps the last card clear of the phone bottom bar; the bar is
    // lg:hidden, so desktop keeps its spacing exactly as it was.
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-0">
      <PageHeader title="Statistics" backPath="/productivity" width={WORKSPACE} hideBackOnDesktop />

      {/* Main Content. Phones keep it centred in the screen; on desktop it
          starts under the title instead of floating halfway down the page. */}
      <main className="flex-1 flex flex-col justify-center lg:justify-start">
        <PageWorkspace width={WORKSPACE} className="flex justify-center py-8 text-center">
          {content}
        </PageWorkspace>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default Stats;
