import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { TRANSCRIBE_FUNCTION, requestTranscription } from './transcribe';

// The real client is never used: every test passes its own invoke.
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: () => { throw new Error('not in tests'); } } } }));

type Invoke = Parameters<typeof requestTranscription>[1];
const invokeReturning = (result: unknown) => vi.fn(async () => result) as unknown as Invoke & ReturnType<typeof vi.fn>;
const failedWith = (code: unknown) => ({ data: null, error: { context: new Response(JSON.stringify({ ok: false, code }), { status: 400 }) } });
const audio = (type = 'audio/webm;codecs=opus') => new Blob([new Uint8Array(2048)], { type });

describe('requestTranscription', () => {
  it('sends the audio Blob itself to transcribe-capture, with no Content-Type of its own', async () => {
    const invoke = invokeReturning({ data: { ok: true, text: 'call Ali' }, error: null });
    const blob = audio();
    expect(await requestTranscription(blob, invoke)).toEqual({ ok: true, text: 'call Ali' });
    // Exactly { body }: a Content-Type here makes supabase-js drop the body.
    expect(invoke).toHaveBeenCalledWith(TRANSCRIBE_FUNCTION, { body: blob });
  });

  it.each([
    ['Chrome webm', 'audio/webm;codecs=opus'],
    ['Safari mp4', 'audio/mp4']
  ])('regression: the real supabase-js client transmits every audio byte (%s)', async (_label, type) => {
    const recorded = new Uint8Array(4096).map((_, i) => (i * 7 + 1) % 256);
    const sent: { url: string; contentType: string | null; bytes: Uint8Array }[] = [];
    const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body;
      const bytes = body instanceof Blob ? new Uint8Array(await body.arrayBuffer()) : new Uint8Array(0);
      sent.push({ url: String(input), contentType: new Headers(init?.headers).get('Content-Type'), bytes });
      return new Response(JSON.stringify({ ok: true, text: 'call Ali' }), { headers: { 'Content-Type': 'application/json' } });
    });
    const client = createClient('https://project.supabase.co', 'anon-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fakeFetch as typeof fetch }
    });

    const result = await requestTranscription(new Blob([recorded], { type }), client.functions.invoke.bind(client.functions));

    expect(result).toEqual({ ok: true, text: 'call Ali' });
    const call = sent.find((entry) => entry.url.endsWith(`/functions/v1/${TRANSCRIBE_FUNCTION}`));
    expect(call, 'the function was called').toBeDefined();
    expect(call?.bytes.byteLength).toBe(recorded.byteLength);
    expect(Array.from(call?.bytes ?? [])).toEqual(Array.from(recorded));
    expect(call?.contentType).toBe('application/octet-stream');
  });

  it.each([
    ['unauthenticated', 'Sign in'],
    ['too_large', 'up to a minute'],
    ['unsupported_format', "isn't supported"],
    ['no_speech', 'did not catch any words'],
    ['rate_limited', 'Try again in a moment'],
    ['provider_unavailable', 'You can still type']
  ])('server code %s becomes a plain sentence', async (code, phrase) => {
    const result = await requestTranscription(audio(), invokeReturning(failedWith(code)));
    expect(result.ok).toBe(false);
    expect('message' in result && result.message).toContain(phrase);
  });

  it.each([
    ['an unknown code', failedWith('something_else')],
    ['no envelope', { data: null, error: { context: new Response('<html>', { status: 502 }) } }],
    ['no context at all', { data: null, error: new Error('Failed to fetch') }]
  ])('%s → the generic sentence, nothing internal shown', async (_label, reply) => {
    expect(await requestTranscription(audio(), invokeReturning(reply))).toEqual({ ok: false, message: 'Could not turn that recording into text just now.' });
  });

  it('a throwing client is handled', async () => {
    const invoke = vi.fn(async () => { throw new Error('offline'); }) as unknown as Invoke;
    expect((await requestTranscription(audio(), invoke)).ok).toBe(false);
  });

  it.each([
    ['not ok', { ok: false, text: 'x' }],
    ['text missing', { ok: true }],
    ['text not a string', { ok: true, text: 42 }],
    ['no data', null]
  ])('a malformed success reply is rejected: %s', async (_label, data) => {
    expect((await requestTranscription(audio(), invokeReturning({ data, error: null }))).ok).toBe(false);
  });

  it('whitespace-only text means no words were caught', async () => {
    const result = await requestTranscription(audio(), invokeReturning({ data: { ok: true, text: ' \n\t ' }, error: null }));
    expect('message' in result && result.message).toContain('did not catch any words');
  });

  it('the text is flattened, control characters removed, and capped at 2000', async () => {
    const result = await requestTranscription(audio(), invokeReturning({ data: { ok: true, text: ' a\u0000b\n\nc d ' + 'x'.repeat(3000) }, error: null }));
    expect('text' in result && result.text.startsWith('a b c d x')).toBe(true);
    expect('text' in result && Array.from(result.text).length).toBe(2000);
  });
});
