import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VoiceToggleProps {
  /** From useSpokenGuidance. When false the control renders nothing. */
  supported: boolean;
  muted: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * The mute control for spoken guidance, shared so Breathing and Body Scan
 * offer the same affordance in the same words.
 *
 * It renders nothing at all when the browser has no SpeechSynthesis. A dead
 * or disabled button would imply the app has voice guidance to offer here,
 * and it does not.
 */
const VoiceToggle = ({ supported, muted, onToggle, className = '' }: VoiceToggleProps) => {
  if (!supported) return null;

  return (
    <Button
      variant="ghost"
      onClick={onToggle}
      aria-pressed={!muted}
      aria-label={muted ? 'Unmute spoken guidance' : 'Mute spoken guidance'}
      className={`h-10 rounded-full px-3 gap-2 hover:bg-white/10 ${className}`}
    >
      {muted ? (
        <VolumeX className="h-5 w-5 text-white/60" />
      ) : (
        <Volume2 className="h-5 w-5 text-white/80" />
      )}
      <span className={`text-xs ${muted ? 'text-white/60' : 'text-white/80'}`}>
        {muted ? 'Muted' : 'Voice'}
      </span>
    </Button>
  );
};

export default VoiceToggle;
