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
alter table public.game_items add column if not exists name text not null default '';
alter table public.game_items add column if not exists category text not null default '';
alter table public.game_items add column if not exists price integer not null default 0;
alter table public.game_items add column if not exists icon text not null default '🎁';
alter table public.game_items add column if not exists required boolean not null default true;
alter table public.game_items add column if not exists blurb text not null default '';
alter table public.game_items add column if not exists image_url text not null default '';
alter table public.game_items add column if not exists accent_color text not null default '';
alter table public.game_items add column if not exists text_color text not null default '';
alter table public.game_items add column if not exists effect jsonb not null default '{}'::jsonb;
alter table public.game_items add column if not exists created_at timestamptz not null default now();

alter table public.game_tiles add column if not exists sort_order integer not null default 0;
alter table public.game_tiles add column if not exists name text not null default '';
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
alter table public.game_tiles add column if not exists created_at timestamptz not null default now();

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
alter table public.game_cards add column if not exists created_at timestamptz not null default now();

alter table public.rooms add column if not exists host_player_id uuid;
alter table public.rooms add column if not exists turn_index integer not null default 0;
alter table public.rooms add column if not exists turn_no integer not null default 1;
alter table public.rooms add column if not exists last_roll integer;
alter table public.rooms add column if not exists phase text not null default 'roll';
alter table public.rooms add column if not exists pending_payload jsonb not null default '{}'::jsonb;
alter table public.rooms add column if not exists created_at timestamptz not null default now();

alter table public.room_players add column if not exists seat_no integer not null default 0;
alter table public.room_players add column if not exists position integer not null default 0;
alter table public.room_players add column if not exists money integer not null default 0;
alter table public.room_players add column if not exists skip_turns integer not null default 0;
alter table public.room_players add column if not exists inventory jsonb not null default '[]'::jsonb;
alter table public.room_players add column if not exists is_host boolean not null default false;
alter table public.room_players add column if not exists created_at timestamptz not null default now();

alter table public.room_logs add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.room_logs add column if not exists created_at timestamptz not null default now();

update public.game_cards set icon = '💌' where coalesce(icon, '') = '';
update public.game_tiles set icon = '✨' where coalesce(icon, '') = '';
update public.game_items set icon = '🎁' where coalesce(icon, '') = '';

insert into public.game_config (key, value)
values
  ('game_title', '{"value":"Gazdálkodj Pajkosan"}'),
  ('game_subtitle', '{"value":"Egyszerű, vicces felnőttes paródia társasjáték."}'),
  ('currency_name', '{"value":"Ft"}'),
  ('starting_money', '{"value":3000}'),
  ('start_bonus', '{"value":400}'),
  ('win_money', '{"value":10000}'),
  ('required_items', '{"value":4}'),
  ('event_overlay_ms', '{"value":3500}'),
  ('card_overlay_ms', '{"value":3500}'),
  ('center_text', '{"value":"Szedd össze a szükséges tárgyakat vagy gyűjts pénzt."}'),
  ('lobby_note', '{"value":"Az egész poén, társasjátékos hangulattal."}')
on conflict (key) do nothing;

create index if not exists idx_game_items_sort_order on public.game_items(sort_order);
create index if not exists idx_game_tiles_sort_order on public.game_tiles(sort_order);
create index if not exists idx_room_players_room_id on public.room_players(room_id);
create index if not exists idx_room_logs_room_id on public.room_logs(room_id);

alter table public.game_config enable row level security;
alter table public.game_items enable row level security;
alter table public.game_tiles enable row level security;
alter table public.game_cards enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_logs enable row level security;

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
