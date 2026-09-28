-- =============================================================================
-- iMA — Gentle Nudges (MVP): push subscriptions, nudge preferences, delivery log
-- =============================================================================
-- One gentle nudge a day, at a local time the user picks, for signed-in users
-- who have explicitly turned it on. Guests never reach any of this: every
-- object below is keyed to auth.users and closed to the anon role.
--
-- What this adds, and nothing else:
--   1. Three preference columns on user_settings. Nudges are OFF for every
--      existing and new user until they opt in. timezone already exists
--      (default 'UTC') and is NOT re-added; a trigger now refuses a name
--      Postgres cannot resolve, because one bad zone must never break a batch.
--   2. push_subscriptions — one row per browser/device. Users read and remove
--      their own; writes go through register_push_subscription(), because a
--      shared browser's endpoint may still belong to a previous account and
--      RLS would (correctly) stop an ordinary UPSERT from moving it.
--   3. nudge_deliveries — at most one daily nudge per user per local date.
--      Server-only.
--   4. claim_due_nudges() — for the sender only (service_role): who is due
--      now, claimed BEFORE sending, so overlapping runs cannot double-send.
--
-- Existing rows: the new user_settings columns are NOT NULL with defaults, so
-- every row is backfilled OFF / 09:00 / titles shown. No existing column,
-- constraint, policy, index, trigger or grant is altered.
--
-- Supabase grants new public tables and functions to anon, authenticated and
-- service_role by default; every grant below is therefore stated explicitly,
-- and everything not needed is revoked.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Preferences on user_settings
-- -----------------------------------------------------------------------------
alter table public.user_settings
  add column nudges_enabled         boolean not null default false,
  add column nudge_time             time    not null default '09:00',
  add column nudge_show_task_titles boolean not null default true;

comment on column public.user_settings.nudges_enabled is
  'Account-wide opt-in to the daily gentle nudge. Off by default. Each device '
  'opts in separately by registering a row in push_subscriptions.';
comment on column public.user_settings.nudge_time is
  'Local wall-clock time of the daily nudge, read in user_settings.timezone.';
comment on column public.user_settings.nudge_show_task_titles is
  'Whether the nudge may name a task. Notifications can show on a lock screen.';

-- A zone Postgres cannot resolve would make `at time zone` throw. Refused at
-- write time here; the sender additionally skips (never errors on) any such
-- row. A trigger rather than a CHECK, because the list lives in a catalog view.
create or replace function public.validate_user_settings_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

comment on function public.validate_user_settings_timezone() is
  'BEFORE INSERT/UPDATE OF timezone trigger: rejects names Postgres cannot resolve.';

revoke all on function public.validate_user_settings_timezone() from public, anon, authenticated;

create trigger user_settings_validate_timezone
  before insert or update of timezone on public.user_settings
  for each row execute function public.validate_user_settings_timezone();


-- -----------------------------------------------------------------------------
-- 2. Push subscriptions: one row per browser/device
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,

  -- PushSubscription.toJSON(): endpoint + keys.p256dh + keys.auth.
  endpoint        text not null
                    constraint push_subscriptions_endpoint_unique unique
                    constraint push_subscriptions_endpoint
                    check (endpoint like 'https://%' and length(endpoint) <= 2048),
  p256dh          text not null
                    constraint push_subscriptions_p256dh
                    check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),        -- 65-byte P-256 point
  auth            text not null
                    constraint push_subscriptions_auth
                    check (auth ~ '^[A-Za-z0-9_-]{22,64}$'),       -- >= 16-byte secret
  user_agent      text
                    constraint push_subscriptions_user_agent
                    check (user_agent is null or length(user_agent) <= 512),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count   integer not null default 0
                    constraint push_subscriptions_failures check (failure_count >= 0)
);

comment on table public.push_subscriptions is
  'Web Push subscriptions, one per browser/device. Written only through '
  'register_push_subscription(); dead ones are deleted by the sender.';

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- Registers (or re-registers) THIS browser for the signed-in user. Holding the
-- endpoint proves possession of the browser's subscription, so on a shared
-- device the row simply moves to whoever is signed in now; the previous
-- account stops receiving nudges on it.
create or replace function public.register_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 512))
  on conflict (endpoint) do update
    set user_id       = excluded.user_id,
        p256dh        = excluded.p256dh,
        auth          = excluded.auth,
        user_agent    = excluded.user_agent,
        failure_count = 0;
end;
$$;

comment on function public.register_push_subscription(text, text, text, text) is
  'Upserts this browser''s push subscription for auth.uid(), moving it from any '
  'previous account on the same device.';

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Delivery log: at most one daily nudge per user per local date
-- -----------------------------------------------------------------------------
create table public.nudge_deliveries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- The local calendar date the nudge was FOR (see claim_due_nudges).
  local_date        date not null,
  status            text not null default 'claimed'
                      constraint nudge_deliveries_status
                      check (status in ('claimed', 'sent', 'no_devices', 'failed')),
  -- Which task the nudge named, if any. Never its title.
  task_id           uuid references public.tasks (id) on delete set null,
  devices_attempted smallint not null default 0
                      constraint nudge_deliveries_attempted check (devices_attempted >= 0),
  devices_succeeded smallint not null default 0
                      constraint nudge_deliveries_succeeded
                      check (devices_succeeded between 0 and devices_attempted),
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,

  constraint nudge_deliveries_one_per_day unique (user_id, local_date)
);

comment on table public.nudge_deliveries is
  'One row per daily nudge claimed. The unique (user_id, local_date) is the '
  'duplicate guard. Server-only: RLS on with no policies.';

alter table public.nudge_deliveries enable row level security;

revoke all on public.nudge_deliveries from anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4. Who is due now — claimed before sending. service_role only.
-- -----------------------------------------------------------------------------
-- A user is due when:
--   * nudges are on and at least one device is registered;
--   * their timezone resolves (a bad one skips that user, never the batch);
--   * their local time is between nudge_time and nudge_time + p_window_minutes
--     (so turning nudges on at 20:00 with a 09:00 time sends nothing today);
--   * no delivery exists yet for the local date the nudge is FOR. That date is
--     taken at nudge_time, so a 23:30 nudge sent at 00:10 still counts for
--     the day before, and the repeated 01:00–02:00 hour when clocks go back
--     cannot produce a second nudge.
-- Claiming inserts the delivery row first; ON CONFLICT DO NOTHING means two
-- overlapping runs can never both claim the same user and day.
-- p_now exists for deterministic tests; the sender leaves it at now().
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
           ) as minutes_late
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
  'nudge now and returns them. Safe against overlapping runs.';

revoke all on function public.claim_due_nudges(integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_due_nudges(integer, integer, timestamptz) to service_role;
