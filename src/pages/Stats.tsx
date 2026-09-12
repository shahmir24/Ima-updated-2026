
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
 */
const Stats = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground w-[480px] mx-auto">

      {/* Header */}
      <header className="w-full p-4 flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/productivity')}
          className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-white text-xl font-bold">Statistics</h1>
        
        <div className="w-10"></div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full px-4 flex flex-col items-center justify-center text-center">
        <div className="bg-white/5 rounded-2xl p-8 max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4">
            <BarChart3 className="h-8 w-8 text-blue-300" />
          </div>
          <h2 className="text-white text-lg font-semibold mb-2">No activity stats yet</h2>
          <p className="text-white/70 text-sm leading-relaxed">
            Once session tracking is switched on, the focus and wellness sessions
            you complete will show up here.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Stats;
