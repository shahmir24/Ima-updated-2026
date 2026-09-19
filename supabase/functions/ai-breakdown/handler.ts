/**
 * ai-breakdown — the request lifecycle, with no runtime bindings.
 *
 * Everything that touches Deno (serving, environment) lives in index.ts, and
 * the only capability this module is handed is a UserResolver. That split is
 * what makes the authentication path testable: a test supplies a resolver that
 * answers from a fixture, while production wires in the real one. The seam is
 * a function PARAMETER — never an environment variable, a header or a debug
 * flag — so no request can select a test double at runtime, and there is no
 * bypass to accidentally ship.
 *
 * STEP 2 OF THE BODY DOUBLE AI SEQUENCE. No model, no provider, no API key,
 * no network call, no database. The steps this returns are fixed placeholder
 * text (see STUB_STEPS) that exists only to prove the path from an
 * authenticated browser to a contract-valid reply.
 */
import {
  sanitiseBreakdownSteps,
  validateBreakdownRequest,
  type BreakdownErrorCode,
  type BreakdownResponse
} from '../_shared/breakdown-contract.ts';
import { corsHeaders, isOriginAllowed, jsonResponse } from '../_shared/http.ts';
import type { ProviderFailure, StepProvider } from '../_shared/provider.ts';

export interface AuthenticatedUser {
  id: string;
}

/**
 * Resolves an access token to a user, or refuses. It is deliberately not told
 * why a token failed: the caller has no use for the distinction and reporting
 * it back would help someone probe tokens.
 */
export type UserResolver = (
  accessToken: string
) => Promise<{ ok: true; user: AuthenticatedUser } | { ok: false }>;

/**
 * Everything a reply may be logged with. Typed shut on purpose: there is no
 * field here for a header, a token, a user id or task text, so none can be
 * logged without changing this type in a reviewable diff.
 */
export interface BreakdownLogEvent {
  method: string;
  status: number;
  outcome: BreakdownErrorCode | 'ok';
  durationMs: number;
}

export interface HandlerDeps {
  resolveUser: UserResolver;
  allowedOrigins: readonly string[];
  /** Where steps come from. This module never asks which kind it is. */
  provider: StepProvider;
  log?: (event: BreakdownLogEvent) => void;
}

/**
 * HTTP status per contract error code. invalid_output is 502 rather than 500
 * because from step 4 onward it means an upstream produced something unusable;
 * keeping it stable now avoids changing the client's handling later.
 */
const STATUS_BY_CODE: Record<BreakdownErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  rate_limited: 429,
  provider_unavailable: 503,
  invalid_output: 502
};

/**
 * What the browser is told when generation fails.
 *
 * Short, neutral and the same shape whatever went wrong upstream. No provider
 * name, no status code, no upstream body, no account detail. The internal
 * ProviderFailure is the diagnostic; this is the sentence.
 */
const MESSAGE_BY_FAILURE: Record<ProviderFailure, string> = {
  not_configured: 'Suggestions are not available right now.',
  invalid_mode: 'Suggestions are not available right now.',
  timeout: 'Suggestions took too long to come back. Try again.',
  upstream_status: 'Could not reach the suggestion service.',
  upstream_unreachable: 'Could not reach the suggestion service.',
  malformed_output: 'Could not produce usable steps.'
};

/**
 * One message for every authentication failure.
 *
 * It says the session could not be VERIFIED rather than that the user is
 * signed out, because both are possible here: the token may be bad, or the
 * auth service may have been unreachable when it was checked. Telling a
 * signed-in user to sign in during an outage would be wrong, and naming which
 * of the two it was would help someone probe tokens.
 */
const UNVERIFIED_SESSION = 'Your session could not be verified. Sign in and try again.';

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * The only shape an error ever leaves in. No stack, no cause, no upstream
 * body, no header echo — just a contract code and a sentence safe to show.
 */
function failure(
  code: BreakdownErrorCode,
  message: string,
  headers: Record<string, string>,
  status = STATUS_BY_CODE[code]
): Response {
  const body: BreakdownResponse = { ok: false, code, message };
  return jsonResponse(body, status, headers);
}

export async function handleBreakdownRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const startedAt = Date.now();
  const origin = request.headers.get('Origin');
  const allowed = deps.allowedOrigins;
  const cors = corsHeaders(origin, allowed);

  const done = (response: Response, outcome: BreakdownLogEvent['outcome']): Response => {
    deps.log?.({
      method: request.method,
      status: response.status,
      outcome,
      durationMs: Date.now() - startedAt
    });
    return response;
  };

  // 1. Preflight first. A preflight carries no credentials by definition, so
  //    it cannot be authenticated and must be answered before any auth check.
  if (request.method === 'OPTIONS') {
    if (origin !== null && !isOriginAllowed(origin, allowed)) {
      return done(failure('bad_request', 'Origin is not allowed.', cors, 403), 'bad_request');
    }
    return done(new Response(null, { status: 204, headers: cors }), 'ok');
  }

  // 2. Browser origin allow-list. A request with no Origin is not from a
  //    browser (curl, a server) and is left to the authentication check.
  if (origin !== null && !isOriginAllowed(origin, allowed)) {
    return done(failure('bad_request', 'Origin is not allowed.', cors, 403), 'bad_request');
  }

  // 3. One verb.
  if (request.method !== 'POST') {
    return done(
      failure('bad_request', 'This endpoint accepts POST.', { ...cors, Allow: 'POST, OPTIONS' }, 405),
      'bad_request'
    );
  }

  // 4. A well-formed bearer token must be present. The gateway rejects
  //    unauthenticated calls before this code runs; this is the second lock.
  const token = bearerToken(request.headers.get('Authorization'));
  if (!token) {
    return done(failure('unauthenticated', UNVERIFIED_SESSION, cors), 'unauthenticated');
  }

  // 5. Identity comes from the token and nowhere else. The request body has no
  //    user field — the contract refuses unknown fields — so a caller cannot
  //    name a user, and this function never reads one from the body.
  //    A resolver is contracted to report failure rather than throw, so a throw
  //    is a bug in it. Catching here keeps that bug from becoming an unhandled
  //    rejection, which the runtime would answer with its own error page —
  //    possibly carrying a stack. It fails closed: no user, no reply.
  let resolved: Awaited<ReturnType<UserResolver>>;
  try {
    resolved = await deps.resolveUser(token);
  } catch {
    resolved = { ok: false };
  }
  if (!resolved.ok) {
    return done(failure('unauthenticated', UNVERIFIED_SESSION, cors), 'unauthenticated');
  }

  // 6. Body.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return done(failure('bad_request', 'Request body must be valid JSON.', cors), 'bad_request');
  }

  // 7. The shared contract decides what a valid request is.
  const validated = validateBreakdownRequest(payload);
  if (!validated.ok) {
    return done(failure(validated.code, validated.message, cors), validated.code);
  }

  // 8. Steps come from the provider — stub or model, decided server-side at
  //    boot. Only the validated contract fields are handed over: no user, no
  //    token, no session, no history.
  const generated = await deps.provider.generate({
    action: validated.value.action,
    task: validated.value.task,
    currentStep: validated.value.currentStep,
    depth: validated.value.depth,
    avoid: validated.value.avoid
  });
  if (!generated.ok) {
    // Looked up, never interpolated. A failure value this table does not know
    // falls back to the neutral sentence rather than reaching the browser as
    // text, so a future provider cannot leak detail through this path.
    const message = MESSAGE_BY_FAILURE[generated.failure] ?? 'Could not reach the suggestion service.';
    return done(failure(generated.code, message, cors), generated.code);
  }

  // 9. Whatever produced them, the steps go through the same sanitiser the
  //    client will run on them. This is what stops unusable model output
  //    leaving the edge, and it is the authority on length, echoes and count.
  const checked = sanitiseBreakdownSteps(
    { steps: generated.steps },
    { task: validated.value.task, currentStep: validated.value.currentStep }
  );
  if (!checked.ok) {
    return done(failure('invalid_output', 'Could not produce usable steps.', cors), 'invalid_output');
  }

  const body: BreakdownResponse = { ok: true, steps: checked.value };
  return done(jsonResponse(body, 200, cors), 'ok');
}
