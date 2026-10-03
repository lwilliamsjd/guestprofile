-- GR GT Applicant Profiles: Supabase schema
-- Paste this whole file into Supabase > SQL Editor and run it once.
-- Safe to re-run.

create extension if not exists pgcrypto;

-- ---------- team logins ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;

drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select using (auth.role() = 'authenticated');

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.set_display_name(new_name text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set full_name = trim(new_name)
  where id = auth.uid() and length(trim(new_name)) > 0;
$$;

-- ---------- applicant profiles ----------
create table if not exists applicants (
  id uuid primary key default gen_random_uuid(),

  -- status / interview meta
  status text not null default 'Draft' check (status in ('Draft','Complete')),
  interview_date date default current_date,
  interviewed_by text,

  -- BIO
  name text not null,
  age_range text,
  preferred_dealer text,
  social_media text,
  tmna_relationship text,
  vip boolean not null default false,

  -- SUMMARY
  summary text,

  -- MOTORSPORTS / EVENTS
  hpde_experience text,
  race_experience text,
  key_events text,
  what_drives_you text,

  -- CAR PROFILE
  -- garage: [{ "vehicle": "2024 GR Supra", "usage": ["Street","Track Only"], "miles": 4000 }]
  garage jsonb not null default '[]'::jsonb,
  lfa_owner boolean not null default false,
  previous_toyota_lexus text,
  recent_flips text,

  -- BUYER PROFILE
  timing text,
  gt_usage jsonb not null default '[]'::jsonb,
  spec_consideration text,
  intended_use text,

  -- bookkeeping
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- added after first release (safe to re-run)
alter table applicants add column if not exists gt_usage jsonb not null default '[]'::jsonb;

create index if not exists applicants_updated_idx on applicants (updated_at desc);
create index if not exists applicants_name_idx on applicants (lower(name));

create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists applicants_touch on applicants;
create trigger applicants_touch before update on applicants
  for each row execute procedure touch_updated_at();

alter table applicants enable row level security;

drop policy if exists "applicants_select" on applicants;
drop policy if exists "applicants_insert" on applicants;
drop policy if exists "applicants_update" on applicants;
drop policy if exists "applicants_delete_admin" on applicants;
create policy "applicants_select" on applicants for select using (auth.role() = 'authenticated');
create policy "applicants_insert" on applicants for insert with check (auth.role() = 'authenticated');
create policy "applicants_update" on applicants for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "applicants_delete_admin" on applicants for delete using (public.is_admin());

-- live updates between teammates
do $$
begin
  alter publication supabase_realtime add table applicants;
exception when duplicate_object then null;
end $$;

-- ---------- update 2: structured fields, decisions, history, backups (safe to re-run) ----------
alter table applicants add column if not exists hpde_level text;
alter table applicants add column if not exists race_level text;
alter table applicants add column if not exists has_flips boolean;
alter table applicants add column if not exists allocation text not null default 'Pending';
do $$ begin
  alter table applicants add constraint applicants_allocation_check check (allocation in ('Pending','Awarded','Waitlist','Declined'));
exception when duplicate_object then null; end $$;

alter table profiles add column if not exists last_export_at timestamptz;
create or replace function public.mark_exported()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_export_at = now() where id = auth.uid();
$$;

create table if not exists applicant_changes (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references applicants(id) on delete cascade,
  changed_by uuid references auth.users(id),
  changed_by_name text,
  changed_at timestamptz not null default now(),
  changes jsonb not null default '[]'::jsonb
);
create index if not exists applicant_changes_idx on applicant_changes (applicant_id, changed_at desc);
alter table applicant_changes enable row level security;
drop policy if exists "changes_select" on applicant_changes;
drop policy if exists "changes_insert" on applicant_changes;
create policy "changes_select" on applicant_changes for select using (auth.role() = 'authenticated');
create policy "changes_insert" on applicant_changes for insert with check (auth.role() = 'authenticated');
-- history is append only: no update or delete policies

-- lets the daily keep-alive ping touch the database without exposing any data
create or replace function public.keepalive()
returns int language sql security definer stable set search_path = public as $$
  select 1;
$$;
grant execute on function public.keepalive() to anon;

-- ---------- update 3: autosave, call notes, follow ups (safe to re-run) ----------
alter table applicants add column if not exists call_notes text;
alter table applicants add column if not exists needs_followup boolean not null default false;
alter table applicants add column if not exists followup_note text;
alter table applicants add column if not exists updated_by uuid references auth.users(id);

-- autosave keeps one history entry per editing session up to date,
-- so people may update their own entries for a few hours (never anyone else's)
drop policy if exists "changes_update_own_recent" on applicant_changes;
create policy "changes_update_own_recent" on applicant_changes for update
  using (changed_by = auth.uid() and changed_at > now() - interval '3 hours')
  with check (changed_by = auth.uid());
