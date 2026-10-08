import { describe, expect, it, vi } from 'vitest';
import {
  STUB_TRANSCRIPT,
  createOpenAiTranscribeProvider,
  createTranscribeProvider,
  extractTranscript,
  resolveTranscribeProviderMode
} from './transcribe-provider';

const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);

describe('OpenAI transcribe provider', () => {
  it('sends one multipart request: the audio as a named file, the model, json output; key only in the header', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ text: 'call Ali' }), { status: 200 }));
    const provider = createOpenAiTranscribeProvider({ apiKey: 'sk-test', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await provider.transcribe({ audio, format: 'webm' })).toEqual({ ok: true, text: 'call Ali' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const form = init.body as FormData;
    const file = form.get('file') as File;
    expect(file.name).toBe('capture.webm');
    expect(file.type).toBe('audio/webm');
    expect(form.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(form.get('response_format')).toBe('json');
    // Nothing else is sent: no prompt, no language hint, no user detail.
    for (const extra of ['prompt', 'language', 'user', 'temperature']) expect(form.has(extra)).toBe(false);
  });

  it('uses the right filename for Safari mp4 and the model override', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ text: 'x' }), { status: 200 }));
    await createOpenAiTranscribeProvider({ apiKey: 'k', model: 'whisper-1', fetchImpl: fetchImpl as unknown as typeof fetch }).transcribe({ audio, format: 'mp4' });
    const form = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect((form.get('file') as File).name).toBe('capture.mp4');
    expect(form.get('model')).toBe('whisper-1');
  });

  it('no API key → not configured, no request', async () => {
    const fetchImpl = vi.fn();
    expect(await createOpenAiTranscribeProvider({ apiKey: '', fetchImpl: fetchImpl as unknown as typeof fetch }).transcribe({ audio, format: 'webm' })).toMatchObject({
      ok: false,
      failure: 'not_configured'
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a non-2xx is a failure, its body never read, no retry', async () => {
    const response = new Response('{"error":"account detail"}', { status: 429 });
    const json = vi.spyOn(response, 'json');
    const fetchImpl = vi.fn(async () => response);
    expect(await createOpenAiTranscribeProvider({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch }).transcribe({ audio, format: 'webm' })).toMatchObject({
      ok: false,
      failure: 'upstream_status'
    });
    expect(json).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('a network failure → unreachable; malformed bodies → malformed', async () => {
    const down = createOpenAiTranscribeProvider({ apiKey: 'k', fetchImpl: (async () => { throw new TypeError('down'); }) as unknown as typeof fetch });
    expect(await down.transcribe({ audio, format: 'webm' })).toMatchObject({ failure: 'upstream_unreachable' });
    expect(extractTranscript({ transcript: 'x' })).toBeNull();
    expect(extractTranscript([])).toBeNull();
    expect(extractTranscript({ text: 5 })).toBeNull();
  });
});

describe('stub and selection', () => {
  it('unset → stub (fixed text, never derived from audio); openai → openai; a typo fails closed', async () => {
    expect(resolveTranscribeProviderMode(undefined)).toBe('stub');
    expect(resolveTranscribeProviderMode(' OpenAI ')).toBe('openai');
    expect(await createTranscribeProvider({ mode: undefined, apiKey: null }).transcribe({ audio, format: 'webm' })).toEqual({ ok: true, text: STUB_TRANSCRIPT });
    const invalid = createTranscribeProvider({ mode: 'openal', apiKey: 'k' });
    expect(invalid.mode).toBe('invalid');
    expect(await invalid.transcribe({ audio, format: 'webm' })).toMatchObject({ ok: false, failure: 'invalid_mode' });
  });
});
