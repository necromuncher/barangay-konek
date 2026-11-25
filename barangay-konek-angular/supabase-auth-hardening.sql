-- Apply after supabase-schema.sql. The client publishable key is not a secret;
-- all role changes below are restricted to verified identity and SQL functions.

create table if not exists public.reserved_superuser_emails (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

alter table public.reserved_superuser_emails enable row level security;
revoke all on table public.reserved_superuser_emails from anon, authenticated;

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, barangay_id, address, marketplace_alerts, marketplace_radius_km, notification_preferences, updated_at)
  on table public.profiles to authenticated;
drop policy if exists "Authenticated users read profiles" on public.profiles;
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select to authenticated using (id = (select auth.uid()));
create or replace view public.member_directory as
  select id, full_name, role, barangay_id, created_at
  from public.profiles;
revoke all on public.member_directory from public, anon;
grant select on public.member_directory to authenticated;

insert into public.reserved_superuser_emails (email)
values ('erwin.alegro@gmail.com')
on conflict (email) do nothing;

create or replace function public.claim_reserved_superuser()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_reserved boolean;
begin
  select exists (
    select 1
    from auth.users u
    join public.reserved_superuser_emails r on r.email = lower(u.email)
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
  ) into is_reserved;

  if is_reserved then
    update public.profiles
    set role = 'superuser'
    where id = (select auth.uid());
  end if;

  return is_reserved;
end;
$$;

revoke all on function public.claim_reserved_superuser() from public, anon;
grant execute on function public.claim_reserved_superuser() to authenticated;

create or replace function public.assign_user_roles(assignments jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment jsonb;
  target_id uuid;
  target_role text;
  target_exists boolean;
begin
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'superuser'
  ) then
    raise exception 'Only a Superuser can assign community roles';
  end if;

  if coalesce(jsonb_typeof(assignments), '') <> 'array' then
    raise exception 'Role assignments must be a JSON array';
  end if;

  for assignment in select value from jsonb_array_elements(assignments)
  loop
    target_id := (assignment ->> 'accountId')::uuid;
    target_role := assignment ->> 'role';
    if target_role is null or target_role not in ('resident', 'officer', 'captain') then
      raise exception 'Invalid community role';
    end if;

    select exists (
      select 1 from public.profiles p
      where p.id = target_id
        and p.role <> 'superuser'
        and not exists (
          select 1
          from auth.users u
          join public.reserved_superuser_emails r on r.email = lower(u.email)
          where u.id = p.id
        )
    ) into target_exists;

    if not target_exists then
      raise exception 'One or more users cannot be assigned a community role';
    end if;

    update public.profiles
    set role = target_role
    where id = target_id;
  end loop;
end;
$$;

revoke all on function public.assign_user_roles(jsonb) from public, anon;
grant execute on function public.assign_user_roles(jsonb) to authenticated;

insert into public.profiles (id, full_name, barangay_id, address)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), 'Resident'),
  b.id,
  coalesce(u.raw_user_meta_data ->> 'address', '')
from auth.users u
left join public.profiles p on p.id = u.id
left join public.barangays b on b.id = nullif(u.raw_user_meta_data ->> 'barangay_id', '')
where p.id is null
on conflict (id) do nothing;

update public.profiles p
set role = 'superuser'
from auth.users u
join public.reserved_superuser_emails r on r.email = lower(u.email)
where p.id = u.id
  and u.email_confirmed_at is not null;

notify pgrst, 'reload schema';
