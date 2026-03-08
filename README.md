# Gazdálkodj Pajkosan

## Gyors javítás frissítés után

Ha ilyen hibát kapsz, hogy egy oszlop hiányzik (`accent_color`, `item_id`, `pending_payload` stb.), akkor a **Supabase SQL Editorban** futtasd le a zipben lévő **`sql/migrate_v4.sql`** fájlt.

Ha teljesen tiszta újrakezdést akarsz, futtasd le inkább a **`sql/reset_full_schema.sql`** fájlt.

# Gazdálkodj Pajkosan - GitHub Pages starter

Ez egy alap multiplayer társasjáték starter GitHub Pages + Supabase felállásra.

## Mi van benne?
- külön lobby és külön játéktér
- egyszerűbb, társasjátékos kinézet
- dobókocka animációval
- adminból szerkeszthető:
  - globális beállítások
  - tárgyak
  - mezők
  - kártyák

## Beüzemelés
1. Supabase projekt létrehozása
2. `sql/migrate_v2.sql` futtatása a meglévő projektre
   - vagy tiszta induláshoz `sql/reset_full_schema.sql`
3. `assets/config.js` kitöltése a saját Project URL-lel és Publishable / anon key-jel
4. fájlok feltöltése GitHub repo-ba
5. GitHub Pages bekapcsolása

## Fontos
A zipben lévő `assets/config.js` csak minta. Ha már van sajátod, ne írd felül.
