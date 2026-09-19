
import React from 'react';
import { Search } from 'lucide-react';
import PageWorkspace from '@/components/layout/PageWorkspace';

interface ProductivitySearchBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  /** Must match the page's content width so the field lines up with the grid. */
  width?: string;
}

const ProductivitySearchBar = ({ searchTerm, onSearchChange, width }: ProductivitySearchBarProps) => {
  return (
    <PageWorkspace width={width} className="mb-8">
      <div className="relative lg:max-w-sm">
        <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
          <Search className="h-5 w-5 text-muted-foreground" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search productivity tools"
          className="w-full bg-secondary border-0 rounded-2xl pl-12 pr-12 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
    </PageWorkspace>
  );
};

export default ProductivitySearchBar;
