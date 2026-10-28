-- Regression tests for 20261028120000_notification_settings.sql.
-- Run by supabase/tests/sql/run.sh against a throwaway local Postgres; every
-- check raises (and stops the run) on failure. Times are fixed with p_now, so
-- nothing depends on when the tests run.
\pset tuples_only on
\pset format unaligned

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok - %', label;
end $$;

-- A user with nudges on and one registered device.
create function pg_temp.nudge_user(p_id uuid, p_zone text, p_nudge time) returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (p_id, p_id::text || '@example.test');
  update public.user_settings set nudges_enabled = true, nudge_time = p_nudge, timezone = p_zone where user_id = p_id;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (p_id, 'https://fcm.googleapis.com/fcm/send/' || p_id, repeat('A', 87), repeat('B', 22));
end $$;

-- Starts a scenario: switches off everyone's nudges so earlier scenarios'
-- users cannot fall due at the times this one picks.
create function pg_temp.new_scenario() returns void language sql as $$
  update public.user_settings set nudges_enabled = false where nudges_enabled
$$;

-- Who claim_due_nudges() hands out at p_now, as "user:local_date".
create function pg_temp.claims(p_now timestamptz) returns text language sql as $$
  select coalesce(string_agg(right(user_id::text, 2) || ':' || local_date::text, ',' order by user_id), '')
  from public.claim_due_nudges(200, 120, p_now)
$$;

-- -----------------------------------------------------------------------------
-- Existing accounts and defaults
-- -----------------------------------------------------------------------------
select pg_temp.check(
  (select nudge_show_task_titles from public.user_settings where user_id = '00000000-0000-4000-8000-0000000000e1') = true,
  'existing account on the old default keeps task names = true (no backfill)');
select pg_temp.check(
  (select nudge_show_task_titles from public.user_settings where user_id = '00000000-0000-4000-8000-0000000000e2') = false,
  'existing account that chose off keeps false');
select pg_temp.check(
  (select (nudges_enabled, nudge_time, timezone, nudge_show_task_titles)
     from public.user_settings where user_id = '00000000-0000-4000-8000-0000000000e3')
  = (true, '08:15'::time, 'Europe/London'::text, true),
  'existing nudges_enabled, nudge_time, timezone and task names are untouched');
select pg_temp.check(
  (select bool_and(not focus_alerts_enabled and not quiet_hours_enabled
                   and quiet_hours_start = '22:00' and quiet_hours_end = '07:00')
     from public.user_settings where user_id::text like '00000000-0000-4000-8000-0000000000e%'),
  'existing accounts get Focus alerts OFF and quiet hours OFF (22:00-07:00)');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'new@example.test');
select pg_temp.check(
  (select (focus_alerts_enabled, quiet_hours_enabled, nudges_enabled, nudge_show_task_titles)
     from public.user_settings where user_id = '00000000-0000-4000-8000-0000000000a1')
  = (false, false, false, false),
  'a new account starts with Focus alerts, quiet hours, nudges and task names all OFF');

-- -----------------------------------------------------------------------------
-- Equal start/end
-- -----------------------------------------------------------------------------
do $$
begin
  update public.user_settings set quiet_hours_enabled = true, quiet_hours_start = '09:00', quiet_hours_end = '09:00'
   where user_id = '00000000-0000-4000-8000-0000000000a1';
  raise exception 'FAILED: equal start/end accepted while quiet hours are on';
exception when check_violation then
  raise notice 'ok - equal start/end is rejected while quiet hours are on';
end $$;
update public.user_settings set quiet_hours_enabled = false, quiet_hours_start = '09:00', quiet_hours_end = '09:00'
 where user_id = '00000000-0000-4000-8000-0000000000a1';
select pg_temp.check(true, 'equal start/end is allowed while quiet hours are off (nothing is suppressed)');

-- -----------------------------------------------------------------------------
-- Quiet hours and claiming. Users 01-09, each isolated by their own settings.
-- -----------------------------------------------------------------------------
-- 01: UTC, nudge 09:00, no quiet hours.
select pg_temp.nudge_user('00000000-0000-4000-8000-000000000001', 'UTC', '09:00');
-- 02: UTC, nudge 14:00, same-day quiet 13:00-15:00 -> deferred to 15:00.
select pg_temp.nudge_user('00000000-0000-4000-8000-000000000002', 'UTC', '14:00');
update public.user_settings set quiet_hours_enabled = true, quiet_hours_start = '13:00', quiet_hours_end = '15:00'
 where user_id = '00000000-0000-4000-8000-000000000002';

select pg_temp.check(pg_temp.claims('2026-06-10 09:05+00') = '01:2026-06-10',
  'no quiet hours: a nudge is claimed in its window as before');
select pg_temp.check(pg_temp.claims('2026-06-10 14:10+00') = '',
  'same-day quiet hours: nothing is claimed inside them');
select pg_temp.check(pg_temp.claims('2026-06-10 15:05+00') = '02:2026-06-10',
  'same-day quiet hours: deferred to their end, still inside the 2-hour window');
select pg_temp.check(pg_temp.claims('2026-06-10 15:30+00') = '',
  'one nudge per local day: a later run claims nothing more');

select pg_temp.new_scenario();
-- 03: UTC, nudge 06:00, overnight quiet 22:00-07:00 -> deferred to 07:00.
-- 04: UTC, nudge 04:00, overnight quiet 22:00-07:00 -> 07:00 is 3h late -> skipped.
select pg_temp.nudge_user('00000000-0000-4000-8000-000000000003', 'UTC', '06:00');
select pg_temp.nudge_user('00000000-0000-4000-8000-000000000004', 'UTC', '04:00');
update public.user_settings set quiet_hours_enabled = true, quiet_hours_start = '22:00', quiet_hours_end = '07:00'
 where user_id in ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004');

select pg_temp.check(pg_temp.claims('2026-06-11 04:30+00') = '',
  'overnight quiet hours: nothing claimed at 04:30');
select pg_temp.check(pg_temp.claims('2026-06-11 06:30+00') = '',
  'overnight quiet hours: nothing claimed at 06:30');
select pg_temp.check(pg_temp.claims('2026-06-11 07:10+00') = '03:2026-06-11',
  'overnight quiet hours: the 06:00 nudge goes out at 07:00 (within 2 hours); the 04:00 one does not');
select pg_temp.check(pg_temp.claims('2026-06-11 08:30+00') = '',
  'the 04:00 nudge is skipped for the day, never sent late');
select pg_temp.check(
  not exists (select 1 from public.nudge_deliveries where user_id = '00000000-0000-4000-8000-000000000004'),
  'a skipped nudge leaves no delivery row');

select pg_temp.new_scenario();
-- 05: quiet hours set but OFF -> ignored.
select pg_temp.nudge_user('00000000-0000-4000-8000-000000000005', 'UTC', '23:00');
update public.user_settings set quiet_hours_enabled = false, quiet_hours_start = '22:00', quiet_hours_end = '07:00'
 where user_id = '00000000-0000-4000-8000-000000000005';
select pg_temp.check(pg_temp.claims('2026-06-11 23:05+00') = '05:2026-06-11',
  'quiet hours switched off are ignored');

select pg_temp.new_scenario();
-- 06: a nudge late in the evening, deferred across midnight, counts for the day it was FOR.
select pg_temp.nudge_user('00000000-0000-4000-8000-000000000006', 'UTC', '23:30');
update public.user_settings set quiet_hours_enabled = true, quiet_hours_start = '23:00', quiet_hours_end = '00:30'
 where user_id = '00000000-0000-4000-8000-000000000006';
select pg_temp.check(pg_temp.claims('2026-06-11 23:45+00') = '', 'evening nudge inside quiet hours: held');
select pg_temp.check(pg_temp.claims('2026-06-12 00:35+00') = '06:2026-06-11',
  'deferred past midnight, it still counts for the local date of its nudge time');
select pg_temp.check(pg_temp.claims('2026-06-12 23:45+00') = '', 'next day: held by quiet hours again');
select pg_temp.check(pg_temp.claims('2026-06-13 00:35+00') = '06:2026-06-12', 'the next day is its own day');

select pg_temp.new_scenario();
-- 07: the saved IANA zone is what counts (Asia/Karachi, UTC+5): nudge 09:00, quiet 08:00-09:30.
select pg_temp.nudge_user('00000000-0000-4000-8000-000000000007', 'Asia/Karachi', '09:00');
update public.user_settings set quiet_hours_enabled = true, quiet_hours_start = '08:00', quiet_hours_end = '09:30'
 where user_id = '00000000-0000-4000-8000-000000000007';
select pg_temp.check(pg_temp.claims('2026-06-14 04:15+00') = '', 'Karachi 09:15 is inside quiet hours');
select pg_temp.check(pg_temp.claims('2026-06-14 04:35+00') = '07:2026-06-14', 'Karachi 09:35: claimed for the Karachi date');

select pg_temp.new_scenario();
-- 08: DST, clocks go forward (Europe/London, 2026-03-29 01:00 GMT -> 02:00 BST).
-- Quiet hours end at 01:30, a time that does not exist that night. Nudge 01:15.
select pg_temp.nudge_user('00000000-0000-4000-8000-000000000008', 'Europe/London', '01:15');
update public.user_settings set quiet_hours_enabled = true, quiet_hours_start = '23:00', quiet_hours_end = '01:30'
 where user_id = '00000000-0000-4000-8000-000000000008';
select pg_temp.check(pg_temp.claims('2026-03-29 00:50+00') = '', 'spring forward: 00:50 local, still quiet');
select pg_temp.check(pg_temp.claims('2026-03-29 01:00+00') = '08:2026-03-29',
  'spring forward: the skipped end of quiet hours counts as reached at 02:00 BST; the nudge goes out');

select pg_temp.new_scenario();
-- 09: DST, clocks go back (Europe/London, 2026-10-25 02:00 BST -> 01:00 GMT; 01:00-02:00 happens twice).
-- Quiet 00:00-01:30, nudge 01:00.
select pg_temp.nudge_user('00000000-0000-4000-8000-000000000009', 'Europe/London', '01:00');
update public.user_settings set quiet_hours_enabled = true, quiet_hours_start = '00:00', quiet_hours_end = '01:30'
 where user_id = '00000000-0000-4000-8000-000000000009';
select pg_temp.check(pg_temp.claims('2026-10-25 00:20+00') = '', 'fall back: 01:20 BST (first time) is quiet');
select pg_temp.check(pg_temp.claims('2026-10-25 00:40+00') = '09:2026-10-25', 'fall back: 01:40 BST, claimed');
select pg_temp.check(pg_temp.claims('2026-10-25 01:20+00') = '', 'fall back: 01:20 GMT (second time) is quiet again');
select pg_temp.check(pg_temp.claims('2026-10-25 01:40+00') = '', 'fall back: 01:40 GMT, the repeated hour cannot send a second nudge');

-- The two-hour window is strict and unchanged: exactly 120 minutes late is skipped.
-- 10: nudge 14:00, no quiet hours. 11: nudge 14:00, quiet 13:00-16:00 (ends exactly 120 min late).
-- 12: nudge 14:00, quiet 13:00-15:59 (ends 119 min late).
select pg_temp.new_scenario();
select pg_temp.nudge_user('00000000-0000-4000-8000-000000000010', 'UTC', '14:00');
select pg_temp.check(pg_temp.claims('2026-07-01 16:00:00+00') = '', 'no quiet hours: exactly 120 minutes late is outside the window');
select pg_temp.check(pg_temp.claims('2026-07-02 15:59:00+00') = '10:2026-07-02', 'no quiet hours: 119 minutes late is inside the window');

select pg_temp.new_scenario();
select pg_temp.nudge_user('00000000-0000-4000-8000-000000000011', 'UTC', '14:00');
update public.user_settings set quiet_hours_enabled = true, quiet_hours_start = '13:00', quiet_hours_end = '16:00'
 where user_id = '00000000-0000-4000-8000-000000000011';
select pg_temp.check(pg_temp.claims('2026-07-01 15:59:00+00') = '', 'quiet until 16:00: still quiet at 15:59');
select pg_temp.check(pg_temp.claims('2026-07-01 16:00:00+00') = '', 'quiet ending exactly 120 minutes late: skipped, not deferred');
select pg_temp.check(pg_temp.claims('2026-07-01 16:01:00+00') = '', '...and not sent late afterwards');

select pg_temp.new_scenario();
select pg_temp.nudge_user('00000000-0000-4000-8000-000000000012', 'UTC', '14:00');
update public.user_settings set quiet_hours_enabled = true, quiet_hours_start = '13:00', quiet_hours_end = '15:59'
 where user_id = '00000000-0000-4000-8000-000000000012';
select pg_temp.check(pg_temp.claims('2026-07-01 15:59:00+00') = '12:2026-07-01', 'quiet ending 119 minutes late: deferred and sent');

-- -----------------------------------------------------------------------------
-- Unchanged rules and access
-- -----------------------------------------------------------------------------
select pg_temp.new_scenario();
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000b1', 'no-device@example.test');
update public.user_settings set nudges_enabled = true, nudge_time = '09:00', timezone = 'UTC'
 where user_id = '00000000-0000-4000-8000-0000000000b1';
select pg_temp.check(pg_temp.claims('2026-06-20 09:05+00') = '',
  'a user with no registered device is still never claimed');

select pg_temp.check(
  not has_function_privilege('authenticated', 'public.claim_due_nudges(integer, integer, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.claim_due_nudges(integer, integer, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.claim_due_nudges(integer, integer, timestamptz)', 'execute'),
  'claim_due_nudges stays service_role only');
select pg_temp.check(
  (select prosecdef from pg_proc where oid = 'public.claim_due_nudges(integer, integer, timestamptz)'::regprocedure),
  'claim_due_nudges stays SECURITY DEFINER');
select pg_temp.check(
  (select relrowsecurity from pg_class where oid = 'public.user_settings'::regclass)
  and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'user_settings') >= 3,
  'user_settings RLS and its policies are still in place');

-- A signed-in user can change only their own new settings (RLS unchanged).
set role authenticated;
select from (select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false)) s;
update public.user_settings set focus_alerts_enabled = true, quiet_hours_enabled = true,
       quiet_hours_start = '21:00', quiet_hours_end = '06:00'
 where user_id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1');
reset role;
select pg_temp.check(
  (select focus_alerts_enabled from public.user_settings where user_id = '00000000-0000-4000-8000-0000000000a1')
  and not (select focus_alerts_enabled from public.user_settings where user_id = '00000000-0000-4000-8000-0000000000e1'),
  'RLS: a user updates their own new settings and nobody else''s');

\echo 'ALL NOTIFICATION SETTINGS SQL TESTS PASSED'
