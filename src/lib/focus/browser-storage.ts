/**
 * Small storage helpers shared by the Focus Timer modules.
 *
 * Every read and write is wrapped: storage can be missing (server rendering),
 * blocked (site data off), or full. A failed write falls back to an in-memory
 * copy so the timer keeps working for as long as the page is open.
 */

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function browserStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : (window[kind] ?? null);
  } catch {
    return null;
  }
}

/** A storage that never throws, keeping a memory copy of anything it could not persist. */
export function resilientStorage(storage: StorageLike | null): StorageLike {
  const memory = new Map<string, string>();
  return {
    getItem(key) {
      if (memory.has(key)) return memory.get(key)!;
      try {
        return storage ? storage.getItem(key) : null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        if (!storage) throw new Error('no storage');
        storage.setItem(key, value);
        memory.delete(key);
      } catch {
        memory.set(key, value);
      }
    },
    removeItem(key) {
      memory.delete(key);
      try {
        storage?.removeItem(key);
      } catch {
        // Nothing more to do.
      }
    }
  };
}

/**
 * Runs `fn` under a cross-tab Web Lock where the browser has them, so two tabs
 * never read-modify-write the same key at once. Without them it simply runs:
 * every database write is guarded anyway, so the worst case is a redundant one.
 */
export async function withBrowserLock<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks || typeof locks.request !== 'function') return fn();
  return locks.request(name, async () => fn()) as Promise<T>;
}
