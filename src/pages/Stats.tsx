
import React from 'react';
import { BarChart3 } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import PageWorkspace from '@/components/layout/PageWorkspace';

/**
 * Statistics.
 *
 * Everything this page used to show was invented: a chart fed by an array
 * literally commented "Sample data for the chart", a hardcoded date of
 * "22 November 2023", and six metrics hardcoded to 0 — which contradicted the
 * chart drawing bars above them. The D/W/M/Y tabs only moved a highlight; no
 * period switching existed.
 *
 * Nothing real can be shown yet: no focus or wellness session is recorded
 * anywhere in the app, so focus_sessions and wellness_sessions are both empty
 * by construction. Until session tracking lands this page says so plainly
 * rather than showing numbers nobody earned. The route stays alive.
 *
 * The desktop pass widened the page but added nothing to it: there is still
 * exactly one honest thing to say here.
 */
const WORKSPACE = 'max-w-4xl';

const Stats = () => {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <PageHeader title="Statistics" backPath="/productivity" width={WORKSPACE} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col justify-center">
        <PageWorkspace width={WORKSPACE} className="flex justify-center py-8 text-center">
          <div className="w-full max-w-md flex min-h-[16rem] flex-col justify-center bg-white/5 rounded-2xl p-8">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4">
              <BarChart3 className="h-8 w-8 text-blue-300" />
            </div>
            <h2 className="text-white text-lg font-semibold mb-2">No activity stats yet</h2>
            <p className="text-white/70 text-sm leading-relaxed">
              Once session tracking is switched on, the focus and wellness sessions
              you complete will show up here.
            </p>
          </div>
        </PageWorkspace>
      </main>
    </div>
  );
};

export default Stats;
