-- GR GT Concierge CRM tables, added to the SAME Supabase project as Applicant Profiles.
-- Paste this whole file into Supabase > SQL Editor and run it once. Safe to re-run.
-- The profiles table already exists (from schema.sql), so the CRM's extra
-- profile columns are added here first.

alter table public.profiles add column if not exists concierge text;
alter table public.profiles add column if not exists notify_comments boolean not null default true;
alter table public.profiles add column if not exists notify_activity boolean not null default true;
alter table public.profiles add column if not exists last_export_at timestamptz;
do $$ begin
  alter table public.profiles add constraint profiles_concierge_check check (concierge is null or concierge in ('Freddie','Logan'));
exception when duplicate_object then null; end $$;


create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES  (one row per team member, mirrors auth.users)
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  is_admin boolean not null default false,
  concierge text check (concierge is null or concierge in ('Freddie','Logan')), -- which Concierge this login represents
  notify_comments boolean not null default true,
  notify_activity boolean not null default true,
  last_export_at timestamptz, -- when this person last ran Export to Excel
  created_at timestamptz not null default now()
);

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

-- Is the current user an admin? (security definer so it can read profiles
-- without tripping over profiles' own RLS)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Lets a signed-in user rename themselves (and only themselves) without
-- being able to touch is_admin.
create or replace function public.set_display_name(new_name text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set full_name = trim(new_name)
  where id = auth.uid() and length(trim(new_name)) > 0;
$$;

-- Lets a signed-in user change their own notification preferences.
create or replace function public.set_notification_prefs(p_comments boolean, p_activity boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set notify_comments = coalesce(p_comments, notify_comments),
      notify_activity = coalesce(p_activity, notify_activity)
  where id = auth.uid();
$$;

-- Records that the signed-in user just ran an export (backup nudge on Account page).
create or replace function public.mark_exported()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_export_at = now() where id = auth.uid();
$$;

-- ============================================================
-- MEISTERS
-- ============================================================
create table if not exists meisters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  dealership text,
  dealership_website text,
  city text,
  state text,
  zip text,
  status text not null default 'New' check (status in ('New','Contacted','Engaged','Sold','Not Interested')),
  concierge text check (concierge is null or concierge in ('Freddie','Logan')),
  job_title text,
  profile_summary text,
  -- Key facts (structured program details, shown on the profile sidebar)
  allocation_count int,
  pma text,
  delivery_eta date,
  -- Soft delete: admins "delete" by setting deleted_at; Trash on the Account page restores.
  deleted_at timestamptz,
  deleted_by_name text,
  created_by uuid references auth.users(id),
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meisters_name_idx on meisters (name);
create index if not exists meisters_dealership_idx on meisters (dealership);
create index if not exists meisters_status_idx on meisters (status);
create index if not exists meisters_deleted_idx on meisters (deleted_at);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists meisters_set_updated_at on meisters;
create trigger meisters_set_updated_at
  before update on meisters
  for each row execute procedure set_updated_at();

-- Only admins may move a Meister to/from the Trash (deleted_at).
create or replace function public.guard_meister_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is distinct from old.deleted_at and not public.is_admin() then
    raise exception 'Only an admin can delete or restore a Meister';
  end if;
  return new;
end;
$$;

drop trigger if exists meisters_guard_delete on meisters;
create trigger meisters_guard_delete
  before update on meisters
  for each row execute procedure public.guard_meister_delete();

-- ============================================================
-- STATUS HISTORY  (every status change, written by the database)
-- Powers pipeline movement, time in stage, and sales per month.
-- ============================================================
create table if not exists status_history (
  id uuid primary key default gen_random_uuid(),
  meister_id uuid not null references meisters(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz not null default now()
);

create index if not exists status_history_meister_idx on status_history (meister_id, changed_at desc);
create index if not exists status_history_changed_idx on status_history (changed_at desc);
create index if not exists status_history_to_idx on status_history (to_status, changed_at desc);

create or replace function public.record_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into status_history (meister_id, from_status, to_status, changed_by, changed_by_name)
    values (new.id, null, new.status, auth.uid(), new.created_by_name);
  elsif new.status is distinct from old.status then
    insert into status_history (meister_id, from_status, to_status, changed_by, changed_by_name)
    values (new.id, old.status, new.status, auth.uid(), new.updated_by_name);
  end if;
  return new;
end;
$$;

drop trigger if exists meisters_status_history on meisters;
create trigger meisters_status_history
  after insert or update on meisters
  for each row execute procedure public.record_status_change();

-- ============================================================
-- QUESTION CATEGORIES  (inbound question types, for client reporting)
-- ============================================================
create table if not exists question_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into question_categories (name, sort_order) values
  ('Allocation', 10), ('PMA', 20), ('Delivery', 30), ('Build Options', 40), ('Guest Engagement', 50), ('Events', 60)
on conflict (name) do nothing;

-- ============================================================
-- INTERACTIONS  (conversation log per Meister)
-- occurred_at = when the conversation happened (editable, can be backdated)
-- created_at  = when it was logged (fixed)
-- ============================================================
create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  meister_id uuid not null references meisters(id) on delete cascade,
  method text not null check (method in ('Phone','Text','Email','In Person','Other')),
  note text not null,
  direction text check (direction is null or direction in ('Inbound','Outbound')), -- who reached out
  category_id uuid references question_categories(id) on delete set null, -- optional question type
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_by_name text,
  edited_at timestamptz,
  edited_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists interactions_meister_idx on interactions (meister_id);
create index if not exists interactions_occurred_idx on interactions (occurred_at desc);
create index if not exists interactions_category_idx on interactions (category_id);
create index if not exists interactions_note_search_idx on interactions using gin (to_tsvector('english', note));

-- Logged entries are locked, but the question type is reporting metadata:
-- this lets any signed-in user fix ONLY that field.
create or replace function public.set_interaction_category(p_id uuid, p_category_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.interactions set category_id = p_category_id
  where id = p_id and auth.role() = 'authenticated';
$$;

-- Fix a logged entry's method, direction or date (the note text stays locked).
create or replace function public.set_interaction_details(p_id uuid, p_method text, p_direction text, p_occurred_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then raise exception 'Not signed in'; end if;
  if p_method not in ('Phone','Text','Email','In Person','Other') then raise exception 'Unknown method'; end if;
  if p_direction is not null and p_direction not in ('Inbound','Outbound') then raise exception 'Unknown direction'; end if;
  if p_occurred_at is null or p_occurred_at > now() + interval '1 day' then raise exception 'Date cannot be in the future'; end if;
  update public.interactions
     set method = p_method, direction = p_direction, occurred_at = p_occurred_at,
         edited_at = now(), edited_by_name = (select full_name from public.profiles where id = auth.uid())
   where id = p_id;
end;
$$;
revoke all on function public.set_interaction_details(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.set_interaction_details(uuid, text, text, timestamptz) to authenticated;

-- ============================================================
-- GUESTS  (people this Meister has referred/sold a vehicle to)
-- ============================================================
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  meister_id uuid not null references meisters(id) on delete cascade,
  guest_name text not null,
  vehicle_purchased text,
  guest_status text not null default 'Allocated' check (guest_status in ('Allocated','Ordered','Delivered')),
  purchase_date date,
  delivery_date date,
  notes text,
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists guests_meister_idx on guests (meister_id);

-- ============================================================
-- FOLLOW-UPS  (personal reminders, optionally tied to an activity)
-- ============================================================
create table if not exists follow_ups (
  id uuid primary key default gen_random_uuid(),
  meister_id uuid not null references meisters(id) on delete cascade,
  interaction_id uuid references interactions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,
  title text not null,
  due_at timestamptz not null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists follow_ups_user_due_idx on follow_ups (user_id, due_at);
create index if not exists follow_ups_meister_idx on follow_ups (meister_id);
create index if not exists follow_ups_interaction_idx on follow_ups (interaction_id);

-- ============================================================
-- COMMENTS  (replies on a logged activity)
-- ============================================================
create table if not exists interaction_comments (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references interactions(id) on delete cascade,
  body text not null,
  created_by uuid references auth.users(id),
  created_by_name text,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists interaction_comments_interaction_idx on interaction_comments (interaction_id);

-- ============================================================
-- NOTIFICATIONS  (created by the database when someone else acts on a
-- Meister assigned to you; see notify_concierge() below)
-- ============================================================
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid,
  actor_name text,
  kind text not null,
  meister_id uuid references meisters(id) on delete cascade,
  interaction_id uuid references interactions(id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications (user_id, read_at, created_at desc);

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in ('comment','activity','mention','assigned'));

create or replace function public.notify_concierge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meister_id uuid;
  v_kind text;
  v_interaction_id uuid;
  v_actor_id uuid;
  v_actor_name text;
  v_snippet text;
  v_method text;
  m record;
  target record;
  p record;
  msg text;
  notified uuid[] := '{}';
begin
  -- Housekeeping: read notifications older than 90 days are dropped so the table stays small.
  delete from notifications where read_at is not null and read_at < now() - interval '90 days';

  if tg_table_name = 'interaction_comments' then
    v_kind := 'comment';
    v_interaction_id := new.interaction_id;
    v_actor_id := new.created_by;
    v_actor_name := new.created_by_name;
    v_snippet := new.body;
    select i.meister_id, i.method into v_meister_id, v_method from interactions i where i.id = new.interaction_id;
  else
    v_kind := 'activity';
    v_interaction_id := new.id;
    v_actor_id := new.created_by;
    v_actor_name := new.created_by_name;
    v_snippet := new.note;
    v_meister_id := new.meister_id;
    v_method := new.method;
  end if;

  if v_meister_id is null then return new; end if;
  select id, name, concierge into m from meisters where id = v_meister_id;
  v_snippet := left(regexp_replace(coalesce(v_snippet, ''), '\s+', ' ', 'g'), 120);

  -- @mentions in comments: "@Full Name" anywhere in the body notifies that teammate.
  if v_kind = 'comment' then
    for p in select id, full_name, notify_comments from profiles where id <> coalesce(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid) loop
      if position(lower('@' || p.full_name) in lower(new.body)) > 0 and p.notify_comments then
        insert into notifications (user_id, actor_id, actor_name, kind, meister_id, interaction_id, message)
        values (p.id, v_actor_id, v_actor_name, 'mention', v_meister_id, v_interaction_id,
                coalesce(v_actor_name, 'Someone') || ' mentioned you on ' || m.name || ': ' || v_snippet);
        notified := notified || p.id;
      end if;
    end loop;
  end if;

  if m.concierge is null then return new; end if;
  select id, notify_comments, notify_activity into target from profiles where concierge = m.concierge limit 1;
  if target.id is null or target.id = v_actor_id or target.id = any(notified) then return new; end if;
  if v_kind = 'comment' and not target.notify_comments then return new; end if;
  if v_kind = 'activity' and not target.notify_activity then return new; end if;

  if v_kind = 'comment' then
    msg := coalesce(v_actor_name, 'Someone') || ' commented on ' || m.name || ': ' || v_snippet;
  else
    msg := coalesce(v_actor_name, 'Someone') || ' logged ' ||
           case v_method when 'Other' then 'a note' when 'In Person' then 'an in-person visit' when 'Email' then 'an email' else 'a ' || lower(v_method) end ||
           ' with ' || m.name || ': ' || v_snippet;
  end if;

  insert into notifications (user_id, actor_id, actor_name, kind, meister_id, interaction_id, message)
  values (target.id, v_actor_id, v_actor_name, v_kind, v_meister_id, v_interaction_id, msg);
  return new;
end;
$$;

drop trigger if exists notify_on_comment on interaction_comments;
create trigger notify_on_comment after insert on interaction_comments
  for each row execute procedure public.notify_concierge();

drop trigger if exists notify_on_activity on interactions;
create trigger notify_on_activity after insert on interactions
  for each row execute procedure public.notify_concierge();

-- ============================================================
-- ROW LEVEL SECURITY
-- Any signed-in team member can read, add, and edit everything.
-- Only admins (profiles.is_admin = true) can DELETE.
-- ============================================================
alter table profiles enable row level security;
alter table meisters enable row level security;
alter table interactions enable row level security;
alter table guests enable row level security;
alter table follow_ups enable row level security;
alter table interaction_comments enable row level security;
alter table notifications enable row level security;
alter table question_categories enable row level security;
alter table status_history enable row level security;

-- status history: read-only for the team; only the database writes it
drop policy if exists "status_history_select" on status_history;
create policy "status_history_select" on status_history for select using (auth.role() = 'authenticated');

-- question categories: everyone reads; only admins manage
drop policy if exists "categories_select" on question_categories;
drop policy if exists "categories_admin_insert" on question_categories;
drop policy if exists "categories_admin_update" on question_categories;
drop policy if exists "categories_admin_delete" on question_categories;
create policy "categories_select" on question_categories for select using (auth.role() = 'authenticated');
create policy "categories_admin_insert" on question_categories for insert with check (public.is_admin());
create policy "categories_admin_update" on question_categories for update using (public.is_admin()) with check (public.is_admin());
create policy "categories_admin_delete" on question_categories for delete using (public.is_admin());

-- profiles: everyone signed in can read the team list; edits go through set_display_name()
drop policy if exists "profiles_read_all" on profiles;
create policy "profiles_read_all" on profiles for select using (auth.role() = 'authenticated');

-- meisters
drop policy if exists "meisters_all_authenticated" on meisters;
drop policy if exists "meisters_select" on meisters;
drop policy if exists "meisters_insert" on meisters;
drop policy if exists "meisters_update" on meisters;
drop policy if exists "meisters_delete_admin" on meisters;
create policy "meisters_select" on meisters for select using (auth.role() = 'authenticated');
create policy "meisters_insert" on meisters for insert with check (auth.role() = 'authenticated');
create policy "meisters_update" on meisters for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "meisters_delete_admin" on meisters for delete using (public.is_admin());

-- interactions: logged entries are a record — they can be read, added, and
-- (by admins) deleted, but never edited. Add context as a comment instead.
drop policy if exists "interactions_all_authenticated" on interactions;
drop policy if exists "interactions_select" on interactions;
drop policy if exists "interactions_insert" on interactions;
drop policy if exists "interactions_update" on interactions;
drop policy if exists "interactions_delete_admin" on interactions;
create policy "interactions_select" on interactions for select using (auth.role() = 'authenticated');
create policy "interactions_insert" on interactions for insert with check (auth.role() = 'authenticated');
create policy "interactions_delete_admin" on interactions for delete using (public.is_admin());

-- guests
drop policy if exists "guests_all_authenticated" on guests;
drop policy if exists "guests_select" on guests;
drop policy if exists "guests_insert" on guests;
drop policy if exists "guests_update" on guests;
drop policy if exists "guests_delete_admin" on guests;
create policy "guests_select" on guests for select using (auth.role() = 'authenticated');
create policy "guests_insert" on guests for insert with check (auth.role() = 'authenticated');
create policy "guests_update" on guests for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "guests_delete_admin" on guests for delete using (public.is_admin());

-- follow-ups: everyone can see them; only the owner (or an admin) can change or remove theirs
drop policy if exists "follow_ups_select" on follow_ups;
drop policy if exists "follow_ups_insert" on follow_ups;
drop policy if exists "follow_ups_update" on follow_ups;
drop policy if exists "follow_ups_delete" on follow_ups;
create policy "follow_ups_select" on follow_ups for select using (auth.role() = 'authenticated');
create policy "follow_ups_insert" on follow_ups for insert with check (auth.role() = 'authenticated' and user_id = auth.uid());
create policy "follow_ups_update" on follow_ups for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "follow_ups_delete" on follow_ups for delete using (user_id = auth.uid() or public.is_admin());

-- comments: everyone can read/add; only the author (or admin) edits; only admins delete
drop policy if exists "comments_select" on interaction_comments;
drop policy if exists "comments_insert" on interaction_comments;
drop policy if exists "comments_update" on interaction_comments;
drop policy if exists "comments_delete_admin" on interaction_comments;
create policy "comments_select" on interaction_comments for select using (auth.role() = 'authenticated');
create policy "comments_insert" on interaction_comments for insert with check (auth.role() = 'authenticated' and created_by = auth.uid());
create policy "comments_update" on interaction_comments for update using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
create policy "comments_delete_admin" on interaction_comments for delete using (public.is_admin());

-- notifications: private to the person they're for. Only the database creates them.
drop policy if exists "notifications_select_own" on notifications;
drop policy if exists "notifications_update_own" on notifications;
drop policy if exists "notifications_delete_own" on notifications;
create policy "notifications_select_own" on notifications for select using (user_id = auth.uid());
create policy "notifications_update_own" on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_delete_own" on notifications for delete using (user_id = auth.uid());

-- ============================================================
-- REALTIME  (wrapped so re-running never errors with "already member")
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table question_categories;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table follow_ups;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table interaction_comments;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table meisters;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table interactions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table guests;
exception when duplicate_object then null; end $$;

-- ============================================================
-- MAKE YOURSELF ADMIN + LINK LOGINS TO CONCIERGE NAMES  (run once)
-- The concierge link is what routes notifications: when someone acts on a
-- Meister assigned to "Logan", the profile with concierge = 'Logan' is notified.
-- ============================================================
-- update profiles set is_admin = true where email = 'lwilliams@jacksondawson.com';
-- update profiles set concierge = 'Logan'   where email = 'lwilliams@jacksondawson.com';
-- update profiles set concierge = 'Freddie' where email = 'ftinkler@jacksondawson.com';

-- How many potential buyers (guests) each Meister has for the GR GT. A number only, no names.
alter table meisters add column if not exists guest_estimate int check (guest_estimate is null or guest_estimate >= 0);

-- ============================================================
-- FOLLOW-UP ASSIGNMENT (Oct 2026)
-- A follow-up can be assigned to Logan, Freddie or Rob. Left blank in the
-- form, it goes to the Meister's concierge. The assignee can complete,
-- snooze, edit and delete it, and gets a bell notification when someone
-- else assigns it to them. Safe to run more than once.
-- ============================================================
alter table follow_ups add column if not exists assigned_to text;
alter table follow_ups drop constraint if exists follow_ups_assigned_to_check;
alter table follow_ups add constraint follow_ups_assigned_to_check check (assigned_to is null or assigned_to in ('Logan','Freddie','Rob'));
create index if not exists follow_ups_assigned_idx on follow_ups (assigned_to, due_at);

-- Rob can be linked to a login the same way as Logan and Freddie.
alter table profiles drop constraint if exists profiles_concierge_check;
alter table profiles add constraint profiles_concierge_check check (concierge is null or concierge in ('Freddie','Logan','Rob'));

-- Existing follow-ups stay with whoever created them.
update follow_ups f set assigned_to = p.concierge
  from profiles p where p.id = f.user_id and f.assigned_to is null and p.concierge is not null;

create or replace function public.my_concierge()
returns text language sql stable security definer set search_path = public
as $$ select concierge from profiles where id = auth.uid() $$;

drop policy if exists "follow_ups_update" on follow_ups;
drop policy if exists "follow_ups_delete" on follow_ups;
create policy "follow_ups_update" on follow_ups for update
  using (user_id = auth.uid() or public.is_admin() or (assigned_to is not null and assigned_to = public.my_concierge()))
  with check (auth.role() = 'authenticated'); -- whoever can edit it can also hand it to someone else
create policy "follow_ups_delete" on follow_ups for delete
  using (user_id = auth.uid() or public.is_admin() or (assigned_to is not null and assigned_to = public.my_concierge()));

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in ('comment','activity','mention','assigned'));

create or replace function public.notify_follow_up_assignee()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  target uuid;
  actor uuid := auth.uid();
  actor_name text;
  m_name text;
begin
  if new.assigned_to is null or new.done_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.assigned_to is not distinct from new.assigned_to then return new; end if;
  select id into target from profiles where concierge = new.assigned_to limit 1;
  if target is null or target = coalesce(actor, new.user_id) then return new; end if;
  select full_name into actor_name from profiles where id = coalesce(actor, new.user_id);
  select name into m_name from meisters where id = new.meister_id;
  insert into notifications (user_id, actor_id, actor_name, kind, meister_id, message)
  values (target, coalesce(actor, new.user_id), actor_name, 'assigned', new.meister_id,
          coalesce(actor_name, 'Someone') || ' assigned you a follow-up for ' || coalesce(m_name, 'a Meister') || ': ' || left(new.title, 120));
  return new;
end;
$$;

drop trigger if exists notify_on_follow_up_assign on follow_ups;
create trigger notify_on_follow_up_assign after insert or update of assigned_to on follow_ups
  for each row execute procedure public.notify_follow_up_assignee();

-- ============================================================
-- DEALER CODE (Oct 2026): replaces PMA on the Meister profile.
-- The old pma column is kept (hidden) so nothing already entered is lost.
-- ============================================================
alter table meisters add column if not exists dealer_code text;

-- ============================================================
-- DEPARTED MEISTERS (Nov 2026)
-- A Meister who leaves the store is marked Departed instead of deleted:
-- every conversation, follow-up and guest stays on their record, the
-- dealership data stays, and they drop out of Going Quiet, follow-up
-- counts and analytics. "Add new Meister for this dealership" creates the
-- replacement with the store data copied over and links the two records.
-- Safe to run more than once.
-- ============================================================
alter table meisters add column if not exists departed_at timestamptz;
alter table meisters add column if not exists departed_note text;
alter table meisters add column if not exists departed_by_name text;
alter table meisters add column if not exists previous_meister_id uuid references meisters(id) on delete set null;
alter table meisters add column if not exists replaced_by_id uuid references meisters(id) on delete set null;
create index if not exists meisters_departed_idx on meisters (departed_at);

-- Mark departed (or bring back). Records the change on the timeline and
-- optionally closes that Meister's open follow-ups (anyone's).
create or replace function public.set_meister_departed(p_id uuid, p_departed boolean, p_note text default null, p_when timestamptz default null, p_close_follow_ups boolean default true)
returns void language plpgsql security definer set search_path = public
as $$
declare
  who text;
  cur_status text;
  was timestamptz;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select coalesce(full_name, 'someone') into who from profiles where id = auth.uid();
  select status, departed_at into cur_status, was from meisters where id = p_id and deleted_at is null;
  if not found then raise exception 'Meister not found'; end if;
  if p_when is not null and p_when > now() + interval '1 day' then raise exception 'Departure date cannot be in the future'; end if;

  if p_departed then
    update meisters set departed_at = coalesce(p_when, departed_at, now()), departed_note = nullif(trim(coalesce(p_note, '')), ''),
      departed_by_name = who, updated_by_name = who where id = p_id;
    if was is null then
      insert into status_history (meister_id, from_status, to_status, changed_by, changed_by_name) values (p_id, cur_status, 'Departed', auth.uid(), who);
    end if;
    if p_close_follow_ups then
      update follow_ups set done_at = now() where meister_id = p_id and done_at is null;
    end if;
  else
    update meisters set departed_at = null, departed_note = null, departed_by_name = null, updated_by_name = who where id = p_id;
    if was is not null then
      insert into status_history (meister_id, from_status, to_status, changed_by, changed_by_name) values (p_id, 'Departed', cur_status, auth.uid(), who);
    end if;
  end if;
end;
$$;

-- When a replacement is created from a departed Meister, link the old record to it.
create or replace function public.link_replacement_meister()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.previous_meister_id is not null then
    update meisters set replaced_by_id = new.id where id = new.previous_meister_id and id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists meisters_link_replacement on meisters;
create trigger meisters_link_replacement after insert on meisters
  for each row execute procedure public.link_replacement_meister();

-- ============================================================
-- CRM ACCESS
-- Some logins (e.g. our client at Toyota) use Applicant Profiles only.
-- profiles.crm_access = false blocks every CRM table for that login,
-- not just the CRM pages. Everyone who exists when this runs keeps
-- access; accounts created afterwards start without it until an admin
-- turns it on (Applicant Profiles → Account → Team access).
-- Safe to run more than once.
-- ============================================================
alter table profiles add column if not exists crm_access boolean;
update profiles set crm_access = true where crm_access is null;
alter table profiles alter column crm_access set default false;
alter table profiles alter column crm_access set not null;

create or replace function public.has_crm_access()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select crm_access from public.profiles where id = auth.uid()), false);
$$;

-- A restrictive policy is ANDed with the existing ones, so CRM users keep
-- exactly the rights they have today and everyone else gets nothing.
do $$
declare t text;
begin
  foreach t in array array['meisters','status_history','question_categories','interactions','guests','follow_ups','interaction_comments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists crm_access_only on public.%I', t);
      execute format('create policy crm_access_only on public.%I as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access())', t);
    end if;
  end loop;
end $$;

-- Applicant Profiles still needs dealer names and ZIPs for "closest dealer".
-- This hands out just those columns, to any signed in user.
create or replace function public.dealer_locations()
returns table (dealership text, city text, state text, zip text)
language sql security definer stable set search_path = public as $$
  select distinct on (lower(trim(m.dealership))) trim(m.dealership), coalesce(m.city, ''), coalesce(m.state, ''), m.zip::text
  from public.meisters m
  where auth.uid() is not null and m.deleted_at is null and m.departed_at is null
    and coalesce(trim(m.dealership), '') <> '' and coalesce(trim(m.zip::text), '') <> ''
  order by lower(trim(m.dealership)), m.created_at;
$$;

create or replace function public.set_crm_access(p_user uuid, p_access boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change CRM access'; end if;
  if p_user = auth.uid() and not p_access then raise exception 'You can''t remove your own CRM access'; end if;
  update public.profiles set crm_access = p_access where id = p_user;
end $$;

revoke execute on function public.dealer_locations() from anon;
revoke execute on function public.set_crm_access(uuid, boolean) from anon;

-- ============================================================
-- USER ACCESS LEVELS (run after CRM ACCESS; safe to run more than once)
-- 'admin'    = CRM + Profiles, can delete records and manage users
-- 'full'     = CRM + Profiles
-- 'profiles' = Applicant Profiles only (clients)
-- ============================================================
create or replace function public.set_user_access(p_user uuid, p_level text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change access'; end if;
  if p_level not in ('admin', 'full', 'profiles') then raise exception 'Unknown access level'; end if;
  if p_user = auth.uid() then raise exception 'You can''t change your own access'; end if;
  update public.profiles
     set is_admin = (p_level = 'admin'),
         crm_access = (p_level <> 'profiles')
   where id = p_user;
end $$;
revoke execute on function public.set_user_access(uuid, text) from anon;

-- ============================================================
-- NOMINATED GUESTS
-- The Guests tab on a Meister tracks every guest the Meister nominates,
-- from Submitted through Delivered (most won't be allocated).
-- purchase_date is shown as "Order Date". vehicle_purchased is no longer used.
-- Safe to run more than once.
-- ============================================================
alter table guests drop constraint if exists guests_guest_status_check;
update guests set guest_status = 'Allocated' where guest_status = 'Ordered';
alter table guests add constraint guests_guest_status_check
  check (guest_status in ('Submitted','Nominated','Waitlist','Denied','Allocated','Delivered'));
alter table guests alter column guest_status set default 'Submitted';

alter table guests add column if not exists vip boolean not null default false;
alter table guests add column if not exists variant text;
alter table guests add column if not exists launch_edition boolean not null default false;
alter table guests add column if not exists spec_tags jsonb not null default '[]'::jsonb;
alter table guests add column if not exists applicant_id uuid references applicants(id) on delete set null;
alter table guests add column if not exists pdf_path text;
alter table guests add column if not exists pdf_name text;
alter table guests add column if not exists updated_at timestamptz;

-- every status change, so each guest's journey can be shown with dates
create table if not exists guest_status_history (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  status text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id),
  changed_by_name text
);
create index if not exists guest_status_history_guest_idx on guest_status_history (guest_id, changed_at);
alter table guest_status_history enable row level security;
drop policy if exists gsh_select on guest_status_history;
create policy gsh_select on guest_status_history for select to authenticated using (public.has_crm_access());
drop policy if exists gsh_delete on guest_status_history;
create policy gsh_delete on guest_status_history for delete to authenticated using (public.is_admin());

create or replace function public.log_guest_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.guest_status is distinct from old.guest_status then
    insert into guest_status_history (guest_id, status, changed_by, changed_by_name)
    values (new.id, new.guest_status, auth.uid(), (select full_name from profiles where id = auth.uid()));
  end if;
  return null;
end $$;
drop trigger if exists guests_status_log on guests;
create trigger guests_status_log after insert or update of guest_status on guests
  for each row execute function public.log_guest_status();

create or replace function public.touch_guest()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists guests_touch on guests;
create trigger guests_touch before update on guests for each row execute function public.touch_guest();

-- starting history for guests that existed before this ran
insert into guest_status_history (guest_id, status, changed_at, changed_by, changed_by_name)
select g.id, g.guest_status, g.created_at, g.created_by, g.created_by_name
from guests g where not exists (select 1 from guest_status_history h where h.guest_id = g.id);

-- linked Applicant Profiles: CRM users look them up by name to link a guest
-- (applicants are already readable by signed in users; nothing new needed)

-- uploaded profile PDFs (or anything else) for a guest
insert into storage.buckets (id, name, public, file_size_limit)
values ('guest-files', 'guest-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;
drop policy if exists guest_files_read on storage.objects;
create policy guest_files_read on storage.objects for select to authenticated
  using (bucket_id = 'guest-files' and public.has_crm_access());
drop policy if exists guest_files_upload on storage.objects;
create policy guest_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'guest-files' and public.has_crm_access());
drop policy if exists guest_files_remove on storage.objects;
create policy guest_files_remove on storage.objects for delete to authenticated
  using (bucket_id = 'guest-files' and public.has_crm_access());

-- ============================================================
-- INQUIRY ↔ MEISTER GUEST MATCH
-- Inquiries flags a guest whose name matches someone on a Meister's Guests tab.
-- Anyone signed in can ask about the names they already have; only CRM users
-- get the Meister, dealership and status back (clients just see "a match").
-- Safe to run more than once.
-- ============================================================
create or replace function public.norm_person_name(s text)
returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(lower(coalesce(s, '')), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

create or replace function public.meister_guest_matches(p_names text[])
returns table (name_key text, guest_name text, guest_status text, meister_id uuid, meister_name text, dealership text)
language sql security definer stable set search_path = public as $$
  with keys as (
    select distinct public.norm_person_name(n) as k from unnest(p_names) n
    where length(public.norm_person_name(n)) > 2
  )
  select public.norm_person_name(g.guest_name),
         g.guest_name,
         case when public.has_crm_access() then g.guest_status end,
         case when public.has_crm_access() then m.id end,
         case when public.has_crm_access() then m.name end,
         case when public.has_crm_access() then m.dealership end
  from public.guests g
  join public.meisters m on m.id = g.meister_id
  join keys on keys.k = public.norm_person_name(g.guest_name)
  where auth.uid() is not null and m.deleted_at is null;
$$;
revoke execute on function public.meister_guest_matches(text[]) from anon;

-- ============================================================
-- SHARED NOTIFICATIONS (one bell for both tools)
-- Notifications belong to the person, not the CRM: everyone signed in sees their own,
-- in either tool. A new inquiry saved with "Notify the team" notifies every other user.
-- Safe to run more than once.
-- ============================================================
drop policy if exists crm_access_only on notifications;

alter table notifications add column if not exists inquiry_id uuid references inquiries(id) on delete cascade;
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('comment','activity','mention','assigned','inquiry'));

create or replace function public.notify_new_inquiry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.notify_team then
    insert into notifications (user_id, actor_id, actor_name, kind, inquiry_id, message)
    select p.id, new.created_by, new.created_by_name, 'inquiry', new.id,
           coalesce(nullif(trim(new.created_by_name), ''), 'Someone') || ' added a new inquiry: ' || new.name
             || case when new.vip then ' (VIP)' else '' end
    from profiles p
    where p.id is distinct from new.created_by;
  end if;
  return null;
end $$;
drop trigger if exists inquiries_notify_team on inquiries;
create trigger inquiries_notify_team after insert on inquiries
  for each row execute function public.notify_new_inquiry();

-- ============================================================
-- LEVEL 3 MATCHING (run after level-3-data.sql and level-3-undo.sql)
-- * Meister guests get an email, a ZIP and a GIH Level 3 flag.
-- * Each Level 3 import is logged; GIH 3 marks it puts on existing Inquiries or
--   Meister guests are tagged with the import, so undo can take them back off.
-- * Matching runs in the database so it stays fast with tens of thousands of rows.
-- Safe to run more than once.
-- ============================================================
alter table guests add column if not exists email text;
alter table guests add column if not exists zip text;
alter table guests add column if not exists gih_level3 boolean not null default false;
alter table guests add column if not exists gih3_added_at timestamptz;
alter table guests add column if not exists gih3_batch uuid;
create index if not exists guests_email_idx on guests (lower(email));

alter table inquiries add column if not exists gih3_added_at timestamptz;
alter table inquiries add column if not exists gih3_batch uuid;
create index if not exists inquiries_name_key_idx on inquiries (public.norm_person_name(name));
create index if not exists guests_name_key_idx on guests (public.norm_person_name(guest_name));
create index if not exists inquiries_source_idx on inquiries (source, received_on desc);

create table if not exists inquiry_imports (
  id uuid primary key,
  file_name text,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id) default auth.uid(),
  imported_by_name text,
  added int not null default 0,
  marked int not null default 0,
  skipped int not null default 0,
  undone_at timestamptz
);
alter table inquiry_imports enable row level security;
drop policy if exists inquiry_imports_select on inquiry_imports;
create policy inquiry_imports_select on inquiry_imports for select to authenticated using (true);
drop policy if exists inquiry_imports_insert on inquiry_imports;
create policy inquiry_imports_insert on inquiry_imports for insert to authenticated with check (imported_by = auth.uid());

-- Everything on file that could be the same person as rows in an import file.
-- Guests: CRM users see the Meister and status; others get just enough to match.
create or replace function public.level3_candidates(p_emails text[], p_names text[], p_phones text[])
returns jsonb language sql security definer stable set search_path = public as $$
  with e as (select distinct lower(trim(x)) v from unnest(p_emails) x where coalesce(trim(x), '') <> ''),
       n as (select distinct public.norm_person_name(x) v from unnest(p_names) x where length(public.norm_person_name(x)) > 2),
       p as (select distinct right(regexp_replace(x, '\D', '', 'g'), 10) v from unnest(p_phones) x where length(regexp_replace(x, '\D', '', 'g')) >= 10)
  select jsonb_build_object(
    'inquiries', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'source', i.source, 'name', i.name, 'email', i.email, 'phone', i.phone, 'zip', i.zip,
        'received_on', i.received_on, 'gih_levels', i.gih_levels, 'status', i.status))
      from inquiries i
      where lower(i.email) in (select v from e) or public.norm_person_name(i.name) in (select v from n)
         or right(regexp_replace(coalesce(i.phone, ''), '\D', '', 'g'), 10) in (select v from p)), '[]'::jsonb),
    'guests', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.guest_name, 'email', g.email, 'zip', g.zip, 'gih_level3', g.gih_level3,
        'status', case when public.has_crm_access() then g.guest_status end,
        'meister_id', case when public.has_crm_access() then m.id end,
        'meister_name', case when public.has_crm_access() then m.name end))
      from guests g join meisters m on m.id = g.meister_id
      where m.deleted_at is null
        and (lower(g.email) in (select v from e) or public.norm_person_name(g.guest_name) in (select v from n))), '[]'::jsonb),
    'applicants', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'city', a.city, 'state', a.state))
      from applicants a where a.deleted_at is null and public.norm_person_name(a.name) in (select v from n)), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

-- Put GIH Level 3 on existing Inquiries and Meister guests, tagged with the import.
create or replace function public.level3_mark(p_batch uuid, p_inquiry_ids uuid[], p_guest_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_i int; v_g int;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  update inquiries set gih_levels = (select array_agg(distinct x order by x) from unnest(gih_levels || array[3]::smallint[]) x),
         gih3_added_at = now(), gih3_batch = p_batch
   where id = any(p_inquiry_ids) and not (3 = any(gih_levels));
  get diagnostics v_i = row_count;
  update guests set gih_level3 = true, gih3_added_at = now(), gih3_batch = p_batch
   where id = any(p_guest_ids) and not gih_level3;
  get diagnostics v_g = row_count;
  return jsonb_build_object('inquiries', v_i, 'guests', v_g);
end $$;

-- Undo now uses the import log, and also takes back the GIH 3 marks that import made.
create or replace function public.undo_inquiry_import(p_batch uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_latest uuid; v_owner uuid; v_paths text[]; v_deleted int; v_kept int; v_ui int; v_ug int;
begin
  select id, imported_by into v_latest, v_owner from inquiry_imports where undone_at is null order by imported_at desc limit 1;
  if v_latest is null then  -- imports from before the log existed
    select import_batch, created_by into v_latest, v_owner from inquiries where import_batch is not null
      order by imported_at desc nulls last, created_at desc limit 1;
  end if;
  if v_latest is null or v_latest <> p_batch then raise exception 'Only the most recent import can be undone'; end if;
  if not (public.is_admin() or v_owner = auth.uid()) then raise exception 'Only the person who ran this import, or an admin, can undo it'; end if;
  select coalesce(array_agg(f.path), '{}') into v_paths from inquiry_files f join inquiries i on i.id = f.inquiry_id
    where i.import_batch = p_batch and i.status <> 'Moved';
  select count(*) into v_kept from inquiries where import_batch = p_batch and status = 'Moved';
  delete from inquiries where import_batch = p_batch and status <> 'Moved';
  get diagnostics v_deleted = row_count;
  update inquiries set import_batch = null where import_batch = p_batch;
  update inquiries set gih_levels = array_remove(gih_levels, 3::smallint), gih3_added_at = null, gih3_batch = null where gih3_batch = p_batch;
  get diagnostics v_ui = row_count;
  update guests set gih_level3 = false, gih3_added_at = null, gih3_batch = null where gih3_batch = p_batch;
  get diagnostics v_ug = row_count;
  update inquiry_imports set undone_at = now() where id = p_batch;
  return json_build_object('deleted', v_deleted, 'kept', v_kept, 'unmarked', v_ui + v_ug, 'paths', v_paths);
end $$;

revoke execute on function public.level3_candidates(text[], text[], text[]) from anon;
revoke execute on function public.level3_mark(uuid, uuid[], uuid[]) from anon;
revoke execute on function public.undo_inquiry_import(uuid) from anon;
