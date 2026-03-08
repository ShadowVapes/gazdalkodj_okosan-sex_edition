drop table if exists public.room_logs cascade;
drop table if exists public.room_players cascade;
drop table if exists public.rooms cascade;
drop table if exists public.game_cards cascade;
drop table if exists public.game_tiles cascade;
drop table if exists public.game_items cascade;
drop table if exists public.game_config cascade;

create extension if not exists pgcrypto;

create table public.game_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.game_items (
  id bigserial primary key,
  sort_order integer not null default 0,
  name text not null,
  category text not null default '',
  price integer not null default 0,
  icon text not null default '🎁',
  required boolean not null default true,
  blurb text not null default '',
  effect jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.game_tiles (
  id bigserial primary key,
  sort_order integer not null default 0,
  name text not null,
  short_name text not null default '',
  kind text not null default 'neutral',
  color_key text not null default '',
  icon text not null default '',
  description text not null default '',
  amount integer not null default 0,
  price integer not null default 0,
  card_group text,
  item_id bigint references public.game_items(id) on delete set null,
  skip_turns integer not null default 0,
  move_steps integer not null default 0,
  effect jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.game_cards (
  id bigserial primary key,
  card_group text not null default 'chance',
  title text not null,
  body text not null default '',
  amount integer not null default 0,
  skip_turns integer not null default 0,
  move_steps integer not null default 0,
  item_id bigint references public.game_items(id) on delete set null,
  effect jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby',
  host_player_id uuid,
  turn_index integer not null default 0,
  turn_no integer not null default 1,
  last_roll integer,
  created_at timestamptz not null default now()
);

create table public.room_players (
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

create table public.room_logs (
  id bigserial primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  entry text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_game_items_sort_order on public.game_items(sort_order);
create index idx_game_tiles_sort_order on public.game_tiles(sort_order);
create index idx_room_players_room_id on public.room_players(room_id);
create index idx_room_logs_room_id on public.room_logs(room_id);

insert into public.game_config (key, value)
values
  ('game_title', '{"value":"Gazdálkodj Pajkosan"}'),
  ('game_subtitle', '{"value":"Egyszerű, vicces felnőttes paródia társasjáték."}'),
  ('currency_name', '{"value":"Ft"}'),
  ('starting_money', '{"value":3000}'),
  ('start_bonus', '{"value":400}'),
  ('win_money', '{"value":10000}'),
  ('required_items', '{"value":4}'),
  ('center_text', '{"value":"Szedd össze a szükséges tárgyakat vagy gyűjts elég pénzt."}'),
  ('lobby_note', '{"value":"Az egész csak poén, társasjátékos paródia hangulattal."}');

insert into public.game_items (id, sort_order, name, category, price, icon, required, blurb, effect)
values
  (1, 0, 'Szatén párna', 'szoba', 450, '🛏️', true, 'A hangulat alapja.', '{}'),
  (2, 1, 'Parfüm', 'stílus', 650, '🧴', true, 'Ettől minden kacérabb.', '{}'),
  (3, 2, 'Pezsgő', 'ital', 900, '🍾', true, 'Koccintós kellék.', '{}'),
  (4, 3, 'Rózsaszirmok', 'romantika', 550, '🌹', true, 'Látványos bónusz.', '{}'),
  (5, 4, 'Lepedőszett', 'szoba', 800, '🧺', false, 'Nem kötelező, de illik.', '{}');

select setval(pg_get_serial_sequence('public.game_items', 'id'), coalesce((select max(id) from public.game_items), 1), true);

insert into public.game_tiles (sort_order, name, short_name, kind, color_key, icon, description, amount, price, card_group, item_id, skip_turns, move_steps, effect)
values
  (0, 'Start', 'Start', 'start', 'gold', '💋', 'Indul a játék.', 0, 0, null, null, 0, 0, '{}'),
  (1, 'Flörtös fizetés', 'Fizu', 'money', 'pink', '💸', 'Kapsz egy kis zsebpénzt.', 600, 0, null, null, 0, 0, '{}'),
  (2, 'Pikáns kártya', 'Kártya', 'card', 'pink', '💌', 'Húzz egy lapot.', 0, 0, 'chance', null, 0, 0, '{}'),
  (3, 'Szatén bolt', 'Bolt', 'shop', 'gold', '🛏️', 'Szatén párna vásárlás.', 0, 450, null, 1, 0, 0, '{}'),
  (4, 'Kínos lebukás', 'Bünti', 'money', 'danger', '🙈', 'Váratlan kiadás.', -350, 0, null, null, 0, 0, '{}'),
  (5, 'Lazuló sarok', 'Pihi', 'neutral', 'violet', '😌', 'Semmi extra.', 0, 0, null, null, 0, 0, '{}'),
  (6, 'Félreértés', 'Skip', 'skip', 'danger', '😵', '1 kör kimaradás.', 1, 0, null, null, 1, 0, '{}'),
  (7, 'Pikáns kártya', 'Kártya', 'card', 'pink', '💌', 'Még egy húzás.', 0, 0, 'chance', null, 0, 0, '{}'),
  (8, 'Parfüm pult', 'Bolt', 'shop', 'gold', '🧴', 'Parfüm vásárlás.', 0, 650, null, 2, 0, 0, '{}'),
  (9, 'Rajongói borravaló', 'Bónusz', 'money', 'gold', '💰', 'Extra pénz.', 800, 0, null, null, 0, 0, '{}'),
  (10, 'Gyors randistart', '+2', 'move', 'violet', '🏃', 'Lépj előre kettőt.', 2, 0, null, null, 0, 2, '{}'),
  (11, 'Pezsgő sarok', 'Bolt', 'shop', 'gold', '🍾', 'Pezsgő vásárlás.', 0, 900, null, 3, 0, 0, '{}'),
  (12, 'Pikáns kártya', 'Kártya', 'card', 'pink', '💌', 'Újabb lap.', 0, 0, 'chance', null, 0, 0, '{}'),
  (13, 'Adó és dráma', 'Adó', 'money', 'danger', '🧾', 'Fizesd ki.', -700, 0, null, null, 0, 0, '{}'),
  (14, 'Rózsás bolt', 'Bolt', 'shop', 'gold', '🌹', 'Rózsaszirmok vásárlás.', 0, 550, null, 4, 0, 0, '{}'),
  (15, 'Vakmerő siker', 'Jutalom', 'money', 'pink', '🔥', 'Szép kör volt.', 1200, 0, null, null, 0, 0, '{}'),
  (16, 'Vissza a valóságba', '-2', 'move', 'violet', '↩️', 'Lépj vissza kettőt.', -2, 0, null, null, 0, -2, '{}'),
  (17, 'Pikáns kártya', 'Kártya', 'card', 'pink', '💌', 'Húzz még.', 0, 0, 'chance', null, 0, 0, '{}'),
  (18, 'Lepedő bolt', 'Bolt', 'shop', 'gold', '🧺', 'Lepedőszett vásárlás.', 0, 800, null, 5, 0, 0, '{}'),
  (19, 'Show végén kassza', 'Kassza', 'money', 'pink', '🎉', 'Újabb pénz.', 1000, 0, null, null, 0, 0, '{}');

insert into public.game_cards (card_group, title, body, amount, skip_turns, move_steps, item_id, effect)
values
  ('chance', 'Pezsgős koccintás', 'Kapsz egy kis plusz pénzt.', 700, 0, 0, null, '{}'),
  ('chance', 'Kínos üzenet', 'Befizetsz egy váratlan büntit.', -500, 0, 0, null, '{}'),
  ('chance', 'Sikeres nyitás', 'Lépj előre 3 mezőt.', 0, 0, 3, null, '{}'),
  ('chance', 'Megfázott romantika', '1 kör kimaradás.', 0, 1, 0, null, '{}'),
  ('chance', 'Ajándék rózsa', 'Kaptál egy tárgyat.', 0, 0, 0, 4, '{}');

alter table public.game_config enable row level security;
alter table public.game_items enable row level security;
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
  if not exists (select 1 from pg_policies where tablename = 'game_items' and policyname = 'Public full access game_items') then
    create policy "Public full access game_items" on public.game_items for all using (true) with check (true);
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
