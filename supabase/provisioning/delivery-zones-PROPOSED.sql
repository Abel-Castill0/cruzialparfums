-- PROPOSED — NOT APPLIED. Cruzial Parfums motorcycle delivery zones (Lima Metropolitana, 43 districts).
-- The owner validates this list (docs/commercial-rules.md, section "Propuesta de zonas") BEFORE it is run anywhere.
--
-- Rule decided 2026-10-14: Centro de Lima + Ate + Villa El Salvador + Carabayllo + the districts in between are covered;
-- everything else is is_restricted = true. A restricted district only disables the motorcycle option (Shalom stays
-- available and the order can always be completed).
--
-- Covered (30): Ate, Barranco, Breña, Carabayllo, Cercado de Lima, Chorrillos, Comas, El Agustino, Independencia, Jesús María, La Molina, La Victoria, Lince, Los Olivos, Magdalena del Mar, Miraflores, Pueblo Libre, Rímac, San Borja, San Isidro, San Juan de Lurigancho, San Juan de Miraflores, San Luis, San Martín de Porres, San Miguel, Santa Anita, Santiago de Surco, Surquillo, Villa El Salvador, Villa María del Triunfo
-- Restricted (13): Ancón, Santa Rosa, Puente Piedra, Chaclacayo, Lurigancho-Chosica, Cieneguilla, Pachacámac, Lurín, Punta Hermosa, Punta Negra, San Bartolo, Santa María del Mar, Pucusana
--
-- Until this runs, delivery_zones is empty and the checkout enforces nothing.
--
-- Run (after the owner's OK): psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/provisioning/delivery-zones-PROPOSED.sql

begin;

insert into public.delivery_zones (business_unit_id, district, is_restricted)
select '11111111-1111-4111-8111-111111111111', district, is_restricted
  from (values
    ('Ancón', true),
    ('Ate', false),
    ('Barranco', false),
    ('Breña', false),
    ('Carabayllo', false),
    ('Cercado de Lima', false),
    ('Chaclacayo', true),
    ('Chorrillos', false),
    ('Cieneguilla', true),
    ('Comas', false),
    ('El Agustino', false),
    ('Independencia', false),
    ('Jesús María', false),
    ('La Molina', false),
    ('La Victoria', false),
    ('Lince', false),
    ('Los Olivos', false),
    ('Lurigancho-Chosica', true),
    ('Lurín', true),
    ('Magdalena del Mar', false),
    ('Miraflores', false),
    ('Pachacámac', true),
    ('Pucusana', true),
    ('Pueblo Libre', false),
    ('Puente Piedra', true),
    ('Punta Hermosa', true),
    ('Punta Negra', true),
    ('Rímac', false),
    ('San Bartolo', true),
    ('San Borja', false),
    ('San Isidro', false),
    ('San Juan de Lurigancho', false),
    ('San Juan de Miraflores', false),
    ('San Luis', false),
    ('San Martín de Porres', false),
    ('San Miguel', false),
    ('Santa Anita', false),
    ('Santa María del Mar', true),
    ('Santa Rosa', true),
    ('Santiago de Surco', false),
    ('Surquillo', false),
    ('Villa El Salvador', false),
    ('Villa María del Triunfo', false)
  ) as zone (district, is_restricted)
on conflict (business_unit_id, lower(btrim(district))) do update set is_restricted = excluded.is_restricted;

do $$
begin
  if (select count(*) from public.delivery_zones where business_unit_id = '11111111-1111-4111-8111-111111111111') <> 43 then
    raise exception 'expected 43 districts in delivery_zones';
  end if;
end
$$;

commit;
