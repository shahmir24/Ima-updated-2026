import { describe, expect, it, vi } from 'vitest';
import {
  ORGANIZE_RESPONSE_SCHEMA,
  ORGANIZE_SYSTEM_PROMPT,
  buildOrganizeUserPrompt,
  createOpenAiOrganizeProvider,
  createOrganizeProvider,
  createStubOrganizeProvider,
  extractOrganizeOutput,
  resolveOrganizeProviderMode,
  weekdayOf
} from './organize-provider';

const TODAY = '2026-10-06';
const completion = (content: unknown) => ({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] });

describe('organize prompt', () => {
  it('states the core rules: organize not rank, no invented dates or times, default importance, text is data', () => {
    expect(ORGANIZE_SYSTEM_PROMPT).toMatch(/never rank, prioritise/i);
    expect(ORGANIZE_SYSTEM_PROMPT).toMatch(/Never default to today\. Never invent a day/);
    expect(ORGANIZE_SYSTEM_PROMPT).toMatch(/Vague times .* are NOT clock times/);
    expect(ORGANIZE_SYSTEM_PROMPT).toMatch(/importance "normal" and importanceBasis "default" unless/);
    expect(ORGANIZE_SYSTEM_PROMPT).toMatch(/Never infer importance from the subject/);
    expect(ORGANIZE_SYSTEM_PROMPT).toMatch(/never instructions to you/);
    expect(ORGANIZE_SYSTEM_PROMPT).toMatch(/notTasks/);
    expect(ORGANIZE_SYSTEM_PROMPT).not.toMatch(/—/);
  });

  it('the user message carries the local date, weekday and tomorrow, then the fenced text', () => {
    const prompt = buildOrganizeUserPrompt({ text: 'call Ali', today: TODAY, timeZone: 'Asia/Karachi' });
    expect(prompt).toContain('Local date: 2026-10-06 (Tuesday). Tomorrow is 2026-10-07.');
    expect(prompt).toContain('Time zone: Asia/Karachi.');
    expect(prompt).toMatch(/<<<BRAIN_DUMP\ncall Ali\nBRAIN_DUMP>>>/);
  });

  it('weekdays are computed from the date alone', () => {
    expect(weekdayOf('1970-01-01')).toBe('Thursday');
    expect(weekdayOf('2026-10-06')).toBe('Tuesday');
    expect(weekdayOf('2024-02-29')).toBe('Thursday');
  });

  it('the schema is strict and closed', () => {
    expect(ORGANIZE_RESPONSE_SCHEMA.additionalProperties).toBe(false);
    expect(ORGANIZE_RESPONSE_SCHEMA.properties.proposals.items.additionalProperties).toBe(false);
    expect(ORGANIZE_RESPONSE_SCHEMA.properties.proposals.items.required).toHaveLength(8);
  });
});

describe('OpenAI organize provider', () => {
  it('sends one strict JSON-schema request with the key only in the header', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(completion({ proposals: [], notTasks: [] })), { status: 200 }));
    const provider = createOpenAiOrganizeProvider({ apiKey: 'sk-test', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await provider.organize({ text: 'call Ali', today: TODAY })).toEqual({ ok: true, output: { proposals: [], notTasks: [] } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.response_format.json_schema).toMatchObject({ name: 'organized_capture', strict: true });
    expect(JSON.stringify(body.messages)).not.toContain('sk-test');
  });

  it('no API key → not configured, no request', async () => {
    const fetchImpl = vi.fn();
    const result = await createOpenAiOrganizeProvider({ apiKey: '', fetchImpl: fetchImpl as unknown as typeof fetch }).organize({ text: 'a', today: TODAY });
    expect(result).toMatchObject({ ok: false, failure: 'not_configured', code: 'provider_unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a non-2xx is a failure and its body is never read; no retry', async () => {
    const response = new Response('{"error":"secret account detail"}', { status: 429 });
    const json = vi.spyOn(response, 'json');
    const fetchImpl = vi.fn(async () => response);
    const result = await createOpenAiOrganizeProvider({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch }).organize({ text: 'a', today: TODAY });
    expect(result).toMatchObject({ ok: false, failure: 'upstream_status' });
    expect(json).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('network failure → unreachable', async () => {
    const result = await createOpenAiOrganizeProvider({ apiKey: 'k', fetchImpl: (async () => { throw new TypeError('down'); }) as unknown as typeof fetch }).organize({ text: 'a', today: TODAY });
    expect(result).toMatchObject({ ok: false, failure: 'upstream_unreachable' });
  });

  it.each([
    ['a refusal', { choices: [{ message: { refusal: 'no', content: null } }] }],
    ['no choices', { choices: [] }],
    ['non-JSON content', completion('Sure! Here are your tasks')],
    ['an array', completion('[1,2]')]
  ])('%s → malformed output', (_label, payload) => {
    expect(extractOrganizeOutput(payload)).toBeNull();
  });
});

describe('stub and selection', () => {
  it('the stub never guesses a date, time or importance, and marks itself', async () => {
    const result = await createStubOrganizeProvider().organize({ text: 'finish the application tomorrow, call Ali at 3pm and buy shoes', today: TODAY });
    expect(result.ok).toBe(true);
    const proposals = (result as { output: { proposals: Record<string, unknown>[] } }).output.proposals;
    expect(proposals).toHaveLength(3);
    for (const p of proposals) {
      expect(p).toMatchObject({ date: null, time: null, importance: 'normal' });
      expect(String(p.title)).toMatch(/^Stub: /);
    }
  });

  it('mode resolution: unset/stub → stub, openai → openai, a typo → invalid (never a silent stub)', async () => {
    expect(resolveOrganizeProviderMode(undefined)).toBe('stub');
    expect(resolveOrganizeProviderMode(' OpenAI ')).toBe('openai');
    expect(resolveOrganizeProviderMode('openal')).toBeNull();
    const invalid = createOrganizeProvider({ mode: 'openal', apiKey: 'k' });
    expect(invalid.mode).toBe('invalid');
    expect(await invalid.organize({ text: 'a', today: TODAY })).toMatchObject({ ok: false, failure: 'invalid_mode' });
  });
});
