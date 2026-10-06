-- One time import of the old CRM's Excel export (GR-GT-CRM-Export-*.xlsx).
-- Run this whole file in Supabase > SQL Editor AFTER crm_schema.sql.
-- Then in the CRM: Account page > "Import CRM export" (admins only).
--
-- The browser reads the Excel file and passes it here as JSON, so the data
-- goes straight from your computer to the database.
-- Authors ("Logged By", "Owner", etc.) are matched to current logins by name;
-- names with no match are kept as text.

create or replace function public.import_crm_export(p jsonb, p_allow_existing boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_id uuid;
  v_meister uuid;
  v_int uuid;
  v_cat uuid;
  v_user uuid;
  n_cat int := 0; n_m int := 0; n_i int := 0; n_c int := 0; n_f int := 0; n_h int := 0;
  skipped jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can import.';
  end if;
  if not p_allow_existing and exists (select 1 from meisters) then
    raise exception 'The CRM already has Meisters in it. Import stopped so nothing is duplicated.';
  end if;

  create temp table _m (name text, id uuid) on commit drop;
  create temp table _i (id uuid, meister text, method text, note text) on commit drop;

  -- question types
  for r in select * from jsonb_array_elements(coalesce(p->'categories', '[]')) loop
    insert into question_categories (name, active)
    values (r->>'name', coalesce((r->>'active')::boolean, true))
    on conflict (name) do update set active = excluded.active;
    n_cat := n_cat + 1;
  end loop;

  -- meisters
  for r in select * from jsonb_array_elements(coalesce(p->'meisters', '[]')) loop
    insert into meisters (name, job_title, concierge, status, phone, email, dealership, dealership_website,
      city, state, zip, allocation_count, pma, delivery_eta, profile_summary,
      created_by, created_by_name, updated_by_name, created_at, updated_at)
    values (
      r->>'name', nullif(r->>'job_title',''),
      case when r->>'concierge' in ('Freddie','Logan') then r->>'concierge' end,
      case when r->>'status' in ('New','Contacted','Engaged','Sold','Not Interested') then r->>'status' else 'New' end,
      nullif(r->>'phone',''), nullif(r->>'email',''), nullif(r->>'dealership',''), nullif(r->>'dealership_website',''),
      nullif(r->>'city',''), nullif(r->>'state',''), nullif(r->>'zip',''),
      nullif(r->>'allocation_count','')::int, nullif(r->>'pma',''), nullif(r->>'delivery_eta','')::date,
      nullif(r->>'profile_summary',''),
      public._import_user(r->>'created_by_name'), nullif(r->>'created_by_name',''), nullif(r->>'updated_by_name',''),
      coalesce(nullif(r->>'created_at','')::timestamptz, now()),
      coalesce(nullif(r->>'updated_at','')::timestamptz, nullif(r->>'created_at','')::timestamptz, now())
    ) returning id into v_id;
    -- first Meister with a given name wins when names repeat
    if not exists (select 1 from _m where lower(name) = lower(r->>'name')) then
      insert into _m values (r->>'name', v_id);
    end if;
    n_m := n_m + 1;
  end loop;

  -- conversations
  for r in select * from jsonb_array_elements(coalesce(p->'interactions', '[]')) loop
    select id into v_meister from _m where lower(name) = lower(r->>'meister');
    if v_meister is null then
      skipped := skipped || jsonb_build_object('sheet','Interactions','meister',r->>'meister'); continue;
    end if;
    select id into v_cat from question_categories where name = nullif(r->>'category','');
    insert into interactions (meister_id, method, direction, category_id, occurred_at, note,
      created_by, created_by_name, created_at, edited_by_name, edited_at)
    values (
      v_meister,
      case when r->>'method' in ('Phone','Text','Email','In Person','Other') then r->>'method' else 'Other' end,
      case when r->>'direction' in ('Inbound','Outbound') then r->>'direction' end,
      v_cat,
      coalesce(nullif(r->>'occurred_at','')::timestamptz, nullif(r->>'created_at','')::timestamptz, now()),
      coalesce(nullif(r->>'note',''), '(no note)'),
      public._import_user(r->>'created_by_name'), nullif(r->>'created_by_name',''),
      coalesce(nullif(r->>'created_at','')::timestamptz, nullif(r->>'occurred_at','')::timestamptz, now()),
      nullif(r->>'edited_by_name',''), nullif(r->>'edited_at','')::timestamptz
    ) returning id into v_int;
    insert into _i values (v_int, r->>'meister', r->>'method', coalesce(r->>'note',''));
    v_cat := null;
    n_i := n_i + 1;
  end loop;

  -- comments ("On Activity" = method — first 60 characters of the note)
  for r in select * from jsonb_array_elements(coalesce(p->'comments', '[]')) loop
    select id into v_int from _i
      where lower(meister) = lower(r->>'meister')
        and method || ' — ' || left(note, 60) = r->>'on_activity'
      limit 1;
    if v_int is null then
      skipped := skipped || jsonb_build_object('sheet','Comments','meister',r->>'meister'); continue;
    end if;
    insert into interaction_comments (interaction_id, body, created_by, created_by_name, created_at, edited_at)
    values (v_int, r->>'body', public._import_user(r->>'by'), nullif(r->>'by',''),
      coalesce(nullif(r->>'created_at','')::timestamptz, now()), nullif(r->>'edited_at','')::timestamptz);
    v_int := null;
    n_c := n_c + 1;
  end loop;

  -- follow ups (owner must be a login; unmatched owners go to whoever runs the import)
  for r in select * from jsonb_array_elements(coalesce(p->'followups', '[]')) loop
    select id into v_meister from _m where lower(name) = lower(r->>'meister');
    if v_meister is null then
      skipped := skipped || jsonb_build_object('sheet','Follow-Ups','meister',r->>'meister'); continue;
    end if;
    v_user := coalesce(public._import_user(r->>'owner'), auth.uid());
    insert into follow_ups (meister_id, user_id, user_name, title, due_at, done_at, created_at)
    values (v_meister, v_user, (select full_name from profiles where id = v_user), r->>'title',
      coalesce(nullif(r->>'due_at','')::timestamptz, now()), nullif(r->>'done_at','')::timestamptz,
      coalesce(nullif(r->>'created_at','')::timestamptz, now()));
    n_f := n_f + 1;
  end loop;

  -- drop the "created" history rows and notifications this import just triggered
  -- (now() is the same moment for the whole import)
  delete from status_history where changed_at = now();
  delete from notifications where created_at = now();

  -- the real status history from the export
  for r in select * from jsonb_array_elements(coalesce(p->'history', '[]')) loop
    select id into v_meister from _m where lower(name) = lower(r->>'meister');
    if v_meister is null or nullif(r->>'to','') is null then continue; end if;
    insert into status_history (meister_id, from_status, to_status, changed_by, changed_by_name, changed_at)
    values (v_meister, nullif(r->>'from',''), r->>'to', public._import_user(r->>'changed_by_name'),
      nullif(r->>'changed_by_name',''), coalesce(nullif(r->>'changed_at','')::timestamptz, now()));
    n_h := n_h + 1;
  end loop;

  return jsonb_build_object('categories', n_cat, 'meisters', n_m, 'interactions', n_i, 'comments', n_c,
    'followups', n_f, 'history', n_h, 'skipped', skipped);
end;
$$;

-- name -> current login. Best match first: exact full name, then same last name,
-- then same first 4 letters of the first name (Freddie / Frederick, Logan / Logan W.)
create or replace function public._import_user(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with n as (
    select lower(trim(p_name)) as full,
           split_part(lower(trim(p_name)), ' ', 1) as first,
           case when position(' ' in trim(p_name)) > 0 then lower(regexp_replace(trim(p_name), '^.* ', '')) end as last
  )
  select p.id from profiles p, n
  where nullif(n.full, '') is not null
    and (lower(p.full_name) = n.full
         or (n.last is not null and position(' ' in trim(p.full_name)) > 0 and lower(regexp_replace(trim(p.full_name), '^.* ', '')) = n.last)
         or left(split_part(lower(p.full_name), ' ', 1), 4) = left(n.first, 4))
  order by (lower(p.full_name) = n.full) desc,
           (n.last is not null and lower(regexp_replace(trim(p.full_name), '^.* ', '')) = n.last) desc
  limit 1;
$$;

revoke all on function public.import_crm_export(jsonb, boolean) from public, anon;
grant execute on function public.import_crm_export(jsonb, boolean) to authenticated;
revoke all on function public._import_user(text) from public, anon;
