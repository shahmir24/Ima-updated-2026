import { Loader2, Mic, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VOICE_MAX_MS, type VoiceStatus } from '@/lib/voice/voice-capture';
import { VOICE_COPY } from './voice-copy';

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export interface VoiceControlsProps {
  status: VoiceStatus;
  message: string | null;
  elapsedMs: number;
  autoStopped: boolean;
  /** A note from inserting the transcript (e.g. it did not all fit). */
  notice: string | null;
  onStart: () => void;
  onStop: () => void;
}

/**
 * The microphone row under the Brain Dump box. Presentational only: the
 * recording lives in lib/voice/voice-capture.ts. The text it produces goes
 * into the same box, and the person still presses Organize it themselves.
 */
const VoiceControls = ({ status, message, elapsedMs, autoStopped, notice, onStart, onStop }: VoiceControlsProps) => {
  const recording = status === 'recording';
  const busy = status === 'requesting' || status === 'stopping' || status === 'transcribing';

  let line: string;
  if (status === 'requesting') line = VOICE_COPY.requesting;
  else if (recording) line = VOICE_COPY.listening(clock(elapsedMs), clock(VOICE_MAX_MS));
  else if (status === 'stopping') line = VOICE_COPY.stopping;
  else if (status === 'transcribing') line = VOICE_COPY.transcribing;
  else if (status === 'error') line = message ?? '';
  else line = notice ?? (autoStopped ? VOICE_COPY.autoStopped : VOICE_COPY.idleHint);

  return (
    <div className="flex flex-col gap-1" data-testid="voice-controls" data-status={status}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={recording ? onStop : onStart}
          disabled={busy}
          aria-label={recording ? VOICE_COPY.stop : VOICE_COPY.record}
          aria-pressed={recording}
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 motion-reduce:transition-none',
            recording ? 'bg-primary text-primary-foreground' : 'bg-white/10 text-foreground hover:bg-white/20'
          )}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
          ) : recording ? (
            <Square className="h-5 w-5 fill-current" aria-hidden="true" />
          ) : (
            <Mic className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
        <p
          role={status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={cn('text-sm', status === 'error' ? 'text-red-300' : 'text-muted-foreground')}
        >
          {recording && <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-red-400 motion-safe:animate-pulse" />}
          {line}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">{VOICE_COPY.privacy}</p>
    </div>
  );
};

export default VoiceControls;
