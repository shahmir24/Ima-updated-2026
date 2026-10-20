import { useSyncExternalStore } from 'react';
import { Download, MoreVertical, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallApp, type InstallApp } from '@/hooks/use-install-app';
import { INSTALL_INSTRUCTIONS } from '@/lib/pwa/install-platform';
import { hintDismissed, showsInstallHint, subscribeHintDismissed, writeHintDismissed } from '@/lib/pwa/install-hint';

const localStorageOrNothing = (): Storage | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

export interface InstallHintProps {
  /** For tests; the app uses the real install state and localStorage. */
  app?: InstallApp;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

/**
 * A quiet, dismissible "Install iMA" line at the foot of Home. Not a modal,
 * never shown inside the installed app, and gone for good once dismissed.
 */
export function InstallHint({ app, storage }: InstallHintProps) {
  const live = useInstallApp();
  const { platform, install } = app ?? live;
  const read = () => hintDismissed(storage ?? localStorageOrNothing());
  const dismissed = useSyncExternalStore(subscribeHintDismissed, read, read);

  if (!showsInstallHint(platform, dismissed)) return null;

  const dismiss = () => writeHintDismissed(storage ?? localStorageOrNothing());

  const handleInstall = async () => {
    const outcome = await install();
    // Either answer is final for the hint; Settings still has the card.
    if (outcome !== 'unavailable') dismiss();
  };

  return (
    <aside
      aria-label="Install iMA"
      data-testid="install-hint"
      className="flex items-center gap-3 rounded-2xl bg-secondary/30 px-4 py-3 text-sm"
    >
      {platform === 'prompt' ? (
        <Download className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      ) : platform === 'android-manual' ? (
        <MoreVertical className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      ) : (
        <Share className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      )}
      <p className="min-w-0 flex-1 text-muted-foreground">
        <span className="text-foreground">Install iMA</span> for quicker access.{' '}
        {/* No native prompt was offered, so only the manual route — never a
            promise of one. Same wording as the Settings card. */}
        {platform !== 'prompt' && INSTALL_INSTRUCTIONS[platform as 'ios-safari' | 'ios-other' | 'android-manual']}
      </p>
      {platform === 'prompt' && (
        <Button size="sm" variant="secondary" className="shrink-0 rounded-xl" onClick={handleInstall}>
          Install
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9 shrink-0 rounded-full"
        onClick={dismiss}
        aria-label="Dismiss install suggestion"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </aside>
  );
}

export default InstallHint;
