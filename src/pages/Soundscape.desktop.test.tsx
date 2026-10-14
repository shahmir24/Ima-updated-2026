import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import { SoundscapeContext, type SoundscapeValue } from '@/contexts/soundscape-context';
import { findSound } from '@/lib/soundscape/soundscape-session';
import Soundscape from './Soundscape';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const user = { id: '11111111-1111-4111-8111-111111111111' } as User;
const auth: AuthContextValue = {
  session: { user } as Session, user, onboardingCompleted: true, loading: false,
  signOut: async () => {}, refreshOnboardingStatus: async () => {}, markOnboardingComplete: () => {}
};

const soundscape = (over: Partial<SoundscapeValue> = {}): SoundscapeValue => ({
  selectedSound: findSound('rain'), volume: 75, status: 'idle', isActive: false, isLoading: false,
  errorMessage: null, activated: false, togglePlay: vi.fn(), selectSound: vi.fn(), setVolume: vi.fn(), ...over
});

const render = (value: SoundscapeValue) =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <SoundscapeContext.Provider value={value}>
          <MemoryRouter initialEntries={['/soundscape']}>
            <Soundscape />
          </MemoryRouter>
        </SoundscapeContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
/** The desktop player section only. */
const player = (html: string) => html.slice(html.indexOf('aria-label="Now playing"'), html.indexOf('id="sound-library-heading"'));
const library = (html: string) => html.slice(html.indexOf('id="sound-library-heading"'));

describe('Soundscape desktop layout', () => {
  it('desktop: a wider workspace, a left-aligned title with a subtitle, player and library side by side', () => {
    const html = render(soundscape());
    expect(html).toContain('max-w-3xl lg:max-w-5xl');
    expect(html).toContain('lg:justify-start lg:gap-3');
    expect(html).toContain('Ambient sound that keeps playing while you use the rest of iMA.');
    expect(html).toContain('lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]');
    expect(html).toMatch(/class="hidden lg:flex[^"]*"[^>]*>|aria-label="Now playing" class="hidden lg:flex/);
    // Phones: the original screen, hidden from lg.
    expect(html).toContain('class="contents lg:hidden"');
  });

  it.each([
    ['idle', false, 'Selected sound Rain Ready'],
    ['loading', true, 'Selected sound Rain Loading…'],
    ['playing', true, 'Now playing Rain Playing'],
    ['paused', false, 'Selected sound Rain Paused']
  ] as const)('player state %s', (status, isActive, expected) => {
    const html = render(soundscape({ status, isActive, isLoading: status === 'loading' }));
    expect(text(player(html))).toContain(expected);
    expect(player(html)).toContain(isActive ? 'aria-label="Pause Rain"' : 'aria-label="Play Rain"');
  });

  it('errors and the headphone hint show in the player', () => {
    const error = render(soundscape({ status: 'error', errorMessage: "That sound couldn't load." }));
    expect(text(player(error))).toContain("Couldn’t play That sound couldn't load.");
    const binaural = render(soundscape({ selectedSound: findSound('ambient'), status: 'playing', isActive: true }));
    expect(text(player(binaural))).toContain('Binaural Focus Playing Best experienced with headphones');
  });

  it('library: all five sounds, the selection pressed, Active only while playing', () => {
    const playing = library(render(soundscape({ selectedSound: findSound('waves'), status: 'playing', isActive: true })));
    for (const name of ['Rain', 'Ocean', 'Brown Noise', 'Binaural Focus', 'Wind']) expect(text(playing)).toContain(name);
    expect(playing.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(playing.match(/aria-pressed="false"/g)).toHaveLength(4);
    expect(text(playing)).toMatch(/Ocean Active/);
    expect(text(library(render(soundscape({ selectedSound: findSound('waves'), status: 'paused' }))))).not.toContain('Active');
    expect(text(library(render(soundscape({ selectedSound: findSound('waves'), status: 'loading', isActive: true }))))).not.toContain('Active');
  });

  it('the volume slider is named on the element that has role="slider", on phones and desktop', () => {
    const html = render(soundscape({ volume: 40 }));
    expect(text(html)).toContain('40%');
    const thumbs = html.match(/<span[^>]*role="slider"[^>]*>/g) ?? [];
    expect(thumbs).toHaveLength(2);
    // Radix fills in aria-valuenow once mounted in the browser; the name is there from the start.
    for (const thumb of thumbs) expect(thumb).toContain('aria-label="Volume"');
    const source = readFileSync(new URL('./Soundscape.tsx', import.meta.url), 'utf8');
    // The shared component is not modified, and both sliders save through the same commit.
    expect(source).not.toContain("from '@/components/ui/slider'");
    expect(source.match(/onValueCommit=\{handleVolumeCommit\}/g)).toHaveLength(2);
    expect(source).toContain('settingsSave.saveNow({ sound_volume: value[0] })');
  });

  it('desktop motion is calm and respects reduced motion; the phone rings are unchanged', () => {
    const source = readFileSync(new URL('./Soundscape.tsx', import.meta.url), 'utf8');
    expect(source).toContain("'opacity-100 motion-safe:animate-[pulse_6s_ease-in-out_infinite]'");
    expect(source).toContain('motion-reduce:transition-none');
    expect(source).toContain('w-32 h-32 rounded-full bg-gradient-to-br from-blue-500/30 to-teal-400/30 animate-ping');
  });
});
