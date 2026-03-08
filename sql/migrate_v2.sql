create extension if not exists pgcrypto;

create table if not exists public.game_items (
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

alter table public.game_tiles add column if not exists short_name text not null default '';
alter table public.game_tiles add column if not exists color_key text not null default '';
alter table public.game_tiles add column if not exists icon text not null default '';
alter table public.game_tiles add column if not exists description text not null default '';
alter table public.game_tiles add column if not exists item_id bigint;
alter table public.game_tiles add column if not exists skip_turns integer not null default 0;
alter table public.game_tiles add column if not exists move_steps integer not null default 0;

alter table public.game_cards add column if not exists item_id bigint;

alter table public.rooms add column if not exists host_player_id uuid;
alter table public.rooms add column if not exists turn_index integer not null default 0;
alter table public.rooms add column if not exists turn_no integer not null default 1;
alter table public.rooms add column if not exists last_roll integer;

alter table public.room_players add column if not exists seat_no integer not null default 0;
alter table public.room_players add column if not exists inventory jsonb not null default '[]'::jsonb;
alter table public.room_players add column if not exists is_host boolean not null default false;

create table if not exists public.room_logs (
  id bigserial primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  entry text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_game_items_sort_order on public.game_items(sort_order);
create index if not exists idx_game_tiles_sort_order on public.game_tiles(sort_order);
create index if not exists idx_room_players_room_id on public.room_players(room_id);
create index if not exists idx_room_logs_room_id on public.room_logs(room_id);

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'game_tiles'
      and constraint_name = 'game_tiles_item_id_fkey'
  ) then
    alter table public.game_tiles
      add constraint game_tiles_item_id_fkey
      foreign key (item_id) references public.game_items(id) on delete set null;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'game_cards'
      and constraint_name = 'game_cards_item_id_fkey'
  ) then
    alter table public.game_cards
      add constraint game_cards_item_id_fkey
      foreign key (item_id) references public.game_items(id) on delete set null;
  end if;
end $$;

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
  ('lobby_note', '{"value":"Az egész csak poén, társasjátékos paródia hangulattal."}')
on conflict (key) do nothing;

insert into public.game_items (id, sort_order, name, category, price, icon, required, blurb, effect)
values
  (1, 0, 'Szatén párna', 'szoba', 450, '🛏️', true, 'A hangulat alapja.', '{}'),
  (2, 1, 'Parfüm', 'stílus', 650, '🧴', true, 'Ettől minden kacérabb.', '{}'),
  (3, 2, 'Pezsgő', 'ital', 900, '🍾', true, 'Koccintós kellék.', '{}'),
  (4, 3, 'Rózsaszirmok', 'romantika', 550, '🌹', true, 'Látványos bónusz.', '{}'),
  (5, 4, 'Lepedőszett', 'szoba', 800, '🧺', false, 'Nem kötelező, de illik.', '{}')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.game_items', 'id'), greatest(coalesce((select max(id) from public.game_items), 1), 5), true);

update public.game_tiles set short_name = left(name, 10) where coalesce(short_name, '') = '';
update public.game_tiles set icon = case kind
  when 'start' then '💋'
  when 'money' then '💸'
  when 'card' then '💌'
  when 'shop' then '🛍️'
  when 'skip' then '😵'
  when 'move' then '↔️'
  else '✨'
end where coalesce(icon, '') = '';

update public.game_tiles set color_key = case kind
  when 'money' then 'pink'
  when 'card' then 'pink'
  when 'shop' then 'gold'
  when 'skip' then 'danger'
  when 'move' then 'violet'
  when 'start' then 'gold'
  else 'neutral'
end where coalesce(color_key, '') = '';

update public.game_tiles set description = coalesce(description, '') where description is null;

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
