-- =============================================================================
-- iMA — task importance
-- =============================================================================
-- The Context Engine needs one thing the schema cannot derive: whether a task
-- MATTERS. Everything else it ranks on — overdue-ness, age, completion — is
-- already in the row. Importance is the only judgement the user has to make,
-- so it is kept to three values and given a default, which means a user who
-- ignores it entirely is indistinguishable from today.
--
-- Three values, not five: a scale people have to think about is a scale they
-- skip. 'normal' is the default so an unanswered question has a safe answer.
--
-- Existing rows: NOT NULL with a DEFAULT backfills every row as 'normal',
-- which reproduces today's ordering exactly. No row becomes invalid and no
-- backfill script is needed.
--
-- No RLS change: the policies on public.tasks are row-level on user_id and say
-- nothing about columns, so a new column is covered by them as it stands.
--
-- No index: ranking happens client-side over the list useTasks() already
-- fetches, so importance is never a query predicate. tasks_user_date_idx still
-- serves the only query this table has.
-- -----------------------------------------------------------------------------

alter table public.tasks
  add column importance text not null default 'normal'
    constraint tasks_importance check (importance in ('low', 'normal', 'high'));

comment on column public.tasks.importance is
  'User-set priority for the Context Engine: low | normal | high. Defaults to '
  'normal so the field is optional in the UI.';
