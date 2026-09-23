import React from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { IMA_LOCKUP_SRC } from '@/lib/brand';
import {
  Home, CheckSquare, Clock, Users, LifeBuoy, Heart, BookOpen, Volume2, BarChart3,
  User, Settings
} from 'lucide-react';

/**
 * The desktop application sidebar.
 *
 * Only rendered at lg and above — below that the existing bottom navigation is
 * the app's navigation, and the two are exact complements (`hidden lg:flex`
 * here, `lg:hidden` there) so neither both nor neither can ever show.
 *
 * Every destination below is a route that exists in App.tsx. Nothing is
 * decorative: no search, no notifications, no counters, no collapse control.
 *
 * Deliberately not shadcn's ui/sidebar: that component is 761 unused lines
 * that ship their own mobile Sheet, cookie persistence and keyboard shortcut,
 * all of which would fight the requirement to keep the bottom navigation on
 * mobile.
 */

type Match =
  | { kind: 'exact'; path: string }
  /** Any of these prefixes lights the item. */
  | { kind: 'prefix'; prefixes: string[] }
  /** /profile-settings, distinguished by its ?tab= value. */
  | { kind: 'tab'; tab: 'profile' | 'settings' };

interface NavItem {
  label: string;
  to: string;
  icon: typeof Home;
  match: Match;
}

const PRIMARY_ITEMS: NavItem[] = [
  { label: 'Home', to: '/', icon: Home, match: { kind: 'exact', path: '/' } },
  { label: 'Tasks', to: '/tasks', icon: CheckSquare, match: { kind: 'exact', path: '/tasks' } },
  { label: 'Focus', to: '/focus', icon: Clock, match: { kind: 'exact', path: '/focus' } },
  { label: 'Body Double', to: '/body-double', icon: Users, match: { kind: 'exact', path: '/body-double' } },
  // Support, so it sits with the support features rather than at the bottom of
  // the list. Points straight at the contacts page, not the Safe Space hub, and
  // lights only on that page: an item labelled Safe Contacts must not claim the
  // chat or grounding screens. LifeBuoy because Users already means Body Double.
  {
    label: 'Safe Contacts',
    to: '/safe-space/contacts',
    icon: LifeBuoy,
    match: { kind: 'exact', path: '/safe-space/contacts' }
  },
  {
    label: 'Wellness',
    to: '/wellness',
    icon: Heart,
    // The wellness menu leads to breathing, meditation and mindfulness, which
    // sit on their own path roots. Without them a user two screens deep would
    // see no active item at all.
    match: { kind: 'prefix', prefixes: ['/wellness', '/breathing', '/meditation', '/mindfulness'] }
  },
  { label: 'Journal', to: '/journaling', icon: BookOpen, match: { kind: 'prefix', prefixes: ['/journaling'] } },
  { label: 'Soundscape', to: '/soundscape', icon: Volume2, match: { kind: 'exact', path: '/soundscape' } },
  { label: 'Stats', to: '/stats', icon: BarChart3, match: { kind: 'exact', path: '/stats' } }
];

const SECONDARY_ITEMS: NavItem[] = [
  { label: 'Profile', to: '/profile-settings?tab=profile', icon: User, match: { kind: 'tab', tab: 'profile' } },
  { label: 'Settings', to: '/profile-settings?tab=settings', icon: Settings, match: { kind: 'tab', tab: 'settings' } }
];

function isItemActive(item: NavItem, pathname: string, tab: string | null): boolean {
  switch (item.match.kind) {
    case 'exact':
      return pathname === item.match.path;
    case 'prefix':
      return item.match.prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    case 'tab':
      // ProfileSettings reads `searchParams.get('tab') || 'profile'`, so a
      // missing tab means the profile tab — mirrored here rather than guessed.
      return pathname.startsWith('/profile-settings') && (tab ?? 'profile') === item.match.tab;
  }
}

const DesktopSidebar = () => {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isItemActive(item, pathname, tab);

    return (
      <li key={item.label}>
        <Link
          to={item.to}
          aria-current={active ? 'page' : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            active
              ? 'bg-secondary font-medium text-foreground'
              : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
          }`}
        >
          <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="truncate">{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <aside
      aria-label="Main"
      data-testid="desktop-sidebar"
      className="hidden shrink-0 border-r border-border bg-background lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-col"
    >
      <Link
        to="/"
        className="flex items-center gap-2 px-5 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* The lockup carries the wordmark, so there is no separate "iMA" text. */}
        <img src={IMA_LOCKUP_SRC} alt="iMA" className="h-8 w-auto object-contain" />
      </Link>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-1">{PRIMARY_ITEMS.map(renderItem)}</ul>
      </nav>

      <nav aria-label="Account" className="mt-auto border-t border-border px-3 py-4">
        <ul className="space-y-1">{SECONDARY_ITEMS.map(renderItem)}</ul>
      </nav>
    </aside>
  );
};

export default DesktopSidebar;
