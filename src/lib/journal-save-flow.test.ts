import { describe, expect, it, vi } from 'vitest';
import { conflictingFields, mergeIntoUntouched, runJournalSave } from './journal-save-flow';

type Row = { id: string };

describe('mergeIntoUntouched — saved data never overwrites writing', () => {
  const saved = { smile: 'Saved smile', warmth: 'Saved warmth' };

  it('fills every field the user has not touched', () => {
    expect(mergeIntoUntouched({ smile: '', warmth: '' }, new Set(), saved)).toEqual(saved);
  });

  it('keeps every field the user has typed in, even an emptied one', () => {
    const typed = { smile: 'Typed while loading', warmth: '' };
    expect(mergeIntoUntouched(typed, new Set(['smile', 'warmth'] as const), saved)).toEqual(typed);
  });

  it('mixes: edited fields kept, untouched ones filled', () => {
    expect(mergeIntoUntouched({ smile: 'Mine', warmth: '' }, new Set(['smile'] as const), saved)).toEqual({
      smile: 'Mine',
      warmth: 'Saved warmth'
    });
  });

  it('conflicts are edited fields whose saved answer differs and is not empty', () => {
    const edited = new Set(['smile', 'warmth'] as const);
    expect(conflictingFields({ smile: 'Mine', warmth: 'Saved warmth' }, edited, saved)).toEqual(['smile']);
    expect(conflictingFields({ smile: 'Mine', warmth: 'x' }, edited, { smile: '', warmth: '  ' })).toEqual([]);
  });
});

describe('runJournalSave', () => {
  const row: Row = { id: 'new' };
  const existing: Row = { id: 'today' };

  it('no entry held: looks again first, and writes when there is still none', async () => {
    const recheck = vi.fn().mockResolvedValue(null);
    const write = vi.fn().mockResolvedValue(row);
    expect(await runJournalSave<Row>({ episodic: false, base: null, recheck, write })).toEqual({ kind: 'written', row });
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('an entry turns up (failed load, or another tab saved first): nothing is written', async () => {
    const write = vi.fn();
    const result = await runJournalSave<Row>({ episodic: false, base: null, recheck: async () => existing, write });
    expect(result).toEqual({ kind: 'found-existing', row: existing });
    expect(write).not.toHaveBeenCalled();
  });

  it('the look-up fails: nothing is written', async () => {
    const write = vi.fn();
    const failure = { message: 'TypeError: Failed to fetch' };
    const result = await runJournalSave<Row>({
      episodic: false, base: null, recheck: () => Promise.reject(failure), write
    });
    expect(result).toEqual({ kind: 'check-failed', error: failure });
    expect(write).not.toHaveBeenCalled();
  });

  it('same-day editing: an entry already held is written to directly', async () => {
    const recheck = vi.fn();
    const write = vi.fn().mockResolvedValue(existing);
    expect(await runJournalSave<Row>({ episodic: false, base: existing, recheck, write })).toEqual({ kind: 'written', row: existing });
    expect(recheck).not.toHaveBeenCalled();
  });

  it('Post-Panic (episodic) always writes a new entry and never looks for one', async () => {
    const recheck = vi.fn().mockResolvedValue(existing);
    const write = vi.fn().mockResolvedValue(row);
    expect(await runJournalSave<Row>({ episodic: true, base: null, recheck, write })).toEqual({ kind: 'written', row });
    expect(recheck).not.toHaveBeenCalled();
  });

  it('a failed write is reported, not thrown', async () => {
    const failure = { code: '500' };
    expect(
      await runJournalSave<Row>({ episodic: false, base: existing, recheck: vi.fn(), write: () => Promise.reject(failure) })
    ).toEqual({ kind: 'write-failed', error: failure });
  });
});
