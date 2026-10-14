/** Test-only helpers shared by the Focus Timer tests. */
import type { StorageLike } from './browser-storage';

/** A Map-backed Storage. Two stores built on the same instance behave like two tabs sharing localStorage. */
export function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key)
  };
}

/** A storage whose writes always fail (quota / blocked site data). */
export function failingStorage(): StorageLike {
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {}
  };
}

/** No cross-tab lock: runs straight away, like a browser without Web Locks. */
export const noLock = <T,>(_name: string, fn: () => Promise<T> | T): Promise<T> => Promise.resolve().then(fn);
