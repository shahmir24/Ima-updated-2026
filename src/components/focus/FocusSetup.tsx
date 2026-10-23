import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CUSTOM_BREAK_MINUTES, CUSTOM_FOCUS_MINUTES } from '@/lib/focus/custom-duration';
import {
  FOCUS_PRESETS,
  resolveFocusSetup,
  SETUP_ROUND_OPTIONS,
  type FocusSetupChoice,
  type FocusSetupResult,
  type FocusSetupSelection
} from '@/lib/focus/focus-setup';

interface FocusSetupProps {
  initial: FocusSetupSelection;
  /** Saves the confirmed preferences. Resolves to an error message, or null when saved. */
  onConfirm: (result: Extract<FocusSetupResult, { ok: true }>) => Promise<string | null>;
  /** Present when setup was reopened: closes it without changing anything. */
  onCancel?: () => void;
}

const OPTION =
  'w-full rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300';
const optionClass = (selected: boolean) =>
  `${OPTION} ${selected ? 'border-blue-300/70 bg-blue-400/10' : 'border-white/15 bg-white/[0.03] hover:bg-white/[0.06]'}`;

/**
 * Choosing how to focus: Short Focus (25/5), Deep Focus (45/15) or custom
 * lengths, and 1–5 rounds. Confirming saves the choice; it never starts the
 * timer — that still takes Play.
 */
const FocusSetup = ({ initial, onConfirm, onCancel }: FocusSetupProps) => {
  const [choice, setChoice] = useState<FocusSetupChoice>(initial.choice);
  const [customBlock, setCustomBlock] = useState(initial.customBlock);
  const [customBreak, setCustomBreak] = useState(initial.customBreak);
  const [rounds, setRounds] = useState(initial.rounds);
  const [error, setError] = useState<{ field: 'block' | 'break' | 'rounds' | 'save'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    const result = resolveFocusSetup({ choice, customBlock, customBreak, rounds });
    if (result.ok === false) {
      setError({ field: result.field, message: result.message });
      return;
    }
    setError(null);
    setSaving(true);
    const failure = await onConfirm(result);
    setSaving(false);
    if (failure) setError({ field: 'save', message: failure });
  };

  const choose = (next: FocusSetupChoice) => {
    setChoice(next);
    setError(null);
  };

  return (
    <section
      aria-labelledby="focus-setup-heading"
      className="w-full max-w-sm sm:max-w-md mb-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
    >
      <h2 id="focus-setup-heading" className="text-white text-lg font-medium">
        How would you like to focus?
      </h2>
      <p className="mt-1 text-white/60 text-sm">You can change this any time.</p>

      <div className="mt-4 space-y-2" role="group" aria-label="Focus length">
        {(['short', 'deep'] as const).map((id) => (
          <button key={id} type="button" aria-pressed={choice === id} onClick={() => choose(id)} className={optionClass(choice === id)}>
            <span className="block text-white text-sm font-medium">{FOCUS_PRESETS[id].label}</span>
            <span className="block text-white/60 text-xs">
              {FOCUS_PRESETS[id].blockMinutes} min focus · {FOCUS_PRESETS[id].breakMinutes} min break
            </span>
          </button>
        ))}
        <button type="button" aria-pressed={choice === 'custom'} onClick={() => choose('custom')} className={optionClass(choice === 'custom')}>
          <span className="block text-white text-sm font-medium">Custom</span>
          <span className="block text-white/60 text-xs">Choose your own lengths</span>
        </button>
      </div>

      {choice === 'custom' && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="focus-setup-block" className="text-white/70 text-xs">
              Focus ({CUSTOM_FOCUS_MINUTES.min}–{CUSTOM_FOCUS_MINUTES.max} min)
            </Label>
            <Input
              id="focus-setup-block"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={customBlock}
              onChange={(event) => {
                setCustomBlock(event.target.value);
                setError(null);
              }}
              aria-invalid={error?.field === 'block' ? true : undefined}
              aria-describedby={error?.field === 'block' ? 'focus-setup-error' : undefined}
              className="mt-1 h-10 bg-white/10 border-white/20 text-white rounded-lg"
            />
          </div>
          <div>
            <Label htmlFor="focus-setup-break" className="text-white/70 text-xs">
              Break ({CUSTOM_BREAK_MINUTES.min}–{CUSTOM_BREAK_MINUTES.max} min)
            </Label>
            <Input
              id="focus-setup-break"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={customBreak}
              onChange={(event) => {
                setCustomBreak(event.target.value);
                setError(null);
              }}
              aria-invalid={error?.field === 'break' ? true : undefined}
              aria-describedby={error?.field === 'break' ? 'focus-setup-error' : undefined}
              className="mt-1 h-10 bg-white/10 border-white/20 text-white rounded-lg"
            />
          </div>
        </div>
      )}

      <div className="mt-5">
        <p id="focus-setup-rounds" className="text-white/70 text-sm">
          Rounds
        </p>
        <div className="mt-2 flex gap-2" role="group" aria-labelledby="focus-setup-rounds">
          {SETUP_ROUND_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={rounds === count}
              aria-label={`${count} ${count === 1 ? 'round' : 'rounds'}`}
              onClick={() => {
                setRounds(count);
                setError(null);
              }}
              className={`h-11 w-11 rounded-xl border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
                rounds === count ? 'border-blue-300/70 bg-blue-400/10 text-white' : 'border-white/15 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]'
              }`}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p id="focus-setup-error" role="alert" className="mt-4 text-sm text-red-300">
          {error.message}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={() => void confirm()} disabled={saving} className="rounded-2xl">
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={saving} className="rounded-2xl text-white/80 hover:bg-white/10">
            Cancel
          </Button>
        )}
      </div>
      <p className="mt-3 text-white/40 text-xs">Saving won’t start the timer. Press play when you’re ready.</p>
    </section>
  );
};

export default FocusSetup;
