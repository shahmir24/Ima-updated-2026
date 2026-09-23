import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Heart, CheckSquare, LifeBuoy } from 'lucide-react';

/**
 * The app's single mobile navigation, rendered page by page — Home included.
 *
 * Hidden from lg up, where the desktop sidebar is the navigation. The two are
 * exact complements — `lg:hidden` here, `hidden lg:flex` there — so a screen
 * can never show both or neither.
 *
 * Five fixed destinations with Home in the centre slot:
 *   Productivity | Wellness | Home | Tasks | Safe Contacts
 * Safe Contacts sits in the bar itself, not behind the Safe Space hub, so it is
 * one tap away from anywhere for someone who is distressed.
 *
 * Deliberately no z-index: Focus's lock overlay (`absolute z-40`) has to keep
 * covering this bar so a locked session cannot be navigated away from.
 */

/** A path lights an item when it equals a prefix or sits beneath one. */
const underAny = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

interface NavItem {
  label: string;
  to: string;
  icon: typeof Heart;
  isActive: (pathname: string) => boolean;
}

// Productivity's tools and Wellness's sub-trees live on their own path roots,
// so each item lists them; otherwise a user one screen deep would see no active
// item. The Safe Space hub and chat are reached through Wellness and light it;
// the contacts page has its own item and must not light Wellness as well.
const PRODUCTIVITY: NavItem = {
  label: 'Productivity',
  to: '/productivity',
  icon: Activity,
  isActive: (p) => underAny(p, ['/productivity', '/focus', '/body-double', '/soundscape', '/stats'])
};

const WELLNESS: NavItem = {
  label: 'Wellness',
  to: '/wellness',
  icon: Heart,
  isActive: (p) =>
    underAny(p, ['/wellness', '/breathing', '/meditation', '/mindfulness', '/journaling', '/safe-space']) &&
    !underAny(p, ['/safe-space/contacts'])
};

const TASKS: NavItem = {
  label: 'Tasks',
  to: '/tasks',
  icon: CheckSquare,
  isActive: (p) => p === '/tasks'
};

const SAFE_CONTACTS: NavItem = {
  label: 'Safe Contacts',
  to: '/safe-space/contacts',
  icon: LifeBuoy,
  isActive: (p) => underAny(p, ['/safe-space/contacts'])
};

const itemClass =
  'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-start gap-0.5 rounded-2xl px-0 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Every icon sits in a slot the height of the Home logo, so the icons share one
 * row and the labels start on one line — even when "Safe Contacts" wraps onto
 * two lines on the narrowest phones.
 */
const iconSlotClass = 'flex h-8 shrink-0 items-center justify-center';

const labelClass = 'w-full text-center text-[10px] font-medium leading-[1.15] min-[360px]:text-[11px]';

const BottomNavigation = () => {
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = item.isActive(pathname);
    const tone = active ? 'text-foreground' : 'text-muted-foreground';

    return (
      <li key={item.label} className="flex min-w-0 flex-1">
        <Link to={item.to} aria-current={active ? 'page' : undefined} className={`${itemClass} ${tone}`}>
          <span className={iconSlotClass}>
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className={labelClass}>{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label="Primary"
      data-testid="mobile-bottom-nav"
      className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur-lg nav-safe-area lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1 py-1 sm:px-4 md:max-w-2xl">
        {renderItem(PRODUCTIVITY)}
        {renderItem(WELLNESS)}

        {/* Home: the centre action, carrying the logo as it always has. */}
        <li className="flex min-w-0 flex-1">
          <Link
            to="/"
            aria-current={isHome ? 'page' : undefined}
            className={`${itemClass} ${isHome ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            <span className={iconSlotClass}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-teal-400 shadow-lg">
                <img
                  src="/lovable-uploads/d8549ee1-5d5d-4efb-9c5b-9c1b49629e14.png"
                  alt=""
                  aria-hidden="true"
                  className="h-6 w-6 object-contain"
                />
              </span>
            </span>
            <span className={labelClass}>Home</span>
          </Link>
        </li>

        {renderItem(TASKS)}
        {renderItem(SAFE_CONTACTS)}
      </ul>
    </nav>
  );
};

export default BottomNavigation;
