
import React from 'react';
import { useNavigate } from 'react-router-dom';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { ArrowLeft, Play, Pause, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAutoSave } from '@/hooks/use-autosave';
import { useUpdateUserSettings, type UserSettingsPatch } from '@/hooks/use-user-settings';
import { useSoundscape } from '@/contexts/soundscape-context';
import type { SoundscapePlayerStatus } from '@/hooks/use-soundscape-player';
import { HEADPHONE_HINT_ID, soundOptions } from '@/lib/soundscape/soundscape-session';
import PageWorkspace from '@/components/layout/PageWorkspace';

/** Wide enough for the five choices to sit in one row, narrow enough to stay a
 *  listening screen rather than a dashboard. On desktop, wide enough for the
 *  player and the sound library side by side. */
const WORKSPACE = 'max-w-3xl lg:max-w-5xl';

/** What the desktop player says about the selected sound. */
const STATUS_LABEL: Record<SoundscapePlayerStatus, string> = {
  idle: 'Ready',
  loading: 'Loading…',
  playing: 'Playing',
  paused: 'Paused',
  error: 'Couldn’t play'
};

type VolumeSliderProps = Pick<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
  'value' | 'onValueChange' | 'onValueCommit' | 'className'
>;

/**
 * The volume slider, with its accessible name on the thumb — the element that
 * has role="slider" and takes focus. The shared <Slider> puts aria-label on its
 * root, which has no role, so the slider itself went unnamed. Same Radix
 * primitives and exactly the same classes as the shared component, so it looks
 * and behaves as before.
 */
const VolumeSlider = ({ className = '', ...props }: VolumeSliderProps) => (
  <SliderPrimitive.Root
    min={0}
    max={100}
    step={1}
    className={`relative flex w-full touch-none select-none items-center ${className}`}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label="Volume"
      className="relative block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
    />
  </SliderPrimitive.Root>
);

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
    status,
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
  const handleVolumeCommit = (value: number[]) => settingsSave.saveNow({ sound_volume: value[0] });

  const ActiveIcon = activeOption.icon;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">

      {/* Header */}
      {/* Desktop: the title sits left beside the back arrow, with a line on
          what the page is for. */}
      <PageWorkspace width={WORKSPACE} className="flex items-center justify-between py-4 lg:justify-start lg:gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/productivity')}
          className="h-11 w-11 rounded-full p-0 hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <div>
          <h1 className="text-white text-lg font-medium">Soundscaping</h1>
          <p className="hidden lg:block text-white/50 text-sm">
            Ambient sound that keeps playing while you use the rest of iMA.
          </p>
        </div>
        
        <div className="w-10 lg:hidden"></div>
      </PageWorkspace>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center">
        <PageWorkspace
          width={WORKSPACE}
          className="flex flex-col items-center justify-center lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-stretch lg:gap-8"
        >
          {/* Phones: the screen exactly as it was. `contents`, so these stay
              direct children of the column; hidden from lg, where the player
              and the sound library below take over. */}
          <div className="contents lg:hidden">
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
            <VolumeSlider
              value={[volume]}
              onValueChange={handleVolumeChange}
              onValueCommit={handleVolumeCommit}
              className="flex-1"
            />
            <span className="text-xs text-white/60 w-8 text-right">{volume}%</span>
          </div>
          </div>

          {/* Desktop: the player. Same handlers as the phone screen above. */}
          <section
            aria-label="Now playing"
            className="hidden lg:flex flex-col items-center rounded-3xl border border-white/10 bg-white/[0.03] px-10 py-10 text-center"
          >
            <div className="relative">
              {/* A soft glow while sound is on, in place of the phone's pulsing
                  rings. It breathes slowly, and holds still for anyone who
                  prefers reduced motion. */}
              <div
                aria-hidden="true"
                className={`absolute -inset-6 rounded-full bg-gradient-to-br from-blue-500/25 to-teal-400/25 blur-2xl transition-opacity duration-700 motion-reduce:transition-none ${
                  isActive ? 'opacity-100 motion-safe:animate-[pulse_6s_ease-in-out_infinite]' : 'opacity-0'
                }`}
              />
              <Button
                onClick={handlePlayPause}
                aria-label={isActive ? `Pause ${activeOption.name}` : `Play ${activeOption.name}`}
                className="relative w-36 h-36 rounded-full bg-gradient-to-br from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 shadow-2xl"
              >
                {isActive ? <Pause className="h-12 w-12 text-white" /> : <Play className="h-12 w-12 text-white ml-1" />}
              </Button>
            </div>

            <p className="mt-8 text-xs font-medium uppercase tracking-wider text-white/50">
              {status === 'playing' ? 'Now playing' : 'Selected sound'}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <ActiveIcon className="h-5 w-5 text-white" aria-hidden="true" />
              </span>
              <span className="text-2xl font-medium text-white">{activeOption.name}</span>
            </div>

            {/* Status, then any error, then the headphone hint — fixed height,
                so nothing below shifts as they come and go. */}
            <div className="mt-3 min-h-[2.75rem] space-y-1" aria-live="polite">
              <p className={`text-sm ${status === 'error' ? 'text-red-300' : 'text-white/70'}`}>{STATUS_LABEL[status]}</p>
              {errorMessage ? (
                <p className="text-xs text-red-300">{errorMessage}</p>
              ) : selectedSound === HEADPHONE_HINT_ID ? (
                <p className="text-xs text-white/50">Best experienced with headphones</p>
              ) : null}
            </div>

            <div className="mt-6 w-full max-w-sm flex items-center gap-3">
              <Volume2 className="h-4 w-4 text-white/70 shrink-0" aria-hidden="true" />
              <VolumeSlider
                value={[volume]}
                onValueChange={handleVolumeChange}
                onValueCommit={handleVolumeCommit}
                className="flex-1"
              />
              <span className="text-sm text-white/70 w-10 text-right">{volume}%</span>
            </div>
          </section>

          {/* Desktop: the sound library. One sound plays at a time; choosing
              another while one plays switches to it, as on the phone. */}
          <section
            aria-labelledby="sound-library-heading"
            className="hidden lg:block rounded-3xl border border-white/10 bg-white/[0.03] p-6"
          >
            <h2 id="sound-library-heading" className="text-sm font-medium text-white/60">
              Sounds
            </h2>
            {/* Two columns of tiles from xl; between lg and xl the column is
                too narrow for that, so each sound is a row instead. */}
            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {soundOptions.map((sound) => {
                const IconComponent = sound.icon;
                const isSelected = selectedSound === sound.id;
                return (
                  <button
                    key={sound.id}
                    type="button"
                    onClick={() => handleSoundSelect(sound.id)}
                    aria-pressed={isSelected}
                    className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-h-[6.5rem] xl:grid-cols-[auto_minmax(0,1fr)] xl:grid-rows-[auto_auto] xl:p-4 ${
                      isSelected
                        ? 'border-white/40 bg-white/10'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                    }`}
                  >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full ${isSelected ? 'bg-white/20' : 'bg-white/10'}`}>
                      <IconComponent className={`h-5 w-5 ${isSelected ? 'text-white' : 'text-white/70'}`} aria-hidden="true" />
                    </span>
                    <span className={`text-sm font-medium xl:col-span-2 xl:row-start-2 ${isSelected ? 'text-white' : 'text-white/80'}`}>
                      {sound.name}
                    </span>
                    {isSelected && status === 'playing' && (
                      <span className="justify-self-end rounded-full bg-teal-400/15 px-2 py-0.5 text-xs font-medium text-teal-200 xl:col-start-2 xl:row-start-1">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </PageWorkspace>
      </main>
    </div>
  );
};

export default Soundscape;
