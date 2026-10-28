import { useRef, useState, type ReactNode } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useGentleNudgesPush, type PushFeature, type UseGentleNudgesPushOptions } from '@/hooks/use-gentle-nudges-push';
import type { UserSettingsPatch, UserSettingsRow } from '@/hooks/use-user-settings';
import type { NudgePushError } from '@/lib/push/gentle-nudges-push';
import {
  accountAfter,
  deviceTimeZone,
  deviceView,
  featureView,
  parseTimeInput,
  quietHoursChange,
  quietHoursProblem,
  quietHoursSummary,
  timeZoneText,
  toTimeInputValue,
  type AccountSwitches,
  type NudgeNotice,
  type NudgeNoticeTone
} from '@/lib/push/notifications-view';

const NOTICE_STYLE: Record<NudgeNoticeTone, string> = {
  info: 'bg-background/40 text-muted-foreground',
  success: 'bg-primary/10 text-foreground',
  warning: 'bg-amber-500/10 text-foreground',
  error: 'bg-destructive/15 text-foreground'
};

export interface NotificationsCardProps {
  /** The saved user_settings row; null/undefined while loading or for a guest. */
  settings: UserSettingsRow | null | undefined;
  /** Settings' auto-save: saveNow for switches, saveSoon for times. */
  save: {
    saveNow: (patch: UserSettingsPatch) => void;
    saveSoon: (patch: UserSettingsPatch) => void;
  };
  /**
   * Saves this device's time zone on its own, so a zone the database does not
   * know can never fail the preference saved with it. Called at most once per
   * visit, when a notification preference is explicitly saved and the zone
   * differs from the saved one.
   */
  saveTimezone?: (zone: string) => void;
  /** Test seam; the app reads the browser's own zone. */
  deviceTimeZone?: string | null;
  /** Test seam for the browser and server; the app uses the real ones. */
  pushOptions?: UseGentleNudgesPushOptions;
}

type Pending = { feature: PushFeature; action: 'enable' | 'disable' } | null;

function Notice({ notice }: { notice: NudgeNotice | null }) {
  if (!notice) return null;
  return (
    <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${NOTICE_STYLE[notice.tone]}`}>
      {notice.text}
    </p>
  );
}

/** One part of the card. With `labelFor`, the heading is also the label of that section's switch. */
function Section({ title, labelFor, children, first = false }: { title: string; labelFor?: string; children: ReactNode; first?: boolean }) {
  return (
    <section className={first ? 'space-y-3' : 'space-y-3 border-t border-border/50 pt-4'}>
      <h4 className="text-sm font-semibold">
        {labelFor ? (
          <Label htmlFor={labelFor} className="text-sm font-semibold">
            {title}
          </Label>
        ) : (
          title
        )}
      </h4>
      {children}
    </section>
  );
}

/**
 * Notifications on Settings: this device, Focus alerts, Gentle Nudges, quiet
 * hours, task-name privacy and the time zone, in one card. Both features are
 * off by default, and nothing here asks for notification permission until the
 * user turns one of them on.
 */
export function NotificationsCard({ settings, save, saveTimezone, deviceTimeZone: zoneOverride, pushOptions }: NotificationsCardProps) {
  const push = useGentleNudgesPush(pushOptions);
  const zone = zoneOverride === undefined ? deviceTimeZone() : zoneOverride;

  // Each switch as this screen last left it; until then, what was loaded.
  const [accountOverride, setAccountOverride] = useState<AccountSwitches>({});
  const [pending, setPending] = useState<Pending>(null);
  const [errors, setErrors] = useState<Partial<Record<PushFeature, NudgePushError | null>>>({});
  const [timezoneMissed, setTimezoneMissed] = useState(false);
  const [time, setTime] = useState<string | null>(null);
  const [showTitles, setShowTitles] = useState<boolean | null>(null);
  const [quietOn, setQuietOn] = useState<boolean | null>(null);
  const [quietStart, setQuietStart] = useState<string | null>(null);
  const [quietEnd, setQuietEnd] = useState<string | null>(null);
  const [quietRefused, setQuietRefused] = useState<string | null>(null);
  const timezoneSent = useRef(false);

  const device = deviceView(push);
  const viewFor = (feature: PushFeature) =>
    featureView({
      feature,
      push,
      accountOn: accountOverride[feature] ?? (feature === 'focus' ? settings?.focus_alerts_enabled : settings?.nudges_enabled) ?? false,
      pending: pending?.feature === feature ? pending.action : null,
      otherPending: pending !== null && pending.feature !== feature,
      error: errors[feature] ?? null,
      timezoneMissed: feature === 'nudges' && timezoneMissed
    });
  const focus = viewFor('focus');
  const nudges = viewFor('nudges');
  const editable = push.signedIn;

  const shownTime = time ?? toTimeInputValue(settings?.nudge_time);
  // Private unless chosen: a missing value never shows task names.
  const shownTitles = showTitles ?? settings?.nudge_show_task_titles ?? false;
  const shownQuietOn = quietOn ?? settings?.quiet_hours_enabled ?? false;
  const savedStart = toTimeInputValue(settings?.quiet_hours_start, '22:00');
  const savedEnd = toTimeInputValue(settings?.quiet_hours_end, '07:00');
  const shownStart = quietStart ?? savedStart;
  const shownEnd = quietEnd ?? savedEnd;
  const quietProblem = quietHoursProblem(shownQuietOn, parseTimeInput(shownStart), parseTimeInput(shownEnd));

  /** The device's zone goes with the first explicit save here, when it differs. */
  const syncTimeZone = () => {
    if (timezoneSent.current || !saveTimezone || !zone || zone === settings?.timezone) return;
    timezoneSent.current = true;
    try {
      saveTimezone(zone);
    } catch {
      // Best effort: a failed time zone save never stands in the way of the preference.
    }
  };
  const savePreference = (patch: UserSettingsPatch, soon = false) => {
    if (soon) save.saveSoon(patch);
    else save.saveNow(patch);
    syncTimeZone();
  };

  const settle = (feature: PushFeature, on: boolean) => (result: Awaited<ReturnType<typeof push.enable>>) => {
    setPending(null);
    setErrors((current) => ({ ...current, [feature]: 'error' in result ? result.error : null }));
    // The server's switches when it reported them, else what was asked for.
    setAccountOverride((current) => accountAfter(current, feature, on, result));
    if (!result.ok) return;
    if (feature === 'nudges') setTimezoneMissed(on && !result.timezoneSaved);
  };

  const turnOff = (feature: PushFeature) => {
    setPending({ feature, action: 'disable' });
    void push.disable(feature).then(settle(feature, false));
  };

  const handleToggle = (feature: PushFeature) => (on: boolean) => {
    if (!on) {
      turnOff(feature);
      return;
    }
    // FIRST, and synchronously: Safari (iPhone, iPad, Mac) only shows the
    // permission prompt while this tap is still being handled. Nothing may
    // run before this call — no await, no state update, no save.
    const enabling = push.enable(feature);
    setPending({ feature, action: 'enable' });
    void enabling.then(settle(feature, true));
  };

  /** Quiet hours are saved whole while on, never in a state the database would refuse (see quietHoursChange). */
  const saveQuietHours = (next: { on?: boolean; start?: string; end?: string }) => {
    const change = quietHoursChange({ on: shownQuietOn, start: shownStart, end: shownEnd }, next);
    if (next.on !== undefined) setQuietOn(change.shownOn);
    setQuietRefused(change.refused);
    if (change.patch) savePreference(change.patch, next.on === undefined);
  };

  return (
    <Card className="p-6 rounded-3xl border-0 bg-secondary/30">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <Bell className="h-5 w-5 mr-2 text-primary" />
        🔔 Notifications
      </h3>
      <div className="space-y-4">
        {/* A. This device */}
        <Section title="This device" first>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">Notifications arrive only on devices you turn them on from.</p>
            <span className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
              {device.status}
            </span>
          </div>
          <Notice notice={device.notice} />
        </Section>

        {/* B. Focus alerts */}
        <Section title="Focus alerts" labelFor="focus-alerts">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                A notification when a focus session or break ends, sent only to the device running the timer. One
                setting for your whole account.
              </p>
            </div>
            <div className="flex shrink-0 items-center space-x-2">
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {focus.status}
              </span>
              <Switch id="focus-alerts" checked={focus.checked} disabled={focus.switchDisabled} onCheckedChange={handleToggle('focus')} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Coming soon: we’re still setting up Focus alert delivery. Turning this on saves your choice and gets this
            device ready; the timer’s sounds and on-screen alerts work as they do now.
          </p>
          <Notice notice={focus.notice} />
          {focus.offerTurnOffEverywhere && (
            <Button variant="outline" className="w-full h-11 rounded-2xl justify-start" onClick={() => turnOff('focus')}>
              Turn off Focus alerts on all devices
            </Button>
          )}
        </Section>

        {/* C. Gentle Nudges */}
        <Section title="Gentle Nudges" labelFor="gentle-nudges">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                iMA can send you a gentle reminder about what deserves your attention today.
              </p>
            </div>
            <div className="flex shrink-0 items-center space-x-2">
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {nudges.status}
              </span>
              <Switch id="gentle-nudges" checked={nudges.checked} disabled={nudges.switchDisabled} onCheckedChange={handleToggle('nudges')} />
            </div>
          </div>
          <Notice notice={nudges.notice} />
          {nudges.offerTurnOffEverywhere && (
            <Button variant="outline" className="w-full h-11 rounded-2xl justify-start" onClick={() => turnOff('nudges')}>
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
              disabled={!editable}
              onChange={(e) => {
                setTime(e.target.value);
                const parsed = parseTimeInput(e.target.value);
                if (parsed) savePreference({ nudge_time: parsed }, true);
              }}
            />
            <p className="text-xs text-muted-foreground mt-1">One nudge a day, at most, around this time.</p>
          </div>
        </Section>

        {/* D. Quiet hours */}
        <Section title="Quiet hours" labelFor="quiet-hours">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {shownQuietOn ? `No nudges ${quietHoursSummary(shownStart, shownEnd)}.` : 'Hold nudges back at times you’d rather not hear from iMA.'}
              </p>
            </div>
            <Switch
              id="quiet-hours"
              checked={shownQuietOn}
              disabled={!editable}
              onCheckedChange={(checked) => saveQuietHours({ on: checked })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quiet-hours-start">From</Label>
              <Input
                id="quiet-hours-start"
                type="time"
                className="mt-1 rounded-2xl"
                value={shownStart}
                disabled={!editable}
                onChange={(e) => {
                  setQuietStart(e.target.value);
                  saveQuietHours({ start: e.target.value });
                }}
              />
            </div>
            <div>
              <Label htmlFor="quiet-hours-end">Until</Label>
              <Input
                id="quiet-hours-end"
                type="time"
                className="mt-1 rounded-2xl"
                value={shownEnd}
                disabled={!editable}
                onChange={(e) => {
                  setQuietEnd(e.target.value);
                  saveQuietHours({ end: e.target.value });
                }}
              />
            </div>
          </div>
          {(quietRefused ?? quietProblem) && <Notice notice={{ tone: 'error', text: quietRefused ?? quietProblem }} />}
          <p className="text-xs text-muted-foreground">
            Quiet hours apply to Gentle Nudges only. A nudge that falls inside them is sent when they end, if that’s
            within two hours of your nudge time; otherwise it’s skipped that day. Focus alerts aren’t held back, because
            they answer a timer you started.
          </p>
        </Section>

        {/* E. Privacy */}
        <Section title="Privacy">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="nudge-show-titles">Show task names in notifications</Label>
              <p className="text-sm text-muted-foreground">
                Applies to Gentle Nudges and Focus alerts. Leave it off to keep task names private on your lock screen.
              </p>
            </div>
            <Switch
              id="nudge-show-titles"
              checked={shownTitles}
              disabled={!editable}
              onCheckedChange={(checked) => {
                setShowTitles(checked);
                savePreference({ nudge_show_task_titles: checked });
              }}
            />
          </div>
        </Section>

        {/* F. Time zone */}
        <Section title="Time zone">
          <p className="text-sm text-muted-foreground">{timeZoneText(settings?.timezone, zone)}</p>
        </Section>
      </div>
    </Card>
  );
}

export default NotificationsCard;
