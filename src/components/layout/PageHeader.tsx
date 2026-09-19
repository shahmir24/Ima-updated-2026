import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageWorkspace from '@/components/layout/PageWorkspace';

interface PageHeaderProps {
  title: string;
  /** Where the back arrow goes. Each page keeps the destination it already had. */
  backPath: string;
  /** Must match the page's content width so the title lines up with it. */
  width?: string;
}

/**
 * Page title row for the pages that sit inside the desktop shell.
 *
 * On a phone it keeps the established arrangement — back arrow left, title
 * centred, spacer right. From lg the title moves next to the arrow so it sits
 * on the content's left edge instead of floating in the middle of a wide
 * column, and the spacer that centred it is no longer needed.
 */
const PageHeader = ({ title, backPath, width }: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <PageWorkspace width={width} className="flex items-center justify-between py-4 lg:justify-start lg:gap-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate(backPath)}
        aria-label="Go back"
        className="h-11 w-11 rounded-full p-0 hover:bg-white/10"
      >
        <ArrowLeft className="h-6 w-6 text-white" />
      </Button>

      <h1 className="text-2xl font-bold text-white lg:text-3xl">{title}</h1>

      <div className="w-10 lg:hidden" />
    </PageWorkspace>
  );
};

export default PageHeader;
