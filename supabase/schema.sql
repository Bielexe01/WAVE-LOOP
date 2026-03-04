create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  handle text not null unique check (char_length(handle) >= 3),
  bio text default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  mood text not null default 'Alta energia',
  track_title text,
  track_artist text,
  media_url text,
  media_type text check (media_type in ('image', 'audio')),
  likes_count integer not null default 0,
  reposts_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_reposts (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.user_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.direct_thread_participants (
  thread_id uuid not null references public.direct_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.direct_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_posts_created_at on public.posts(created_at desc);
create index if not exists idx_posts_user_id on public.posts(user_id);
create index if not exists idx_comments_post_id on public.comments(post_id);
create index if not exists idx_comments_created_at on public.comments(created_at desc);
create index if not exists idx_user_follows_follower on public.user_follows(follower_id);
create index if not exists idx_user_follows_following on public.user_follows(following_id);
create index if not exists idx_direct_participants_user on public.direct_thread_participants(user_id);
create index if not exists idx_direct_participants_thread on public.direct_thread_participants(thread_id);
create index if not exists idx_direct_messages_thread_created_at on public.direct_messages(thread_id, created_at desc);
create index if not exists idx_direct_threads_updated_at on public.direct_threads(updated_at desc);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_reposts enable row level security;
alter table public.user_follows enable row level security;
alter table public.direct_threads enable row level security;
alter table public.direct_thread_participants enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
on public.profiles
for select
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "posts_select_all" on public.posts;
create policy "posts_select_all"
on public.posts
for select
using (true);

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
on public.posts
for insert
with check (auth.uid() = user_id);

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own"
on public.posts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own"
on public.posts
for delete
using (auth.uid() = user_id);

drop policy if exists "comments_select_all" on public.comments;
create policy "comments_select_all"
on public.comments
for select
using (true);

drop policy if exists "comments_insert_authenticated" on public.comments;
create policy "comments_insert_authenticated"
on public.comments
for insert
with check (auth.uid() = user_id);

drop policy if exists "comments_update_own" on public.comments;
create policy "comments_update_own"
on public.comments
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own"
on public.comments
for delete
using (auth.uid() = user_id);

drop policy if exists "likes_select_all" on public.post_likes;
create policy "likes_select_all"
on public.post_likes
for select
using (true);

drop policy if exists "likes_insert_own" on public.post_likes;
create policy "likes_insert_own"
on public.post_likes
for insert
with check (auth.uid() = user_id);

drop policy if exists "likes_delete_own" on public.post_likes;
create policy "likes_delete_own"
on public.post_likes
for delete
using (auth.uid() = user_id);

drop policy if exists "reposts_select_all" on public.post_reposts;
create policy "reposts_select_all"
on public.post_reposts
for select
using (true);

drop policy if exists "reposts_insert_own" on public.post_reposts;
create policy "reposts_insert_own"
on public.post_reposts
for insert
with check (auth.uid() = user_id);

drop policy if exists "reposts_delete_own" on public.post_reposts;
create policy "reposts_delete_own"
on public.post_reposts
for delete
using (auth.uid() = user_id);

drop policy if exists "user_follows_select_all" on public.user_follows;
create policy "user_follows_select_all"
on public.user_follows
for select
using (true);

drop policy if exists "user_follows_insert_own" on public.user_follows;
create policy "user_follows_insert_own"
on public.user_follows
for insert
with check (auth.uid() = follower_id and follower_id <> following_id);

drop policy if exists "user_follows_delete_own" on public.user_follows;
create policy "user_follows_delete_own"
on public.user_follows
for delete
using (auth.uid() = follower_id);

create or replace function public.is_direct_thread_member(thread_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.direct_thread_participants
    where thread_id = thread_uuid
      and user_id = auth.uid()
  );
$$;

drop policy if exists "direct_threads_select_member" on public.direct_threads;
create policy "direct_threads_select_member"
on public.direct_threads
for select
using (public.is_direct_thread_member(id));

drop policy if exists "direct_threads_insert_authenticated" on public.direct_threads;
create policy "direct_threads_insert_authenticated"
on public.direct_threads
for insert
with check (auth.uid() is not null);

drop policy if exists "direct_participants_select_member" on public.direct_thread_participants;
create policy "direct_participants_select_member"
on public.direct_thread_participants
for select
using (public.is_direct_thread_member(thread_id));

drop policy if exists "direct_participants_insert_member" on public.direct_thread_participants;
create policy "direct_participants_insert_member"
on public.direct_thread_participants
for insert
with check (
  auth.uid() is not null
  and (auth.uid() = user_id or public.is_direct_thread_member(thread_id))
);

drop policy if exists "direct_participants_update_own_read" on public.direct_thread_participants;
create policy "direct_participants_update_own_read"
on public.direct_thread_participants
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "direct_messages_select_member" on public.direct_messages;
create policy "direct_messages_select_member"
on public.direct_messages
for select
using (public.is_direct_thread_member(thread_id));

drop policy if exists "direct_messages_insert_member" on public.direct_messages;
create policy "direct_messages_insert_member"
on public.direct_messages
for insert
with check (
  auth.uid() = sender_id
  and public.is_direct_thread_member(thread_id)
);

create or replace function public.refresh_post_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.posts
  set likes_count = (
    select count(*)
    from public.post_likes
    where post_id = coalesce(new.post_id, old.post_id)
  )
  where id = coalesce(new.post_id, old.post_id);

  return null;
end;
$$;

create or replace function public.refresh_post_reposts_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.posts
  set reposts_count = (
    select count(*)
    from public.post_reposts
    where post_id = coalesce(new.post_id, old.post_id)
  )
  where id = coalesce(new.post_id, old.post_id);

  return null;
end;
$$;

create or replace function public.refresh_direct_thread_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.direct_threads
  set updated_at = coalesce(new.created_at, now())
  where id = new.thread_id;

  return null;
end;
$$;

drop trigger if exists trg_post_likes_refresh_count on public.post_likes;
create trigger trg_post_likes_refresh_count
after insert or delete on public.post_likes
for each row
execute procedure public.refresh_post_likes_count();

drop trigger if exists trg_post_reposts_refresh_count on public.post_reposts;
create trigger trg_post_reposts_refresh_count
after insert or delete on public.post_reposts
for each row
execute procedure public.refresh_post_reposts_count();

drop trigger if exists trg_direct_messages_refresh_thread on public.direct_messages;
create trigger trg_direct_messages_refresh_thread
after insert on public.direct_messages
for each row
execute procedure public.refresh_direct_thread_updated_at();

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "storage_media_public_read" on storage.objects;
create policy "storage_media_public_read"
on storage.objects
for select
using (bucket_id = 'media');

drop policy if exists "storage_media_insert_own" on storage.objects;
create policy "storage_media_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'media'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_media_update_own" on storage.objects;
create policy "storage_media_update_own"
on storage.objects
for update
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_media_delete_own" on storage.objects;
create policy "storage_media_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
