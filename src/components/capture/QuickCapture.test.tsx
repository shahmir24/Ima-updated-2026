import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { OrganizeResult } from '@/lib/ai/organize-contract';
import { captureReducer, initialCaptureState, type CaptureState } from '@/lib/capture/drafts';
import type { CaptureOrganizer } from '@/hooks/use-capture-organizer';
import BrainDumpInput from './BrainDumpInput';
import CaptureReview from './CaptureReview';
import QuickCaptureSheet from './QuickCaptureSheet';
import VoiceControls from './VoiceControls';
import { VOICE_COPY } from './voice-copy';
import type { VoiceEnv, VoiceStatus } from '@/lib/voice/voice-capture';

// The real organizer hook must never be reached: a fake is passed in.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const RESULT: OrganizeResult = {
  proposals: [
    { title: 'Research Dubai accelerators', importance: 'normal', importanceBasis: 'default', date: null, dateBasis: null, dateText: null, time: null, timeText: null },
    { title: 'Work on the landing page', importance: 'normal', importanceBasis: 'default', date: TODAY, dateBasis: 'inferred', dateText: 'tonight', time: null, timeText: 'tonight' }
  ],
  notTasks: [{ text: 'feeling scattered', kind: 'note' }]
};
const reviewState = (): CaptureState => captureReducer({ ...initialCaptureState, text: 'dump' }, { type: 'organized', result: RESULT });

const organizer = (): CaptureOrganizer & { organize: ReturnType<typeof vi.fn> } => ({
  pending: false,
  error: null,
  organize: vi.fn(async () => RESULT),
  clearError: () => {}
});

const sheet = (overrides: Partial<React.ComponentProps<typeof QuickCaptureSheet>> = {}) => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    isGuest: false,
    onAddManually: vi.fn(),
    create: vi.fn(async () => ({})),
    onCreateAccount: vi.fn(),
    onLogIn: vi.fn(),
    organizer: organizer(),
    ...overrides
  };
  // React separates adjacent text nodes with <!-- --> in server output; drop it for text assertions.
  return { html: renderToString(<QuickCaptureSheet {...props} />).replace(/<!-- -->/g, ''), props };
};

type El = React.ReactElement<Record<string, unknown> & { children?: React.ReactNode }>;
/** Walks a presentational component's element tree (no rendering) to reach its handlers. */
function find(node: React.ReactNode, match: (el: El) => boolean): El[] {
  const out: El[] = [];
  const walk = (n: React.ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!React.isValidElement(n)) return;
    const el = n as El;
    if (match(el)) out.push(el);
    walk(el.props.children);
  };
  walk(node);
  return out;
}
const textOf = (el: El): string => {
  const parts: string[] = [];
  const walk = (n: React.ReactNode) => {
    if (typeof n === 'string') parts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (React.isValidElement(n)) walk((n as El).props.children);
  };
  walk(el.props.children);
  return parts.join('');
};

describe('Quick Capture — write step', () => {
  it('shows the heading, supporting copy, the AI note and the two actions', () => {
    const { html } = sheet();
    expect(html).toContain('What&#x27;s on your mind?');
    expect(html).toContain('Dump your tasks, ideas, reminders, whatever. iMA will help sort them out.');
    expect(html).toContain('Organize it');
    expect(html).toContain('Add manually');
    expect(html).toContain('your text is sent to an AI service');
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain('—');
  });

  it('opening it calls nothing: no organize, no save', () => {
    const { props } = sheet();
    expect(props.organizer.organize).not.toHaveBeenCalled();
    expect(props.create).not.toHaveBeenCalled();
  });

  it('closed renders nothing', () => {
    expect(sheet({ isOpen: false }).html).toBe('');
  });

  it('Add manually calls the existing manual form opener', () => {
    const onAddManually = vi.fn();
    const tree = BrainDumpInput({ text: '', onTextChange: () => {}, onOrganize: () => {}, onAddManually, organizing: false, error: null, isGuest: false });
    const button = find(tree, (el) => typeof el.props.onClick === 'function' && textOf(el) === 'Add manually')[0];
    (button.props.onClick as () => void)();
    expect(onAddManually).toHaveBeenCalledTimes(1);
  });

  it('typing goes through onTextChange (the slot voice will reuse later)', () => {
    const onTextChange = vi.fn();
    const tree = BrainDumpInput({ text: '', onTextChange, onOrganize: () => {}, onAddManually: () => {}, organizing: false, error: null, isGuest: false });
    const [area] = find(tree, (el) => el.props.id === 'brain-dump');
    (area.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'call Ali' } });
    expect(onTextChange).toHaveBeenCalledWith('call Ali');
    expect(area.props.maxLength).toBe(2000);
  });

  it('Organize it is disabled with nothing written', () => {
    const tree = BrainDumpInput({ text: '   ', onTextChange: () => {}, onOrganize: () => {}, onAddManually: () => {}, organizing: false, error: null, isGuest: false });
    const [organize] = find(tree, (el) => typeof el.props.onClick === 'function' && textOf(el).includes('Organize it'));
    expect(organize.props.disabled).toBe(true);
  });

  it('a guest sees no AI note (organizing needs an account)', () => {
    expect(sheet({ isGuest: true }).html).not.toContain('AI service');
  });
});

describe('Quick Capture — review step', () => {
  it('shows each proposal editable, Later for unscheduled, Check this for inferred, and the thoughts', () => {
    const html = sheet({ initialState: reviewState() }).html;
    expect(html).toContain('value="Research Dubai accelerators"');
    expect(html).toContain('value="Work on the landing page"');
    expect(html).toContain('Date: Later');
    expect(html).toContain('Date: Today');
    expect(html).toContain('Tonight · Check this');
    expect(html).toContain('1 thought not added as a task');
    expect(html).toContain('Add another');
    expect(html).toContain('Add tasks');
    expect(html).not.toMatch(/\bnull\b|provenance|schema|database/i);
  });

  it('rendering the review saves nothing', () => {
    const { props } = sheet({ initialState: reviewState() });
    expect(props.create).not.toHaveBeenCalled();
  });

  it('review controls report the right actions', () => {
    const calls: unknown[] = [];
    const record = (name: string) => (...args: unknown[]) => calls.push([name, ...args]);
    const state = reviewState();
    const tree = CaptureReview({
      drafts: state.drafts,
      notTasks: state.notTasks,
      today: TODAY,
      saving: false,
      saveError: null,
      invalid: {},
      showImportanceQuestion: true,
      onSkipImportance: record('skipImportance'),
      onTitle: record('title'),
      onImportance: record('importance'),
      onDate: record('date'),
      onTime: record('time'),
      onRemove: record('remove'),
      onAddAnother: record('addAnother'),
      onPromote: record('promote'),
      onAddTasks: record('addTasks'),
      onBack: record('back')
    });
    const click = (label: string) => (find(tree, (el) => typeof el.props.onClick === 'function' && textOf(el).includes(label))[0].props.onClick as () => void)();
    click('Add another');
    click('Make it a task');
    click('Add tasks');
    click('Edit text');
    // Each card's callbacks are bound to its own draft.
    const cards = find(tree, (el) => typeof el.props.onRemove === 'function');
    (cards[0].props.onRemove as () => void)();
    (cards[0].props.onDate as (d: string | null) => void)(null);
    (cards[1].props.onTitle as (t: string) => void)('Edited');
    expect(calls).toEqual([
      ['addAnother'],
      ['promote', 0],
      ['addTasks'],
      ['back'],
      ['remove', state.drafts[0].key],
      ['date', state.drafts[0].key, null],
      ['title', state.drafts[1].key, 'Edited']
    ]);
  });
});

describe('Tasks wiring', () => {
  it('New Task opens Quick Capture; Add manually opens the existing form; saving uses the task source', () => {
    const source = readFileSync(new URL('../../pages/Tasks.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/onClick=\{\(\) => setShowCapture\(true\)\}[\s\S]{0,400}New Task/);
    expect(source).toMatch(/const openManualFromCapture = \(\) => \{\s*setShowCapture\(false\);\s*openCreateModal\(\);/);
    expect(source).toMatch(/<QuickCaptureSheet[\s\S]*?create=\{createTask\.run\}[\s\S]*?isGuest=\{isGuest\}|<QuickCaptureSheet[\s\S]*?isGuest=\{isGuest\}[\s\S]*?create=\{createTask\.run\}/);
    expect(source).toContain('<MeetingModal');
  });
});

describe('Quick Capture: optional importance question', () => {
  const stated = (title: string, importance: 'high' | 'low') => ({
    title, importance, importanceBasis: 'stated' as const, date: null, dateBasis: null, dateText: null, time: null, timeText: null
  });
  const stateFor = (result: OrganizeResult) => captureReducer({ ...initialCaptureState, text: 'dump' }, { type: 'organized', result });
  const QUESTION = 'Anything here particularly important to you?';

  it('shows once, above the list, when any proposal has unclear importance; Add tasks stays enabled', () => {
    const html = sheet({ initialState: reviewState() }).html;
    expect(html.split(QUESTION)).toHaveLength(2);
    expect(html.indexOf(QUESTION)).toBeLessThan(html.indexOf('value="Research Dubai accelerators"'));
    expect(html).toContain('>Skip<');
    const addTasks = html.slice(html.lastIndexOf('<button', html.indexOf('>Add tasks<')), html.indexOf('>Add tasks<'));
    expect(addTasks).not.toContain('disabled=""');
  });

  it('is not shown when every proposal has stated importance', () => {
    const html = sheet({ initialState: stateFor({ proposals: [stated('Pay rent', 'high'), stated('Tidy desk', 'low')], notTasks: [] }) }).html;
    expect(html).not.toContain(QUESTION);
    expect(html).not.toContain('data-importance-unclear');
  });

  it('reuses the existing importance buttons: one set per card, tied to the question only on unclear cards', () => {
    const state = stateFor({ proposals: [RESULT.proposals[0], stated('Pay rent', 'high')], notTasks: [] });
    const html = sheet({ initialState: state }).html;
    expect(html.match(/aria-pressed=/g)).toHaveLength(6);
    expect(html.match(/data-importance-unclear="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-describedby="capture-importance-question"');
  });

  it('Skip reports skipImportance', () => {
    const onSkipImportance = vi.fn();
    const state = reviewState();
    const tree = CaptureReview({
      drafts: state.drafts, notTasks: [], today: TODAY, saving: false, saveError: null, invalid: {},
      showImportanceQuestion: true, onSkipImportance,
      onTitle: vi.fn(), onImportance: vi.fn(), onDate: vi.fn(), onTime: vi.fn(), onRemove: vi.fn(),
      onAddAnother: vi.fn(), onPromote: vi.fn(), onAddTasks: vi.fn(), onBack: vi.fn()
    });
    const [skip] = find(tree, (el) => typeof el.props.onClick === 'function' && textOf(el) === 'Skip');
    (skip.props.onClick as () => void)();
    expect(onSkipImportance).toHaveBeenCalledTimes(1);
  });

  it('after Skip the question is gone and the review is otherwise unchanged', () => {
    const skipped = captureReducer(reviewState(), { type: 'skipImportance' });
    const html = sheet({ initialState: skipped }).html;
    expect(html).not.toContain(QUESTION);
    expect(html).toContain('value="Research Dubai accelerators"');
    expect(html).toContain('>Add tasks<');
  });
});

describe('Quick Capture: Voice Brain Dump', () => {
  /** A browser that can record webm. Nothing here is ever started: server rendering runs no effects. */
  const capableEnv = () => {
    const Recorder = class {} as unknown as NonNullable<VoiceEnv['MediaRecorder']>;
    Recorder.isTypeSupported = (type: string) => type.startsWith('audio/webm');
    return { getUserMedia: vi.fn(), MediaRecorder: Recorder, isSecureContext: true } satisfies VoiceEnv;
  };
  const voiceOptions = () => ({ env: capableEnv(), transcribe: vi.fn() });

  it('signed in on a capable browser: the mic sits under the same box, idle, with the privacy note', () => {
    const options = voiceOptions();
    const { html } = sheet({ voiceOptions: options });
    expect(html).toContain('data-testid="voice-controls"');
    expect(html).toContain('data-status="idle"');
    expect(html).toContain(`aria-label="${VOICE_COPY.record}"`);
    expect(html).toContain(VOICE_COPY.idleHint);
    expect(html.replace(/&#x27;/g, "'")).toContain(VOICE_COPY.privacy);
    expect(html.indexOf('id="brain-dump"')).toBeLessThan(html.indexOf('data-testid="voice-controls"'));
    // Rendering never asks for the microphone or sends anything.
    expect(options.env.getUserMedia).not.toHaveBeenCalled();
    expect(options.transcribe).not.toHaveBeenCalled();
  });

  it('guests never see the mic', () => {
    const { html } = sheet({ isGuest: true, voiceOptions: voiceOptions() });
    expect(html).not.toContain('voice-controls');
    expect(html).not.toContain(VOICE_COPY.record);
  });

  it.each([
    ['no MediaRecorder', { MediaRecorder: undefined }],
    ['no microphone API', { getUserMedia: undefined }],
    ['not a secure context', { isSecureContext: false }],
    ['no supported format', { MediaRecorder: Object.assign(class {}, { isTypeSupported: () => false }) }]
  ])('unsupported browser (%s): the mic is hidden and typing works as before', (_label, patch) => {
    const { html } = sheet({ voiceOptions: { env: { ...capableEnv(), ...patch } as VoiceEnv, transcribe: vi.fn() } });
    expect(html).not.toContain('voice-controls');
    expect(html).toContain('id="brain-dump"');
  });

  it('Organize it is disabled while voice is still producing text', () => {
    const props = { text: 'Buy shoes', onTextChange: vi.fn(), onOrganize: vi.fn(), onAddManually: vi.fn(), organizing: false, error: null, isGuest: false };
    const organizeButton = (extra: Record<string, unknown>) =>
      find(BrainDumpInput({ ...props, ...extra }), (el) => el.props.onClick === props.onOrganize)[0];
    expect(organizeButton({}).props.disabled).toBe(false);
    expect(organizeButton({ organizeDisabled: true }).props.disabled).toBe(true);
  });

  it('voice only fills the box: the sheet never organizes or saves from a transcript', () => {
    const source = readFileSync(new URL('./QuickCaptureSheet.tsx', import.meta.url), 'utf8');
    const callback = source.slice(source.indexOf('useVoiceCapture('), source.indexOf('enabled: !props.isGuest'));
    expect(callback).toContain("type: 'text'");
    expect(callback).toContain('appendTranscript(textRef.current');
    expect(callback).not.toMatch(/\b(organize|create|runSave|onClose|close)\s*\(|'organized'|'saving'/);
  });
});

describe('VoiceControls', () => {
  const base = { message: null, elapsedMs: 0, autoStopped: false, notice: null, onStart: vi.fn(), onStop: vi.fn() };
  const render = (props: Partial<React.ComponentProps<typeof VoiceControls>> & { status: VoiceStatus }) => {
    const all = { ...base, onStart: vi.fn(), onStop: vi.fn(), ...props };
    const tree = VoiceControls(all);
    const button = find(tree, (el) => el.type === 'button')[0];
    const line = find(tree, (el) => el.props.role === 'status' || el.props.role === 'alert')[0];
    return { all, button, line, html: renderToString(<VoiceControls {...all} />).replace(/<!-- -->/g, '') };
  };

  it('idle: tapping starts a recording', () => {
    const { all, button, line } = render({ status: 'idle' });
    expect(button.props['aria-label']).toBe(VOICE_COPY.record);
    expect(button.props.disabled).toBe(false);
    (button.props.onClick as () => void)();
    expect(all.onStart).toHaveBeenCalled();
    expect(textOf(line)).toBe(VOICE_COPY.idleHint);
  });

  it('recording: shows the time against the one-minute cap, and tapping stops', () => {
    const { all, button, line } = render({ status: 'recording', elapsedMs: 12_400 });
    expect(button.props['aria-label']).toBe(VOICE_COPY.stop);
    expect(button.props['aria-pressed']).toBe(true);
    expect(textOf(line)).toBe('Listening 0:12 of 1:00. Tap to stop.');
    (button.props.onClick as () => void)();
    expect(all.onStop).toHaveBeenCalled();
    expect(all.onStart).not.toHaveBeenCalled();
  });

  it.each([
    ['requesting', VOICE_COPY.requesting],
    ['stopping', VOICE_COPY.stopping],
    ['transcribing', VOICE_COPY.transcribing]
  ] as const)('%s: busy, the button cannot be pressed', (status, copy) => {
    const { button, line } = render({ status });
    expect(button.props.disabled).toBe(true);
    expect(line.props.role).toBe('status');
    expect(textOf(line)).toBe(copy);
  });

  it('error: the message is announced and you can try again', () => {
    const { all, button, line } = render({ status: 'error', message: 'No microphone was found. You can still type.' });
    expect(line.props.role).toBe('alert');
    expect(textOf(line)).toBe('No microphone was found. You can still type.');
    (button.props.onClick as () => void)();
    expect(all.onStart).toHaveBeenCalled();
  });

  it('after an automatic stop, and when the transcript did not all fit', () => {
    expect(textOf(render({ status: 'idle', autoStopped: true }).line)).toBe(VOICE_COPY.autoStopped);
    expect(textOf(render({ status: 'idle', autoStopped: true, notice: VOICE_COPY.truncated }).line)).toBe(VOICE_COPY.truncated);
  });

  it('the privacy note speaks only for iMA, not for the transcription provider', () => {
    expect(VOICE_COPY.privacy).toBe("Your voice is transcribed securely. Audio isn't saved by iMA.");
    expect(VOICE_COPY.privacy).not.toMatch(/never (stored|saved|kept)|not (stored|saved|kept) anywhere|deleted/i);
  });

  it('copy has no em dashes', () => {
    const all = Object.values(VOICE_COPY).map((v) => (typeof v === 'function' ? v('0:01', '1:00') : v)).join(' ');
    expect(all).not.toContain('—');
  });
});
