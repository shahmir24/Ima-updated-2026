-- =============================================================================
-- iMA — Notification settings: Focus Timer alerts, quiet hours, task-name privacy
-- =============================================================================
-- What this adds, and nothing else:
--
--   1. focus_alerts_enabled — account-wide opt-in to Focus Timer alerts.
--      OFF for every existing and new user until they turn it on. This stage
--      only stores the choice; delivering alerts is a later stage.
--
--   2. Quiet hours — quiet_hours_enabled (OFF), quiet_hours_start (22:00) and
--      quiet_hours_end (07:00), read in user_settings.timezone. They apply to
--      gentle nudges only; Focus alerts, which answer a timer the user started,
--      ignore them. An overnight range is a start later than the end. While
--      quiet hours are on, start and end may not be equal.
--
--   3. Task names in notifications — nudge_show_task_titles keeps its name and
--      every stored value. Only its DEFAULT changes, from true to false, so
--      accounts created from now on start private. No existing row is updated:
--      a stored true may be a deliberate choice, and nothing here can tell.
--      The one setting now covers both notification types.
--
--   4. claim_due_nudges() — the same signature, return shape, security and
--      grants, plus one rule: a nudge is never claimed while the user is in
--      quiet hours. Because the existing two-hour window is still measured
--      from nudge_time, a nudge that falls in quiet hours goes out when they
--      end if that is still inside the window, and is otherwise skipped for
--      that day. The local date it counts for is unchanged (the date taken at
--      nudge_time), so the one-nudge-per-local-day guard means exactly what it
--      meant before.
--
-- Existing rows: the three new columns are NOT NULL with defaults, so every
-- row is backfilled OFF / 22:00 / 07:00 by the column defaults alone. No
-- existing column value, constraint, policy, index, trigger or grant is
-- altered. RLS on user_settings is unchanged: users read and write only their
-- own row, exactly as before.
--
-- Deployment order: apply this migration BEFORE deploying the frontend that
-- reads focus_alerts_enabled and the quiet-hours columns. A frontend ahead of
-- the database cannot save Focus alerts or quiet hours (turning things off
-- stays safe: an unreadable setting keeps the device). The send-nudges edge
-- function needs no change: claim_due_nudges() returns the same columns.
--
-- Rollback (not run here; for reference). Roll the FRONTEND back first, or in
-- the same release, since it reads the new columns. Then, in one transaction:
--   1. Restore the previous claim_due_nudges(): re-run its CREATE OR REPLACE
--      from 20260928120000_gentle_nudges.sql, with the same revoke/grant
--      (service_role only).
--   2. alter table public.user_settings
--        alter column nudge_show_task_titles set default true;
--      (Only the default. Rows saved since keep their values; do not update
--      them, a stored false may be a user's choice.)
--   3. alter table public.user_settings
--        drop constraint user_settings_quiet_hours_range,
--        drop column focus_alerts_enabled,
--        drop column quiet_hours_enabled,
--        drop column quiet_hours_start,
--        drop column quiet_hours_end;
-- Dropping the columns permanently loses every user's saved Focus alerts and
-- quiet-hours choices; export them first if they may be needed again. Steps 1
-- and 2 alone undo the behaviour change while keeping the data.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1–3. Settings
-- -----------------------------------------------------------------------------
alter table public.user_settings
  add column focus_alerts_enabled boolean not null default false,
  add column quiet_hours_enabled  boolean not null default false,
  add column quiet_hours_start    time    not null default '22:00',
  add column quiet_hours_end      time    not null default '07:00',
  add constraint user_settings_quiet_hours_range
    check (not quiet_hours_enabled or quiet_hours_start <> quiet_hours_end);

alter table public.user_settings
  alter column nudge_show_task_titles set default false;

comment on column public.user_settings.focus_alerts_enabled is
  'Account-wide opt-in to Focus Timer alerts. Off by default. Alerts go only '
  'to the device running the timer, which must also be registered in push_subscriptions.';
comment on column public.user_settings.quiet_hours_enabled is
  'Whether quiet hours apply. They hold back gentle nudges only, never Focus alerts.';
comment on column public.user_settings.quiet_hours_start is
  'Local wall-clock start of quiet hours, in user_settings.timezone. Later than '
  'quiet_hours_end means the range runs overnight.';
comment on column public.user_settings.quiet_hours_end is
  'Local wall-clock end of quiet hours (exclusive), in user_settings.timezone.';
comment on column public.user_settings.nudge_show_task_titles is
  'Whether a notification (a gentle nudge or a Focus alert) may name a task. '
  'Notifications can show on a lock screen. Defaults to false for new accounts; '
  'values stored before that change were kept.';


-- -----------------------------------------------------------------------------
-- 4. Who is due now — claimed before sending. service_role only.
-- -----------------------------------------------------------------------------
-- As before (see 20260928120000_gentle_nudges.sql), a user is due when:
--   * nudges are on and at least one device is registered;
--   * their timezone resolves (a bad one skips that user, never the batch);
--   * their local time is between nudge_time and nudge_time + p_window_minutes;
--   * no delivery exists yet for the local date the nudge is FOR (taken at
--     nudge_time).
-- And now also:
--   * their local wall-clock time is not inside enabled quiet hours. Same-day
--     range: start <= t < end. Overnight range (start > end): t >= start or
--     t < end.
--
-- Daylight-saving transitions follow from comparing local wall-clock times:
-- when clocks go forward and skip the end of quiet hours, the first local time
-- after the jump is already past the end, so quiet hours are over; when clocks
-- go back, the repeated hour is judged by its wall-clock time both times, and
-- the per-day guard still allows only one nudge.
create or replace function public.claim_due_nudges(
  p_limit          integer     default 200,
  p_window_minutes integer     default 120,
  p_now            timestamptz default now()
)
returns table (delivery_id uuid, user_id uuid, local_date date, show_task_titles boolean)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    -- Converted through tz.name, never us.timezone: an expression on the
    -- joined column cannot run before the join, so an unresolvable zone is
    -- dropped by the join instead of throwing and failing the whole batch.
    select us.user_id,
           us.nudge_show_task_titles,
           (p_now at time zone tz.name) as local_now,
           mod(
             ((extract(epoch from ((p_now at time zone tz.name)::time - us.nudge_time)) / 60)::integer
               + 1440),
             1440
           ) as minutes_late,
           us.quiet_hours_enabled
             and case
                   when us.quiet_hours_start < us.quiet_hours_end then
                     (p_now at time zone tz.name)::time >= us.quiet_hours_start
                     and (p_now at time zone tz.name)::time < us.quiet_hours_end
                   when us.quiet_hours_start > us.quiet_hours_end then
                     (p_now at time zone tz.name)::time >= us.quiet_hours_start
                     or (p_now at time zone tz.name)::time < us.quiet_hours_end
                   else false
                 end as in_quiet_hours
    from public.user_settings us
    join pg_catalog.pg_timezone_names tz on tz.name = us.timezone
    where us.nudges_enabled
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = us.user_id)
  ),
  due as (
    select c.user_id,
           c.nudge_show_task_titles,
           (c.local_now - make_interval(mins => c.minutes_late))::date as local_date
    from candidates c
    where c.minutes_late < p_window_minutes
      and not c.in_quiet_hours
      and not exists (
        select 1 from public.nudge_deliveries nd
        where nd.user_id = c.user_id
          and nd.local_date = (c.local_now - make_interval(mins => c.minutes_late))::date
      )
    limit p_limit
  ),
  claimed as (
    insert into public.nudge_deliveries (user_id, local_date)
    select due.user_id, due.local_date from due
    on conflict on constraint nudge_deliveries_one_per_day do nothing
    returning nudge_deliveries.id, nudge_deliveries.user_id, nudge_deliveries.local_date
  )
  select claimed.id, claimed.user_id, claimed.local_date, due.nudge_show_task_titles
  from claimed
  join due on due.user_id = claimed.user_id;
$$;

comment on function public.claim_due_nudges(integer, integer, timestamptz) is
  'Sender only: claims (inserts nudge_deliveries rows for) every user due a daily '
  'nudge now, outside their quiet hours, and returns them. Safe against overlapping runs.';

-- Restated, not changed: CREATE OR REPLACE keeps the existing privileges.
revoke all on function public.claim_due_nudges(integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_due_nudges(integer, integer, timestamptz) to service_role;
