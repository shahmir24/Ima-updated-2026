import { useState } from 'react';
import { Download, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useInstallApp, type InstallApp } from '@/hooks/use-install-app';
import { INSTALL_INSTRUCTIONS } from '@/lib/pwa/install-platform';

export interface InstallAppCardProps {
  /** For tests; the app uses the real install state. */
  app?: InstallApp;
}

/**
 * "Install iMA" in Settings. It offers only what this browser can really do:
 * the browser's own prompt where one exists, Share → Add to Home Screen on
 * iPhone and iPad, the browser menu on Android — and nothing at all where no
 * accurate offer exists, or inside the installed app itself.
 */
export function InstallAppCard({ app }: InstallAppCardProps) {
  const live = useInstallApp();
  const { platform, standalone, installedHere, lastOutcome, install } = app ?? live;
  const [busy, setBusy] = useState(false);

  // Inside the installed app there is nothing to offer, and a browser with no
  // accurate offer gets no card at all — never a button that cannot work.
  if (standalone || platform === 'unsupported') return null;

  const handleInstall = async () => {
    setBusy(true);
    try {
      await install();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6 rounded-3xl border-0 bg-secondary/30">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <Download className="h-5 w-5 mr-2 text-primary" aria-hidden="true" />
        📲 Install iMA
      </h3>

      {installedHere ? (
        <p role="status" className="text-sm text-muted-foreground">
          iMA is installed on this device. Open it from your Home Screen or app list.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Open iMA like an app — full screen, straight from your Home Screen or dock.
          </p>

          {platform === 'prompt' && (
            <Button onClick={handleInstall} disabled={busy} className="w-full h-11 rounded-2xl">
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
              Install iMA
            </Button>
          )}

          {(platform === 'ios-safari' || platform === 'ios-other' || platform === 'android-manual') && (
            <p className="text-sm flex items-start gap-2">
              {platform !== 'android-manual' && <Share className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />}
              <span>{INSTALL_INSTRUCTIONS[platform]}</span>
            </p>
          )}

          {lastOutcome === 'dismissed' && platform !== 'prompt' && (
            <p role="status" className="text-xs text-muted-foreground">
              No problem — you can install iMA any time from your browser’s menu.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default InstallAppCard;
