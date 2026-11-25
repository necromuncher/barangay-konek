-- Barangay Konek initial Supabase schema.
-- Apply to a new project only after reviewing role and RLS policies.

create table if not exists public.barangays (
  id text primary key,
  name text not null,
  city text not null,
  province text not null,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  constraint barangay_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint barangay_longitude_range check (longitude is null or longitude between -180 and 180)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'resident'
    check (role in ('resident', 'officer', 'captain', 'superuser')),
  barangay_id text references public.barangays(id) on delete set null,
  address text not null default '',
  violation_count integer not null default 0 check (violation_count between 0 and 100),
  banned boolean not null default false,
  suspended_until timestamptz,
  marketplace_alerts boolean not null default true,
  marketplace_radius_km integer not null default 25 check (marketplace_radius_km between 0 and 100),
  notification_preferences jsonb not null default
    '{"incidents":true,"announcements":true,"messages":true,"marketplace":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, barangay_id, address)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Resident'),
    nullif(new.raw_user_meta_data ->> 'barangay_id', ''),
    coalesce(new.raw_user_meta_data ->> 'address', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  barangay_id text references public.barangays(id) on delete set null,
  post_type text not null check (post_type in ('update', 'incident', 'announcement', 'event')),
  severity text check (severity is null or severity in ('low', 'medium', 'high', 'critical')),
  title text not null,
  body text not null,
  purok text,
  media_paths text[] not null default '{}',
  resolved_at timestamptz,
  resolution_comment text,
  resolution_media_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_post_media_limit check (cardinality(media_paths) <= 4),
  constraint incident_resolution_evidence check (
    resolved_at is null or nullif(trim(resolution_comment), '') is not null or resolution_media_path is not null
  )
);

create or replace function public.guard_incident_resolution()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    new.resolved_at is distinct from old.resolved_at
    or new.resolution_comment is distinct from old.resolution_comment
    or new.resolution_media_path is distinct from old.resolution_media_path
  ) and not public.is_barangay_staff(old.barangay_id) then
    raise exception 'Only assigned barangay staff may resolve an incident';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_incident_resolution on public.community_posts;
create trigger guard_incident_resolution
  before update on public.community_posts
  for each row execute procedure public.guard_incident_resolution();

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null default '',
  media_path text,
  created_at timestamptz not null default now(),
  constraint comment_content_required check (nullif(trim(body), '') is not null or media_path is not null)
);

create table if not exists public.post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  barangay_id text references public.barangays(id) on delete set null,
  title text not null,
  category text not null,
  description text not null,
  media_path text,
  is_free boolean not null default true,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  target_user_id uuid not null references public.profiles(id) on delete restrict,
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.post_comments(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_comment text,
  resolution_media_path text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint report_target_required check (post_id is not null or comment_id is not null),
  constraint report_not_self check (reporter_id <> target_user_id),
  constraint report_resolution_evidence check (
    status <> 'resolved' or nullif(trim(resolution_comment), '') is not null or resolution_media_path is not null
  )
);

create table if not exists public.banned_words (
  id uuid primary key default gen_random_uuid(),
  word text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.banned_identities (
  id uuid primary key default gen_random_uuid(),
  identity_type text not null check (identity_type in ('email', 'phone', 'provider')),
  identity_hash text not null,
  banned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (identity_type, identity_hash)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null check (
    notification_type in ('community', 'incident', 'marketplace', 'message', 'violation')
  ),
  title text not null,
  body text not null,
  related_post_id uuid references public.community_posts(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists community_posts_barangay_created_idx
  on public.community_posts (barangay_id, created_at desc);
create index if not exists community_posts_incident_queue_idx
  on public.community_posts (barangay_id, resolved_at, created_at desc)
  where post_type = 'incident';
create index if not exists marketplace_listings_barangay_created_idx
  on public.marketplace_listings (barangay_id, created_at desc)
  where claimed_at is null;
create index if not exists content_reports_status_created_idx
  on public.content_reports (status, created_at desc);
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

create or replace function public.is_barangay_staff(target_barangay_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (
        p.role = 'superuser'
        or (p.role in ('officer', 'captain') and p.barangay_id = target_barangay_id)
      )
  );
$$;

alter table public.barangays enable row level security;
alter table public.profiles enable row level security;
alter table public.community_posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.content_reports enable row level security;
alter table public.banned_words enable row level security;
alter table public.banned_identities enable row level security;
alter table public.notifications enable row level security;

create policy "Authenticated users can read barangay directory"
  on public.barangays for select to authenticated using (true);
create policy "Superusers manage barangay directory"
  on public.barangays for all to authenticated
  using (public.is_barangay_staff(null) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'superuser'
  ))
  with check (public.is_barangay_staff(null) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'superuser'
  ));

create policy "Users read own profile"
  on public.profiles for select to authenticated using (id = (select auth.uid()));
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, barangay_id, address, marketplace_alerts, marketplace_radius_km, notification_preferences, updated_at)
  on public.profiles to authenticated;
create policy "Users update editable profile fields"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create or replace view public.member_directory as
  select id, full_name, role, barangay_id, created_at
  from public.profiles;
revoke all on public.member_directory from public, anon;
grant select on public.member_directory to authenticated;

create policy "Users read community posts"
  on public.community_posts for select to authenticated using (true);
create policy "Eligible users create community posts"
  on public.community_posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and not p.banned
        and (p.suspended_until is null or p.suspended_until <= now())
        and p.barangay_id = community_posts.barangay_id
    )
  );
create policy "Authors and barangay staff update community posts"
  on public.community_posts for update to authenticated
  using (
    author_id = (select auth.uid())
    or public.is_barangay_staff(barangay_id)
  )
  with check (
    author_id = (select auth.uid())
    or public.is_barangay_staff(barangay_id)
  );
create policy "Authors or staff delete community posts"
  on public.community_posts for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_barangay_staff(barangay_id));

create policy "Users read comments"
  on public.post_comments for select to authenticated using (true);
create policy "Eligible users create comments"
  on public.post_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and not p.banned
        and (p.suspended_until is null or p.suspended_until <= now())
    )
  );
create policy "Authors delete own comments"
  on public.post_comments for delete to authenticated using (author_id = (select auth.uid()));

create policy "Users read likes"
  on public.post_likes for select to authenticated using (true);
create policy "Users manage own likes"
  on public.post_likes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Users read free listings"
  on public.marketplace_listings for select to authenticated using (claimed_at is null or owner_id = (select auth.uid()));
create policy "Eligible users create listings"
  on public.marketplace_listings for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and not p.banned
        and (p.suspended_until is null or p.suspended_until <= now())
        and p.barangay_id = marketplace_listings.barangay_id
    )
  );
create policy "Owners update listings"
  on public.marketplace_listings for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "Reporters and assigned staff read reports"
  on public.content_reports for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or exists (
      select 1 from public.community_posts cp
      where cp.id = post_id and public.is_barangay_staff(cp.barangay_id)
    )
    or exists (
      select 1 from public.profiles target
      where target.id = target_user_id and public.is_barangay_staff(target.barangay_id)
    )
  );
create policy "Eligible users create reports"
  on public.content_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and not p.banned
    )
    and (
      (post_id is not null and exists (
        select 1 from public.community_posts cp
        where cp.id = post_id and cp.author_id = target_user_id
      ))
      or
      (comment_id is not null and exists (
        select 1 from public.post_comments pc
        where pc.id = comment_id and pc.author_id = target_user_id
      ))
    )
  );
create policy "Assigned staff resolve reports"
  on public.content_reports for update to authenticated
  using (
    exists (
      select 1 from public.profiles target
      where target.id = target_user_id and public.is_barangay_staff(target.barangay_id)
    )
  )
  with check (
    exists (
      select 1 from public.profiles target
      where target.id = target_user_id and public.is_barangay_staff(target.barangay_id)
    )
  );

create policy "Authenticated users read banned words"
  on public.banned_words for select to authenticated using (true);
create policy "Staff manage banned words"
  on public.banned_words for all to authenticated
  using (public.is_barangay_staff(null))
  with check (public.is_barangay_staff(null));
create policy "Users cannot read banned identity hashes"
  on public.banned_identities for select to authenticated using (false);
create policy "Superusers manage banned identity hashes"
  on public.banned_identities for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'superuser'))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'superuser'));

create policy "Users read own notifications"
  on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy "Users mark own notifications read"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-media', 'community-media', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Users upload their own community media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Authenticated users read community media"
  on storage.objects for select to authenticated
  using (bucket_id = 'community-media');
create policy "Users delete their own community media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

insert into public.banned_words (word)
values ('profanity'), ('sex'), ('nudity'), ('harassment')
on conflict (word) do nothing;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['notifications', 'community_posts', 'marketplace_listings', 'content_reports']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
