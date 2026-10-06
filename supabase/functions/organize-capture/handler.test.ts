import { describe, expect, it, vi } from 'vitest';
import { handleOrganizeRequest, type OrganizeHandlerDeps, type OrganizeLogEvent } from './handler';
import type { OrganizeProvider } from '../_shared/organize-provider';

const TODAY = '2026-10-06';
const ORIGIN = 'https://ima-updated-2026.vercel.app';
const SECRET_TEXT = 'Finish the accelerator application tomorrow and call Ali at 3pm';

function deps(overrides: Partial<OrganizeHandlerDeps> = {}) {
  const logs: OrganizeLogEvent[] = [];
  const organize = vi.fn(async () => ({
    ok: true as const,
    output: {
      proposals: [
        { title: 'Finish the accelerator application', importance: 'normal', importanceBasis: 'default', date: '2026-10-07', dateBasis: 'stated', dateText: 'tomorrow', time: null, timeText: null },
        { title: 'Call Ali', importance: 'normal', importanceBasis: 'default', date: '2026-10-07', dateBasis: 'stated', dateText: 'tomorrow', time: '15:00', timeText: '3pm' }
      ],
      notTasks: [{ text: 'feeling scattered', kind: 'note' }]
    }
  }));
  const provider: OrganizeProvider = { mode: 'stub', organize };
  const resolveUser = vi.fn(async (token: string) => (token === 'good-token' ? { ok: true as const, user: { id: 'user-1' } } : { ok: false as const }));
  return {
    deps: { resolveUser, allowedOrigins: [ORIGIN], provider, log: (event: OrganizeLogEvent) => logs.push(event), ...overrides } as OrganizeHandlerDeps,
    logs,
    organize,
    resolveUser
  };
}

const request = (init: { method?: string; token?: string | null; origin?: string | null; body?: unknown } = {}) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.token !== null) headers.Authorization = `Bearer ${init.token ?? 'good-token'}`;
  if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
  const method = init.method ?? 'POST';
  return new Request('https://x.supabase.co/functions/v1/organize-capture', {
    method,
    headers,
    body: method === 'POST' ? (typeof init.body === 'string' ? init.body : JSON.stringify(init.body ?? { text: SECRET_TEXT, today: TODAY })) : undefined
  });
};

describe('organize-capture — authentication and transport', () => {
  it('a signed-in request gets sanitised proposals and not-tasks', async () => {
    const d = deps();
    const response = await handleOrganizeRequest(request(), d.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.proposals).toHaveLength(2);
    expect(body.proposals[1]).toMatchObject({ title: 'Call Ali', date: '2026-10-07', time: '15:00' });
    expect(body.notTasks).toEqual([{ text: 'feeling scattered', kind: 'note' }]);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it.each([
    ['no token', { token: null }],
    ['a bad token', { token: 'forged' }]
  ])('%s → 401 and the provider is never called', async (_label, init) => {
    const d = deps();
    const response = await handleOrganizeRequest(request(init), d.deps);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, code: 'unauthenticated' });
    expect(d.organize).not.toHaveBeenCalled();
  });

  it('a resolver that throws fails closed', async () => {
    const d = deps({ resolveUser: async () => { throw new Error('boom'); } });
    expect((await handleOrganizeRequest(request(), d.deps)).status).toBe(401);
    expect(d.organize).not.toHaveBeenCalled();
  });

  it('a disallowed origin is refused before authentication', async () => {
    const d = deps();
    expect((await handleOrganizeRequest(request({ origin: 'https://evil.example' }), d.deps)).status).toBe(403);
    expect(d.resolveUser).not.toHaveBeenCalled();
  });

  it('preflight is answered without credentials', async () => {
    const d = deps();
    const response = await handleOrganizeRequest(request({ method: 'OPTIONS', token: null }), d.deps);
    expect(response.status).toBe(204);
    expect(d.organize).not.toHaveBeenCalled();
  });

  it('only POST', async () => {
    expect((await handleOrganizeRequest(request({ method: 'GET' }), deps().deps)).status).toBe(405);
  });
});

describe('organize-capture — request validation', () => {
  it.each([
    ['invalid JSON', '{not json', 400],
    ['unknown fields', { text: 'a', today: TODAY, userId: 'someone-else' }, 400],
    ['input too long', { text: 'x'.repeat(2001), today: TODAY }, 400],
    ['missing today', { text: 'a' }, 400],
    ['a huge body', 'x'.repeat(20_000), 413]
  ])('%s → refused, provider not called', async (_label, body, status) => {
    const d = deps();
    const response = await handleOrganizeRequest(request({ body }), d.deps);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ ok: false, code: 'bad_request' });
    expect(d.organize).not.toHaveBeenCalled();
  });

  it('the provider receives only the validated text, date and zone', async () => {
    const d = deps();
    await handleOrganizeRequest(request({ body: { text: `  ${SECRET_TEXT}  `, today: TODAY, timeZone: 'Asia/Karachi' } }), d.deps);
    expect(d.organize).toHaveBeenCalledWith({ text: SECRET_TEXT, today: TODAY, timeZone: 'Asia/Karachi' });
  });
});

describe('organize-capture — provider failures and bad output', () => {
  it.each([
    ['not_configured', 'provider_unavailable', 503],
    ['timeout', 'provider_unavailable', 503],
    ['upstream_status', 'provider_unavailable', 503],
    ['malformed_output', 'invalid_output', 502]
  ] as const)('%s → %s, with no provider detail', async (failure, code, status) => {
    const d = deps({ provider: { mode: 'openai', organize: async () => ({ ok: false, code, failure }) } });
    const response = await handleOrganizeRequest(request(), d.deps);
    expect(response.status).toBe(status);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ ok: false, code });
    expect(text).not.toMatch(/openai|gpt|api key|status \d/i);
  });

  it('a provider that throws is a 503, not a crash', async () => {
    const d = deps({ provider: { mode: 'openai', organize: async () => { throw new Error('socket reset with sk-secret'); } } });
    const response = await handleOrganizeRequest(request(), d.deps);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('sk-secret');
  });

  it('output of the wrong shape → 502 invalid_output', async () => {
    const d = deps({ provider: { mode: 'openai', organize: async () => ({ ok: true, output: { tasks: 'Call Ali' } }) } });
    expect((await handleOrganizeRequest(request(), d.deps)).status).toBe(502);
  });

  it('bad items in the output are cleaned, never passed through', async () => {
    const d = deps({
      provider: {
        mode: 'openai',
        organize: async () => ({
          ok: true,
          output: {
            proposals: [
              { title: 'Research Dubai accelerators', importance: 'high', importanceBasis: 'default', date: '2020-01-01', dateBasis: 'stated', dateText: null, time: '09:00', timeText: null, rank: 1 }
            ],
            notTasks: []
          }
        })
      }
    });
    const body = await (await handleOrganizeRequest(request(), d.deps)).json();
    expect(body.proposals[0]).toEqual({
      title: 'Research Dubai accelerators',
      importance: 'normal',
      importanceBasis: 'default',
      date: null,
      dateBasis: null,
      dateText: null,
      time: null,
      timeText: null
    });
  });
});

describe('organize-capture — logs', () => {
  it('logs counts and codes only, never the text or a title', async () => {
    const d = deps();
    await handleOrganizeRequest(request(), d.deps);
    await handleOrganizeRequest(request({ token: 'forged' }), d.deps);
    await handleOrganizeRequest(request({ body: { text: SECRET_TEXT, today: TODAY, userId: 'x' } }), d.deps);
    expect(d.logs[0]).toMatchObject({ method: 'POST', status: 200, outcome: 'ok', proposals: 2, notTasks: 1 });
    expect(Object.keys(d.logs[0]).sort()).toEqual(['durationMs', 'method', 'notTasks', 'outcome', 'proposals', 'status']);
    const all = JSON.stringify(d.logs);
    for (const secret of ['accelerator', 'Ali', 'scattered', 'good-token', 'user-1', 'forged']) expect(all).not.toContain(secret);
  });
});
