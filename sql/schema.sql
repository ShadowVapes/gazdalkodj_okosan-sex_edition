create extension if not exists pgcrypto;

create table if not exists public.game_config (
  id bigint generated always as identity primary key,
  starting_money integer not null default 1500,
  pass_start_bonus integer not null default 300,
  win_item_count integer not null default 3,
  default_deck text not null default 'default',
  created_at timestamptz not null default now()
);

create table if not exists public.game_tiles (
  id bigint generated always as identity primary key,
  sort_order integer not null,
  name text not null,
  description text,
  tile_type text not null check (tile_type in ('start', 'neutral', 'money', 'card', 'shop', 'skip', 'move')),
  amount integer not null default 0,
  turns integer not null default 0,
  steps integer not null default 0,
  deck_name text not null default 'default',
  item_name text,
  item_price integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.game_cards (
  id bigint generated always as identity primary key,
  deck_name text not null default 'default',
  title text not null,
  description text not null,
  action_type text not null check (action_type in ('none', 'money', 'skip', 'move', 'shop')),
  amount integer not null default 0,
  turns integer not null default 0,
  steps integer not null default 0,
  item_name text,
  item_price integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  current_turn_index integer not null default 0,
  turn_number integer not null default 1,
  last_roll integer,
  winner_player_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  player_order integer not null default 0,
  position integer not null default 0,
  money integer not null default 1500,
  skip_turns integer not null default 0,
  inventory jsonb not null default '[]'::jsonb,
  is_host boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.room_logs (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

insert into public.game_config (starting_money, pass_start_bonus, win_item_count, default_deck)
select 1500, 300, 3, 'default'
where not exists (select 1 from public.game_config);

insert into public.game_tiles (sort_order, name, description, tile_type, amount, turns, steps, deck_name, item_name, item_price)
select * from (
  values
    (0, 'Start', 'Ha áthaladsz rajta, kapsz bónuszt.', 'start', 0, 0, 0, 'default', null, 0),
    (1, 'Fizetésnap', 'Kapsz egy kis pénzt.', 'money', 400, 0, 0, 'default', null, 0),
    (2, 'Szerencse', 'Húzz egy kártyát.', 'card', 0, 0, 0, 'default', null, 0),
    (3, 'Bútorbolt', 'Vehetsz egy széket.', 'shop', 0, 0, 0, 'default', 'Szék', 600),
    (4, 'Csekk', 'Befizetsz egy kellemetlen számlát.', 'money', -300, 0, 0, 'default', null, 0),
    (5, 'Pihenő', 'Kimaradsz egy körből.', 'skip', 0, 1, 0, 'default', null, 0),
    (6, 'Buszmegálló', 'Előrelépsz kettőt.', 'move', 0, 0, 2, 'default', null, 0),
    (7, 'Semmi', 'Nyugi, itt most nincs hatás.', 'neutral', 0, 0, 0, 'default', null, 0)
) as seed(sort_order, name, description, tile_type, amount, turns, steps, deck_name, item_name, item_price)
where not exists (select 1 from public.game_tiles);

insert into public.game_cards (deck_name, title, description, action_type, amount, turns, steps, item_name, item_price)
select * from (
  values
    ('default', 'Prémium', 'Találsz pénzt a kabátzsebben.', 'money', 500, 0, 0, null, 0),
    ('default', 'Baleset', 'Kimaradsz egy körből.', 'skip', 0, 1, 0, null, 0),
    ('default', 'Akciós polc', 'Visszalépsz egy mezőt.', 'move', 0, 0, -1, null, 0),
    ('default', 'Outlet', 'Olcsón megvehetsz egy lámpát.', 'shop', 0, 0, 0, 'Lámpa', 450),
    ('default', 'Semmi extra', 'Csak egy vicces szöveg.', 'none', 0, 0, 0, null, 0)
) as cards(deck_name, title, description, action_type, amount, turns, steps, item_name, item_price)
where not exists (select 1 from public.game_cards);

alter table public.game_config enable row level security;
alter table public.game_tiles enable row level security;
alter table public.game_cards enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'game_config' and policyname = 'Public full access game_config') then
    create policy "Public full access game_config" on public.game_config for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'game_tiles' and policyname = 'Public full access game_tiles') then
    create policy "Public full access game_tiles" on public.game_tiles for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'game_cards' and policyname = 'Public full access game_cards') then
    create policy "Public full access game_cards" on public.game_cards for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'rooms' and policyname = 'Public full access rooms') then
    create policy "Public full access rooms" on public.rooms for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'room_players' and policyname = 'Public full access room_players') then
    create policy "Public full access room_players" on public.room_players for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'room_logs' and policyname = 'Public full access room_logs') then
    create policy "Public full access room_logs" on public.room_logs for all using (true) with check (true);
  end if;
end $$;

-- Opcionális realtime:
-- Ha valós idejű frissítést akarsz polling helyett / mellett, add hozzá ezeket a táblákat a Supabase Realtime replicationhöz:
-- rooms, room_players, room_logs
