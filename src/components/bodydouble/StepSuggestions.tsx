import React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The suggested-steps block inside Body Double's "Break it down" view.
 *
 * Purely additive: it sits ABOVE the existing "write your own step" field,
 * which stays visible and usable in every state below — idle, loading, success
 * and failure. If this whole block fails, the screen still does what it did
 * before any of it existed.
 */

interface StepSuggestionsProps {
  steps: string[];
  pending: boolean;
  error: string | null;
  /** True once a request has been made, so idle and empty read differently. */
  requested: boolean;
  /** False at the refinement cap. */
  canMakeSmaller: boolean;
  onSuggest: () => void;
  onStartWith: (step: string) => void;
  onMakeSmaller: (step: string) => void;
  onTryAnother: (step: string) => void;
}

const StepSuggestions = ({
  steps,
  pending,
  error,
  requested,
  canMakeSmaller,
  onSuggest,
  onStartWith,
  onMakeSmaller,
  onTryAnother
}: StepSuggestionsProps) => (
  <div className="space-y-3">
    {steps.length === 0 && (
      <Button
        onClick={onSuggest}
        disabled={pending}
        className="w-full h-11 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 text-purple-200 disabled:opacity-60"
      >
        <Sparkles className="h-4 w-4 mr-2" />
        {pending ? 'Thinking…' : requested ? 'Try again' : 'Suggest some steps'}
      </Button>
    )}

    {error && (
      <p role="alert" className="text-red-300 text-sm text-center">
        {error}
      </p>
    )}

    {steps.length > 0 && (
      <ul className="space-y-3">
        {steps.map((step) => (
          <li key={step} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
            <p className="text-white text-sm leading-relaxed">{step}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => onStartWith(step)}
                disabled={pending}
                className="h-11 px-4 bg-purple-500 hover:bg-purple-600 text-white disabled:opacity-60"
              >
                Start with this
              </Button>
              <Button
                onClick={() => onMakeSmaller(step)}
                disabled={pending || !canMakeSmaller}
                variant="outline"
                className="h-11 px-4 border-white/20 text-white hover:bg-white/10 disabled:opacity-60"
              >
                Make this smaller
              </Button>
              <Button
                onClick={() => onTryAnother(step)}
                disabled={pending}
                variant="outline"
                className="h-11 px-4 border-white/20 text-white hover:bg-white/10 disabled:opacity-60"
              >
                Try another
              </Button>
            </div>
          </li>
        ))}
      </ul>
    )}

    {steps.length > 0 && !canMakeSmaller && (
      <p className="text-white/40 text-xs text-center">
        That is as small as these go. Write your own below if none of them fit.
      </p>
    )}

    {steps.length > 0 && (
      <Button
        onClick={onSuggest}
        disabled={pending}
        variant="ghost"
        className="w-full h-11 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-60"
      >
        {pending ? 'Thinking…' : 'Start over from the task'}
      </Button>
    )}
  </div>
);

export default StepSuggestions;
