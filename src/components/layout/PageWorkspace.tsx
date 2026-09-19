import React from 'react';

interface PageWorkspaceProps {
  /**
   * The desktop content ceiling. Pages choose their own: a hub of cards can use
   * more width than a list meant to be read, so there is no single value here.
   */
  width?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * The shared page container: full width with comfortable gutters on a phone,
 * capped and centred once the desktop shell gives the page a real workspace.
 *
 * It replaces the `max-w-lg` that several pages used for every block, which
 * pinned content to 512px and left the rest of the desktop column empty.
 */
const PageWorkspace = ({ width = 'max-w-6xl', className = '', children }: PageWorkspaceProps) => (
  <div className={`mx-auto w-full ${width} px-4 sm:px-6 lg:px-8 ${className}`}>
    {children}
  </div>
);

export default PageWorkspace;
