import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Safe Contacts screen in each state of its data. The hooks are replaced
 * by fixed results; their own behaviour is tested in use-safe-contacts.test.
 */

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  deleteError: null as unknown
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/use-safe-contacts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-safe-contacts')>();
  const mutation = () => ({ mutate: () => {}, mutateAsync: async () => {}, reset: () => {}, isPending: false, isError: false, error: null });
  return {
    ...actual,
    useSafeContacts: () => state.query,
    useCreateSafeContact: mutation,
    useDeleteSafeContact: () => ({ ...mutation(), isError: state.deleteError !== null, error: state.deleteError })
  };
});

const { default: SafeContacts } = await import('./SafeContacts');

const RAW = /safe_contacts|row-level|policy|constraint|relation|PGRST|42501|JWT/i;
const contact = (over: Record<string, unknown>) => ({
  id: 'c', user_id: 'u', label: 'Support Person', phone: null, email: null, instagram: null, note: null,
  position: 0, created_at: '', updated_at: '', ...over
});
const loaded = (data: unknown[]) => ({ data, isPending: false, isError: false, isSuccess: true, isFetching: false, error: null, refetch: () => {} });

const render = () =>
  renderToString(
    <MemoryRouter initialEntries={['/safe-space/contacts']}>
      <SafeContacts />
    </MemoryRouter>
  );

beforeEach(() => {
  state.query = loaded([]);
  state.deleteError = null;
});

describe('Safe Contacts — loading and failure', () => {
  it('while the list is loading: says so, and offers no way to add someone yet', () => {
    state.query = { data: undefined, isPending: true, isError: false, isSuccess: false, isFetching: true, error: null, refetch: () => {} };
    const html = render();
    expect(html).toMatch(/role="status"[^>]*>Loading your circle…/);
    expect(html).not.toContain('Add Someone to Your Circle');
    expect(html).not.toContain('Build Your Support Circle');
  });

  it('a failed load: a friendly, announced message and Try again — no database text, no Add button', () => {
    state.query = {
      data: undefined, isPending: false, isError: true, isSuccess: false, isFetching: false, refetch: () => {},
      error: { code: '42501', message: 'permission denied for relation "safe_contacts"' }
    };
    const html = render();
    expect(html).toMatch(/role="alert"[^>]*>We couldn’t open your safe contacts/);
    expect(html).toContain('Try again');
    expect(html).not.toMatch(RAW);
    expect(html).not.toContain('Add Someone to Your Circle');
  });

  it('the emergency numbers are shown in every state', () => {
    for (const query of [loaded([]), { ...loaded([]), isSuccess: false, isPending: true }, { ...loaded([]), isSuccess: false, isError: true, error: {} }]) {
      state.query = query;
      const html = render();
      for (const number of ['911', '999', '112']) expect(html).toContain(`>${number}<`);
    }
  });

  it('a failed removal: announced in friendly words, and the contact is still listed', () => {
    state.query = loaded([contact({ id: 'c1', name: 'Amira', phone: '+44 7700 900123' })]);
    state.deleteError = { code: '42501', message: 'new row violates row-level security policy for table "safe_contacts"' };
    const html = render();
    expect(html).toMatch(/role="alert"[^>]*>We couldn’t change your circle with this account, so nobody was removed/);
    expect(html).toContain('Amira');
    expect(html).not.toMatch(RAW);
  });
});

describe('Safe Contacts — actions on a contact', () => {
  it('Instagram-only: no Support Message, and a labelled Instagram button instead of a lone icon', () => {
    state.query = loaded([contact({ id: 's', name: 'Sam', instagram: '@sam.hype' })]);
    const html = render();
    expect(html).not.toContain('Support Message');
    expect(html).not.toContain('aria-label="Call Sam"');
    expect(html).toContain('aria-label="Open Sam’s Instagram (opens in a new tab)"');
    expect(html).toMatch(/Instagram<\/button>/);
  });

  it('every icon-only button has a name, and every action names the person', () => {
    state.query = loaded([
      contact({ id: 'a', name: 'Amira', phone: '+44 7700 900123', email: 'amira@example.com', instagram: 'amira.k' }),
      contact({ id: 'l', name: 'Dr. Lee', email: 'lee@example.com' })
    ]);
    const html = render();
    for (const name of ['Call Amira', 'Send Amira a support message', 'Email Amira', 'Open Amira’s Instagram (opens in a new tab)',
      'Remove Amira from your circle', 'Send Dr. Lee a support message', 'Email Dr. Lee', 'Back']) {
      expect(html, name).toContain(`aria-label="${name}"`);
    }
    // Dr. Lee has no phone: no Call button for them.
    expect(html).not.toContain('aria-label="Call Dr. Lee"');
  });

  it('a stored contact whose details cannot make any link says so instead of showing dead buttons', () => {
    state.query = loaded([contact({ id: 'x', name: 'Old', phone: 'n/a', email: 'nope', instagram: 'not a handle' })]);
    const html = render();
    expect(html.replace(/<!-- -->/g, '')).toContain('No working phone number, email or Instagram handle is saved for Old.');
    expect(html).not.toContain('Support Message');
  });
});

describe('Safe Contacts — action row on narrow screens', () => {
  // The row of a contact's actions, as rendered: the div holding "Call <name>"
  // (or, for Instagram-only, the Instagram button) and everything up to its end.
  const actionRow = (html: string, firstLabel: string) => {
    const at = html.indexOf(`aria-label="${firstLabel}"`);
    const open = html.lastIndexOf('<div class="', at);
    return { classes: html.slice(open + 12, html.indexOf('"', open + 12)), body: html.slice(open, html.indexOf('</div>', at)) };
  };

  it.each([
    ['1 action', contact({ id: 's', name: 'Sam', instagram: 'sam' }), ['Open Sam’s Instagram (opens in a new tab)']],
    ['2 actions', contact({ id: 'l', name: 'Lee', email: 'lee@example.com' }), ['Send Lee a support message', 'Email Lee']],
    ['3 actions', contact({ id: 'n', name: 'Noor', phone: '555 0102', email: 'noor@example.com' }), ['Call Noor', 'Send Noor a support message', 'Email Noor']],
    ['4 actions', contact({ id: 'a', name: 'Amira', phone: '+44 7700', email: 'a@example.com', instagram: 'amira.k' }),
      ['Call Amira', 'Send Amira a support message', 'Email Amira', 'Open Amira’s Instagram (opens in a new tab)']]
  ])('%s: all in one row that wraps instead of overflowing, spaced by gap', (_label, row, labels) => {
    state.query = loaded([row]);
    const { classes, body } = actionRow(render(), labels[0]);
    expect(classes.split(' ')).toEqual(['flex', 'flex-wrap', 'gap-2']);
    // No horizontal margins left over from space-x-*, which would double up with gap.
    expect(classes).not.toMatch(/space-x/);
    for (const label of labels) expect(body, label).toContain(`aria-label="${label}"`);
  });

  it('desktop keeps its fixed action widths', () => {
    state.query = loaded([contact({ id: 'a', name: 'Amira', phone: '+44 7700', email: 'a@example.com' })]);
    const html = render();
    for (const label of ['Call Amira', 'Send Amira a support message']) {
      const button = html.slice(html.lastIndexOf('<button', html.indexOf(`aria-label="${label}"`)), html.indexOf(`aria-label="${label}"`));
      expect(button, label).toMatch(/flex-1 lg:flex-none lg:min-w-\[10rem\]/);
    }
  });
});

describe('Safe Contacts — source guarantees', () => {
  const source = readFileSync(new URL('./SafeContacts.tsx', import.meta.url), 'utf8');

  it('every form field has a label tied to it', () => {
    const fieldIds = [...source.matchAll(/<(?:Input|Textarea)\s+id=\{ids\.(\w+)\}/g)].map((m) => m[1]);
    expect(fieldIds.sort()).toEqual(['email', 'instagram', 'label', 'name', 'note', 'phone']);
    for (const id of fieldIds) expect(source).toContain(`<label htmlFor={ids.${id}}`);
  });

  it('suggested labels report which one is selected', () => {
    expect(source).toContain('aria-pressed={newContact.label === label}');
  });

  it('no stored text is put into a link directly, and Instagram opens without access to this page', () => {
    expect(source).not.toMatch(/`(?:tel|sms|mailto):\$\{/);
    expect(source).not.toMatch(/instagram\.com\/\$\{/);
    expect(source).toContain("window.open(url, '_blank', 'noopener,noreferrer')");
  });

  it('no error object’s own message is rendered', () => {
    expect(source).not.toMatch(/\(\w*[eE]rror as Error\)\??\.message/);
    expect(source).not.toMatch(/err\.message/);
  });

  it('the list query retries once, not React Query’s default three times', () => {
    const hook = readFileSync(new URL('../hooks/use-safe-contacts.ts', import.meta.url), 'utf8');
    expect(hook).toMatch(/retry: SAFE_CONTACTS_RETRIES,\s+retryDelay: SAFE_CONTACTS_RETRY_DELAY_MS/);
  });
});
