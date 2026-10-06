import { describe, expect, it, vi } from 'vitest';
import { ORGANIZE_FUNCTION, requestOrganize } from './use-capture-organizer';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const TODAY = '2026-10-06';
type Invoke = Parameters<typeof requestOrganize>[1];
const invokeReturning = (result: unknown) => vi.fn(async () => result) as unknown as Invoke & ReturnType<typeof vi.fn>;

describe('requestOrganize (client)', () => {
  it('calls organize-capture with only text, today and the zone', async () => {
    const invoke = invokeReturning({ data: { ok: true, proposals: [], notTasks: [] }, error: null });
    await requestOrganize({ text: 'call Ali', today: TODAY, timeZone: 'Asia/Karachi' }, invoke);
    expect(invoke).toHaveBeenCalledWith(ORGANIZE_FUNCTION, { body: { text: 'call Ali', today: TODAY, timeZone: 'Asia/Karachi' } });
  });

  it('re-validates the reply with the same contract: bad items are cleaned on the client too', async () => {
    const invoke = invokeReturning({
      data: {
        ok: true,
        proposals: [{ title: 'Call Ali', importance: 'high', importanceBasis: 'default', date: '2020-01-01', dateBasis: 'stated', dateText: null, time: '09:00', timeText: null, rank: 1 }],
        notTasks: []
      },
      error: null
    });
    const outcome = await requestOrganize({ text: 'x', today: TODAY }, invoke);
    expect(outcome).toEqual({
      ok: true,
      result: { proposals: [{ title: 'Call Ali', importance: 'normal', importanceBasis: 'default', date: null, dateBasis: null, dateText: null, time: null, timeText: null }], notTasks: [] }
    });
  });

  it.each([
    ['unauthenticated', 'Your session could not be verified. Sign in and try again.'],
    ['provider_unavailable', 'Organizing is not available right now. You can add tasks manually.'],
    ['invalid_output', 'Could not organize that just now. Try again.']
  ])('a %s error becomes a plain sentence, never provider detail', async (code, message) => {
    const context = new Response(JSON.stringify({ ok: false, code, message: 'upstream said: sk-secret' }), { status: 503 });
    const outcome = await requestOrganize({ text: 'x', today: TODAY }, invokeReturning({ data: null, error: { context } }));
    expect(outcome).toEqual({ ok: false, message });
  });

  it.each([
    ['a thrown invoke', vi.fn(async () => { throw new Error('offline'); }) as unknown as Invoke],
    ['a malformed reply', invokeReturning({ data: { ok: true, proposals: 'x' }, error: null })],
    ['an error without an envelope', invokeReturning({ data: null, error: new Error('boom') })]
  ])('%s → the generic sentence', async (_label, invoke) => {
    expect(await requestOrganize({ text: 'x', today: TODAY }, invoke)).toEqual({ ok: false, message: 'Could not organize that just now. Try again.' });
  });
});
