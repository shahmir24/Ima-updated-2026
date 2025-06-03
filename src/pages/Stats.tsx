
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, ResponsiveContainer } from 'recharts';

const Stats = () => {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState('D');

  const tabs = [
    { id: 'D', label: 'D' },
    { id: 'W', label: 'W' },
    { id: 'M', label: 'M' },
    { id: 'Y', label: 'Y' }
  ];

  // Sample data for the chart
  const chartData = [
    { hour: '6', flows: 2, potential: 4 },
    { hour: '9', flows: 3, potential: 4 },
    { hour: '12', flows: 1, potential: 4 },
    { hour: '15', flows: 4, potential: 4 },
    { hour: '18', flows: 2, potential: 4 },
    { hour: '21', flows: 1, potential: 4 }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground w-[480px] mx-auto">
      {/* Status Bar */}
      <div className="w-full px-4 pt-2 pb-1">
        <div className="flex justify-between items-center text-white text-sm font-medium">
          <span>09:41</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white/60 rounded-full"></div>
            </div>
            <svg className="w-4 h-4 ml-1" fill="white" viewBox="0 0 24 24">
              <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.07 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
            </svg>
            <div className="w-6 h-3 border border-white rounded-sm ml-1">
              <div className="w-4 h-1.5 bg-white rounded-sm m-0.5"></div>
            </div>
          </div>
        </div>
      </div>

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
      <main className="flex-1 w-full px-4">
        {/* Time Range Tabs */}
        <div className="mb-6">
          <div className="bg-white/10 rounded-full p-1 flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-all duration-300 ${
                  selectedTab === tab.id
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'text-white/70 hover:text-white/90'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Flows Summary */}
        <div className="mb-6 text-center">
          <div className="text-4xl font-bold text-white mb-1">0 Flows</div>
          <div className="text-white/70 text-sm">22 November 2023</div>
        </div>

        {/* Chart Area */}
        <div className="mb-8 bg-white/5 rounded-2xl p-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <XAxis 
                dataKey="hour" 
                axisLine={false} 
                tickLine={false}
                tick={{ fill: '#ffffff80', fontSize: 12 }}
              />
              <Bar 
                dataKey="potential" 
                fill="#374151" 
                radius={[2, 2, 2, 2]}
              />
              <Bar 
                dataKey="flows" 
                fill="#3B82F6" 
                radius={[2, 2, 2, 2]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Detailed Breakdown */}
        <div className="space-y-6">
          {/* Block 1 */}
          <div className="bg-white/5 rounded-2xl p-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-1">0</div>
                <div className="text-white/70 text-sm">Flows</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-1">0</div>
                <div className="text-white/70 text-sm">Started</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-1">0</div>
                <div className="text-white/70 text-sm">Completed</div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/10"></div>

          {/* Block 2 */}
          <div className="bg-white/5 rounded-2xl p-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-1">0</div>
                <div className="text-white/70 text-sm">Minutes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-1">0</div>
                <div className="text-white/70 text-sm">Breaks</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-1">0</div>
                <div className="text-white/70 text-sm">Started</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Stats;
