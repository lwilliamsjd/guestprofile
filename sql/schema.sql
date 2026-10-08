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

-- ---------- update 4: Buyer Profile PDF fields (safe to re-run) ----------
-- profile ID: GRGT-<yy>-<number>, numbered in the order profiles were created
create sequence if not exists applicant_no_seq;
alter table applicants add column if not exists profile_no integer;
do $$
declare r record;
begin
  for r in select id from applicants where profile_no is null order by created_at loop
    update applicants set profile_no = nextval('applicant_no_seq') where id = r.id;
  end loop;
end $$;
alter table applicants alter column profile_no set default nextval('applicant_no_seq');
create unique index if not exists applicants_profile_no_idx on applicants (profile_no);

-- bio
alter table applicants add column if not exists city text;
alter table applicants add column if not exists state text;
-- social rows: [{ "platform": "Instagram", "handle": "@x", "note": "Track days", "followers": 18200 }]
alter table applicants add column if not exists socials jsonb not null default '[]'::jsonb;
alter table applicants add column if not exists clubs text;

-- motorsports
alter table applicants add column if not exists years_on_track numeric;
alter table applicants add column if not exists track_days integer;
alter table applicants add column if not exists race_series jsonb not null default '[]'::jsonb;
alter table applicants add column if not exists driver_style integer;   -- 0 raw numbers ... 100 overall experience
alter table applicants add column if not exists driver_style_note text;

-- car profile
alter table applicants add column if not exists lfa_status text;        -- Owned, Driven, Inquired, None
alter table applicants add column if not exists lfa_note text;
-- history rows: [{ "year": "2008", "model": "Lexus IS F", "held": 6, "note": "" }]
alter table applicants add column if not exists toyota_history jsonb not null default '[]'::jsonb;
alter table applicants add column if not exists past_cars jsonb not null default '[]'::jsonb;

-- buyer profile
-- { "track": 45, "street": 40, "events": 10, "collection": 5 }
alter table applicants add column if not exists usage_split jsonb;
alter table applicants add column if not exists usage_note text;
alter table applicants add column if not exists target_quarter text;    -- e.g. Q2 2027
alter table applicants add column if not exists timing_flex text;
alter table applicants add column if not exists timing_note text;
-- [{ "label": "Carbon ceramic brakes", "priority": true }]
alter table applicants add column if not exists spec_tags jsonb not null default '[]'::jsonb;
-- [{ "model": "Porsche 911 GT3", "status": "Owns", "note": "Keeping" }]
alter table applicants add column if not exists cross_shop jsonb not null default '[]'::jsonb;

-- concierge assessment
alter table applicants add column if not exists concierge_rec text;
alter table applicants add column if not exists assessment text;
alter table applicants add column if not exists strengths text;
alter table applicants add column if not exists concerns text;

-- decision wording now matches the PDF: Approve, Waitlist, Decline
alter table applicants drop constraint if exists applicants_allocation_check;
update applicants set allocation = 'Approve' where allocation = 'Awarded';
update applicants set allocation = 'Decline' where allocation = 'Declined';
alter table applicants add constraint applicants_allocation_check check (allocation in ('Pending','Approve','Waitlist','Decline'));

-- race levels now run None, Autocross / Time Attack, Club Racer, Pro Am, Pro
update applicants set race_level = 'Autocross / Time Attack' where race_level = 'Time Attack / Autocross';
update applicants set race_level = 'Club Racer' where race_level = 'Club Racing';
update applicants set race_level = 'Pro Am' where race_level = 'Pro / Semi Pro';

-- LFA: carry the old Yes toggle over to the new status
update applicants set lfa_status = 'Owned' where lfa_status is null and lfa_owner = true;

-- job title for the "Prepared by" line on the PDF
alter table profiles add column if not exists job_title text;
create or replace function public.set_job_title(new_title text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set job_title = nullif(trim(new_title), '') where id = auth.uid();
$$;

-- PDF redesign: short bio for the At a Glance box, banner phrases, code phrase option
alter table applicants add column if not exists bio_short text;
alter table applicants add column if not exists persona_left text;
alter table applicants add column if not exists persona_center text;
alter table applicants add column if not exists persona_right text;
alter table applicants add column if not exists code_phrase boolean not null default false;
