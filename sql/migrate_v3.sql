
create extension if not exists pgcrypto;

alter table public.game_items add column if not exists image_url text not null default '';
alter table public.game_items add column if not exists accent_color text not null default '';
alter table public.game_items add column if not exists text_color text not null default '';

alter table public.game_tiles add column if not exists item_id bigint;
alter table public.game_tiles add column if not exists image_url text not null default '';
alter table public.game_tiles add column if not exists accent_color text not null default '';
alter table public.game_tiles add column if not exists text_color text not null default '';

alter table public.game_cards add column if not exists item_id bigint;
alter table public.game_cards add column if not exists icon text not null default '💌';
alter table public.game_cards add column if not exists image_url text not null default '';
alter table public.game_cards add column if not exists accent_color text not null default '';
alter table public.game_cards add column if not exists text_color text not null default '';

alter table public.rooms add column if not exists phase text not null default 'roll';
alter table public.rooms add column if not exists pending_payload jsonb not null default '{}'::jsonb;

update public.game_cards set icon = '💌' where coalesce(icon, '') = '';

insert into public.game_config (key, value)
values
  ('event_overlay_ms', '{"value":3500}'),
  ('card_overlay_ms', '{"value":3500}')
on conflict (key) do nothing;

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
