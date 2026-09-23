import React from 'react';
import { Search } from 'lucide-react';
import PageWorkspace from '@/components/layout/PageWorkspace';

interface ToolSearchBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  /** Also the field's accessible name, since there is no visible label. */
  placeholder: string;
  /** Must match the page's content width so the field lines up with the grid. */
  width?: string;
  /** Extra classes for the wrapper, e.g. to hide the field at a breakpoint. */
  className?: string;
}

/**
 * The search field above a hub's tool cards (Productivity, Wellness). It only
 * reports what was typed; each page filters its own list.
 */
const ToolSearchBar = ({ searchTerm, onSearchChange, placeholder, width, className = '' }: ToolSearchBarProps) => (
  <PageWorkspace width={width} className={`mb-8 ${className}`}>
    <div className="relative lg:max-w-sm">
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
        <Search className="h-5 w-5 text-muted-foreground" />
      </div>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-secondary border-0 rounded-2xl pl-12 pr-12 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  </PageWorkspace>
);

export default ToolSearchBar;
