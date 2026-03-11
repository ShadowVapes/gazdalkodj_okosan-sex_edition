-- Gazdálkodj okosan - Supabase schema (újrafuttatható verzió)
-- Demó / hobby célra lazább policy-kkel.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby' check (status in ('lobby','in_game','finished')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms
  add column if not exists host_player_id text;

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.rooms(code) on delete cascade,
  player_id text not null,
  username text not null,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  unique(room_code, player_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rooms_updated_at on public.rooms;
create trigger trg_rooms_updated_at
before update on public.rooms
for each row
execute function public.set_updated_at();

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

drop policy if exists "rooms_select_all" on public.rooms;
create policy "rooms_select_all" on public.rooms
for select to anon, authenticated
using (true);

drop policy if exists "rooms_insert_all" on public.rooms;
create policy "rooms_insert_all" on public.rooms
for insert to anon, authenticated
with check (true);

drop policy if exists "rooms_update_all" on public.rooms;
create policy "rooms_update_all" on public.rooms
for update to anon, authenticated
using (true)
with check (true);

drop policy if exists "rooms_delete_all" on public.rooms;
create policy "rooms_delete_all" on public.rooms
for delete to anon, authenticated
using (true);

drop policy if exists "room_players_select_all" on public.room_players;
create policy "room_players_select_all" on public.room_players
for select to anon, authenticated
using (true);

drop policy if exists "room_players_insert_all" on public.room_players;
create policy "room_players_insert_all" on public.room_players
for insert to anon, authenticated
with check (true);

drop policy if exists "room_players_update_all" on public.room_players;
create policy "room_players_update_all" on public.room_players
for update to anon, authenticated
using (true)
with check (true);

drop policy if exists "room_players_delete_all" on public.room_players;
create policy "room_players_delete_all" on public.room_players
for delete to anon, authenticated
using (true);

alter table public.rooms replica identity full;
alter table public.room_players replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_players'
  ) then
    alter publication supabase_realtime add table public.room_players;
  end if;
end $$;

notify pgrst, 'reload schema';
