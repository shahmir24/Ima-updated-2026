import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useGentleNudgesPush, type UseGentleNudgesPushOptions } from '@/hooks/use-gentle-nudges-push';
import type { UserSettingsPatch, UserSettingsRow } from '@/hooks/use-user-settings';
import { gentleNudgesView, parseTimeInput, toTimeInputValue, type NudgeNoticeTone } from '@/lib/push/gentle-nudges-view';

const NOTICE_STYLE: Record<NudgeNoticeTone, string> = {
  info: 'bg-background/40 text-muted-foreground',
  success: 'bg-primary/10 text-foreground',
  warning: 'bg-amber-500/10 text-foreground',
  error: 'bg-destructive/15 text-foreground'
};

export interface GentleNudgesCardProps {
  /** The saved user_settings row; null/undefined while loading or for a guest. */
  settings: UserSettingsRow | null | undefined;
  /** Settings' auto-save: saveNow for the switch, saveSoon for the time. */
  save: {
    saveNow: (patch: UserSettingsPatch) => void;
    saveSoon: (patch: UserSettingsPatch) => void;
  };
  /** Test seam for the browser and server; the app uses the real ones. */
  pushOptions?: UseGentleNudgesPushOptions;
}

/**
 * Gentle nudges on Settings. Off by default, and nothing here asks for
 * notification permission until the user turns the switch on.
 */
export function GentleNudgesCard({ settings, save, pushOptions }: GentleNudgesCardProps) {
  const nudges = useGentleNudgesPush(pushOptions);

  // The account switch as this screen last left it; until then, what was loaded.
  const [accountOverride, setAccountOverride] = useState<boolean | null>(null);
  const [pending, setPending] = useState<'enable' | 'disable' | null>(null);
  const [timezoneMissed, setTimezoneMissed] = useState(false);
  const [time, setTime] = useState<string | null>(null);
  const [showTitles, setShowTitles] = useState<boolean | null>(null);

  const accountOn = accountOverride ?? settings?.nudges_enabled ?? false;
  const view = gentleNudgesView({ push: nudges, accountOn, pending, timezoneMissed });
  const shownTime = time ?? toTimeInputValue(settings?.nudge_time);
  const shownTitles = showTitles ?? settings?.nudge_show_task_titles ?? true;

  const turnOff = () => {
    setPending('disable');
    void nudges.disable().then((result) => {
      setPending(null);
      if (result.ok) {
        setAccountOverride(false);
        setTimezoneMissed(false);
      }
    });
  };

  const handleToggle = (on: boolean) => {
    if (!on) {
      turnOff();
      return;
    }
    // FIRST, and synchronously: Safari (iPhone, iPad, Mac) only shows the
    // permission prompt while this tap is still being handled. Nothing may
    // run before this call — no await, no state update, no save.
    const enabling = nudges.enable();
    setPending('enable');
    void enabling.then((result) => {
      setPending(null);
      if (result.ok) {
        setAccountOverride(true);
        setTimezoneMissed(!result.timezoneSaved);
      }
    });
  };

  return (
    <Card className="p-6 rounded-3xl border-0 bg-secondary/30">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <Bell className="h-5 w-5 mr-2 text-primary" />
        🔔 Gentle nudges
      </h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="gentle-nudges">Gentle nudges</Label>
            <p className="text-sm text-muted-foreground">
              iMA can send you a gentle reminder about what deserves your attention today.
            </p>
          </div>
          <div className="flex shrink-0 items-center space-x-2">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {view.status}
            </span>
            <Switch
              id="gentle-nudges"
              checked={view.checked}
              disabled={view.switchDisabled}
              onCheckedChange={handleToggle}
            />
          </div>
        </div>

        {view.notice && (
          <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${NOTICE_STYLE[view.notice.tone]}`}>
            {view.notice.text}
          </p>
        )}

        {view.offerTurnOffEverywhere && (
          <Button variant="outline" className="w-full h-11 rounded-2xl justify-start" onClick={turnOff}>
            Turn off nudges on all devices
          </Button>
        )}

        <div>
          <Label htmlFor="nudge-time">Daily nudge time</Label>
          <Input
            id="nudge-time"
            type="time"
            className="mt-1 rounded-2xl"
            value={shownTime}
            disabled={!view.detailsEditable}
            onChange={(e) => {
              setTime(e.target.value);
              const parsed = parseTimeInput(e.target.value);
              if (parsed) save.saveSoon({ nudge_time: parsed });
            }}
          />
          <p className="text-xs text-muted-foreground mt-1">One nudge a day, at most, around this time.</p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="nudge-show-titles">Show task names in notifications</Label>
            <p className="text-sm text-muted-foreground">
              Turn this off to keep task names private on your lock screen.
            </p>
          </div>
          <Switch
            id="nudge-show-titles"
            checked={shownTitles}
            disabled={!view.detailsEditable}
            onCheckedChange={(checked) => {
              setShowTitles(checked);
              save.saveNow({ nudge_show_task_titles: checked });
            }}
          />
        </div>
      </div>
    </Card>
  );
}

export default GentleNudgesCard;
