import React from 'react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import SafeSpaceMenu from './SafeSpaceMenu';

const html = renderToString(
  <MemoryRouter initialEntries={['/safe-space']}>
    <SafeSpaceMenu />
  </MemoryRouter>
);

const SRC = new URL('..', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

describe('Safe Space without the AI Friend (deferred to post-MVP)', () => {
  it('the menu no longer offers the AI Friend chat or describes anything as AI', () => {
    expect(html).not.toMatch(/AI Friend|AI chat|\bAI\b/);
    expect(readFileSync(join(SRC, 'pages/SafeSpaceMenu.tsx'), 'utf8')).not.toContain("'/safe-space/chat'");
  });

  it('keeps emergency help, Safe Contacts, grounding and breathing', () => {
    for (const title of ['I Need Help Now', 'Safe Contacts', 'Grounding Techniques', 'Emergency Breathing']) {
      expect(html).toContain(title);
    }
  });

  it('/safe-space/chat redirects to the Safe Space menu, replacing the history entry', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
    expect(app).toMatch(/<Route path="\/safe-space\/chat" element=\{<Navigate to="\/safe-space" replace \/>\} \/>/);
    expect(app).not.toMatch(/import SafeSpaceChat|<SafeSpaceChat/);
  });

  it('nothing outside the kept chat page links or navigates to /safe-space/chat', () => {
    const linking = files(SRC).filter((path) => {
      if (/\.test\.tsx?$/.test(path) || path.endsWith('pages/SafeSpaceChat.tsx') || path.endsWith('App.tsx')) return false;
      return /(navigate\(|to=|route:|href)[^\n]*\/safe-space\/chat/.test(readFileSync(path, 'utf8'));
    });
    expect(linking).toEqual([]);
  });

  it('the emergency card reads “Emergency services and safe contacts”, not hotlines', () => {
    expect(html).toContain('Emergency services and safe contacts');
    expect(html).not.toContain('Crisis hotlines');
  });

  it('Wellness search no longer matches “chat” to Safe Space', () => {
    const wellness = readFileSync(join(SRC, 'pages/Wellness.tsx'), 'utf8');
    const keywords = wellness.match(/id: 'safe-space'[\s\S]*?keywords: \[([^\]]*)\]/)?.[1] ?? '';
    expect(keywords).toContain("'crisis'");
    expect(keywords).not.toContain("'chat'");
  });
});

describe('Safe Space menu — keyboard and desktop', () => {
  const cards = [...html.matchAll(/<button type="button"[^>]*>([\s\S]*?)<\/button>/g)];
  const card = (title: string) => cards.find((m) => m[1].includes(title))?.[0] ?? '';

  it('all four cards are native buttons: reachable with Tab, opened with Enter or Space', () => {
    for (const title of ['I Need Help Now', 'Safe Contacts', 'Grounding Techniques', 'Emergency Breathing']) {
      const button = card(title);
      expect(button, title).not.toBe('');
      expect(button, title).not.toContain('tabindex="-1"');
      expect(button, title).not.toContain('disabled');
    }
    // No clickable divs are left behind.
    expect(html).not.toMatch(/<div[^>]*cursor-pointer/);
  });

  it('the emergency card says it opens a dialog, and has a red focus ring outside its own ring', () => {
    const emergency = card('I Need Help Now');
    expect(emergency).toContain('aria-haspopup="dialog"');
    expect(emergency).toContain('focus-visible:ring-red-300');
    expect(emergency).toContain('focus-visible:ring-offset-2');
    expect(card('Safe Contacts')).toContain('focus-visible:ring-blue-300');
  });

  it('the cards keep their look: same surface, rounding, padding and hover', () => {
    for (const cls of ['bg-secondary/40', 'rounded-3xl', 'p-4', 'sm:p-6', 'hover:bg-secondary/60', 'card-hover']) {
      expect(card('Safe Contacts'), cls).toContain(cls);
    }
  });

  it('desktop: the header matches the content column, and the phone-only bottom padding is dropped', () => {
    expect(html).toMatch(/<div class="lg:\[&amp;&gt;header\]:max-w-xl xl:\[&amp;&gt;header\]:max-w-2xl lg:\[&amp;&gt;header\]:px-8"><header /);
    expect(html).toMatch(/pb-20 lg:pb-8/);
    expect(html).toContain('aria-label="Back"');
  });

  it('the emergency dialog keeps its numbers and two-step call, and hands focus back to whatever opened it', () => {
    const dialog = readFileSync(join(SRC, 'components/safe-space/EmergencyHelpDialog.tsx'), 'utf8');
    const numbers = readFileSync(join(SRC, 'lib/emergency-contacts.ts'), 'utf8');
    for (const n of ["number: '911'", "number: '999'", "number: '112'"]) expect(numbers).toContain(n);
    expect(dialog).toContain('Call {pending.number}?');
    expect(dialog).toMatch(/onOpenAutoFocus=\{[\s\S]*openerRef\.current = document\.activeElement/);
    expect(dialog).toMatch(/onCloseAutoFocus=\{[\s\S]*opener\.focus\(\)/);
  });
});

