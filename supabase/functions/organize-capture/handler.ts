/**
 * organize-capture — Quick Capture's "Organize it", with no runtime bindings.
 *
 * Built exactly like ai-breakdown: index.ts wires Deno in; this module is
 * handed a UserResolver, the allowed origins and a provider, so every path is
 * testable and no request can select a test double.
 *
 * What it does: takes a signed-in person's brain dump and returns PROPOSED
 * tasks and not-task thoughts. That is all.
 *
 * What it can never do: read or write the database (it holds no service-role
 * key and makes no database call), save a task, rank anything, or see who the
 * person is beyond confirming the session. The body has no user field — the
 * contract refuses unknown fields — and identity comes only from the token.
 *
 * Privacy: the text, the proposals and the notTasks are never logged. A log
 * line is method, status, outcome, duration and two counts.
 */
import {
  sanitiseOrganizeOutput,
  validateOrganizeRequest,
  type OrganizeErrorCode,
  type OrganizeResponse
} from '../_shared/organize-contract.ts';
import { corsHeaders, isOriginAllowed, jsonResponse } from '../_shared/http.ts';
import type { UserResolver } from '../ai-breakdown/handler.ts';
import type { OrganizeProvider, OrganizeProviderFailure } from '../_shared/organize-provider.ts';

export interface OrganizeLogEvent {
  method: string;
  status: number;
  outcome: OrganizeErrorCode | 'ok';
  durationMs: number;
  /** Counts only, on success. */
  proposals?: number;
  notTasks?: number;
}

export interface OrganizeHandlerDeps {
  resolveUser: UserResolver;
  allowedOrigins: readonly string[];
  provider: OrganizeProvider;
  log?: (event: OrganizeLogEvent) => void;
}

const STATUS_BY_CODE: Record<OrganizeErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  rate_limited: 429,
  provider_unavailable: 503,
  invalid_output: 502
};

/** Looked up, never interpolated: no provider name, status or upstream text reaches the browser. */
const MESSAGE_BY_FAILURE: Record<OrganizeProviderFailure, string> = {
  not_configured: 'Organizing is not available right now.',
  invalid_mode: 'Organizing is not available right now.',
  timeout: 'That took too long. Try again.',
  upstream_status: 'Could not organize that just now.',
  upstream_unreachable: 'Could not organize that just now.',
  malformed_output: 'Could not organize that just now.'
};

const UNVERIFIED_SESSION = 'Your session could not be verified. Sign in and try again.';

/** A brain dump is at most 2,000 characters; the whole body is capped well above that. */
const MAX_BODY_BYTES = 16 * 1024;

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function failure(code: OrganizeErrorCode, message: string, headers: Record<string, string>, status = STATUS_BY_CODE[code]): Response {
  const body: OrganizeResponse = { ok: false, code, message };
  return jsonResponse(body, status, headers);
}

export async function handleOrganizeRequest(request: Request, deps: OrganizeHandlerDeps): Promise<Response> {
  const startedAt = Date.now();
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);

  const done = (response: Response, outcome: OrganizeLogEvent['outcome'], counts: { proposals?: number; notTasks?: number } = {}) => {
    deps.log?.({ method: request.method, status: response.status, outcome, durationMs: Date.now() - startedAt, ...counts });
    return response;
  };

  // 1. Preflight: carries no credentials, so it is answered before any auth.
  if (request.method === 'OPTIONS') {
    if (origin !== null && !isOriginAllowed(origin, deps.allowedOrigins)) {
      return done(failure('bad_request', 'Origin is not allowed.', cors, 403), 'bad_request');
    }
    return done(new Response(null, { status: 204, headers: cors }), 'ok');
  }

  // 2. Browser origin allow-list.
  if (origin !== null && !isOriginAllowed(origin, deps.allowedOrigins)) {
    return done(failure('bad_request', 'Origin is not allowed.', cors, 403), 'bad_request');
  }

  // 3. One verb.
  if (request.method !== 'POST') {
    return done(failure('bad_request', 'This endpoint accepts POST.', { ...cors, Allow: 'POST, OPTIONS' }, 405), 'bad_request');
  }

  // 4. A session, verified by Auth. The gateway (verify_jwt) is the first lock.
  const token = bearerToken(request.headers.get('Authorization'));
  if (!token) return done(failure('unauthenticated', UNVERIFIED_SESSION, cors), 'unauthenticated');
  let resolved: Awaited<ReturnType<UserResolver>>;
  try {
    resolved = await deps.resolveUser(token);
  } catch {
    resolved = { ok: false };
  }
  if (!resolved.ok) return done(failure('unauthenticated', UNVERIFIED_SESSION, cors), 'unauthenticated');

  // 5. Body: bounded, then JSON, then the contract.
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return done(failure('bad_request', 'That is a little long. Try a shorter list.', cors, 413), 'bad_request');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return done(failure('bad_request', 'Request body must be valid JSON.', cors), 'bad_request');
  }
  const validated = validateOrganizeRequest(payload);
  if (!validated.ok) return done(failure(validated.code, validated.message, cors), validated.code);

  // 6. The provider sees only the validated text, date and optional zone.
  let generated: Awaited<ReturnType<OrganizeProvider['organize']>>;
  try {
    generated = await deps.provider.organize(validated.value);
  } catch {
    generated = { ok: false, code: 'provider_unavailable', failure: 'upstream_unreachable' };
  }
  if (!generated.ok) {
    const message = MESSAGE_BY_FAILURE[generated.failure] ?? 'Could not organize that just now.';
    return done(failure(generated.code, message, cors), generated.code);
  }

  // 7. Whatever came back is untrusted until the contract has cleaned it.
  const checked = sanitiseOrganizeOutput(generated.output, { today: validated.value.today });
  if (!checked.ok) return done(failure('invalid_output', 'Could not organize that just now.', cors), 'invalid_output');

  const body: OrganizeResponse = { ok: true, ...checked.value };
  return done(jsonResponse(body, 200, cors), 'ok', {
    proposals: checked.value.proposals.length,
    notTasks: checked.value.notTasks.length
  });
}
