
import React from 'react';
import { Search, Mic } from 'lucide-react';

interface ProductivitySearchBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

const ProductivitySearchBar = ({ searchTerm, onSearchChange }: ProductivitySearchBarProps) => {
  return (
    <div className="w-full max-w-lg mx-auto px-4 mb-8">
      <div className="relative">
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
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
          <Mic className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
};

export default ProductivitySearchBar;
