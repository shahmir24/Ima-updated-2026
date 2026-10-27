import type { LockManagerLike } from './push-lock';

/**
 * A Web Locks stand-in shared by "tabs" in a test: one exclusive lock per
 * name, granted in request order, abortable while waiting, and released by
 * `closeHolder()` the way a browser releases a closing tab's lock.
 */
export function fakeLocks() {
  type Entry = { name: string; start: () => void; token: number };
  const queue: Entry[] = [];
  const holders = new Map<string, number>();
  let tokens = 0;
  const log: string[] = [];

  const next = (name: string) => {
    const index = queue.findIndex((entry) => entry.name === name);
    if (index < 0) return;
    const [entry] = queue.splice(index, 1);
    entry.start();
  };

  const manager: LockManagerLike = {
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const token = ++tokens;
        const entry: Entry = {
          name,
          token,
          start: () => {
            holders.set(name, token);
            log.push(`grant#${token}`);
            Promise.resolve()
              .then(callback)
              .then(
                (value) => {
                  if (holders.get(name) === token) {
                    holders.delete(name);
                    log.push(`release#${token}`);
                    next(name);
                  }
                  resolve(value);
                },
                (error) => {
                  if (holders.get(name) === token) {
                    holders.delete(name);
                    next(name);
                  }
                  reject(error);
                }
              );
          }
        };
        options.signal?.addEventListener('abort', () => {
          const index = queue.indexOf(entry);
          if (index >= 0) {
            queue.splice(index, 1);
            log.push(`abort#${token}`);
            reject(new DOMException('The lock request was aborted.', 'AbortError'));
          }
        });
        if (holders.has(name)) queue.push(entry);
        else entry.start();
      });
    }
  };

  return {
    manager,
    log,
    isHeld: (name: string) => holders.has(name),
    waiting: () => queue.length,
    /** The holding tab closed: the browser releases its lock. */
    closeHolder(name: string) {
      holders.delete(name);
      log.push('tab-closed');
      next(name);
    }
  };
}
