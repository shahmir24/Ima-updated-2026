import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import { DESKTOP_DIALOG_OVERLAY, DESKTOP_DIALOG_PANEL } from '@/components/layout/desktop-dialog';
import { nextTrapIndex, shouldDismissOnKey } from '@/hooks/use-dialog-dismiss';
import type { TaskRow } from '@/hooks/use-tasks';
import CaptureReview from '@/components/capture/CaptureReview';
import QuickCaptureSheet from '@/components/capture/QuickCaptureSheet';
import { draftFromProposal } from '@/lib/capture/drafts';
import { NOT_TASK_KINDS } from '@/lib/ai/organize-contract';
import MeetingModal, { TASK_FORM_HEADING_ID } from './MeetingModal';
import TaskCard from './TaskCard';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Escape rule
// ---------------------------------------------------------------------------

describe('Escape-to-close rule', () => {
  it('closes on an unhandled Escape', () => {
    expect(shouldDismissOnKey({ key: 'Escape', defaultPrevented: false }, true)).toBe(true);
  });

  it('never when a nested picker already handled that Escape', () => {
    expect(shouldDismissOnKey({ key: 'Escape', defaultPrevented: true }, true)).toBe(false);
  });

  it('never while saving', () => {
    expect(shouldDismissOnKey({ key: 'Escape', defaultPrevented: false }, false)).toBe(false);
  });

  it('only Escape', () => {
    for (const key of ['Enter', 'Tab', ' ', 'Backspace']) expect(shouldDismissOnKey({ key, defaultPrevented: false }, true)).toBe(false);
  });

  it('Quick Capture uses the same rule (its nested date picker no longer closes the whole sheet)', () => {
    expect(read('../capture/QuickCaptureSheet.tsx')).toContain('if (shouldDismissOnKey(event, !state.saving)) close();');
  });

  it('Quick Capture returns focus to its opener, so New Task → Add manually → close lands back on New Task', () => {
    expect(read('../capture/QuickCaptureSheet.tsx')).toContain('useDialogFocusReturn(props.isOpen, panelRef);');
  });
});

describe('focus trap: where Tab goes at the edges', () => {
  it('Tab on the last control wraps to the first', () => {
    expect(nextTrapIndex(5, 4, false)).toBe(0);
  });
  it('Shift+Tab on the first control wraps to the last', () => {
    expect(nextTrapIndex(5, 0, true)).toBe(4);
  });
  it('between two controls the browser moves naturally', () => {
    expect(nextTrapIndex(5, 2, false)).toBeNull();
    expect(nextTrapIndex(5, 2, true)).toBeNull();
  });
  it('from the panel itself (just opened): Tab to the first, Shift+Tab to the last', () => {
    expect(nextTrapIndex(5, -1, false)).toBe(0);
    expect(nextTrapIndex(5, -1, true)).toBe(4);
  });
  it('a single control keeps focus', () => {
    expect(nextTrapIndex(1, 0, false)).toBe(0);
    expect(nextTrapIndex(1, 0, true)).toBe(0);
  });
  it('no controls: nothing to move to', () => {
    expect(nextTrapIndex(0, -1, false)).toBeNull();
  });
  it('the task form traps focus on desktop only, and nested pickers are exempt', () => {
    expect(read('./MeetingModal.tsx')).toContain('trapFocus: isDesktopViewport');
    const hook = read('../../hooks/use-dialog-dismiss.ts');
    expect(hook).toContain("window.matchMedia('(min-width: 1024px)')");
    expect(hook).toContain("const NESTED_LAYER = '[data-radix-popper-content-wrapper]';");
    // Keys from inside the portalled pickers are left to the pickers.
    expect(hook).toContain('if (event.target instanceof Element && event.target.closest(NESTED_LAYER)) return;');
    // A control that cannot take focus (Save while saving) is never the return target.
    expect(hook).toContain('if (lastInside && items.includes(lastInside)) return lastInside;');
  });
});

// ---------------------------------------------------------------------------
// New / Edit Task dialog
// ---------------------------------------------------------------------------

const row = (over: Partial<TaskRow> = {}): TaskRow =>
  ({
    id: 't1', user_id: 'u', title: 'Write the investor update', description: null, tag: 'focus', scheduled_date: '2026-10-14',
    start_time: '09:17:00', end_time: null, completed: false, completed_at: null, importance: 'high', created_at: '', updated_at: '', ...over
  }) as TaskRow;

const renderForm = (props: Partial<React.ComponentProps<typeof MeetingModal>> = {}) =>
  renderToString(<MeetingModal isOpen onClose={() => {}} onSubmit={async () => {}} {...props} />);

describe('task form dialog', () => {
  it('is a labelled modal dialog with an accessible close button', () => {
    const html = renderForm();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(`aria-labelledby="${TASK_FORM_HEADING_ID}"`);
    expect(html).toContain(`id="${TASK_FORM_HEADING_ID}"`);
    expect(html).toContain('aria-label="Close"');
    expect(text(html)).toContain('Create New Task');
  });

  it('keeps every field and the save action, in create and edit', () => {
    const create = text(renderForm());
    for (const label of ['Task Title', 'Date', 'Time', 'Importance', 'Low', 'Normal', 'High', 'Save Task']) expect(create).toContain(label);
    const edit = text(renderForm({ task: row() }));
    for (const label of ['Edit Task', 'Date', 'Time', '9:17 AM', 'Save Changes']) expect(edit).toContain(label);
  });

  it('Cancel exists for desktop only; the phone sheet is unchanged', () => {
    const html = renderForm();
    const cancel = /<button[^>]*class="([^"]*)"[^>]*>Cancel</.exec(html)?.[1] ?? '';
    expect(cancel.split(' ')).toEqual(expect.arrayContaining(['hidden', 'lg:inline-flex']));
    // The phone sheet classes are all still there, in order.
    expect(html).toContain('w-full max-w-lg mx-auto bg-background rounded-t-3xl min-h-[60vh] flex flex-col');
    expect(html).toContain('fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end');
  });

  it('desktop: centred 680px dialog in the workspace, Date and Time side by side', () => {
    const html = renderForm();
    expect(html).toContain(DESKTOP_DIALOG_OVERLAY);
    expect(html).toContain(DESKTOP_DIALOG_PANEL);
    expect(html).toContain('lg:max-w-[680px]');
    expect(html).toContain('lg:grid lg:grid-cols-2');
  });

  it('while saving, Close, Cancel and Save are all disabled', () => {
    const html = renderForm({ isSaving: true });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Close"|<button[^>]*aria-label="Close"[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Cancel</);
    expect(text(html)).toContain('Saving…');
  });

  it('wires Escape, Cancel and Close to onClose and nothing else', () => {
    const form = read('./MeetingModal.tsx');
    expect(form).toContain('useDialogDismiss({ open: isOpen, onDismiss: onClose, canDismiss: !isSaving, panelRef, trapFocus: isDesktopViewport });');
    expect(form.match(/onClick=\{onClose\}/g)).toHaveLength(2); // Close button + Cancel
    expect(form).toContain('await onSubmit(buildTaskFormInput({ title, date: selectedDate, time: selectedTime, importance }));');
  });

  it('Date and Time are real buttons that open their pickers (Tab reaches them; Enter and Space work natively)', () => {
    const html = renderForm({ task: row() });
    const date = /<button[^>]*type="button"[^>]*aria-haspopup="dialog"[^>]*>(?:(?!<\/button>)[\s\S])*?>Date<(?:(?!<\/button>)[\s\S])*<\/button>/.exec(html)?.[0] ?? '';
    const time = /<button[^>]*type="button"[^>]*aria-haspopup="dialog"[^>]*>(?:(?!<\/button>)[\s\S])*?>Time<(?:(?!<\/button>)[\s\S])*<\/button>/.exec(html)?.[0] ?? '';
    expect(date).toContain('Wednesday, 14 October 2026');
    expect(date).toContain('aria-expanded="false"');
    expect(time).toContain('9:17 AM');
    expect(time).not.toContain('aria-disabled');
    // Valid markup: no headings inside the buttons; a visible ring for keyboard focus only.
    expect(date + time).not.toMatch(/<h[1-6]/);
    expect(date).toContain('focus-visible:ring-2');
    // Same look as the old rows on every screen.
    expect(date).toContain('flex w-full items-center justify-between cursor-pointer');
    expect(date).toContain('block text-white font-semibold text-lg mb-1');
  });

  it('a Later task: the Time button stays focusable but is marked unavailable and explains why', () => {
    const html = renderForm({ task: row({ scheduled_date: null, start_time: null }) });
    const time = /<button[^>]*aria-disabled="true"[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/.exec(html)?.[0] ?? '';
    expect(time).toContain('Choose a day to add a time');
    expect(time).not.toMatch(/\sdisabled=""/);
  });

  it('closed: renders nothing', () => {
    expect(renderToString(<MeetingModal isOpen={false} onClose={() => {}} onSubmit={async () => {}} />)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Task rows
// ---------------------------------------------------------------------------

const card = (over: Partial<React.ComponentProps<typeof TaskCard>['task']> = {}, handlers = true) =>
  renderToString(
    <TaskCard
      task={{ id: 't1', title: 'Write the investor update', description: '', time: '9:17 AM', dateLabel: 'Today', tag: 'Focus', completed: false, ...over }}
      onComplete={() => {}}
      onDelete={() => {}}
      {...(handlers ? { onEdit: () => {}, onStart: () => {}, onStuck: () => {} } : {})}
    />
  );

describe('task rows', () => {
  it('keep every action and every piece of information', () => {
    const html = card();
    const t = text(html);
    for (const part of ['Write the investor update', 'Focus', 'Today', '9:17 AM', 'Start', 'I’m stuck']) expect(t).toContain(part);
    for (const label of ['Edit task "Write the investor update"', 'Delete task "Write the investor update"', 'Mark as done', 'Start "Write the investor update" in Focus', 'Get unstuck on "Write the investor update" with Body Double']) {
      expect(html.replace(/&quot;/g, '"')).toContain(`aria-label="${label}"`);
    }
  });

  it('desktop: a single-row grid (details | Start + I’m stuck | edit, delete, done)', () => {
    const html = card();
    expect(html).toContain('lg:grid lg:grid-cols-[minmax(0,1fr)_auto_auto]');
    expect(html).toContain('lg:contents');
    expect(html).toMatch(/lg:col-start-2 lg:row-span-3 lg:row-start-1/);
    expect(html).toMatch(/lg:col-start-3 lg:row-span-3 lg:row-start-1/);
  });

  it('phones keep the stacked card: the line break and the full-width buttons are still there', () => {
    const html = card();
    expect(html).toContain('rounded-3xl p-6');
    expect(html).toMatch(/<br class="lg:hidden"\/?>/);
    expect(html).toContain('min-h-11 flex-1 min-w-[130px] rounded-full');
  });

  it('a completed task shows no Start or I’m stuck, as before', () => {
    const t = text(card({ completed: true }));
    expect(t).not.toContain('Start');
    expect(t).not.toContain('I’m stuck');
    expect(t).toContain('Write the investor update');
  });

  it('no time: no stray separator', () => {
    expect(text(card({ time: '' }))).not.toContain('·');
  });

  it('the Tasks page widens to 5xl on desktop only', () => {
    expect(read('../../pages/Tasks.tsx')).toContain("const WORKSPACE = 'max-w-4xl lg:max-w-5xl';");
  });
});

// ---------------------------------------------------------------------------
// Quick Capture and Brain Dump review
// ---------------------------------------------------------------------------

const user = { id: '11111111-1111-4111-8111-111111111111' } as User;
const auth: AuthContextValue = {
  session: { user } as Session, user, onboardingCompleted: true, loading: false,
  signOut: async () => {}, refreshOnboardingStatus: async () => {}, markOnboardingComplete: () => {}
};

describe('Quick Capture dialog', () => {
  const render = () =>
    renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider value={auth}>
          <QuickCaptureSheet isOpen onClose={() => {}} isGuest={false} onAddManually={() => {}} create={async () => ({}) as never} onCreateAccount={() => {}} onLogIn={() => {}} />
        </AuthContext.Provider>
      </QueryClientProvider>
    );

  it('desktop: centred 720px dialog for writing; phone sheet classes unchanged', () => {
    const html = render();
    expect(html).toContain(DESKTOP_DIALOG_OVERLAY);
    expect(html).toContain('lg:max-w-[720px]');
    expect(html).toContain('mx-auto flex max-h-[92dvh] min-h-[60vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-background');
    expect(html).toContain('lg:min-h-[18rem]');
  });

  it('review is 920px wide on desktop', () => {
    expect(read('../capture/QuickCaptureSheet.tsx')).toContain("!guestBoundary && state.stage !== 'write' ? 'lg:max-w-[920px]' : 'lg:max-w-[720px]'");
  });
});

describe('Brain Dump review rows', () => {
  const draft = draftFromProposal(
    { title: 'Call the bank', importance: 'high', importanceBasis: 'stated', date: '2026-10-15', dateBasis: 'stated', dateText: 'tomorrow', time: '15:15', timeText: '3:15pm' },
    'k1'
  );
  const html = renderToString(
    <CaptureReview
      drafts={[draft]} notTasks={[{ text: 'feeling scattered', kind: NOT_TASK_KINDS[0] }]} today="2026-10-14" saving={false} saveError={null} invalid={{}}
      showImportanceQuestion={false} onSkipImportance={vi.fn()} onTitle={vi.fn()} onImportance={vi.fn()} onDate={vi.fn()} onTime={vi.fn()}
      onRemove={vi.fn()} onAddAnother={vi.fn()} onPromote={vi.fn()} onAddTasks={vi.fn()} onBack={vi.fn()}
    />
  );

  it('keeps every editable field and action', () => {
    const t = text(html);
    expect(html).toContain('value="Call the bank"');
    expect(html).toContain('type="time"');
    expect(html).toContain('value="15:15"');
    for (const part of ['Tomorrow', 'No time', 'Low', 'Normal', 'High', 'Add another', 'Add tasks', 'feeling scattered']) expect(t).toContain(part);
    expect(html).toContain('aria-label="Remove this task"');
  });

  it('desktop: two-line proposal rows and a right-aligned footer', () => {
    expect(html).toContain('lg:grid lg:grid-cols-[minmax(0,1fr)_auto]');
    expect(html).toContain('lg:col-span-2');
    expect(html).toContain('lg:w-[16.5rem]');
    expect(html).toContain('lg:flex-row-reverse');
  });
});
