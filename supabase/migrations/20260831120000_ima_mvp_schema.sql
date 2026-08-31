-- =============================================================================
-- iMA — MVP schema
-- =============================================================================
-- Target: the new Supabase project (empty).
--
-- Scope: persistence for the features that already exist in the app today.
-- Every column here maps to state a component currently holds in useState and
-- loses on refresh. Nothing is modelled ahead of the UI.
--
--   profiles              1:1  Profile Info tab
--   user_settings         1:1  App Settings tab + Focus timer defaults
--   onboarding_responses  1:1  the 8-question questionnaire
--   mood_checkins         1:N  home-screen mood picker (append-only log)
--   journal_entries       1:N  all six journal types
--   tasks                 1:N  Tasks screen + New Task modal
--   focus_sessions        1:N  Focus timer AND BodyDouble
--   wellness_sessions     1:N  breathing, meditation, body scan, walking
--   safe_contacts         1:N  Safe Space support circle
--
-- Plus a private `avatars` Storage bucket; profiles.avatar_url holds the object
-- path, not the image.
--
-- Deliberately NOT included (no shape in the code yet, see the schema doc):
--   * goals        — three unconnected UI stubs, no type/target/period
--   * chat history — both chats are canned scripts; shape changes with real AI
--   * an exercises catalogue — the content ships in the bundle
--
-- -----------------------------------------------------------------------------
-- History
-- -----------------------------------------------------------------------------
-- This is the first migration for the new project, and the only one in this
-- directory. Two Lovable-era files (20250621103046-… and 20250621103924-…)
-- defined the previous project's schema — public.users, an earlier
-- onboarding_responses, handle_new_user() and the on_auth_user_created trigger.
-- That project has been deleted, and those files collided with this one on
-- `supabase db push`, so they were removed in the same commit as this note.
-- They remain in git history if you ever need to read them.
-- =============================================================================


-- =============================================================================
-- 1. SHARED FUNCTIONS
-- =============================================================================

-- Keeps updated_at honest on every table that has one.
-- No table references, so an empty search_path is safe (pg_catalog is always
-- implicitly searched, so now() still resolves).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at.';


-- Creates the two 1:1 rows the app assumes exist, the moment an auth user is
-- created. This is what removes the old project''s failure mode, where
-- onboarding had to create its own user row and the RLS policy to do so was
-- missing.
--
-- SECURITY DEFINER so it can write past RLS; search_path is pinned to '' and
-- every object is schema-qualified, which is the hardening the old
-- handle_new_user() lacked.
--
-- ON CONFLICT DO NOTHING so a retried or replayed signup can never fail here —
-- an error in this trigger would abort the whole account creation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'AFTER INSERT ON auth.users: seeds profiles + user_settings.';


-- =============================================================================
-- 2. TABLES
-- =============================================================================
-- Every foreign key points at auth.users(id), never at an intermediate table.
-- That is deliberate: the old project chained onboarding_responses through
-- public.users, so a missing row there made onboarding unrecoverable.

-- -----------------------------------------------------------------------------
-- profiles — who the person is
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                      uuid primary key
                            references auth.users (id) on delete cascade,

  full_name               text,          -- captured at signup (Auth.tsx)
  first_name              text,          -- "About You" → First Name

  -- Free text by design: the Select offers she-her / he-him / they-them / other
  -- but has nowhere to say what "other" is. Suggestions stay in the UI; anyone
  -- can type their own. Bounded only to stop an essay landing in the column.
  pronouns                text
                            constraint profiles_pronouns_len
                            check (pronouns is null or length(btrim(pronouns)) between 1 and 50),

  date_of_birth           date
                            constraint profiles_dob_sane
                            check (date_of_birth is null
                                   or (date_of_birth > date '1900-01-01'
                                       and date_of_birth < current_date)),

  -- Storage object path inside the `avatars` bucket, e.g. '<uid>/avatar.jpg'.
  -- NOT a base64 data URL — see §4.
  avatar_url              text,
  avatar_emoji            text,          -- the 8-emoji picker
  use_emoji_avatar        boolean not null default false,

  focus_goal              text,          -- "✨ reduce overwhelm"
  preferred_mode          text
                            constraint profiles_preferred_mode
                            check (preferred_mode in ('focus', 'calm', 'sleep')),
  mood_checkin_frequency  text
                            constraint profiles_checkin_freq
                            check (mood_checkin_frequency in ('daily', 'weekly', 'on-demand')),

  -- The single value that lets the router decide whether a signed-in user still
  -- needs onboarding. The app has no way to answer that question today.
  onboarding_completed_at timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.profiles is
  'One row per user. Backs the Profile Info tab of ProfileSettings.tsx.';
comment on column public.profiles.avatar_url is
  'Object path in the private `avatars` bucket. Read with createSignedUrl().';
comment on column public.profiles.onboarding_completed_at is
  'Null until the questionnaire is finished. Drives the /welcome redirect.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- user_settings — how the app behaves
-- -----------------------------------------------------------------------------
create table public.user_settings (
  user_id             uuid primary key
                        references auth.users (id) on delete cascade,

  theme               text     not null default 'dark'
                        constraint user_settings_theme check (theme in ('light', 'dark')),
  sound_volume        smallint not null default 75
                        constraint user_settings_volume check (sound_volume between 0 and 100),
  animation_speed     text     not null default 'normal'
                        constraint user_settings_anim check (animation_speed in ('normal', 'reduced')),

  adhd_mode           boolean  not null default false,
  encouragement       boolean  not null default true,
  ai_companion_name   text,    -- "AI Body Double Name"

  -- Focus.tsx hard-codes these as 25 / 5 / 4 today. Ranges are wider than the
  -- current dropdowns (25|50, 5|15, 1-4) so the UI can widen without a migration.
  focus_block_minutes smallint not null default 25
                        constraint user_settings_block check (focus_block_minutes between 1 and 240),
  buffer_minutes      smallint not null default 5
                        constraint user_settings_buffer check (buffer_minutes between 0 and 60),
  default_flows       smallint not null default 4
                        constraint user_settings_flows check (default_flows between 1 and 12),

  timeboxing_style    text
                        constraint user_settings_style
                        check (timeboxing_style in ('pomodoro', 'deep-dive', 'custom')),
  daily_focus_goal    text,

  -- No UI behind this one, and it is load-bearing: Stats buckets by local day
  -- and the streak counter needs consecutive calendar days. Both are wrong
  -- outside UTC without it. Capture once with
  -- Intl.DateTimeFormat().resolvedOptions().timeZone
  timezone            text     not null default 'UTC',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.user_settings is
  'One row per user. Backs the App Settings tab and the Focus timer defaults.';
comment on column public.user_settings.timezone is
  'IANA name. Required for correct day-bucketing in Stats and streaks.';

-- Not modelled: "Panic Mode Shortcut". Its button has no handler and no state,
-- so there is no shape to store yet.

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- onboarding_responses — one column per question
-- -----------------------------------------------------------------------------
-- The old schema concatenated three answers into a single string
-- ("Status: X. Struggles: Y. Additional: Z"), which cannot be queried,
-- segmented, or selectively redacted — and free-text mental-health disclosure
-- was part of that blob. One column per field of the OnboardingData interface.
create table public.onboarding_responses (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null unique
                         references auth.users (id) on delete cascade,

  reason               text,     -- "What brings you to iMA today?"
  daily_feeling        text,     -- "How do you usually feel at the start of your day?"
  struggles            text[],   -- multiselect
  adhd_status          text,     -- diagnosed / suspect / no / prefer not to say
  overwhelmed_response text,     -- "When you're overwhelmed, what usually happens?"
  first_help           text,     -- "What would you love iMA to help you with first?"
  support_style        text[],   -- multiselect
  additional_info      text,     -- free text

  -- Derived client-side by getStressLevelFromResponses(), now stored alongside
  -- the raw answers rather than instead of them.
  stress_level         smallint
                         constraint onboarding_stress_range
                         check (stress_level between 1 and 10),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.onboarding_responses is
  'One row per user. UNIQUE(user_id) — write with upsert(onConflict: user_id).';

create trigger onboarding_responses_set_updated_at
  before update on public.onboarding_responses
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- mood_checkins — append-only log
-- -----------------------------------------------------------------------------
-- Deliberately NOT one row per day. Mood changes through a day and the series
-- is the valuable data; a unique constraint on the day would throw it away.
-- To pre-select "today's" answer, read the newest row for the local day.
create table public.mood_checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,

  -- Matches the `moods` array in Index.tsx exactly, lowercased.
  mood       text not null
               constraint mood_checkins_vocab
               check (mood in ('happy', 'sad', 'calm', 'anxious', 'focused')),
  note       text,

  created_at timestamptz not null default now()
);

comment on table public.mood_checkins is
  'Append-only. Multiple check-ins per day are expected, not an error.';

create index mood_checkins_user_time_idx
  on public.mood_checkins (user_id, created_at desc);


-- -----------------------------------------------------------------------------
-- journal_entries — all six types, editable
-- -----------------------------------------------------------------------------
-- entry_type values are the ids already declared in JournalingMenu.tsx.
-- `responses` holds that type's fields verbatim — each page's handleSave
-- already builds exactly the right object and passes it to console.log:
--
--   morning-intention  { intention }
--   daily-journal      { onMind, energy, letGoLeanIn }
--   post-panic         { whatHappened, howItFelt, whatNeeded }
--   focus-reset        { whatMatters, justNoise }
--   gratitude          { smile, warmth }
--   sensory-checkin    { sensations, bodyAwareness, softenSpot }
create table public.journal_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,

  entry_type text  not null
               constraint journal_entries_type
               check (entry_type in ('morning-intention', 'daily-journal', 'post-panic',
                                     'focus-reset', 'gratitude', 'sensory-checkin')),
  responses  jsonb not null
               constraint journal_entries_responses_object
               check (jsonb_typeof(responses) = 'object'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.journal_entries is
  'Editable: has updated_at and an UPDATE policy. Client owns the per-type shape.';

create index journal_entries_user_time_idx
  on public.journal_entries (user_id, created_at desc);

-- Serves the per-type history views and the "3 days in a row" streak.
create index journal_entries_user_type_time_idx
  on public.journal_entries (user_id, entry_type, created_at desc);

create trigger journal_entries_set_updated_at
  before update on public.journal_entries
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- tasks
-- -----------------------------------------------------------------------------
-- A date plus a time, not a timestamptz. The screen is "Today's Tasks" and
-- groups by calendar day; a timestamptz would force a conversion into every
-- query and would silently move a 9am task across the date boundary for a
-- travelling user.
create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,

  title          text not null
                   constraint tasks_title_present check (length(btrim(title)) > 0),
  description    text,

  -- The three values TaskCard.tsx switches on to pick a colour.
  tag            text not null default 'focus'
                   constraint tasks_tag check (tag in ('flow', 'break', 'focus')),

  -- Replaces the display string "9:15 AM - 10:15 AM", which cannot be sorted.
  scheduled_date date not null default current_date,
  start_time     time,
  end_time       time,

  completed      boolean not null default false,
  completed_at   timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint tasks_time_order
    check (end_time is null or start_time is null or end_time > start_time),
  -- completed_at may only be set on a completed task.
  constraint tasks_completed_at_consistent
    check (completed or completed_at is null)
);

comment on table public.tasks is
  'One row per to-do. Replaces the three seeded objects in Tasks.tsx.';

-- Exactly the shape of the page's only query: filter by user and day,
-- order by start time.
create index tasks_user_date_idx
  on public.tasks (user_id, scheduled_date, start_time);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- focus_sessions — Focus timer AND BodyDouble
-- -----------------------------------------------------------------------------
-- One table for both, because Stats needs one. The Statistics page counts
-- Flows / Started / Completed / Minutes / Breaks across all focus work; with
-- two tables every one of those five numbers becomes a UNION. `source` keeps
-- them separable where a screen wants only one.
create table public.focus_sessions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,

  source                text not null
                          constraint focus_sessions_source
                          check (source in ('focus-timer', 'body-double')),
  status                text not null default 'active'
                          constraint focus_sessions_status
                          check (status in ('active', 'completed', 'abandoned')),

  -- what was planned (Focus.tsx: timeBoxDuration / intervalDuration / numberOfFlows)
  planned_block_minutes smallint
                          constraint focus_sessions_planned_block
                          check (planned_block_minutes is null or planned_block_minutes between 1 and 240),
  planned_break_minutes smallint
                          constraint focus_sessions_planned_break
                          check (planned_break_minutes is null or planned_break_minutes between 0 and 60),
  planned_flows         smallint
                          constraint focus_sessions_planned_flows
                          check (planned_flows is null or planned_flows between 1 and 12),

  -- what actually happened — this is everything Stats reads
  flows_completed       smallint not null default 0
                          constraint focus_sessions_flows_done check (flows_completed >= 0),
  breaks_taken          smallint not null default 0
                          constraint focus_sessions_breaks check (breaks_taken >= 0),
  -- Accumulate on pause and on phase change. Do NOT derive from
  -- ended_at - started_at, or paused time counts as focus. Neither timer
  -- tracks this today; it is the one field with no existing state behind it.
  focus_seconds         integer  not null default 0
                          constraint focus_sessions_seconds check (focus_seconds >= 0),

  -- BodyDouble only (SessionState / SessionWrapUp in BodyDouble.tsx)
  intention             text,
  start_type            text
                          constraint focus_sessions_start_type
                          check (start_type in ('task', 'scattered', 'lost')),
  start_mood            text
                          constraint focus_sessions_start_mood
                          check (start_mood in ('calm', 'anxious', 'sleepy', 'fire', 'scattered')),
  end_mood              text
                          constraint focus_sessions_end_mood
                          check (end_mood in ('calm', 'anxious', 'sleepy', 'fire', 'scattered')),
  reflection_did_well   text,
  reflection_to_improve text,

  started_at            timestamptz not null default now(),
  ended_at              timestamptz,

  constraint focus_sessions_span
    check (ended_at is null or ended_at >= started_at),
  -- An active session has not ended; a finished one has.
  constraint focus_sessions_status_span
    check ((status = 'active' and ended_at is null)
           or (status <> 'active' and ended_at is not null))
);

comment on table public.focus_sessions is
  'Focus timer and BodyDouble in one table. Insert on start, update as it runs.';
comment on column public.focus_sessions.focus_seconds is
  'Accumulated focus time excluding pauses. Source for the Stats "Minutes" tile.';

create index focus_sessions_user_time_idx
  on public.focus_sessions (user_id, started_at desc);


-- -----------------------------------------------------------------------------
-- wellness_sessions — breathing, meditation, body scan, walking
-- -----------------------------------------------------------------------------
-- The slugs are the `id` fields already declared in the menu components, so
-- there is no new vocabulary to keep in sync. No `exercises` lookup table: the
-- catalogue (title, copy, icon, breathing pattern) ships in the bundle, and a
-- database copy would be a second source of truth.
create table public.wellness_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,

  category         text not null
                     constraint wellness_sessions_category
                     check (category in ('breathing', 'meditation', 'body-scan', 'walking')),
  exercise_slug    text not null,

  duration_seconds integer  not null default 0
                     constraint wellness_sessions_duration check (duration_seconds >= 0),
  -- The `cycles` counter every breathing page already keeps, and the grounding
  -- loop count in AnchorGrounding.tsx. Null where the exercise has no cycles.
  cycles_completed smallint
                     constraint wellness_sessions_cycles
                     check (cycles_completed is null or cycles_completed >= 0),

  completed        boolean not null default false,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,

  constraint wellness_sessions_span
    check (ended_at is null or ended_at >= started_at),

  -- Pins the slug to its category so a mislabelled row cannot corrupt the
  -- "Most Used Tool" grouping. One ALTER to extend when an exercise is added.
  constraint wellness_sessions_slug_matches_category check (
       (category = 'breathing'
          and exercise_slug in ('steady-square', 'triangle-calm', 'deep-reset',
                                'sleep-switch', 'ride-wave'))
    or (category = 'meditation'  and exercise_slug in ('focus-reset', 'anchor'))
    or (category = 'body-scan'   and exercise_slug = 'body-scan')
    or (category = 'walking'     and exercise_slug in ('breath-sync', 'break-loop'))
  )
);

comment on table public.wellness_sessions is
  'Ten exercises, one table. Source for "Most Used Tool" and "Time Spent This Week".';

create index wellness_sessions_user_time_idx
  on public.wellness_sessions (user_id, started_at desc);

create index wellness_sessions_user_slug_idx
  on public.wellness_sessions (user_id, exercise_slug);


-- -----------------------------------------------------------------------------
-- safe_contacts — the support circle
-- -----------------------------------------------------------------------------
-- Third-party PII: these are other people's phone numbers and emails, held by
-- your user and never consented to by the contact. Of everything in this schema
-- this is the table to exclude from any analytics export.
create table public.safe_contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,

  name       text not null
               constraint safe_contacts_name_present check (length(btrim(name)) > 0),
  -- Free text with the same default the code uses. The seven suggested labels
  -- stay a client-side array so users can keep typing their own.
  label      text not null default 'Support Person',

  phone      text,
  email      text,
  instagram  text,
  note       text,

  -- Lets a user put their panic pal first. No UI reorders yet; retrofitting
  -- ordering later would mean backfilling every row.
  position   smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- handleAddContact() requires only a name, so a contact with no phone, email
  -- or handle can be saved today — and its "Support Message" button then
  -- silently does nothing, because handleSendSupportMessage falls through both
  -- branches. In a crisis feature that is worse than no contact.
  constraint safe_contacts_reachable
    check (phone is not null or email is not null or instagram is not null)
);

comment on table public.safe_contacts is
  'Crisis support circle. Contains third-party PII — treat as the most sensitive table here.';

create index safe_contacts_user_idx
  on public.safe_contacts (user_id, position, created_at);

create trigger safe_contacts_set_updated_at
  before update on public.safe_contacts
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 3. ROW LEVEL SECURITY
-- =============================================================================
-- Four policies per table. Notes on the pattern:
--
--   (select auth.uid())  — the subquery form is evaluated once per statement
--                          instead of once per row. On a journal timeline that
--                          is the difference between a fast and a slow query.
--
--   to authenticated     — without it the policy is also evaluated for the
--                          `anon` role on every request. Nothing in iMA should
--                          be readable while signed out.
--
--   UPDATE needs BOTH using AND with check. With only `using`, a user can
--   update their own row and reassign user_id to someone else in the same
--   statement.
--
--   DELETE policies are present on every table. Their absence in the old
--   project is why "Delete Account" and "Clear Emotional History" could never
--   have worked.

alter table public.profiles             enable row level security;
alter table public.user_settings        enable row level security;
alter table public.onboarding_responses enable row level security;
alter table public.mood_checkins        enable row level security;
alter table public.journal_entries      enable row level security;
alter table public.tasks                enable row level security;
alter table public.focus_sessions       enable row level security;
alter table public.wellness_sessions    enable row level security;
alter table public.safe_contacts        enable row level security;


-- profiles — keyed on id, not user_id
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);


-- user_settings
create policy "user_settings_select_own" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_settings_insert_own" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_settings_update_own" on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_settings_delete_own" on public.user_settings
  for delete to authenticated using ((select auth.uid()) = user_id);


-- onboarding_responses
create policy "onboarding_responses_select_own" on public.onboarding_responses
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "onboarding_responses_insert_own" on public.onboarding_responses
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "onboarding_responses_update_own" on public.onboarding_responses
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "onboarding_responses_delete_own" on public.onboarding_responses
  for delete to authenticated using ((select auth.uid()) = user_id);


-- mood_checkins
create policy "mood_checkins_select_own" on public.mood_checkins
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "mood_checkins_insert_own" on public.mood_checkins
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "mood_checkins_update_own" on public.mood_checkins
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "mood_checkins_delete_own" on public.mood_checkins
  for delete to authenticated using ((select auth.uid()) = user_id);


-- journal_entries — editable, so UPDATE is intentional here
create policy "journal_entries_select_own" on public.journal_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "journal_entries_insert_own" on public.journal_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "journal_entries_update_own" on public.journal_entries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "journal_entries_delete_own" on public.journal_entries
  for delete to authenticated using ((select auth.uid()) = user_id);


-- tasks
create policy "tasks_select_own" on public.tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tasks_update_own" on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete to authenticated using ((select auth.uid()) = user_id);


-- focus_sessions
create policy "focus_sessions_select_own" on public.focus_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "focus_sessions_insert_own" on public.focus_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "focus_sessions_update_own" on public.focus_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "focus_sessions_delete_own" on public.focus_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);


-- wellness_sessions
create policy "wellness_sessions_select_own" on public.wellness_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "wellness_sessions_insert_own" on public.wellness_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "wellness_sessions_update_own" on public.wellness_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "wellness_sessions_delete_own" on public.wellness_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);


-- safe_contacts
create policy "safe_contacts_select_own" on public.safe_contacts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "safe_contacts_insert_own" on public.safe_contacts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "safe_contacts_update_own" on public.safe_contacts
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "safe_contacts_delete_own" on public.safe_contacts
  for delete to authenticated using ((select auth.uid()) = user_id);


-- -----------------------------------------------------------------------------
-- Defence in depth: take the tables away from `anon` entirely.
-- -----------------------------------------------------------------------------
-- RLS already returns zero rows to a signed-out client, but revoking the grant
-- means a future policy mistake still cannot leak anything to `anon`. Nothing
-- in iMA is meant to be readable while signed out.
revoke all on public.profiles             from anon;
revoke all on public.user_settings        from anon;
revoke all on public.onboarding_responses from anon;
revoke all on public.mood_checkins        from anon;
revoke all on public.journal_entries      from anon;
revoke all on public.tasks                from anon;
revoke all on public.focus_sessions       from anon;
revoke all on public.wellness_sessions    from anon;
revoke all on public.safe_contacts        from anon;


-- =============================================================================
-- 4. STORAGE — avatars
-- =============================================================================
-- Private bucket. profiles.avatar_url holds the object path; the client reads
-- the image with createSignedUrl(). Private rather than public because these
-- are faces attached to mental-health accounts — a public bucket URL is
-- readable by anyone who has it, forever.
--
-- Path convention: {user_id}/{filename}. The first folder segment is the owner,
-- which is what the policies below check.
--
-- NOTE for "Delete Account": deleting the auth user cascades all nine tables
-- above, but it does NOT remove the avatar object — storage has no foreign key
-- back to these tables. The deletion Edge Function must call
-- storage.from('avatars').remove([...]) explicitly, or the file is orphaned.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,                                                   -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "avatars_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text);


-- =============================================================================
-- 5. SIGNUP TRIGGER
-- =============================================================================
-- Created last, so the tables and policies it depends on already exist.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
