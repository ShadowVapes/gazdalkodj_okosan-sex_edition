-- Gazdálkodj okosan - Supabase schema (újrafuttatható, migrációbarát)
-- Úgy lett összerakva, hogy régebbi room / room_players táblákon is a lehető legkisebb fájdalommal fusson végig.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby' check (status in ('lobby','in_game','finished')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms add column if not exists host_player_id text;
alter table public.rooms add column if not exists host_client_id text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rooms' and column_name = 'host_player_id' and is_nullable = 'NO'
  ) then
    alter table public.rooms alter column host_player_id drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rooms' and column_name = 'host_client_id' and is_nullable = 'NO'
  ) then
    alter table public.rooms alter column host_client_id drop not null;
  end if;
end $$;

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_code text,
  room_id uuid,
  player_id text,
  client_id text,
  username text not null default 'Játékos',
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

alter table public.room_players add column if not exists room_code text;
alter table public.room_players add column if not exists room_id uuid;
alter table public.room_players add column if not exists player_id text;
alter table public.room_players add column if not exists client_id text;
alter table public.room_players add column if not exists username text;
alter table public.room_players add column if not exists joined_at timestamptz;
alter table public.room_players add column if not exists last_seen timestamptz;
alter table public.room_players add column if not exists meta jsonb;

alter table public.room_players alter column username set default 'Játékos';
alter table public.room_players alter column joined_at set default now();
alter table public.room_players alter column last_seen set default now();
alter table public.room_players alter column meta set default '{}'::jsonb;

update public.room_players
set username = 'Játékos'
where username is null or btrim(username) = '';

update public.room_players
set joined_at = now()
where joined_at is null;

update public.room_players
set last_seen = now()
where last_seen is null;

update public.room_players
set meta = '{}'::jsonb
where meta is null;

update public.room_players
set player_id = client_id
where player_id is null and client_id is not null;

update public.room_players
set client_id = player_id
where client_id is null and player_id is not null;

update public.room_players rp
set room_code = r.code
from public.rooms r
where rp.room_code is null
  and rp.room_id is not null
  and r.id = rp.room_id;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'room_players_room_id_fkey'
      and conrelid = 'public.room_players'::regclass
  ) then
    begin
      alter table public.room_players
        add constraint room_players_room_id_fkey
        foreign key (room_id) references public.rooms(id) on delete cascade;
    exception when others then
      null;
    end;
  end if;
end $$;

create unique index if not exists idx_rooms_code_unique
  on public.rooms(code);

create unique index if not exists idx_room_players_room_code_player_id_unique
  on public.room_players(room_code, player_id)
  where room_code is not null and player_id is not null;

create unique index if not exists idx_room_players_room_id_player_id_unique
  on public.room_players(room_id, player_id)
  where room_id is not null and player_id is not null;

create unique index if not exists idx_room_players_room_code_client_id_unique
  on public.room_players(room_code, client_id)
  where room_code is not null and client_id is not null;

create unique index if not exists idx_room_players_room_id_client_id_unique
  on public.room_players(room_id, client_id)
  where room_id is not null and client_id is not null;

create index if not exists idx_room_players_room_code
  on public.room_players(room_code);

create index if not exists idx_room_players_room_id
  on public.room_players(room_id);

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
