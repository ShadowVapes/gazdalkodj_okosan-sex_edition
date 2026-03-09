create extension if not exists pgcrypto;

create table if not exists public.game_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.game_items (
  id bigserial primary key,
  sort_order integer not null default 0,
  name text not null default '',
  category text not null default '',
  price integer not null default 0,
  icon text not null default '🎁',
  required boolean not null default true,
  blurb text not null default '',
  image_url text not null default '',
  accent_color text not null default '',
  text_color text not null default '',
  effect jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.game_tiles (
  id bigserial primary key,
  sort_order integer not null default 0,
  name text not null default '',
  short_name text not null default '',
  kind text not null default 'neutral',
  color_key text not null default '',
  icon text not null default '',
  description text not null default '',
  amount integer not null default 0,
  price integer not null default 0,
  card_group text,
  item_id bigint,
  skip_turns integer not null default 0,
  move_steps integer not null default 0,
  image_url text not null default '',
  accent_color text not null default '',
  text_color text not null default '',
  effect jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.game_cards (
  id bigserial primary key,
  card_group text not null default 'chance',
  title text not null default '',
  body text not null default '',
  amount integer not null default 0,
  skip_turns integer not null default 0,
  move_steps integer not null default 0,
  item_id bigint,
  icon text not null default '💌',
  image_url text not null default '',
  accent_color text not null default '',
  text_color text not null default '',
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
  phase text not null default 'roll',
  pending_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null default '',
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
  entry text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.game_items add column if not exists sort_order integer not null default 0;
alter table public.game_items add column if not exists category text not null default '';
alter table public.game_items add column if not exists price integer not null default 0;
alter table public.game_items add column if not exists icon text not null default '🎁';
alter table public.game_items add column if not exists required boolean not null default true;
alter table public.game_items add column if not exists blurb text not null default '';
alter table public.game_items add column if not exists image_url text not null default '';
alter table public.game_items add column if not exists accent_color text not null default '';
alter table public.game_items add column if not exists text_color text not null default '';
alter table public.game_items add column if not exists effect jsonb not null default '{}'::jsonb;

alter table public.game_tiles add column if not exists short_name text not null default '';
alter table public.game_tiles add column if not exists kind text not null default 'neutral';
alter table public.game_tiles add column if not exists color_key text not null default '';
alter table public.game_tiles add column if not exists icon text not null default '';
alter table public.game_tiles add column if not exists description text not null default '';
alter table public.game_tiles add column if not exists amount integer not null default 0;
alter table public.game_tiles add column if not exists price integer not null default 0;
alter table public.game_tiles add column if not exists card_group text;
alter table public.game_tiles add column if not exists item_id bigint;
alter table public.game_tiles add column if not exists skip_turns integer not null default 0;
alter table public.game_tiles add column if not exists move_steps integer not null default 0;
alter table public.game_tiles add column if not exists image_url text not null default '';
alter table public.game_tiles add column if not exists accent_color text not null default '';
alter table public.game_tiles add column if not exists text_color text not null default '';
alter table public.game_tiles add column if not exists effect jsonb not null default '{}'::jsonb;

alter table public.game_cards add column if not exists card_group text not null default 'chance';
alter table public.game_cards add column if not exists title text not null default '';
alter table public.game_cards add column if not exists body text not null default '';
alter table public.game_cards add column if not exists amount integer not null default 0;
alter table public.game_cards add column if not exists skip_turns integer not null default 0;
alter table public.game_cards add column if not exists move_steps integer not null default 0;
alter table public.game_cards add column if not exists item_id bigint;
alter table public.game_cards add column if not exists icon text not null default '💌';
alter table public.game_cards add column if not exists image_url text not null default '';
alter table public.game_cards add column if not exists accent_color text not null default '';
alter table public.game_cards add column if not exists text_color text not null default '';
alter table public.game_cards add column if not exists effect jsonb not null default '{}'::jsonb;

alter table public.rooms add column if not exists host_player_id uuid;
alter table public.rooms add column if not exists turn_index integer not null default 0;
alter table public.rooms add column if not exists turn_no integer not null default 1;
alter table public.rooms add column if not exists last_roll integer;
alter table public.rooms add column if not exists phase text not null default 'roll';
alter table public.rooms add column if not exists pending_payload jsonb not null default '{}'::jsonb;

alter table public.room_players add column if not exists seat_no integer not null default 0;
alter table public.room_players add column if not exists position integer not null default 0;
alter table public.room_players add column if not exists money integer not null default 0;
alter table public.room_players add column if not exists skip_turns integer not null default 0;
alter table public.room_players add column if not exists inventory jsonb not null default '[]'::jsonb;
alter table public.room_players add column if not exists is_host boolean not null default false;

create index if not exists idx_game_items_sort_order on public.game_items(sort_order);
create index if not exists idx_game_tiles_sort_order on public.game_tiles(sort_order);
create index if not exists idx_room_players_room_id on public.room_players(room_id);
create index if not exists idx_room_logs_room_id on public.room_logs(room_id);

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public' and table_name = 'game_tiles' and constraint_name = 'game_tiles_item_id_fkey'
  ) then
    alter table public.game_tiles
      add constraint game_tiles_item_id_fkey foreign key (item_id) references public.game_items(id) on delete set null;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public' and table_name = 'game_cards' and constraint_name = 'game_cards_item_id_fkey'
  ) then
    alter table public.game_cards
      add constraint game_cards_item_id_fkey foreign key (item_id) references public.game_items(id) on delete set null;
  end if;
end $$;

insert into public.game_config (key, value)
values
  ('event_overlay_ms', '{"value":3200}'),
  ('card_overlay_ms', '{"value":3200}'),
  ('min_board_tiles', '{"value":72}'),
  ('board_cols', '{"value":18}'),
  ('board_rows', '{"value":11}'),
  ('roll_sync_delay_ms', '{"value":1000}'),
  ('dice_animation_ms', '{"value":1150}'),
  ('pawn_step_ms', '{"value":180}')
on conflict (key) do update set value = excluded.value;

insert into public.game_items (sort_order, name, category, price, icon, required, blurb, accent_color, text_color, effect)
select * from (
  values
    (6, 'Hangfal', 'party', 980, '🔊', false, 'Kell a jó zene.', '#dbe8ff', '#311814', '{}'::jsonb),
    (7, 'Csokidoboz', 'ajándék', 520, '🍫', false, 'Olcsó, de hatásos.', '#f7e7b1', '#311814', '{}'::jsonb),
    (8, 'Gyertyaszett', 'hangulat', 610, '🕯️', false, 'Több fény, több hangulat.', '#f4e2bb', '#311814', '{}'::jsonb),
    (9, 'Pléd', 'kényelem', 430, '🧸', false, 'Kuckózós bónusz.', '#efe5ff', '#311814', '{}'::jsonb),
    (10, 'Szelfibot', 'fun', 390, '🤳', false, 'A dokumentáció fontos.', '#ffd8e8', '#311814', '{}'::jsonb),
    (11, 'Ajándékdoboz', 'meglepi', 740, '🎁', false, 'Mindig jól jön.', '#dff2d2', '#311814', '{}'::jsonb)
) as seed(sort_order, name, category, price, icon, required, blurb, accent_color, text_color, effect)
where not exists (
  select 1 from public.game_items gi where lower(gi.name) = lower(seed.name)
);
