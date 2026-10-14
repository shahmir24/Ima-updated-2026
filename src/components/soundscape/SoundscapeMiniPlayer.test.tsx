import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import { SoundscapeContext, type SoundscapeValue } from '@/contexts/soundscape-context';
import SoundscapeProvider from '@/contexts/SoundscapeProvider';
import { findSound } from '@/lib/soundscape/soundscape-session';
import Soundscape from '@/pages/Soundscape';
import SoundscapeMiniPlayer from './SoundscapeMiniPlayer';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const user = { id: '11111111-1111-4111-8111-111111111111' } as User;
const auth = (signedIn: boolean): AuthContextValue => ({
  session: signedIn ? ({ user } as Session) : null,
  user: signedIn ? user : null,
  onboardingCompleted: signedIn ? true : null,
  loading: false,
  signOut: async () => {},
  refreshOnboardingStatus: async () => {},
  markOnboardingComplete: () => {}
});

const soundscape = (over: Partial<SoundscapeValue> = {}): SoundscapeValue => ({
  selectedSound: findSound('rain'),
  volume: 75,
  status: 'playing',
  isActive: true,
  isLoading: false,
  errorMessage: null,
  activated: true,
  togglePlay: vi.fn(),
  selectSound: vi.fn(),
  setVolume: vi.fn(),
  ...over
});

function render(ui: React.ReactNode, path: string, value: SoundscapeValue | null, signedIn = true) {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth(signedIn)}>
        <SoundscapeContext.Provider value={value}>
          <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
        </SoundscapeContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

const shown = (html: string) => html.includes('data-testid="soundscape-mini-player"');
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('floating Soundscape control', () => {
  it('playing: a labelled pause button, bottom-right', () => {
    const html = render(<SoundscapeMiniPlayer />, '/tasks', soundscape());
    expect(shown(html)).toBe(true);
    expect(html).toContain('aria-label="Pause Rain soundscape"');
    expect(html).toContain('type="button"');
    expect(html).toContain('right-4');
    expect(html).toContain('bottom-[calc(6rem+env(safe-area-inset-bottom,0px))]');
  });

  it('paused: a play button for the selected sound', () => {
    const html = render(<SoundscapeMiniPlayer />, '/', soundscape({ isActive: false, status: 'paused', selectedSound: findSound('waves') }));
    expect(html).toContain('aria-label="Play Ocean soundscape"');
  });

  it('loading: says it will pause the loading sound', () => {
    expect(render(<SoundscapeMiniPlayer />, '/', soundscape({ isLoading: true, status: 'loading' }))).toContain(
      'aria-label="Pause Rain soundscape (loading)"'
    );
  });

  it('an error is exposed to assistive tech, not only as colour', () => {
    const html = render(
      <SoundscapeMiniPlayer />,
      '/',
      soundscape({ isActive: false, status: 'paused', errorMessage: 'Your browser blocked playback. Tap play again to start.' })
    );
    expect(html).toContain('aria-describedby="soundscape-mini-player-error"');
    expect(text(html)).toContain('Your browser blocked playback. Tap play again to start.');
  });

  it('hidden until a Soundscape has been started', () => {
    expect(shown(render(<SoundscapeMiniPlayer />, '/', soundscape({ activated: false, isActive: false })))).toBe(false);
  });

  it('hidden when signed out', () => {
    expect(shown(render(<SoundscapeMiniPlayer />, '/', soundscape(), false))).toBe(false);
  });

  it.each(['/soundscape', '/safe-space/chat'])('hidden on %s', (path) => {
    expect(shown(render(<SoundscapeMiniPlayer />, path, soundscape()))).toBe(false);
  });

  it('on /focus it sits left of the floating settings button', () => {
    const html = render(<SoundscapeMiniPlayer />, '/focus', soundscape());
    expect(html).toContain('right-[4.75rem]');
    expect(html).toContain('lg:right-[5.75rem]');
  });

  it('outside a provider it renders nothing', () => {
    expect(shown(render(<SoundscapeMiniPlayer />, '/', null))).toBe(false);
  });

  it('has no pulsing or scaling animation', () => {
    const html = render(<SoundscapeMiniPlayer />, '/', soundscape());
    expect(html).not.toMatch(/animate-|scale-/);
  });

  it('with the real provider on a fresh visit: nothing is shown (no autoplay, not activated)', () => {
    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider value={auth(true)}>
          <SoundscapeProvider>
            <MemoryRouter initialEntries={['/']}>
              <SoundscapeMiniPlayer />
            </MemoryRouter>
          </SoundscapeProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    );
    expect(shown(html)).toBe(false);
  });
});

describe('Soundscape page — same screen, now a view of the app-wide player', () => {
  it('renders the existing controls with the shared state', () => {
    const html = render(<Soundscape />, '/soundscape', soundscape({ selectedSound: findSound('ambient'), volume: 40 }));
    const t = text(html);
    expect(t).toContain('Soundscaping');
    expect(html).toContain('aria-label="Pause Binaural Focus"');
    for (const name of ['Rain', 'Ocean', 'Brown Noise', 'Binaural Focus', 'Wind']) expect(t).toContain(name);
    expect(t).toContain('Best experienced with headphones');
    expect(t).toContain('40%');
    expect(html).toMatch(/aria-pressed="true"[^>]*>[\s\S]*?Binaural Focus/);
  });

  it('shows loading and error states as before', () => {
    expect(text(render(<Soundscape />, '/soundscape', soundscape({ isLoading: true, status: 'loading' })))).toContain('Loading…');
    expect(text(render(<Soundscape />, '/soundscape', soundscape({ isActive: false, status: 'error', errorMessage: "That sound couldn't load." })))).toContain(
      "That sound couldn&#x27;t load."
    );
  });

  it('paused: shows Play for the selected sound', () => {
    expect(render(<Soundscape />, '/soundscape', soundscape({ isActive: false, status: 'paused' }))).toContain('aria-label="Play Rain"');
  });
});

describe('regression guards', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('there is exactly one Soundscape player: created by the provider only', () => {
    expect(read('../../pages/Soundscape.tsx')).not.toContain('useSoundscapePlayer');
    expect(read('../../contexts/SoundscapeProvider.tsx')).toContain('useSoundscapePlayer(');
    const app = read('../../App.tsx');
    expect(app.match(/<SoundscapeProvider>/g)).toHaveLength(1);
    expect(app.match(/<SoundscapeMiniPlayer \/>/g)).toHaveLength(1);
    expect(app.indexOf('<SoundscapeProvider>')).toBeLessThan(app.indexOf('<BrowserRouter>'));
  });

  it('the player engine keeps its safeguards (one source, stop-before-start, stale-load guard, gesture resume)', () => {
    const engine = read('../../hooks/use-soundscape-player.ts');
    expect(engine).toContain('stopSource();');
    expect(engine).toContain('const stale = () => !liveRef.current || request !== requestRef.current;');
    expect(engine).toContain('const resumed = context.resume().catch(() => undefined);');
    expect(engine).toContain('source.loop = true;');
  });

  it('spoken guidance claims audio focus only while active and audible', () => {
    const hook = read('../../hooks/use-spoken-guidance.ts');
    expect(hook).toContain("const holdsFocus = supported && !!options.active && !muted;");
    expect(hook).toContain('return audioFocus.claim();');
  });

  it.each([
    ['../../pages/breathing/SteadySquare.tsx', 'active: isActive'],
    ['../../pages/breathing/TriangleCalm.tsx', 'active: isActive'],
    ['../../pages/breathing/DeepReset.tsx', 'active: isActive'],
    ['../../pages/breathing/SleepSwitch.tsx', 'active: isActive'],
    ['../../pages/BodyScanSession.tsx', 'active: isPlaying']
  ])('%s tells guidance when it is active', (path, flag) => {
    expect(read(path)).toContain(flag);
  });
});
