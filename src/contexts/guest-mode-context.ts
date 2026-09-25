import { createContext, useContext } from 'react';
import type { GuestTaskStore } from '@/lib/guest/guest-task-store';

/**
 * The guest task store, offered only where Guest Mode is allowed.
 *
 * Null — the default, and what every screen gets today — means Guest Mode is
 * off: a signed-out render behaves exactly as it always has. Guest Mode is
 * switched on for a part of the app by wrapping it in
 * <GuestTaskStoreContext.Provider value={getGuestTaskStore()}>. Nothing in the
 * app does that yet.
 *
 * A signed-in user never uses this store, whatever the context holds; see
 * selectTaskSourceMode.
 */
export const GuestTaskStoreContext = createContext<GuestTaskStore | null>(null);

export function useAllowedGuestTaskStore(): GuestTaskStore | null {
  return useContext(GuestTaskStoreContext);
}
