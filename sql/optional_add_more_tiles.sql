-- Opcionális: ha adatbázisban is 32 mezőt akarsz látni, ezt futtasd le a Supabase SQL Editorban.
-- Nem kötelező, a frontend enélkül is 32 mezőre egészíti ki a táblát helyi mintából.

insert into public.game_tiles (sort_order, name, short_name, kind, color_key, icon, description, amount, price, card_group, item_id, skip_turns, move_steps, effect)
select * from (
  values
    (20, 'Kacér kassza', 'Kassza', 'money', 'pink', '💸', 'Apró plusz pénz.', 500, 0, null, null, 0, 0, '{}'::jsonb),
    (21, 'Pletykasarok', 'Pletyka', 'skip', 'danger', '🫢', 'Pletyka miatt kimaradsz.', 1, 0, null, null, 1, 0, '{}'::jsonb),
    (22, 'Randi ügynök', '+2', 'move', 'violet', '💃', 'Lépj előre kettőt.', 2, 0, null, null, 0, 2, '{}'::jsonb),
    (23, 'Pikáns kártya', 'Kártya', 'card', 'pink', '💌', 'Húzz lapot.', 0, 0, 'chance', null, 0, 0, '{}'::jsonb),
    (24, 'Árnyfény pult', 'Bolt', 'shop', 'gold', '🕯️', 'Hangulatfény vásárlás.', 0, 780, null, 5, 0, 0, '{}'::jsonb),
    (25, 'Kínos számla', 'Számla', 'money', 'danger', '🧾', 'Fizesd ki.', -450, 0, null, null, 0, 0, '{}'::jsonb),
    (26, 'Pikáns kártya', 'Kártya', 'card', 'pink', '💌', 'Még egy húzás.', 0, 0, 'chance', null, 0, 0, '{}'::jsonb),
    (27, 'Duett bónusz', 'Bónusz', 'money', 'green', '🎶', 'Kapsz egy bónuszt.', 950, 0, null, null, 0, 0, '{}'::jsonb),
    (28, 'Túl sok üzenet', 'Skip', 'skip', 'danger', '📵', '1 kör kimaradás.', 1, 0, null, null, 1, 0, '{}'::jsonb),
    (29, 'Visszafordító csók', '-2', 'move', 'violet', '↩️', 'Lépj vissza kettőt.', -2, 0, null, null, 0, -2, '{}'::jsonb),
    (30, 'Titkos boríték', 'Kártya', 'card', 'pink', '💌', 'Újabb kártya.', 0, 0, 'chance', null, 0, 0, '{}'::jsonb),
    (31, 'Éjféli kassza', 'Kassza', 'money', 'gold', '🌙', 'Szép kis plusz.', 1100, 0, null, null, 0, 0, '{}'::jsonb)
) as v(sort_order, name, short_name, kind, color_key, icon, description, amount, price, card_group, item_id, skip_turns, move_steps, effect)
where not exists (
  select 1 from public.game_tiles gt where gt.sort_order = v.sort_order
);
