
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
  required boolean not null default false,
  blurb text not null default '',
  image_url text not null default '',
  accent_color text not null default '',
  text_color text not null default '',
  effect jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.game_tiles (
  id bigserial primary key,
  sort_order integer not null default 0,
  name text not null,
  short_name text not null default '',
  kind text not null default 'neutral',
  icon text not null default '⬢',
  description text not null default '',
  amount integer not null default 0,
  skip_turns integer not null default 0,
  move_steps integer not null default 0,
  card_group text not null default 'chance',
  item_id bigint references public.game_items(id) on delete set null,
  board_x integer not null default 0,
  board_y integer not null default 0,
  next_tile_id bigint,
  image_url text not null default '',
  accent_color text not null default '',
  text_color text not null default '',
  effect jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.game_cards (
  id bigserial primary key,
  sort_order integer not null default 0,
  card_group text not null default 'chance',
  title text not null,
  body text not null default '',
  amount integer not null default 0,
  skip_turns integer not null default 0,
  move_steps integer not null default 0,
  item_id bigint references public.game_items(id) on delete set null,
  icon text not null default '💌',
  image_url text not null default '',
  accent_color text not null default '',
  text_color text not null default '',
  effect jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.game_tiles
  add constraint game_tiles_next_tile_id_fkey
  foreign key (next_tile_id) references public.game_tiles(id) on delete set null;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby',
  host_client_id text not null,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  client_id text not null,
  name text not null,
  seat_no integer not null default 0,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(room_id, client_id)
);

create index idx_game_items_sort on public.game_items(sort_order, id);
create index idx_game_tiles_sort on public.game_tiles(sort_order, id);
create index idx_game_cards_sort on public.game_cards(sort_order, id);
create index idx_room_players_room on public.room_players(room_id, seat_no);
create index idx_rooms_code on public.rooms(code);

insert into public.game_config(key, value) values
('game_title', '{"value":"Gazdálkodj Pajkosan"}'),
('game_subtitle', '{"value":"Tiszta újraépített multiplayer társas, jobb adminnal és stabilabb körlogikával."}'),
('currency_name', '{"value":"Ft"}'),
('starting_money', '{"value":3000}'),
('start_pass_bonus', '{"value":400}'),
('start_land_bonus', '{"value":800}'),
('win_money', '{"value":12000}'),
('required_items_to_win', '{"value":4}'),
('board_cols', '{"value":12}'),
('board_rows', '{"value":12}'),
('event_overlay_ms', '{"value":2600}'),
('pawn_step_ms', '{"value":220}'),
('dice_animation_ms', '{"value":900}'),
('poll_ms', '{"value":750}');

insert into public.game_items(id, sort_order, name, category, price, icon, required, blurb, accent_color, text_color) values
(1, 1, 'Szatén párna', 'háló', 450, '🛏️', true, 'Alapkellék.', '#7d6126', '#fff7df'),
(2, 2, 'Parfüm', 'stílus', 650, '🧴', true, 'Mindig jól jön.', '#6a2d55', '#fff0fa'),
(3, 3, 'Pezsgő', 'ital', 900, '🍾', true, 'Koccintós kellék.', '#315c3e', '#ecfff2'),
(4, 4, 'Rózsaszirmok', 'romantika', 550, '🌹', true, 'Látványra erős.', '#683444', '#ffeef3'),
(5, 5, 'Hangulatfény', 'hangulat', 780, '🕯️', false, 'Extra plusz.', '#4a4186', '#f5f0ff'),
(6, 6, 'Lepedőszett', 'háló', 800, '🧺', false, 'Hasznos kiegészítő.', '#32476f', '#eef5ff'),
(7, 7, 'Masszázsolaj', 'wellness', 720, '🧴', false, 'Finom bónusz.', '#24427e', '#eef5ff'),
(8, 8, 'Csokidesszert', 'kaja', 520, '🍫', false, 'Édes ráadás.', '#8a6620', '#fff3d0');

select setval(pg_get_serial_sequence('public.game_items', 'id'), (select max(id) from public.game_items), true);

insert into public.game_tiles(id, sort_order, name, short_name, kind, icon, description, amount, skip_turns, move_steps, card_group, item_id, board_x, board_y, image_url, accent_color, text_color, effect) values
(1, 1, 'Start', 'START', 'start', '🚩', 'Innen indul minden.', 0, 0, 0, 'chance', null, 0, 0, '', '#8a6620', '#fff3d0', '{}'::jsonb),
(2, 2, 'Napi bevétel', 'BEV', 'money', '💸', 'Kis pénz érkezik.', 650, 0, 0, 'chance', null, 1, 0, '', '#315c3e', '#ecfff2', '{}'::jsonb),
(3, 3, 'Chance', 'PAKLI', 'card', '💌', 'Húzz egy lapot.', 0, 0, 0, 'chance', null, 2, 0, '', '#6a2d55', '#fff0fa', '{}'::jsonb),
(4, 4, 'Szatén bolt', 'BOLT', 'shop', '🛏️', 'Itt lehet vásárolni.', 0, 0, 0, 'chance', null, 3, 0, '', '#7d6126', '#fff7df', '{"buy_item_ids":[1,5,6],"buy_pick_limit":1}'::jsonb),
(5, 5, 'Váratlan kiadás', 'BÜNTI', 'money', '🙈', 'Kellemetlen költség.', -400, 0, 0, 'chance', null, 4, 0, '', '#683444', '#ffeef3', '{}'::jsonb),
(6, 6, 'Ajándék polc', 'AJI', 'neutral', '🎁', 'Kapsz valami hasznosat.', 0, 0, 0, 'chance', null, 5, 0, '', '#4a4186', '#f5f0ff', '{"gift_item_ids":[5,7,8],"gift_count":1}'::jsonb),
(7, 7, 'Kimaradsz', 'SKIP', 'skip', '😵', '1 körből kimaradsz.', 0, 1, 0, 'chance', null, 6, 0, '', '#683444', '#ffeef3', '{}'::jsonb),
(8, 8, 'Gyorsító', '+2', 'move', '🏃', 'Lépj előre 2 mezőt.', 0, 0, 2, 'chance', null, 7, 0, '', '#4a4186', '#f5f0ff', '{}'::jsonb),
(9, 9, 'Parfüm bolt', 'BOLT', 'shop', '🧴', 'Illatos vásárlás.', 0, 0, 0, 'chance', null, 8, 0, '', '#7d6126', '#fff7df', '{"buy_item_ids":[2,7,8],"buy_pick_limit":2}'::jsonb),
(10, 10, 'Rajongói borravaló', 'BÓNUSZ', 'money', '💰', 'Szépen termeltél.', 900, 0, 0, 'chance', null, 9, 0, '', '#315c3e', '#ecfff2', '{}'::jsonb),
(11, 11, 'Még egy kártya', 'PAKLI', 'card', '💌', 'Újabb húzás.', 0, 0, 0, 'chance', null, 10, 0, '', '#6a2d55', '#fff0fa', '{}'::jsonb),
(12, 12, 'Pezsgő bolt', 'BOLT', 'shop', '🍾', 'Megveheted a pezsgőt.', 0, 0, 0, 'chance', null, 11, 0, '', '#7d6126', '#fff7df', '{"buy_item_ids":[3],"buy_pick_limit":1}'::jsonb),
(13, 13, 'Fals start', '-2', 'move', '↩️', 'Lépj vissza 2 mezőt.', 0, 0, -2, 'chance', null, 11, 1, '', '#4a4186', '#f5f0ff', '{}'::jsonb),
(14, 14, 'Lazuló sarok', 'PIHI', 'neutral', '😌', 'Semmi extra.', 0, 0, 0, 'chance', null, 11, 2, '', '#32476f', '#eef5ff', '{}'::jsonb),
(15, 15, 'Rózsás bolt', 'BOLT', 'shop', '🌹', 'Válassz romantikus cuccot.', 0, 0, 0, 'chance', null, 11, 3, '', '#7d6126', '#fff7df', '{"buy_item_ids":[4,8],"buy_pick_limit":1}'::jsonb),
(16, 16, 'Kártya', 'PAKLI', 'card', '💌', 'Pakli mező.', 0, 0, 0, 'chance', null, 11, 4, '', '#6a2d55', '#fff0fa', '{}'::jsonb),
(17, 17, 'Ajándék csomag', 'AJI', 'neutral', '📦', 'Több ajándék is lehet benne.', 0, 0, 0, 'chance', null, 11, 5, '', '#32476f', '#eef5ff', '{"gift_item_ids":[6,7,8],"gift_count":2}'::jsonb),
(18, 18, 'Nagy bünti', 'ADÓ', 'money', '🧾', 'Ez most fájni fog.', -750, 0, 0, 'chance', null, 11, 6, '', '#683444', '#ffeef3', '{}'::jsonb),
(19, 19, 'Bónusz', 'PLUSZ', 'money', '🔥', 'Meglepően jó kör.', 1100, 0, 0, 'chance', null, 11, 7, '', '#315c3e', '#ecfff2', '{}'::jsonb),
(20, 20, 'Kártya', 'PAKLI', 'card', '💌', 'Húzz a pakliból.', 0, 0, 0, 'chance', null, 11, 8, '', '#6a2d55', '#fff0fa', '{}'::jsonb),
(21, 21, 'Masszázs bolt', 'BOLT', 'shop', '🧴', 'Többféle cuccból is választhatsz.', 0, 0, 0, 'chance', null, 11, 9, '', '#7d6126', '#fff7df', '{"buy_item_ids":[5,6,7,8],"buy_pick_limit":2}'::jsonb),
(22, 22, 'Kimaradás 2', 'SKIP', 'skip', '🥴', '2 kör kimaradás.', 0, 2, 0, 'chance', null, 11, 10, '', '#683444', '#ffeef3', '{}'::jsonb),
(23, 23, 'Hátra egyet', '-1', 'move', '↩️', 'Lépj vissza 1 mezőt.', 0, 0, -1, 'chance', null, 11, 11, '', '#4a4186', '#f5f0ff', '{}'::jsonb),
(24, 24, 'Pénzeső', 'CASH', 'money', '🪙', 'Kapsz még egy kis bónuszt.', 700, 0, 0, 'chance', null, 10, 11, '', '#315c3e', '#ecfff2', '{}'::jsonb),
(25, 25, 'Kártya', 'PAKLI', 'card', '💌', 'Húzz lapot.', 0, 0, 0, 'chance', null, 9, 11, '', '#6a2d55', '#fff0fa', '{}'::jsonb),
(26, 26, 'Minden bolt', 'BOLT', 'shop', '🛍️', 'Szinte bármit vehetsz.', 0, 0, 0, 'chance', null, 8, 11, '', '#7d6126', '#fff7df', '{"buy_all_items":true,"buy_pick_limit":1}'::jsonb),
(27, 27, 'Ajándék mindenből', 'AJI', 'neutral', '🎉', 'Mindenből eshet valami.', 0, 0, 0, 'chance', null, 7, 11, '', '#32476f', '#eef5ff', '{"gift_all_items":true,"gift_count":1}'::jsonb),
(28, 28, 'Lépj előre 3', '+3', 'move', '➡️', 'Lépj előre 3 mezőt.', 0, 0, 3, 'chance', null, 6, 11, '', '#4a4186', '#f5f0ff', '{}'::jsonb),
(29, 29, 'Bünti', 'MINUSZ', 'money', '💥', 'Megint fizetsz.', -550, 0, 0, 'chance', null, 5, 11, '', '#683444', '#ffeef3', '{}'::jsonb),
(30, 30, 'Kártya', 'PAKLI', 'card', '💌', 'Pakli.', 0, 0, 0, 'chance', null, 4, 11, '', '#6a2d55', '#fff0fa', '{}'::jsonb),
(31, 31, 'Jutalom', 'PLUSZ', 'money', '🎊', 'Egy kis pénzjutalom.', 850, 0, 0, 'chance', null, 3, 11, '', '#315c3e', '#ecfff2', '{}'::jsonb),
(32, 32, 'Kényelmi bolt', 'BOLT', 'shop', '🛏️', 'Még több tárgy közül választhatsz.', 0, 0, 0, 'chance', null, 2, 11, '', '#7d6126', '#fff7df', '{"buy_item_ids":[1,2,3,4],"buy_pick_limit":2}'::jsonb),
(33, 33, 'Ajándék kettő', 'AJI', 'neutral', '🎁', 'Két ajándék is jöhet.', 0, 0, 0, 'chance', null, 1, 11, '', '#32476f', '#eef5ff', '{"gift_item_ids":[5,6,7,8],"gift_count":2}'::jsonb),
(34, 34, 'Utolsó pénz', 'CASH', 'money', '💵', 'Utolsó egyenes előtti bónusz.', 1000, 0, 0, 'chance', null, 0, 11, '', '#315c3e', '#ecfff2', '{}'::jsonb),
(35, 35, 'Vissza kettő', '-2', 'move', '↩️', 'Lépj vissza 2 mezőt.', 0, 0, -2, 'chance', null, 0, 10, '', '#4a4186', '#f5f0ff', '{}'::jsonb),
(36, 36, 'Nagy pakli', 'PAKLI', 'card', '💌', 'Húzz a pakliból.', 0, 0, 0, 'chance', null, 0, 9, '', '#6a2d55', '#fff0fa', '{}'::jsonb);

select setval(pg_get_serial_sequence('public.game_tiles', 'id'), (select max(id) from public.game_tiles), true);

update public.game_tiles t
set next_tile_id = coalesce(
  (select id from public.game_tiles nx where nx.sort_order = t.sort_order + 1),
  (select id from public.game_tiles s where s.sort_order = 1)
);

insert into public.game_cards(sort_order, card_group, title, body, amount, skip_turns, move_steps, item_id, icon, accent_color, text_color, effect) values
(1, 'chance', 'Rajongói borravaló', 'Kapsz egy kis plusz pénzt.', 700, 0, 0, null, '💰', '#315c3e', '#ecfff2', '{}'::jsonb),
(2, 'chance', 'Kínos baki', 'Befizetsz egy kellemetlen összeget.', -500, 0, 0, null, '🙈', '#683444', '#ffeef3', '{}'::jsonb),
(3, 'chance', 'Sikeres nyitás', 'Mozogj előre három mezőt.', 0, 0, 3, null, '🚀', '#4a4186', '#f5f0ff', '{}'::jsonb),
(4, 'chance', 'Lefagyás', '1 körből kimaradsz.', 0, 1, 0, null, '🥶', '#683444', '#ffeef3', '{}'::jsonb),
(5, 'chance', 'Ajándék rózsa', 'Kapsz egy romantikus ajándékot.', 0, 0, 0, null, '🌹', '#32476f', '#eef5ff', '{"gift_item_ids":[4],"gift_count":1}'::jsonb),
(6, 'chance', 'Minishop', 'Válassz és vegyél valamit.', 0, 0, 0, null, '🛒', '#7d6126', '#fff7df', '{"buy_item_ids":[1,2,5,6,7,8],"buy_pick_limit":1}'::jsonb),
(7, 'chance', 'Lépj vissza egyet', 'Most visszalépsz.', 0, 0, -1, null, '↩️', '#4a4186', '#f5f0ff', '{}'::jsonb),
(8, 'chance', 'Kapsz két ajándékot', 'Jön két random cucc.', 0, 0, 0, null, '🎁', '#32476f', '#eef5ff', '{"gift_all_items":true,"gift_count":2}'::jsonb),
(9, 'chance', 'Nagy kassza', 'Szép bevétel.', 1200, 0, 0, null, '🎉', '#315c3e', '#ecfff2', '{}'::jsonb),
(10, 'chance', 'Luxus pult', 'Több boltcucc közül vehetsz.', 0, 0, 0, null, '🛍️', '#7d6126', '#fff7df', '{"buy_all_items":true,"buy_pick_limit":2}'::jsonb);

alter table public.game_config enable row level security;
alter table public.game_items enable row level security;
alter table public.game_tiles enable row level security;
alter table public.game_cards enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'game_config' and policyname = 'public_game_config_all') then
    create policy public_game_config_all on public.game_config for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'game_items' and policyname = 'public_game_items_all') then
    create policy public_game_items_all on public.game_items for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'game_tiles' and policyname = 'public_game_tiles_all') then
    create policy public_game_tiles_all on public.game_tiles for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'game_cards' and policyname = 'public_game_cards_all') then
    create policy public_game_cards_all on public.game_cards for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'rooms' and policyname = 'public_rooms_all') then
    create policy public_rooms_all on public.rooms for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'room_players' and policyname = 'public_room_players_all') then
    create policy public_room_players_all on public.room_players for all using (true) with check (true);
  end if;
end $$;
