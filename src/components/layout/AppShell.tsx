import React from 'react';
import { Outlet } from 'react-router-dom';
import DesktopSidebar from '@/components/layout/DesktopSidebar';

/**
 * The desktop application shell: a persistent sidebar beside the page.
 *
 * Applied as a layout route inside ProtectedRoute, so no page file knows it
 * exists and no guard changes. Pages render into the Outlet exactly as before.
 *
 * Scrolling is deliberately left alone. A desktop-only
 * `h-screen overflow-y-auto` content column would have created a second scroll
 * container, changing what `position: fixed` children scroll against and what
 * scroll-dependent components measure — Body Double's overlays, Soundscape's
 * animated rings and every dialog would all have needed re-checking. Instead
 * the sidebar is `sticky top-0 h-screen`, which pins it to the viewport while
 * the document keeps scrolling exactly as it does today. `items-start` gives
 * the sticky element room to stick inside the flex row.
 *
 * `min-w-0` on the content column is load-bearing: without it a wide child
 * (the three pages still pinned to w-[480px], a table) would push the whole
 * application sideways instead of being constrained.
 */
const AppShell = () => (
  <div className="lg:flex lg:items-start">
    <DesktopSidebar />
    <div className="min-w-0 flex-1">
      <Outlet />
    </div>
  </div>
);

export default AppShell;
