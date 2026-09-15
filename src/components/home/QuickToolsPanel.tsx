import React from 'react';
import { Link } from 'react-router-dom';
import { Wind, Scan, Volume2, BookOpen } from 'lucide-react';

/**
 * Four real destinations, kept deliberately quiet so they cannot compete with
 * Right Now. Every route exists in App.tsx; nothing here is new behaviour.
 */
const TOOLS = [
  { label: 'Breathe', to: '/breathing', icon: Wind },
  { label: 'Body Scan', to: '/mindfulness/body-scan', icon: Scan },
  { label: 'Soundscape', to: '/soundscape', icon: Volume2 },
  { label: 'Journal', to: '/journaling', icon: BookOpen }
];

const QuickToolsPanel = () => (
  <section aria-label="Quick tools" className="rounded-2xl border border-border bg-secondary/30 p-4">
    <h2 className="text-sm font-medium text-foreground">Quick tools</h2>

    <ul className="mt-3 grid grid-cols-2 gap-2">
      {TOOLS.map((tool) => {
        const Icon = tool.icon;

        return (
          <li key={tool.label}>
            <Link
              to={tool.to}
              className="flex h-11 items-center gap-2 rounded-xl bg-secondary/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{tool.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  </section>
);

export default QuickToolsPanel;
