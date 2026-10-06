-- =============================================================================
-- iMA — unscheduled tasks ("Later")
-- =============================================================================
-- Quick Capture lets a person write a thought down without deciding WHEN to do
-- it. Until now every task had to carry a date, so an undated thought could
-- only be stored by pretending it was due today, which floods Today and the
-- Right Now card with things nobody planned for today.
--
-- The change is one constraint: scheduled_date may now be NULL, meaning
-- "unscheduled / later". Nothing else moves:
--
--   * Existing rows: untouched. Every one already has a date and keeps it.
--     No row is rewritten, rescheduled or backfilled.
--   * The column DEFAULT (current_date) stays, so any insert that omits the
--     column behaves exactly as before. The app sends NULL explicitly, and
--     only when the person chose "Later".
--   * tasks_user_date_idx stays valid; NULLs are indexed and sort last.
--   * RLS: the policies on public.tasks are row-level on user_id and say
--     nothing about this column, so they cover it unchanged.
--   * Gentle nudges: the sender filters with scheduled_date <= local date, and
--     NULL never satisfies that, so unscheduled tasks are never nudged.
--   * The Context Engine treats a NULL date as not eligible for Right Now.
-- -----------------------------------------------------------------------------

alter table public.tasks
  alter column scheduled_date drop not null;

comment on column public.tasks.scheduled_date is
  'The local day the task is planned for, or NULL for an unscheduled ("Later") '
  'task. Unscheduled tasks are never ranked into Right Now.';
