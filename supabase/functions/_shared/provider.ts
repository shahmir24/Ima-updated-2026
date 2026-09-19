/**
 * Where Body Double's suggested steps come from.
 *
 * This is the ONLY module in the repository that knows a model provider
 * exists. handler.ts asks for steps and gets steps or a typed failure; it has
 * no idea whether they were generated or canned, and nothing downstream needs
 * to change to swap provider, model or transport. The client is further still
 * from it: the browser talks to the Edge Function, never to a provider.
 *
 * OPENAI_API_KEY is read here and nowhere else. It is never returned, never
 * logged, never echoed into an error, and never reaches the browser.
 */
import type { BreakdownAction, BreakdownErrorCode } from './breakdown-contract.ts';
import { BREAKDOWN_LIMITS } from './breakdown-contract.ts';

export type ProviderMode = 'stub' | 'openai';

/** Why generation failed, for the server's own eyes. Never sent to a browser. */
export type ProviderFailure =
  | 'not_configured'
  | 'invalid_mode'
  | 'timeout'
  | 'upstream_status'
  | 'upstream_unreachable'
  | 'malformed_output';

export interface ProviderRequest {
  action: BreakdownAction;
  task: string;
  currentStep?: string;
  depth: number;
  avoid?: string[];
}

export type ProviderResult =
  | { ok: true; steps: string[] }
  | { ok: false; code: BreakdownErrorCode; failure: ProviderFailure };

export interface StepProvider {
  readonly mode: ProviderMode | 'invalid';
  generate(request: ProviderRequest): Promise<ProviderResult>;
}

/* -------------------------------------------------------------------------- */
/*  Mode                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Safe by default and safe when wrong.
 *
 * Absent or empty means 'stub', so a deploy that forgets to configure anything
 * keeps today's behaviour rather than starting to spend money. A value that is
 * neither mode is NOT quietly treated as one: `AI_BREAKDOWN_PROVIDER=openal`
 * returns null, and the caller turns that into a visible failure. Falling back
 * to the stub on a typo would serve placeholder text under the impression that
 * real generation was on.
 */
export function resolveProviderMode(raw: string | null | undefined): ProviderMode | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return 'stub';
  if (value === 'stub' || value === 'openai') return value;
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Stub                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * DETERMINISTIC PLACEHOLDER TEXT — NOT MODEL OUTPUT, NOT ADVICE.
 *
 * Unchanged from the step-2 handler, moved here so that "where steps come
 * from" lives in one module. Nothing generated these and nothing consulted a
 * model. The "Stub:" prefix is deliberate: if this text reaches a real user it
 * must read as an obvious fault rather than pass for a suggestion.
 */
const STUB_STEPS: Record<BreakdownAction, string[]> = {
  break_down: [
    'Stub: open the thing this task lives in',
    'Stub: write down what finished would look like',
    'Stub: do the smallest visible piece of it'
  ],
  make_smaller: ['Stub: do only the first minute of that step'],
  try_another: ['Stub: come at that step from a different angle']
};

export function createStubProvider(): StepProvider {
  return {
    mode: 'stub',
    // No clock, no randomness, no user, no network: the same action always
    // produces the same steps.
    generate: (request) => Promise.resolve({ ok: true, steps: STUB_STEPS[request.action] })
  };
}

/* -------------------------------------------------------------------------- */
/*  Prompt                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Constant, short, and the same on every call.
 *
 * The bans are not decoration. This screen is used by someone who is stuck,
 * and the two failure modes that would actually hurt are a model that pads
 * with encouragement instead of an action, and a model that implies the app
 * can see them. Both are forbidden here and neither is inferable from what we
 * send, which is only the task text and the step being narrowed.
 */
const SYSTEM_PROMPT = [
  'You turn a task into the smallest concrete actions someone can start right now.',
  'You are not a chat partner, a coach or a therapist.',
  'Every step: begin with a verb, name one specific action, and be startable in under two minutes.',
  `Keep each step under ${BREAKDOWN_LIMITS.stepMaxLength} characters.`,
  'Never add work that is not part of the given task.',
  'Never include encouragement, reassurance, praise, or commentary about how the person feels.',
  'You cannot see the person, their screen, their mood, their attention or their surroundings.',
  'Never refer to any of those, and never imply anything was observed about them.',
  'Reply only with the requested JSON.'
].join(' ');

const ACTION_INSTRUCTION: Record<BreakdownAction, string> = {
  break_down: 'Break the task into 3 to 5 small starting actions, in the order they would be done.',
  make_smaller:
    'Return exactly 1 step: the current step made materially smaller and easier to begin. ' +
    'Stay inside the current step. Do not restate the task and do not move on to later work.',
  try_another:
    'Return exactly 1 step: a genuinely different way to approach the current step. ' +
    'It must not be a rewording of anything listed as already tried.'
};

/**
 * The entire user message. Nothing else about the person travels — no id, no
 * session, no mood, no history, no journal, no task list.
 */
export function buildUserPrompt(request: ProviderRequest): string {
  const lines = [`Task: ${request.task}`];
  if (request.currentStep) lines.push(`Current step: ${request.currentStep}`);
  if (request.avoid && request.avoid.length > 0) {
    lines.push(`Already tried: ${request.avoid.map((entry) => `"${entry}"`).join(', ')}`);
  }
  lines.push(ACTION_INSTRUCTION[request.action]);
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- */
/*  OpenAI                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Settings, all overridable by environment so a change costs a secret update
 * rather than a redeploy.
 *
 * The model was chosen for this job rather than for being cheapest: breaking a
 * task into steps that are actually useful is not classification, and a
 * floor-priced model can be benchmarked against it later on real output.
 *
 * REASONING BUDGET — the reason these numbers look generous.
 *
 * gpt-5.6-luna is a reasoning model. Reasoning tokens are billed as output
 * tokens and drawn from the SAME max_completion_tokens budget, so a ceiling
 * sized for the visible answer alone can be spent entirely on reasoning before
 * a single step is emitted, returning truncated or empty content with
 * finish_reason "length". That path is safe — it becomes malformed_output and
 * the client shows an honest error — but it is safe and useless, and it still
 * costs money. The ceiling is therefore set well above the visible output, and
 * reasoning_effort is set low because turning a task into three short actions
 * is decomposition, not deliberation.
 *
 * The ceiling is not the expected spend. sanitiseBreakdownSteps caps what can
 * ever be returned at maxSteps short strings, so typical completions stay tiny;
 * this only stops a reasoning pass from hitting the wall.
 */
export const PROVIDER_DEFAULTS = {
  endpoint: 'https://api.openai.com/v1/chat/completions',
  /**
   * Verified to support Chat Completions and structured outputs via a JSON
   * schema in response_format, and to require max_completion_tokens rather
   * than max_tokens.
   */
  model: 'gpt-5.6-luna',
  /** Room for a low-effort reasoning pass plus the JSON. See the note above. */
  maxOutputTokens: 1000,
  /** Reasoning costs latency as well as tokens; 8s aborted before it finished. */
  timeoutMs: 30000,
  /**
   * Cheapest setting that still reasons. A top-level Chat Completions
   * parameter, so this needs no change to the request shape, the response
   * schema or the provider abstraction.
   */
  reasoningEffort: 'low'
} as const;

/**
 * The response schema, in the subset strict mode accepts.
 *
 * Deliberately no minItems/maxItems: strict mode supports only part of JSON
 * Schema, an unsupported keyword is rejected outright, and the count is
 * already enforced twice — asked for in the prompt and imposed by
 * sanitiseBreakdownSteps, which is the authority either way.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['steps'],
  properties: {
    steps: { type: 'array', items: { type: 'string' } }
  }
} as const;

export interface OpenAiProviderConfig {
  apiKey: string | null | undefined;
  model?: string | null;
  endpoint?: string | null;
  maxOutputTokens?: number;
  timeoutMs?: number;
  reasoningEffort?: string | null;
  /** Injected in tests. Production passes nothing and the global is used. */
  fetchImpl?: typeof fetch;
}

function failed(failure: ProviderFailure): ProviderResult {
  // Everything except unusable output is reported as the service being
  // unavailable: from the caller's point of view that is the same situation,
  // and the distinction is the server's business, not the browser's.
  const code: BreakdownErrorCode = failure === 'malformed_output' ? 'invalid_output' : 'provider_unavailable';
  return { ok: false, code, failure };
}

export function createOpenAiProvider(config: OpenAiProviderConfig): StepProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = config.endpoint || PROVIDER_DEFAULTS.endpoint;
  const model = config.model || PROVIDER_DEFAULTS.model;
  const maxOutputTokens = config.maxOutputTokens ?? PROVIDER_DEFAULTS.maxOutputTokens;
  const timeoutMs = config.timeoutMs ?? PROVIDER_DEFAULTS.timeoutMs;
  const reasoningEffort = config.reasoningEffort ?? PROVIDER_DEFAULTS.reasoningEffort;

  return {
    mode: 'openai',
    async generate(request: ProviderRequest): Promise<ProviderResult> {
      // Checked per call rather than at construction: a function booted before
      // the secret was set must report a configuration problem, not crash.
      if (!config.apiKey) return failed('not_configured');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: buildUserPrompt(request) }
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'breakdown_steps', strict: true, schema: RESPONSE_SCHEMA }
            },
            max_completion_tokens: maxOutputTokens,
            reasoning_effort: reasoningEffort
          })
        });
      } catch (cause) {
        // One call, one outcome. There is no retry anywhere in this module:
        // a retry on a paid endpoint is a silent way to double a bill, and a
        // timeout that is retried is just a longer timeout.
        const aborted = cause instanceof Error && cause.name === 'AbortError';
        return failed(aborted ? 'timeout' : 'upstream_unreachable');
      } finally {
        clearTimeout(timer);
      }

      // The body of a non-2xx is not read. It can carry account, key or
      // organisation detail, and nothing here has any use for it.
      if (!response.ok) return failed('upstream_status');

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return failed('malformed_output');
      }

      const steps = extractSteps(payload);
      if (steps === null) return failed('malformed_output');
      return { ok: true, steps };
    }
  };
}

/**
 * Pulls the steps out of a chat completion, or returns null.
 *
 * Every shape that is not exactly what was asked for is null rather than a
 * best guess: a refusal, a truncated body that no longer parses, a missing
 * choice, content that is not an object, steps that are not an array of
 * strings. sanitiseBreakdownSteps then decides whether what survived is
 * usable — this only decides whether anything was returned at all.
 */
export function extractSteps(payload: unknown): string[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const message = (choices[0] as { message?: unknown } | null)?.message;
  if (typeof message !== 'object' || message === null) return null;

  // A structured-output refusal is a valid reply that contains no steps.
  if (typeof (message as { refusal?: unknown }).refusal === 'string') return null;

  const content = (message as { content?: unknown }).content;
  if (typeof content !== 'string' || content.trim() === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const steps = (parsed as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return null;
  if (!steps.every((step) => typeof step === 'string')) return null;
  return steps as string[];
}

/* -------------------------------------------------------------------------- */
/*  Selection                                                                  */
/* -------------------------------------------------------------------------- */

export interface StepProviderConfig {
  /** Raw AI_BREAKDOWN_PROVIDER. Absent means stub. */
  mode: string | null | undefined;
  apiKey: string | null | undefined;
  model?: string | null;
  endpoint?: string | null;
  fetchImpl?: typeof fetch;
}

/** An invalid mode becomes a provider that always fails, never a silent stub. */
export function createStepProvider(config: StepProviderConfig): StepProvider {
  const mode = resolveProviderMode(config.mode);
  if (mode === null) {
    return { mode: 'invalid', generate: () => Promise.resolve(failed('invalid_mode')) };
  }
  if (mode === 'stub') return createStubProvider();
  return createOpenAiProvider({
    apiKey: config.apiKey,
    model: config.model,
    endpoint: config.endpoint,
    fetchImpl: config.fetchImpl
  });
}
