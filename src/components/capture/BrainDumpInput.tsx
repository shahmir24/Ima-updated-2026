import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ORGANIZE_LIMITS } from '@/lib/ai/organize-contract';
import { CAPTURE_COPY } from '@/lib/capture/drafts';

export const BRAIN_DUMP_HEADING_ID = 'quick-capture-heading';

export interface BrainDumpInputProps {
  text: string;
  onTextChange: (text: string) => void;
  onOrganize: () => void;
  onAddManually: () => void;
  organizing: boolean;
  error: string | null;
  /** Guests may write, but organizing needs an account; the AI note is not shown to them. */
  isGuest: boolean;
  /**
   * Room beside the actions for a future input source (the microphone). Voice
   * will put its transcript into THIS text box through onTextChange, and the
   * person will press the same Organize it: there is no second organizer.
   */
  accessory?: ReactNode;
}

/** Step 1: one large box for everything, then Organize it. Presentational only. */
const BrainDumpInput = ({ text, onTextChange, onOrganize, onAddManually, organizing, error, isGuest, accessory }: BrainDumpInputProps) => {
  const length = Array.from(text).length;
  const nearLimit = length > ORGANIZE_LIMITS.inputMaxLength * 0.9;
  const canOrganize = text.trim().length > 0 && length <= ORGANIZE_LIMITS.inputMaxLength && !organizing;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h2 id={BRAIN_DUMP_HEADING_ID} className="text-2xl font-bold text-foreground">
          {CAPTURE_COPY.heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{CAPTURE_COPY.supporting}</p>
      </div>

      <Textarea
        id="brain-dump"
        aria-labelledby={BRAIN_DUMP_HEADING_ID}
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={CAPTURE_COPY.placeholder}
        maxLength={ORGANIZE_LIMITS.inputMaxLength}
        autoFocus
        className="min-h-[12rem] flex-1 resize-none rounded-2xl border-white/20 bg-white/10 text-base leading-relaxed text-foreground placeholder:text-white/50"
      />
      {nearLimit && (
        <p className="-mt-2 text-right text-xs text-muted-foreground" aria-live="polite">
          {length} / {ORGANIZE_LIMITS.inputMaxLength}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        {accessory}
        <Button
          type="button"
          onClick={onOrganize}
          disabled={!canOrganize}
          style={{ backgroundColor: '#2f74db' }}
          className="h-12 flex-1 rounded-2xl text-base font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
          {organizing ? CAPTURE_COPY.organizing : CAPTURE_COPY.organize}
        </Button>
      </div>

      <Button type="button" variant="ghost" onClick={onAddManually} className="h-11 rounded-2xl text-primary">
        {CAPTURE_COPY.addManually}
      </Button>

      {!isGuest && <p className="text-center text-xs text-muted-foreground">{CAPTURE_COPY.aiNote}</p>}
    </div>
  );
};

export default BrainDumpInput;
