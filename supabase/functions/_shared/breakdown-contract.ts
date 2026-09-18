/**
 * Body Double "Break it down" — the wire contract (edge copy).
 *
 * This is the Deno half of a deliberately duplicated module. The browser half
 * is src/lib/ai/breakdown-contract.ts, built by Vite; the two runtimes cannot
 * share a module, so the file exists twice and the copies are held together by
 * a parity test that runs identical inputs through both and compares results.
 *
 * Keep this file dependency-free and free of Deno-specific APIs. It is pure
 * validation: no fetch, no env, no secrets, no database. The provider adapter
 * that does know about an API key is a separate module, and nothing in here
 * should ever learn its name.
 *
 * If you change a rule or a bound here, change it in the browser copy in the
 * same commit. The parity test fails loudly if you do not.
 */

export const BREAKDOWN_ACTIONS = ['break_down', 'make_smaller', 'try_another'] as const;

export type BreakdownAction = (typeof BREAKDOWN_ACTIONS)[number];

/**
 * Every bound in one object so the parity test can compare them directly
 * rather than trusting that two files happen to agree.
 */
export const BREAKDOWN_LIMITS = {
  taskMaxLength: 200,
  currentStepMaxLength: 200,
  stepMaxLength: 120,
  avoidMaxItems: 3,
  avoidItemMaxLength: 120,
  minDepth: 0,
  maxDepth: 3,
  minSteps: 1,
  maxSteps: 5
} as const;

export interface BreakdownRequest {
  action: BreakdownAction;
  /**
   * The ROOT task — session.intention, never the step being refined.
   * Present on every action including make_smaller, which is what stops a
   * refinement from losing the thing the user actually set out to do.
   */
  task: string;
  /** The step being refined. Required by make_smaller and try_another. */
  currentStep?: string;
  /** How far from the root task this request sits. See validateBreakdownRequest. */
  depth: number;
  /** Up to three already-offered steps, so try_another does not repeat them. */
  avoid?: string[];
}

export type BreakdownErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'invalid_output';

/**
 * The success payload on the wire is exactly this. Nothing is added to it.
 *
 * Note the deliberate difference from Validated<string[]> below: that is the
 * internal result of a validator (ok + value), used on BOTH sides — the edge
 * runs it over the model output before replying, the client runs it again over
 * what arrives. The handler maps a successful validation onto this envelope.
 */
export interface BreakdownSuccess {
  ok: true;
  steps: string[];
}

export interface BreakdownFailure {
  ok: false;
  code: BreakdownErrorCode;
  message: string;
}

export type BreakdownResponse = BreakdownSuccess | BreakdownFailure;

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; code: BreakdownErrorCode; message: string };

const REQUEST_FIELDS = ['action', 'task', 'currentStep', 'depth', 'avoid'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Case- and whitespace-insensitive, which is what "simply echoes" means in
 * practice: a model that hands back the task with different capitalisation or
 * a doubled space has still told the user nothing. Punctuation is deliberately
 * NOT stripped — that starts collapsing genuinely different steps.
 */
function comparisonKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function badRequest(message: string): Validated<never> {
  return { ok: false, code: 'bad_request', message };
}

/**
 * Validates and normalises a request before it costs anything.
 *
 * `depth` is the distance of THIS request from the root task, and the windows
 * below are what make the refinement cap enforceable at the edge rather than
 * only in a disabled button:
 *
 *   break_down   depth 0        decomposes the root task itself
 *   make_smaller depth 1..3     narrows an existing step; a fourth narrow is 4, refused
 *   try_another  depth 0..3     replaces a step without narrowing, so depth is unchanged
 *
 * Unknown fields are refused rather than ignored. The list of things this
 * contract must never carry is long, and silently dropping an extra field is
 * how one of them eventually arrives.
 */
export function validateBreakdownRequest(input: unknown): Validated<BreakdownRequest> {
  if (!isPlainObject(input)) return badRequest('Request must be a JSON object.');

  const unknown = Object.keys(input).filter((key) => !REQUEST_FIELDS.includes(key));
  if (unknown.length > 0) {
    return badRequest(`Unexpected field(s): ${unknown.slice().sort().join(', ')}.`);
  }

  const rawAction = input.action;
  if (typeof rawAction !== 'string' || !(BREAKDOWN_ACTIONS as readonly string[]).includes(rawAction)) {
    return badRequest(`action must be one of: ${BREAKDOWN_ACTIONS.join(', ')}.`);
  }
  const action = rawAction as BreakdownAction;

  if (typeof input.task !== 'string') return badRequest('task is required and must be a string.');
  const task = input.task.trim();
  if (task.length === 0) return badRequest('task is required.');
  if (task.length > BREAKDOWN_LIMITS.taskMaxLength) {
    return badRequest(`task must be ${BREAKDOWN_LIMITS.taskMaxLength} characters or fewer.`);
  }

  let currentStep: string | undefined;
  if (input.currentStep !== undefined) {
    if (typeof input.currentStep !== 'string') {
      return badRequest('currentStep must be a string when supplied.');
    }
    const trimmed = input.currentStep.trim();
    if (trimmed.length === 0) return badRequest('currentStep must not be blank when supplied.');
    if (trimmed.length > BREAKDOWN_LIMITS.currentStepMaxLength) {
      return badRequest(`currentStep must be ${BREAKDOWN_LIMITS.currentStepMaxLength} characters or fewer.`);
    }
    currentStep = trimmed;
  }

  if (action === 'break_down' && currentStep !== undefined) {
    return badRequest('break_down works on the root task, so currentStep must be omitted.');
  }
  if (action !== 'break_down' && currentStep === undefined) {
    return badRequest(`${action} refines an existing step, so currentStep is required.`);
  }

  if (typeof input.depth !== 'number' || !Number.isInteger(input.depth)) {
    return badRequest('depth is required and must be an integer.');
  }
  const depth = input.depth;
  if (depth < BREAKDOWN_LIMITS.minDepth || depth > BREAKDOWN_LIMITS.maxDepth) {
    return badRequest(
      `depth must be between ${BREAKDOWN_LIMITS.minDepth} and ${BREAKDOWN_LIMITS.maxDepth}.`
    );
  }
  if (action === 'break_down' && depth !== BREAKDOWN_LIMITS.minDepth) {
    return badRequest(`break_down starts from the root task, so depth must be ${BREAKDOWN_LIMITS.minDepth}.`);
  }
  if (action === 'make_smaller' && depth < BREAKDOWN_LIMITS.minDepth + 1) {
    return badRequest(
      `make_smaller narrows an existing step, so depth must be at least ${BREAKDOWN_LIMITS.minDepth + 1}.`
    );
  }

  let avoid: string[] | undefined;
  if (input.avoid !== undefined) {
    if (!Array.isArray(input.avoid)) return badRequest('avoid must be an array when supplied.');
    if (input.avoid.length > BREAKDOWN_LIMITS.avoidMaxItems) {
      return badRequest(`avoid must contain at most ${BREAKDOWN_LIMITS.avoidMaxItems} items.`);
    }
    const cleaned: string[] = [];
    for (const entry of input.avoid) {
      if (typeof entry !== 'string') return badRequest('avoid entries must be strings.');
      const trimmed = entry.trim();
      if (trimmed.length === 0) return badRequest('avoid entries must not be blank.');
      if (trimmed.length > BREAKDOWN_LIMITS.avoidItemMaxLength) {
        return badRequest(`avoid entries must be ${BREAKDOWN_LIMITS.avoidItemMaxLength} characters or fewer.`);
      }
      cleaned.push(trimmed);
    }
    if (cleaned.length > 0) avoid = cleaned;
  }

  const value: BreakdownRequest = { action, task, depth };
  if (currentStep !== undefined) value.currentStep = currentStep;
  if (avoid !== undefined) value.avoid = avoid;
  return { ok: true, value };
}

/**
 * Turns whatever the model returned into steps that are safe to show, or fails.
 *
 * Per-element problems drop that element; only an unusable whole fails. A step
 * over the limit is DROPPED, never truncated — a sentence cut mid-word reads as
 * a bug, and a half-instruction is worse than one fewer suggestion.
 *
 * Extra keys on the object are ignored rather than refused: the payload here is
 * a string[], so anything the model bolted on cannot reach the UI anyway, and
 * refusing would throw away four good steps over one stray field.
 */
export function sanitiseBreakdownSteps(
  input: unknown,
  context: { task: string; currentStep?: string }
): Validated<string[]> {
  const invalid = (message: string): Validated<string[]> => ({
    ok: false,
    code: 'invalid_output',
    message
  });

  if (!isPlainObject(input)) return invalid('Model output was not a JSON object.');
  const raw = input.steps;
  if (!Array.isArray(raw)) return invalid('Model output did not contain a steps array.');

  const taskKey = comparisonKey(context.task);
  const stepKey = context.currentStep ? comparisonKey(context.currentStep) : null;

  const kept: string[] = [];
  const seen = new Set<string>();

  for (const candidate of raw) {
    if (typeof candidate !== 'string') continue;
    const text = candidate.trim();
    if (text.length === 0) continue;
    if (text.length > BREAKDOWN_LIMITS.stepMaxLength) continue;

    const key = comparisonKey(text);
    if (key === taskKey) continue;
    if (stepKey !== null && key === stepKey) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    kept.push(text);
    if (kept.length === BREAKDOWN_LIMITS.maxSteps) break;
  }

  if (kept.length < BREAKDOWN_LIMITS.minSteps) {
    return invalid('Model output contained no usable steps.');
  }
  return { ok: true, value: kept };
}
