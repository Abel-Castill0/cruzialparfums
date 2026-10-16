-- Pre-change record of the Production project (iyxidhglyqkzoziyewlc), taken 2026-10-14 04:19 UTC, BEFORE the commercial-rules and
-- notes migrations. Read-only SELECTs only. It contains no customer data.
--
-- What it is and what it is not:
--   * A FULL logical backup was attempted with scripts/backup-production-db.mjs and could not run: the Supabase CLI access token lacks the
--     `database_write` permission it needs to create the temporary login role (HTTP 403). The most recent full backups are in
--     C:\cruzial-private-backups (latest: 2026-10-11T07-13-47Z, outside OneDrive).
--   * This file covers everything the two migrations can touch. Both are additive (new tables, two new nullable columns on `orders`,
--     new functions). The only EXISTING data they can change is `products.specs->'notes'` of Parfums (the notes mirror), so that column is
--     snapshotted below with an md5 to compare after the change.
--
-- State before the change
--   migration history ........ last version 20261011130000 (search_indexing_setting); the repo's next two are 20261014120000 and 20261014130000
--   new tables present ....... none of: delivery_zones, notes, product_notes, shipping_agencies, promotion_rules
--   orders ................... 1 row; columns: id, business_unit_id, order_number, campaign_id, customer_id, shipping_method_id, channel, status,
--                              customer_snapshot, delivery_snapshot, claimed_customer_status, verified_customer_status_snapshot,
--                              deposit_policy_snapshot, deposit_percentage_snapshot, subtotal_amount, currency, notes, created_at, updated_at,
--                              archived_at, request_id, deposit_amount_snapshot
--                              (the migration adds shipping_cost_cents and gift_product_id; rollback: supabase/rollback/20261014_commercial_rules_rollback.sql)
--   Parfums products ......... 100 (99 with a specs.notes array)
--   notes snapshot md5 ....... 230ace328101a166bfb0a91626e2fd77 over  string_agg(id::text || ':' || (specs->'notes')::text, '|' order by id)
--                              for Parfums products whose specs->'notes' is an array (99 rows)
--
-- To restore the notes column exactly as it was (only needed if the notes mirror ever changed it):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/prod-backup-2026-10-13.sql
-- To check it was not changed:
--   select md5(string_agg(p.id::text || ':' || (p.specs->'notes')::text, '|' order by p.id)) from public.products p
--    where p.business_unit_id = '11111111-1111-4111-8111-111111111111' and jsonb_typeof(p.specs->'notes') = 'array';   -- expect the md5 above

begin;
update public.products set specs = jsonb_set(specs, '{notes}', '["Ciruela", "Avellana", "Ámbar"]'::jsonb) where id = '66a51a6f-d452-4029-b616-fc99b0666ec2'; -- 1-million-lucky
update public.products set specs = jsonb_set(specs, '{notes}', '["Bergamota", "Flor de naranjo", "Madera"]'::jsonb) where id = 'ce153f35-289c-4159-bc9d-4c68ecefe6f9'; -- 212-edt
update public.products set specs = jsonb_set(specs, '{notes}', '["Cítricos", "Acuático", "Ámbar"]'::jsonb) where id = '22cd15ee-0024-4da7-a58b-6a9a1773da76'; -- 9am
update public.products set specs = jsonb_set(specs, '{notes}', '["Acuático", "Verde", "Madera"]'::jsonb) where id = '5d6537b6-d0c8-431b-a2d2-c4069f7cc7cf'; -- 9am-dive
update public.products set specs = jsonb_set(specs, '{notes}', '["Manzana", "Canela", "Vainilla"]'::jsonb) where id = '713bb20d-0fd0-4df5-aaa5-6bb6ab1e7b72'; -- 9pm
update public.products set specs = jsonb_set(specs, '{notes}', '["Vainilla", "Ámbar", "Especias"]'::jsonb) where id = '64359ea2-612f-4874-8394-1d60d507f8bc'; -- 9pm-elixir
update public.products set specs = jsonb_set(specs, '{notes}', '["Especias", "Cuero", "Ámbar"]'::jsonb) where id = 'faf6fd7e-97d4-49d2-9c48-e48baa0c49e8'; -- 9pm-night-out
update public.products set specs = jsonb_set(specs, '{notes}', '["Especias", "Vainilla", "Ámbar"]'::jsonb) where id = 'e65b9b36-c314-41b6-9e95-846e533b2640'; -- 9pm-rebel
update public.products set specs = jsonb_set(specs, '{notes}', '["Marino", "Bergamota", "Madera"]'::jsonb) where id = '12c5df58-11b8-441e-8da6-0a963fe61d8f'; -- adg-profondo-edp
update public.products set specs = jsonb_set(specs, '{notes}', '["Ámbar", "Coco", "Vainilla"]'::jsonb) where id = 'ceb1e90b-24e4-464e-a4f1-412b3eea158c'; -- amber-o-gold-e
update public.products set specs = jsonb_set(specs, '{notes}', '["Vainilla", "Ámbar", "Flores"]'::jsonb) where id = '957e9cb9-22c7-43c0-898b-e07b420ef758'; -- angham
update public.products set specs = jsonb_set(specs, '{notes}', '["Acuático", "Bergamota", "Ámbar"]'::jsonb) where id = 'fdd7577d-409e-47bc-9c1e-11e7fccc8bb5'; -- ao-aqua-dubai
update public.products set specs = jsonb_set(specs, '{notes}', '["Ámbar", "Cuero", "Especias"]'::jsonb) where id = 'c46cab69-c76a-42fd-b4e2-7a9502c39b8b'; -- ao-dubai-night
update public.products set specs = jsonb_set(specs, '{notes}', '["Especias", "Ámbar", "Cuero"]'::jsonb) where id = '1d2af2eb-69a3-4395-8ea6-9b73d4b5bbc2'; -- art-of-universe
update public.products set specs = jsonb_set(specs, '{notes}', '["Ron", "Especias", "Madera"]'::jsonb) where id = '75ef6648-005b-4742-b235-123c56c6ee76'; -- asad-bourbon
update public.products set specs = jsonb_set(specs, '{notes}', '["Especias", "Vainilla", "Ámbar"]'::jsonb) where id = 'd7576dad-86f9-47bb-8b14-865bd2b92b55'; -- asad-clasico
update public.products set specs = jsonb_set(specs, '{notes}', '["Especias", "Café", "Cuero"]'::jsonb) where id = '1efcfaef-3310-424f-9f74-a2ee02e4adbd'; -- asad-elixir
update public.products set specs = jsonb_set(specs, '{notes}', '["Manzana", "Cardamomo", "Ámbar"]'::jsonb) where id = '0fda59a1-7699-40d5-a132-9d556d891813'; -- azzaro-tmw-edp
update public.products set specs = jsonb_set(specs, '{notes}', '["Ron", "Cuero", "Especias"]'::jsonb) where id = '4ac97203-2f9d-40b3-bd8b-e3b9b926c95a'; -- b-man-in-black
update public.products set specs = jsonb_set(specs, '{notes}', '["Especias", "Cuero", "Ámbar"]'::jsonb) where id = '7b82b464-4ebe-4d16-8969-e434989788e3'; -- bharara-king
update public.products set specs = jsonb_set(specs, '{notes}', '["Romero", "Cedro", "Ámbar"]'::jsonb) where id = '27d34a9a-1671-44a9-beaa-6f970aa0f437'; -- bir-intense
update public.products set specs = jsonb_set(specs, '{notes}', '["Melocotón", "Flores", "Vainilla"]'::jsonb) where id = '25e6476b-6ae0-42db-9865-323d4847ca26'; -- bright-peach
update public.products set specs = jsonb_set(specs, '{notes}', '["Castaña", "Vainilla", "Madera"]'::jsonb) where id = '8d485a67-9a74-4dff-8149-651c866d72f3'; -- by-the-fireplace
update public.products set specs = jsonb_set(specs, '{notes}', '["Piña", "Abedul", "Ámbar"]'::jsonb) where id = 'aefbf332-4297-4bc2-bc51-c88c5480698a'; -- cdn-intense-man
update public.products set specs = jsonb_set(specs, '{notes}', '["Piña", "Cedro", "Ámbar"]'::jsonb) where id = '3228ae87-1dae-437e-b6f3-8a901f7cb4ac'; -- cdn-preciux-i
update public.products set specs = jsonb_set(specs, '{notes}', '["Cítricos", "Verde", "Ámbar"]'::jsonb) where id = 'dcdb5a45-9248-4322-bb54-63eab1b8cb28'; -- cdn-urban-man-e
update public.products set specs = jsonb_set(specs, '{notes}', '["Limón", "Cedro", "Almizcle"]'::jsonb) where id = 'cc019a6e-d351-4eaf-9097-058d2c8e434e'; -- cedrat-boise-int
update public.products set specs = jsonb_set(specs, '{notes}', '["4 fragancias", "Orientales", "Selección"]'::jsonb) where id = '8f9081cb-7b82-4505-914c-74b2ba39fe60'; -- combo-cuarteto
update public.products set specs = jsonb_set(specs, '{notes}', '["Fresco", "Cálido", "Veraniego"]'::jsonb) where id = 'f542a2a7-e9a6-41be-af06-a1fb41e5b88a'; -- combo-tulum
update public.products set specs = jsonb_set(specs, '{notes}', '["Vainilla", "Gourmand", "Dulce"]'::jsonb) where id = '0bb78db1-42d4-49d6-90db-38d8734d2536'; -- combo-vainilla
update public.products set specs = jsonb_set(specs, '{notes}', '["Bergamota", "Agua", "Almizcle"]'::jsonb) where id = '309439db-26fb-4e6c-94af-0fc283cc8fe3'; -- dylan-blue
update public.products set specs = jsonb_set(specs, '{notes}', '["Vainilla", "Caramelo", "Ámbar"]'::jsonb) where id = '5517f0f4-2b67-43bf-9437-a27a7fc1a943'; -- eclaire
update public.products set specs = jsonb_set(specs, '{notes}', '["Plátano", "Caramelo", "Vainilla"]'::jsonb) where id = 'd0a8a7ce-72a5-42fd-aa20-340b533762db'; -- eclaire-banoffi
update public.products set specs = jsonb_set(specs, '{notes}', '["Pistacho", "Vainilla", "Almendra"]'::jsonb) where id = 'defb7efc-98b9-4516-baef-5329d5ee6467'; -- eclaire-pistache
update public.products set specs = jsonb_set(specs, '{notes}', '["Fruta", "Vainilla", "Almizcle"]'::jsonb) where id = 'e33a0155-3df3-4083-a738-39e9c6b2c50a'; -- erba-pura
update public.products set specs = jsonb_set(specs, '{notes}', '["Menta", "Manzana", "Vainilla"]'::jsonb) where id = '14960631-67a9-4480-91ee-a87262f5a84e'; -- eros-edt
update public.products set specs = jsonb_set(specs, '{notes}', '["Mandarina", "Rosas", "Vainilla"]'::jsonb) where id = '790f0ba4-6f72-469b-b5da-dadcd82e5bac'; -- eros-flame
update public.products set specs = jsonb_set(specs, '{notes}', '["Lavanda", "Geranio", "Vainilla"]'::jsonb) where id = '484d5777-9b06-42c0-b59a-cb078525fc0a'; -- fakhar-black
update public.products set specs = jsonb_set(specs, '{notes}', '["Acuático", "Cítricos", "Metálico"]'::jsonb) where id = 'e5480d52-730b-4330-a683-b619c6e17348'; -- hawas-chrome
update public.products set specs = jsonb_set(specs, '{notes}', '["Acuático", "Ámbar", "Especias"]'::jsonb) where id = 'c6ce22b0-7b91-450f-9310-f634f0a4b74d'; -- hawas-elixir
update public.products set specs = jsonb_set(specs, '{notes}', '["Acuático", "Mango", "Ámbar"]'::jsonb) where id = '61c734d0-8bac-4473-9563-2d317776950a'; -- hawas-exotic
update public.products set specs = jsonb_set(specs, '{notes}', '["Especias", "Ámbar", "Madera"]'::jsonb) where id = 'a1b255e1-06c2-402c-9976-21e2125c7260'; -- hawas-fire
update public.products set specs = jsonb_set(specs, '{notes}', '["Acuático", "Menta", "Ámbar"]'::jsonb) where id = '624c2e9e-ee22-490d-b3b4-7794511f0b62'; -- hawas-ice
update public.products set specs = jsonb_set(specs, '{notes}', '["Acuático", "Cítricos", "Ámbar"]'::jsonb) where id = '9290a0a2-9e3b-4e19-9b1e-29829ea17dbe'; -- hawas-kobra
update public.products set specs = jsonb_set(specs, '{notes}', '["Coco", "Fruta tropical", "Ámbar"]'::jsonb) where id = 'e49a2f35-5e00-4384-b46b-26f00176dae4'; -- hawas-tropical
update public.products set specs = jsonb_set(specs, '{notes}', '["Verde", "Acuático", "Cítricos"]'::jsonb) where id = '6348a8ba-03c2-4d59-a5de-402a06eafea5'; -- hawas-verde
update public.products set specs = jsonb_set(specs, '{notes}', '["Bergamota", "Especias", "Ámbar"]'::jsonb) where id = 'd8bb5df7-861e-451c-aae0-df1c0c8a49bd'; -- homme-white
update public.products set specs = jsonb_set(specs, '{notes}', '["Piña", "Caramelo", "Especias"]'::jsonb) where id = 'd333afa1-31fe-4458-b2d9-0f4dc2a4dfc3'; -- honor-and-glory
update public.products set specs = jsonb_set(specs, '{notes}', '["Acuático", "Ámbar", "Madera"]'::jsonb) where id = '89960a3a-d68a-41e8-9853-9c82935688b1'; -- invictus-elixir
update public.products set specs = jsonb_set(specs, '{notes}', '["Bergamota", "Ámbar", "Vainilla"]'::jsonb) where id = '19e4efb9-aa8e-4971-aa02-c052e54076bb'; -- jean-lowe-inmotel
update public.products set specs = jsonb_set(specs, '{notes}', '["Cítricos", "Acuático", "Madera"]'::jsonb) where id = 'b7aac828-2853-4fc8-a07d-4a628093bab1'; -- jean-lowe-vibe
update public.products set specs = jsonb_set(specs, '{notes}', '["Vainilla", "Canela", "Ámbar"]'::jsonb) where id = '65f11a5f-7d30-402c-bc5e-aedf5057a3b6'; -- khamrah-clasico
update public.products set specs = jsonb_set(specs, '{notes}', '["Incienso", "Vainilla", "Humo"]'::jsonb) where id = 'f342df64-892d-4966-912c-2c0c4d71ef36'; -- khamrah-dukhan
update public.products set specs = jsonb_set(specs, '{notes}', '["Café", "Vainilla", "Ámbar"]'::jsonb) where id = '730b355b-6bae-42d4-8a1b-3da01e00dea2'; -- khamrah-qahwa
update public.products set specs = jsonb_set(specs, '{notes}', '["Ámbar", "Coco", "Vainilla"]'::jsonb) where id = '25a600de-8542-4e68-9add-70d4e1a76937'; -- khamrah-waha
update public.products set specs = jsonb_set(specs, '{notes}', '["Coco", "Madera", "Especias"]'::jsonb) where id = '42f14eb1-ba8b-4339-a393-45c4e7d252e5'; -- le-beau-le-parfum
update public.products set specs = jsonb_set(specs, '{notes}', '["Miel", "Canela", "Tabaco"]'::jsonb) where id = '2b5c73d9-71f7-42cf-87b8-403ec253aaa1'; -- le-male-elixir
update public.products set specs = jsonb_set(specs, '{notes}', '["Canela", "Ámbar", "Vainilla"]'::jsonb) where id = '9249aaa0-6966-4b0d-92dd-9932eafdfb44'; -- liquid-brun
update public.products set specs = jsonb_set(specs, '{notes}', '["Cereza", "Almendra", "Vainilla"]'::jsonb) where id = '09d74624-c9c4-49b4-ba9c-92044d70ee35'; -- lovely-cherry
update public.products set specs = jsonb_set(specs, '{notes}', '["Tabaco", "Canela", "Ámbar"]'::jsonb) where id = 'a1df8507-e800-436b-8463-0b990861129f'; -- m-red-tobacco
update public.products set specs = jsonb_set(specs, '{notes}', '["Mandarina", "Ámbar", "Cacao"]'::jsonb) where id = '4ae3550f-1c2e-4e0c-9169-e0f03e8eb9d0'; -- m-sky-elixir
update public.products set specs = jsonb_set(specs, '{notes}', '["Madera", "Ámbar", "Cítricos"]'::jsonb) where id = 'dc87fd9f-1bf1-4f47-84ac-baf212819853'; -- m-sky-vintage
update public.products set specs = jsonb_set(specs, '{notes}', '["Mandarina", "Vainilla", "Caramelo"]'::jsonb) where id = '85a65045-7408-467d-85aa-4d0f7abbfdee'; -- mandarin-sky
update public.products set specs = jsonb_set(specs, '{notes}', '["Madera", "Rosas", "Ámbar"]'::jsonb) where id = '1a37780a-bf22-455e-90c7-a03991216cf6'; -- mashrabya
update public.products set specs = jsonb_set(specs, '{notes}', '["Flores blancas", "Ámbar", "Vainilla"]'::jsonb) where id = 'dda30eb2-dbdb-4667-afd9-1e70c6e4cf41'; -- mayar
update public.products set specs = jsonb_set(specs, '{notes}', '["Cereza", "Flores", "Vainilla"]'::jsonb) where id = 'd5fb4271-c500-457f-812d-9bf4b9566389'; -- mayar-cherry-i
update public.products set specs = jsonb_set(specs, '{notes}', '["Marino", "Manzana", "Madera"]'::jsonb) where id = '65a9e7a3-5665-4f0c-a753-da74ff4d01a3'; -- nautica-voyage
update public.products set specs = jsonb_set(specs, '{notes}', '["Frutal", "Acuático", "Ámbar"]'::jsonb) where id = '5adbee37-231c-4435-b05f-4a46d97f688b'; -- nitro-red
update public.products set specs = jsonb_set(specs, '{notes}', '["Acuático", "Cítricos", "Madera"]'::jsonb) where id = '88a0999e-27eb-40ef-80a9-85e63e19607e'; -- odyssey-aqua
update public.products set specs = jsonb_set(specs, '{notes}', '["Especias", "Cuero", "Ámbar"]'::jsonb) where id = 'dba85664-633f-42bf-85a3-5c31ab74ac75'; -- odyssey-artisto
update public.products set specs = jsonb_set(specs, '{notes}', '["Lavanda", "Ámbar", "Madera"]'::jsonb) where id = 'cc026b3c-cfb9-42aa-8ebd-3edcf7f856ab'; -- odyssey-homme
update public.products set specs = jsonb_set(specs, '{notes}', '["Limón", "Cedro", "Menta"]'::jsonb) where id = '7199ff39-af49-4783-bcd3-1b01e6c0a8c0'; -- odyssey-limoni
update public.products set specs = jsonb_set(specs, '{notes}', '["Madera", "Ámbar", "Cítricos"]'::jsonb) where id = 'be7ec50a-4295-4fe0-9116-640f97b56db7'; -- odyssey-mega
update public.products set specs = jsonb_set(specs, '{notes}', '["Acuático", "Jazmín", "Ámbar"]'::jsonb) where id = '0e1ca2a8-b32d-4188-88a5-d37d36b2075b'; -- odyssey-spectra
update public.products set specs = jsonb_set(specs, '{notes}', '["Oud", "Especias", "Ámbar"]'::jsonb) where id = 'c333b6ca-ee53-49c4-9999-a740cd4c40de'; -- oud-for-glory
update public.products set specs = jsonb_set(specs, '{notes}', '["Flores", "Coco", "Ámbar"]'::jsonb) where id = 'a8f5d44f-7a7b-4118-aef0-d48509c8e97f'; -- paradise-garden
update public.products set specs = jsonb_set(specs, '{notes}', '["Violeta", "Flores", "Ámbar"]'::jsonb) where id = '3f2d3947-9ba5-434d-be07-cfdd1ca7db66'; -- purple-melancholia
update public.products set specs = jsonb_set(specs, '{notes}', '["Azafrán", "Madera", "Ámbar"]'::jsonb) where id = '0b7cd49c-5b7a-4a32-b9d8-5389b90e212b'; -- qaed-al-fursan
update public.products set specs = jsonb_set(specs, '{notes}', '["Cítricos", "Especias", "Ámbar"]'::jsonb) where id = 'bde108e7-9561-4db6-8eb2-80ae9b1e463e'; -- rayhaan-italia
update public.products set specs = jsonb_set(specs, '{notes}', '["Frutos rojos", "Vainilla", "Ámbar"]'::jsonb) where id = 'e62f75ad-fd4e-4375-bd83-bbd72f8ab4ea'; -- red-intensely
update public.products set specs = jsonb_set(specs, '{notes}', '["Madera", "Ámbar", "Vainilla"]'::jsonb) where id = '7d30854b-e2fa-4b19-baeb-f583662de9b2'; -- reserve-privee
update public.products set specs = jsonb_set(specs, '{notes}', '["Cedro", "Especias", "Ámbar"]'::jsonb) where id = '0b2657ff-f49c-49e6-bc32-8833fd55e90f'; -- royal-blend-sequoia
update public.products set specs = jsonb_set(specs, '{notes}', '["Bergamota", "Pimienta", "Ámbar"]'::jsonb) where id = 'a09ad0b4-1b04-4856-9838-843d07a9602f'; -- sauvage-edt
update public.products set specs = jsonb_set(specs, '{notes}', '["Madera", "Ámbar", "Especias"]'::jsonb) where id = '8ce4b072-39a3-43f3-a136-5887d49714ff'; -- sceptre-malachite
update public.products set specs = jsonb_set(specs, '{notes}', '["Canela", "Tabaco", "Vainilla"]'::jsonb) where id = '3a86fcfb-20cd-47e8-8366-5e80754d5820'; -- spicebomb-extreme
update public.products set specs = jsonb_set(specs, '{notes}', '["Flores", "Ámbar", "Almizcle"]'::jsonb) where id = 'bb439fd0-2cd3-43a6-a519-2c0040485551'; -- sublime
update public.products set specs = jsonb_set(specs, '{notes}', '["Piña", "Madera", "Ámbar"]'::jsonb) where id = '7b8fbd57-4298-4257-ae1c-7d57756c2240'; -- supremacy-colle
update public.products set specs = jsonb_set(specs, '{notes}', '["Piña", "Cedro", "Almizcle"]'::jsonb) where id = '86a4c8f4-91e8-48dd-a837-a07c475d7d77'; -- supremacy-noi
update public.products set specs = jsonb_set(specs, '{notes}', '["Madera", "Ámbar", "Café"]'::jsonb) where id = 'a36bfbd5-858e-4e91-8454-e18ad8ada36e'; -- swy-absolutely
update public.products set specs = jsonb_set(specs, '{notes}', '["Canela", "Ron", "Vainilla"]'::jsonb) where id = '14d8f2b7-e0fb-46e9-a3e5-6d1f8c3b1336'; -- swy-intensely
update public.products set specs = jsonb_set(specs, '{notes}', '["Manzana", "Toffee", "Ámbar"]'::jsonb) where id = '0e3f101e-8f65-4c3e-bbbd-872b601d1f53'; -- tmw-parfum
update public.products set specs = jsonb_set(specs, '{notes}', '["Pera", "Vainilla", "Lavanda"]'::jsonb) where id = '73bffdfc-e2bc-4c54-8903-de504b929127'; -- ultra-male
update public.products set specs = jsonb_set(specs, '{notes}', '["Especias", "Ámbar", "Café"]'::jsonb) where id = '9169ad80-a9e7-405c-b4e2-62ae3838f3b2'; -- victory-elixir
update public.products set specs = jsonb_set(specs, '{notes}', '["Fuego", "Especias", "Ámbar"]'::jsonb) where id = 'd8320c1f-665e-45cc-bff0-3b6bd1173b3a'; -- vulcan-feu
update public.products set specs = jsonb_set(specs, '{notes}', '["Algodón dulce", "Fresa", "Vainilla"]'::jsonb) where id = 'c234de67-5d7a-4b45-914b-a14876866e66'; -- yara-candy
update public.products set specs = jsonb_set(specs, '{notes}', '["Flores blancas", "Ámbar", "Vainilla"]'::jsonb) where id = '06db979a-4628-44ae-b29b-3cca3d90f23d'; -- yara-elixir
update public.products set specs = jsonb_set(specs, '{notes}', '["Flores", "Frutos rojos", "Vainilla"]'::jsonb) where id = 'b0fee19f-9bf4-46c9-b156-85f008e3bc9d'; -- yara-pink
update public.products set specs = jsonb_set(specs, '{notes}', '["Praliné", "Flores", "Vainilla"]'::jsonb) where id = 'a5f7e420-b15a-4bcb-8048-c9b2c1cfd6e7'; -- yum-yum
update public.products set specs = jsonb_set(specs, '{notes}', '["Madera", "Ámbar", "Especias"]'::jsonb) where id = '22dd8575-f478-4ed5-8838-59cbf7d52085'; -- zanzibar-limited-e
commit;
