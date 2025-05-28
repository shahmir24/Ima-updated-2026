
import React, { useState, useMemo } from 'react';
import ProductivityHeader from '@/components/productivity/ProductivityHeader';
import ProductivitySearchBar from '@/components/productivity/ProductivitySearchBar';
import { ToolCardsGrid, toolCards } from '@/components/productivity/ToolCardsGrid';
import FidgetButton from '@/components/productivity/FidgetButton';
import GoalsSection from '@/components/productivity/GoalsSection';
import BottomNavigation from '@/components/productivity/BottomNavigation';

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
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <ProductivityHeader />
      
      <ProductivitySearchBar 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      <main className="flex-1 max-w-lg w-full mx-auto px-4">
        <ToolCardsGrid filteredTools={filteredTools} />

        <FidgetButton 
          fidgetColor={fidgetColor}
          onFidgetClick={handleFidgetClick}
        />

        <GoalsSection />

        {/* Empty Card Space */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-secondary/50 rounded-3xl p-6 aspect-square border-2 border-dashed border-muted"></div>
          <div className="bg-secondary/50 rounded-3xl p-6 aspect-square border-2 border-dashed border-muted"></div>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default Productivity;
