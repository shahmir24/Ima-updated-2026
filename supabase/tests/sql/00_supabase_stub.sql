-- A minimal stand-in for what a Supabase project provides (roles, auth and
-- storage schemas), so the migrations can be applied to a plain local
-- Postgres for these tests. Never applied to a real Supabase project.
do $r$ begin create role anon nologin; exception when duplicate_object then null; end $r$;
do $r$ begin create role authenticated nologin; exception when duplicate_object then null; end $r$;
do $r$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $r$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
