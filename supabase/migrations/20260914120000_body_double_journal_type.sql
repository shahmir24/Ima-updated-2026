-- =============================================================================
-- iMA — add the 'body-double' journal type
-- =============================================================================
-- The Body Double wrap-up asks two reflection questions ("What went well?" /
-- "What would I like to improve?") and offers to save them to the journal.
--
-- None of the six existing types fits. `focus-reset` and `daily-journal` are
-- the closest in spirit, but both are one-row-per-day in the client, so saving
-- a co-working reflection as either would overwrite that day's real entry —
-- and Journal History would print the wrong question above the answer. So the
-- type gets its own value rather than borrowing one.
--
-- The client treats 'body-double' as episodic (like 'post-panic'): two
-- co-working sessions in one day are two separate sessions, so each save is a
-- new row. Nothing in the schema needs to enforce that.
--
-- responses shape (client-owned, same convention as the other six):
--   body-double  { didWell, toImprove }
--
-- Existing rows are unaffected: this only widens the accepted set, so every
-- row that satisfied the old constraint satisfies the new one.
-- -----------------------------------------------------------------------------

alter table public.journal_entries
  drop constraint journal_entries_type;

alter table public.journal_entries
  add constraint journal_entries_type
  check (entry_type in ('morning-intention', 'daily-journal', 'post-panic',
                        'focus-reset', 'gratitude', 'sensory-checkin',
                        'body-double'));
