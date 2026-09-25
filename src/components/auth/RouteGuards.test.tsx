import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import { useAllowedGuestTaskStore } from '@/contexts/guest-mode-context';
import { ACCOUNT_MARKER_KEY, hasAccountMarker, setAccountMarker } from '@/lib/account-marker';
import { GuestAllowedRoute, ProtectedRoute } from './RouteGuards';

// <Navigate> only acts in an effect, which a server render never runs. Render
// the destination instead so each test can read where a guard sends people.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, Navigate: ({ to }: { to: string }) => <p>{`REDIRECT ${to}`}</p> };
});

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

function withBrowser(options: { marker?: boolean; blocked?: boolean } = {}) {
  const localStorage = new MemoryStorage();
  if (options.marker) localStorage.setItem(ACCOUNT_MARKER_KEY, '1');
  const sessionStorage = new MemoryStorage();
  const win = options.blocked
    ? Object.defineProperty({}, 'localStorage', {
        get() {
          throw new Error('SecurityError');
        }
      })
    : { localStorage, sessionStorage };
  vi.stubGlobal('window', win);
  return localStorage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const auth = (state: { loading?: boolean; signedIn?: boolean; onboarded?: boolean | null }): AuthContextValue => ({
  session: state.signedIn ? ({ user: { id: 'u' } } as Session) : null,
  user: state.signedIn ? ({ id: 'u' } as Session['user']) : null,
  onboardingCompleted: state.signedIn ? ('onboarded' in state ? state.onboarded : true) : null,
  loading: state.loading ?? false,
  signOut: async () => {},
  refreshOnboardingStatus: async () => {},
  markOnboardingComplete: () => {}
});

/** What the page under the guard sees: rendered, and whether guests are allowed. */
const Home = () => <p>{`HOME guestStore=${useAllowedGuestTaskStore() ? 'offered' : 'none'}`}</p>;

function render(guard: React.ReactElement, value: AuthContextValue, path = '/') {
  return renderToString(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={guard}>
            <Route path={path} element={<Home />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('GuestAllowedRoute', () => {
  it('brand-new visitor (no session, no marker): Home, with the guest store offered', () => {
    withBrowser();
    expect(render(<GuestAllowedRoute />, auth({}))).toContain('HOME guestStore=offered');
  });

  it('returning user signed out (no session, marker): sent to /auth, no Home', () => {
    withBrowser({ marker: true });
    const html = render(<GuestAllowedRoute />, auth({}));
    expect(html).toContain('REDIRECT /auth');
    expect(html).not.toContain('HOME');
  });

  it('signed in and onboarded: Home, and the guest store is NOT offered', () => {
    withBrowser();
    expect(render(<GuestAllowedRoute />, auth({ signedIn: true }))).toContain('HOME guestStore=none');
  });

  it('signed in but not onboarded: sent to /welcome — Guest Mode never bypasses onboarding', () => {
    withBrowser();
    for (const onboarded of [false, null]) {
      const html = render(<GuestAllowedRoute />, auth({ signedIn: true, onboarded }));
      expect(html).toContain('REDIRECT /welcome');
      expect(html).not.toContain('HOME');
    }
  });

  it('while auth is loading: the loading screen, never a guest flash', () => {
    withBrowser();
    const html = render(<GuestAllowedRoute />, auth({ loading: true }));
    expect(html).toContain('Loading…');
    expect(html).not.toContain('HOME');
  });

  it('storage blocked entirely: treated as a new visitor', () => {
    withBrowser({ blocked: true });
    expect(render(<GuestAllowedRoute />, auth({}))).toContain('HOME guestStore=offered');
  });
});

describe('ProtectedRoute is unchanged', () => {
  it.each(['/tasks', '/focus', '/body-double'])('%s: a brand-new signed-out visitor still goes to /auth', (path) => {
    withBrowser();
    const html = render(<ProtectedRoute />, auth({}), path);
    expect(html).toContain('REDIRECT /auth');
    expect(html).not.toContain('HOME');
  });

  it('offers no guest store to a signed-in page', () => {
    withBrowser();
    expect(render(<ProtectedRoute />, auth({ signedIn: true }), '/tasks')).toContain('HOME guestStore=none');
  });
});

describe('account marker', () => {
  it('stores only the value 1 under ima.hasAccount', () => {
    const storage = withBrowser();
    expect(hasAccountMarker()).toBe(false);
    setAccountMarker();
    expect([...storage.data.entries()]).toEqual([['ima.hasAccount', '1']]);
    expect(hasAccountMarker()).toBe(true);
  });

  it('never throws when storage is blocked', () => {
    withBrowser({ blocked: true });
    expect(() => setAccountMarker()).not.toThrow();
    expect(hasAccountMarker()).toBe(false);
  });
});
