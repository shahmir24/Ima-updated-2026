/**
 * The decisions behind saving a journal entry, kept apart from React and
 * Supabase so they can be tested on their own. The hook (use-journal.ts)
 * supplies the reads and writes.
 */

/**
 * Today's saved answers merged into the form: a field the user has edited
 * keeps what they wrote; every other field takes the saved answer. Saved data
 * arriving late can therefore never overwrite writing.
 */
export function mergeIntoUntouched<T extends Record<string, string>>(
  current: T,
  edited: ReadonlySet<keyof T>,
  saved: T
): T {
  const next = { ...current };
  for (const key of Object.keys(saved) as (keyof T)[]) {
    if (!edited.has(key)) next[key] = saved[key];
  }
  return next;
}

/**
 * The edited fields whose new text would replace a different, non-empty saved
 * answer if saved as they are.
 */
export function conflictingFields<T extends Record<string, string>>(
  current: T,
  edited: ReadonlySet<keyof T>,
  saved: T
): (keyof T)[] {
  return (Object.keys(saved) as (keyof T)[]).filter(
    (key) => edited.has(key) && saved[key].trim() !== '' && saved[key].trim() !== current[key].trim()
  );
}

export type JournalSaveFlowResult<Row> =
  /** The entry was written (inserted, or today's entry updated). */
  | { kind: 'written'; row: Row }
  /** An entry already exists today that the form was not based on. Nothing was written. */
  | { kind: 'found-existing'; row: Row }
  /** Whether an entry exists could not be confirmed. Nothing was written. */
  | { kind: 'check-failed'; error: unknown }
  | { kind: 'write-failed'; error: unknown };

/**
 * One save.
 *
 *   * An episodic journal (Post-Panic) always writes a new entry: each episode
 *     is its own row, so there is nothing to look for.
 *   * A one-per-day journal editing an entry it already holds (`base`) writes
 *     straight to it.
 *   * A one-per-day journal holding no entry looks again, straight at the
 *     database, before writing — the earlier load may have failed, or another
 *     tab or device may have saved since. If an entry turns up, nothing is
 *     written: the caller shows it for review. If the look-up itself fails,
 *     nothing is written either, rather than risk a second entry for the day.
 */
export async function runJournalSave<Row>(options: {
  episodic: boolean;
  base: Row | null;
  recheck: () => Promise<Row | null>;
  write: () => Promise<Row>;
}): Promise<JournalSaveFlowResult<Row>> {
  const { episodic, base, recheck, write } = options;

  if (!episodic && base === null) {
    let found: Row | null;
    try {
      found = await recheck();
    } catch (error) {
      return { kind: 'check-failed', error };
    }
    if (found) return { kind: 'found-existing', row: found };
  }

  try {
    return { kind: 'written', row: await write() };
  } catch (error) {
    return { kind: 'write-failed', error };
  }
}
