import React, { useSyncExternalStore } from 'react';
import { BellOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DEVICE_STILL_CONNECTED_MESSAGE } from '@/lib/push/push-device-lifecycle';
import {
  clearDeviceStillConnectedNotice,
  isDeviceStillConnectedNoticeShown,
  subscribeToDeviceNotice
} from '@/lib/push/signed-out-notice';

/**
 * The sign-in page's notice that this device may still receive the signed-out
 * account's notifications. In the page flow, above the form, so it never
 * covers the sign-in or sign-up controls at any width.
 */
const SignedOutDeviceNotice = () => {
  const visible = useSyncExternalStore(subscribeToDeviceNotice, isDeviceStillConnectedNoticeShown, isDeviceStillConnectedNoticeShown);
  if (!visible) return null;

  return (
    <Alert className="border-amber-300/30 bg-amber-400/10 text-left" data-testid="signed-out-device-notice">
      <BellOff className="h-4 w-4" aria-hidden="true" />
      <AlertDescription className="text-sm">{DEVICE_STILL_CONNECTED_MESSAGE}</AlertDescription>
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clearDeviceStillConnectedNotice}>
          Dismiss
        </Button>
      </div>
    </Alert>
  );
};

export default SignedOutDeviceNotice;
