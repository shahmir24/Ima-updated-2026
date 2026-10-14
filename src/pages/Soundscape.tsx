
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { useAutoSave } from '@/hooks/use-autosave';
import { useUpdateUserSettings, type UserSettingsPatch } from '@/hooks/use-user-settings';
import { useSoundscape } from '@/contexts/soundscape-context';
import { HEADPHONE_HINT_ID, soundOptions } from '@/lib/soundscape/soundscape-session';
import PageWorkspace from '@/components/layout/PageWorkspace';

/** Wide enough for the five choices to sit in one row, narrow enough to stay a
 *  listening screen rather than a dashboard. */
const WORKSPACE = 'max-w-3xl';

/**
 * The Soundscape's full controls. Playback itself lives app-wide
 * (SoundscapeProvider), so leaving this page no longer stops the sound; this
 * screen chooses the sound, sets the volume, and plays or pauses it.
 */
const Soundscape = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const {
    selectedSound: activeOption,
    volume,
    isActive,
    isLoading,
    errorMessage,
    togglePlay,
    selectSound,
    setVolume
  } = useSoundscape();
  const selectedSound = activeOption.id;

  const updateSettings = useUpdateUserSettings();

  const settingsSave = useAutoSave<UserSettingsPatch>(async (patch) => {
    try {
      await updateSettings.mutateAsync(patch);
    } catch {
      toast({
        title: 'Volume not saved',
        description: 'It applies to this session, but we could not save it to your settings.',
        variant: 'destructive'
      });
    }
  });

  // Only ever reached from a click, so playback always follows a gesture.
  const handlePlayPause = () => togglePlay();

  const handleSoundSelect = (soundId: string) => selectSound(soundId);

  const handleVolumeChange = (value: number[]) => setVolume(value[0]);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">

      {/* Header */}
      <PageWorkspace width={WORKSPACE} className="flex items-center justify-between py-4">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/productivity')}
          className="h-11 w-11 rounded-full p-0 hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-white text-lg font-medium">Soundscaping</h1>
        
        <div className="w-10"></div>
      </PageWorkspace>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center">
        <PageWorkspace width={WORKSPACE} className="flex flex-col items-center justify-center">
          {/* Central Play Button */}
          <div className="relative flex items-center justify-center mb-4">
            <div className="relative">
              {/* Outer pulsing ring when playing */}
              {isActive && (
                <div className="absolute inset-0 w-32 h-32 rounded-full bg-gradient-to-br from-blue-500/30 to-teal-400/30 animate-ping"></div>
              )}
            
              {/* Middle pulsing ring when playing */}
              {isActive && (
                <div className="absolute inset-2 w-28 h-28 rounded-full bg-gradient-to-br from-blue-500/40 to-teal-400/40 animate-pulse"></div>
              )}
            
              {/* Main button */}
              <Button
                onClick={handlePlayPause}
                aria-label={isActive ? `Pause ${activeOption.name}` : `Play ${activeOption.name}`}
                className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 relative z-10"
              >
                {isActive ? (
                  <Pause className="h-12 w-12 text-white" />
                ) : (
                  <Play className="h-12 w-12 text-white ml-1" />
                )}
              </Button>
            </div>
          </div>

          {/* Playback status — fixed height so nothing shifts when it appears */}
          <div className="h-5 mb-7 flex items-center justify-center px-4" aria-live="polite">
            {errorMessage ? (
              <span className="text-xs text-red-300 text-center">{errorMessage}</span>
            ) : isLoading ? (
              <span className="text-xs text-white/60">Loading…</span>
            ) : null}
          </div>

          {/* Sound Selector — wraps on a phone, one row from sm up */}
          <div className="grid w-full grid-cols-3 gap-4 sm:flex sm:w-auto sm:items-center sm:gap-8">
            {soundOptions.map((sound) => {
              const IconComponent = sound.icon;
              const isSelected = selectedSound === sound.id;
            
              return (
                <button
                  key={sound.id}
                  onClick={() => handleSoundSelect(sound.id)}
                  aria-pressed={isSelected}
                  className="flex flex-col items-center space-y-2 transition-all duration-300"
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isSelected 
                        ? 'bg-white/20 shadow-lg ring-2 ring-white/40 scale-110' 
                        : 'bg-white/10 hover:bg-white/15 hover:scale-105'
                    }`}
                  >
                    <IconComponent 
                      className={`h-5 w-5 transition-colors duration-300 ${
                        isSelected ? 'text-white' : 'text-white/70'
                      }`} 
                    />
                  </div>
                  <span 
                    className={`text-xs transition-colors duration-300 ${
                      isSelected ? 'text-white' : 'text-white/70'
                    }`}
                  >
                    {sound.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Headphone hint — also fixed height, for the same reason */}
          <div className="h-5 mt-4 flex items-center justify-center">
            {selectedSound === HEADPHONE_HINT_ID && (
              <span className="text-xs text-white/50">Best experienced with headphones</span>
            )}
          </div>

          {/* Volume */}
          <div className="mt-6 w-full max-w-[240px] sm:max-w-sm flex items-center gap-3">
            <Volume2 className="h-4 w-4 text-white/70 shrink-0" />
            <Slider
              value={[volume]}
              onValueChange={handleVolumeChange}
              onValueCommit={(value) => settingsSave.saveNow({ sound_volume: value[0] })}
              min={0}
              max={100}
              step={1}
              aria-label="Volume"
              className="flex-1"
            />
            <span className="text-xs text-white/60 w-8 text-right">{volume}%</span>
          </div>
        </PageWorkspace>
      </main>
    </div>
  );
};

export default Soundscape;
