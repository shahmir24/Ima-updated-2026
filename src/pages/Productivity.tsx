
import React, { useState, useMemo } from 'react';
import ProductivityHeader from '@/components/productivity/ProductivityHeader';
import ToolSearchBar from '@/components/layout/ToolSearchBar';
import { ToolCardsGrid, toolCards } from '@/components/productivity/ToolCardsGrid';
import FidgetButton from '@/components/productivity/FidgetButton';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import PageWorkspace from '@/components/layout/PageWorkspace';

const WORKSPACE = 'max-w-6xl';

const Productivity = () => {
  const [fidgetColor, setFidgetColor] = useState('#2F74DB');
  const [searchTerm, setSearchTerm] = useState('');
  
  const fidgetColors = ['#2F74DB', '#7359B8', '#1D8690'];
  
  const handleFidgetClick = () => {
    const currentIndex = fidgetColors.indexOf(fidgetColor);
    const nextIndex = (currentIndex + 1) % fidgetColors.length;
    setFidgetColor(fidgetColors[nextIndex]);
  };

  const filteredTools = useMemo(() => {
    if (!searchTerm.trim()) return toolCards;
    
    return toolCards.filter(tool =>
      tool.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-10">
      <ProductivityHeader width={WORKSPACE} />

      <ToolSearchBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="Search productivity tools"
        width={WORKSPACE}
      />

      <main className="flex-1">
        <PageWorkspace width={WORKSPACE}>
          <ToolCardsGrid filteredTools={filteredTools} />

          <FidgetButton
            fidgetColor={fidgetColor}
            onFidgetClick={handleFidgetClick}
          />
        </PageWorkspace>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default Productivity;
