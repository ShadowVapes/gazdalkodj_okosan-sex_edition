create extension if not exists pgcrypto;

create table if not exists public.game_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.game_tiles (
  id bigserial primary key,
  sort_order integer not null default 0,
  name text not null,
  kind text not null default 'neutral',
  amount integer not null default 0,
  price integer not null default 0,
  card_group text,
  effect jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.game_cards (
  id bigserial primary key,
  card_group text not null default 'chance',
  title text not null,
  body text,
  amount integer not null default 0,
  skip_turns integer not null default 0,
  move_steps integer not null default 0,
  effect jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby',
  host_player_id uuid,
  turn_index integer not null default 0,
  turn_no integer not null default 1,
  last_roll integer,
  created_at timestamptz not null default now()
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  seat_no integer not null default 0,
  position integer not null default 0,
  money integer not null default 0,
  skip_turns integer not null default 0,
  inventory jsonb not null default '[]'::jsonb,
  is_host boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.room_logs (
  id bigserial primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  entry text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_game_tiles_sort_order on public.game_tiles(sort_order);
create index if not exists idx_room_players_room_id on public.room_players(room_id);
create index if not exists idx_room_logs_room_id on public.room_logs(room_id);

insert into public.game_config (key, value)
values
  ('starting_money', '{"value":3000}'),
  ('start_bonus', '{"value":400}'),
  ('win_money', '{"value":10000}'),
  ('required_items', '{"value":4}')
on conflict (key) do nothing;

insert into public.game_tiles (sort_order, name, kind, amount, price, card_group, effect)
values
  (0, 'Start', 'start', 0, 0, null, '{}'),
  (1, 'Fizetés', 'money', 600, 0, null, '{}'),
  (2, 'Szerencsekártya', 'card', 0, 0, 'chance', '{}'),
  (3, 'Konyhaszék bolt', 'shop', 0, 400, null, '{"item":"Konyhaszék","price":400}'),
  (4, 'Villanyszámla', 'money', -350, 0, null, '{}'),
  (5, 'Pihenő', 'neutral', 0, 0, null, '{}'),
  (6, 'Kimaradsz', 'skip', 1, 0, null, '{"skip_turns":1}'),
  (7, 'Szerencsekártya', 'card', 0, 0, 'chance', '{}'),
  (8, 'Asztal bolt', 'shop', 0, 900, null, '{"item":"Asztal","price":900}'),
  (9, 'Bónusz', 'money', 800, 0, null, '{}'),
  (10, 'Lépj előre', 'move', 2, 0, null, '{"move_steps":2}'),
  (11, 'Tv bolt', 'shop', 0, 1300, null, '{"item":"Tv","price":1300}'),
  (12, 'Szerencsekártya', 'card', 0, 0, 'chance', '{}'),
  (13, 'Adó', 'money', -700, 0, null, '{}'),
  (14, 'Ágy bolt', 'shop', 0, 1600, null, '{"item":"Ágy","price":1600}'),
  (15, 'Jutalom', 'money', 1200, 0, null, '{}'),
  (16, 'Vissza 2 mezőt', 'move', -2, 0, null, '{"move_steps":-2}'),
  (17, 'Szerencsekártya', 'card', 0, 0, 'chance', '{}'),
  (18, 'Hűtő bolt', 'shop', 0, 2000, null, '{"item":"Hűtő","price":2000}'),
  (19, 'Havi fizu', 'money', 1000, 0, null, '{}')
on conflict do nothing;

insert into public.game_cards (card_group, title, body, amount, skip_turns, move_steps, effect)
values
  ('chance', 'Fizetésemelés', 'Kapsz egy kis plusz pénzt.', 700, 0, 0, '{}'),
  ('chance', 'Bírság', 'Befizetsz egy váratlan csekket.', -500, 0, 0, '{}'),
  ('chance', 'Lépj előre', 'Szerencsés vagy, haladj tovább.', 0, 0, 3, '{}'),
  ('chance', 'Kimaradsz', 'Most pihensz egyet.', 0, 1, 0, '{}'),
  ('chance', 'Ajándék rádió', 'Kaptál egy tárgyat.', 0, 0, 0, '{"item":"Rádió"}')
on conflict do nothing;

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
