/* ============================================================
   CRUZIAL PARFUMS — Catálogo y configuración
   Fuente: CATALOGO DE DECANTS.pdf (38 páginas, 2026) — datos verificados.
   Cambia WA_NUMBER solo si el número oficial cambia.
   mood: paleta de la botella SVG (a = luz, b = sombra, liquid = color del líquido, glow = resplandor)
   ============================================================ */

window.CRUZIAL_CONFIG = {
  WA_NUMBER: "51924590921",
  PHONE_DISPLAY: "924 590 921",
  INSTAGRAM_HANDLE: "@Cruzial_parfum",
  INSTAGRAM_URL: "https://www.instagram.com/Cruzial_parfum/",
  STORE: "Cruzial Parfums",
  CITY: "Lima · Perú",
  SIZES: [3, 5, 10],
  ATOMIZACIONES: { 3: "50–60", 5: "70–80", 10: "140–150" },
  ADELANTO: "50% de adelanto",
  DELIVERY: "Línea 1 del tren eléctrico · Motorizado · Contraentrega Lima · Shalom / Olva"
  /* Perfumes enteros (frasco sellado): se muestra el precio de 1 unidad
     cuando está confirmado en cada producto (ver `bottle` más abajo).
     Para volumen no se publica un número — el precio se cotiza por
     WhatsApp según cantidad. Fase 2 del Master Plan retiró el factor
     de descuento "4+ unidades" que existía aquí: era un cálculo
     (precio × 0.9) sin respaldo comercial real. */
};

/* Paletas de botella SVG */
const M = {
  m1: { a: "#f2e3bd", b: "#8a6d3b", liquid: "#d9a441", glow: "rgba(217,164,65,.45)" },
  m2: { a: "#f5ecd6", b: "#7a5a2e", liquid: "#c9a25e", glow: "rgba(201,162,94,.4)" },
  m3: { a: "#efe0c2", b: "#6b4d26", liquid: "#b8860b", glow: "rgba(184,134,11,.4)" },
  m4: { a: "#f8eede", b: "#8f6a35", liquid: "#d4a24c", glow: "rgba(212,162,76,.45)" },
  m5: { a: "#f3e8cd", b: "#5f4520", liquid: "#a87c32", glow: "rgba(168,124,50,.42)" },
  m6: { a: "#f9f1e0", b: "#96713a", liquid: "#e0b253", glow: "rgba(224,178,83,.45)" },
  m7: { a: "#eddfc0", b: "#7a5f2e", liquid: "#c08a2e", glow: "rgba(192,138,46,.4)" },
  m8: { a: "#f7ecd3", b: "#8d6a30", liquid: "#d9b054", glow: "rgba(217,176,84,.4)" }
};

/* Fábrica compacta de productos.
   extra: { tag, desc, bottle, bestseller, discontinued }
   Provenance del claim "100% original" en la desc por defecto: CLIENT_CONFIRMED
   (dueño del negocio, 2026-08-30) — cumple el requisito de CLAUDE.md de que un
   claim de autenticidad necesita confirmación explícita, igual que un precio. */
const P = (id, brand, name, gender, type, family, conc, price, notes, mood, extra) => ({
  id, brand, name, gender, type, family, conc, price, notes, mood,
  tag: extra && extra.tag || (type === "combo" ? "Combo" : type === "arab" ? "Árabe" : type === "niche" ? "Nicho" : "Designer"),
  desc: extra && extra.desc || `${name} — fragancia de la familia ${family.toLowerCase()}, concentración ${conc}. Decant 100% original, preparado con material limpio y empaquetado con protección para garantizar el bienestar del contenido.`,
  bottle: extra && extra.bottle || null,
  /* UNVERIFIED — INTERNAL ONLY — DO NOT EXPOSE AS A COMMERCIAL CLAIM.
     bestseller: editorial/curatorial flag set by the team (products worth highlighting
     for scent profile, availability, margin, etc.) — NOT a claim of verified sales volume
     or demand. No UI surface (filter, badge, sort, copy) may present it as fact until
     real sales data confirms it. See CLAUDE.md → ZERO INVENTED COMMERCE. */
  bestseller: !!(extra && extra.bestseller),
  discontinued: !!(extra && extra.discontinued)
});

/* Precios según el catálogo */
const T121626 = { 3: 12, 5: 16, 10: 26 };
const T111524 = { 3: 11, 5: 15, 10: 24 };
const T131728 = { 3: 13, 5: 17, 10: 28 };
const T141830 = { 3: 14, 5: 18, 10: 30 };
const T121729 = { 3: 12, 5: 17, 10: 29 };
const T111424 = { 3: 11, 5: 14, 10: 24 };
const T223048 = { 3: 22, 5: 30, 10: 48 };
const T243251 = { 3: 24, 5: 32, 10: 51 };
const T263456 = { 3: 26, 5: 34, 10: 56 };
const T303869 = { 3: 30, 5: 38, 10: 69 };
const T404889 = { 3: 40, 5: 48, 10: 89 };

/* Mapa de imágenes reales del catálogo
   bottle = frasco solo · set = frasco + decants (3, 5, 10 ml) */
const IMG_MAP = {
  // ÁRABE - Lattafa Khamrah
  "khamrah-clasico": { bottle: "img/perfumes/LATTAFA - KHAMRAH CLASICO.png", set: "img/perfumes/LATTAFA - KHAMRAH CLASICO (2).png" },
  "khamrah-qahwa": { bottle: "img/perfumes/LATTAFA - KHAMRAH QAHWA.png", set: "img/perfumes/LATTAFA - KHAMRAH QAHWA (2).png" },
  "khamrah-dukhan": { bottle: "img/perfumes/LATTAFA - KHAMRAH DUKHAN.png", set: "img/perfumes/LATTAFA - KHAMRAH DUKHAN (2).png" },
  "khamrah-waha": { bottle: "img/perfumes/Khamrah Waha.png", set: "img/perfumes/Khamrah Waha (2).png" },

  // ÁRABE - Lattafa otros
  "mashrabya": { bottle: "img/perfumes/Mashrabya.png", set: "img/perfumes/Mashrabya (2).png" },
  "asad-elixir": { bottle: "img/perfumes/Asad Elixir.png", set: "img/perfumes/Asad Elixir (2).png" },
  "asad-clasico": { bottle: "img/perfumes/LATTAFA - ASAD CLASICO.png", set: "img/perfumes/LATTAFA - ASAD CLASICO (2).png" },
  "asad-bourbon": { bottle: "img/perfumes/LATTAFA - ASAD BOURBON.png", set: "img/perfumes/LATTAFA - ASAD BOURBON (2).png" },
  "zanzibar-limited-e": { bottle: "img/perfumes/Zanzibar Limited Edition.png", set: "img/perfumes/Zanzibar Limited Edition (2).png" },
  "yara-pink": { bottle: "img/perfumes/LATTAFA - YARA PINK.png", set: "img/perfumes/LATTAFA - YARA PINK (2).png" },
  "yara-candy": { bottle: "img/perfumes/Yara Candy.png", set: "img/perfumes/Yara Candy (2).png" },
  "yara-elixir": { bottle: "img/perfumes/LATTAFA - YARA ELIXIR.png", set: "img/perfumes/LATTAFA - YARA ELIXIR (2).png" },
  "sublime": { bottle: "img/perfumes/LATTAFA - SUBLIME.png", set: "img/perfumes/LATTAFA - SUBLIME (2).png" },
  "oud-for-glory": { bottle: "img/perfumes/Oud For Glory.png", set: "img/perfumes/Oud For Glory (2).png" },
  "honor-and-glory": { bottle: "img/perfumes/LATTAFA - HONOR AND GLORY.png", set: "img/perfumes/LATTAFA - HONOR AND GLORY (2).png" },
  "eclaire": { bottle: "img/perfumes/LATTAFA - ECLAIRE.png", set: "img/perfumes/LATTAFA - ECLAIRE (2).png" },
  "eclaire-banoffi": { bottle: "img/perfumes/Lattafa Eclaire Banoffi.png", set: "img/perfumes/Lattafa Eclaire Banoffi (2).png" },
  "eclaire-pistache": { bottle: "img/perfumes/Lattafa Eclaire Pistache.png", set: "img/perfumes/Lattafa Eclaire Pistache (2).png" },
  "yum-yum": { bottle: "img/perfumes/Lattafa Yum Yum.png", set: "img/perfumes/Lattafa Yum Yum (2).png" },
  "angham": { bottle: "img/perfumes/Lattafa Angham.png", set: "img/perfumes/Lattafa Angham (2).png" },
  "fakhar-black": { bottle: "img/perfumes/Lattafa Fakhar Black.png", set: "img/perfumes/Lattafa Fakhar Black (2).png" },
  "qaed-al-fursan": { bottle: "img/perfumes/Lattafa Qaed Al Fursan.png", set: "img/perfumes/Lattafa Qaed Al Fursan (2).png" },
  "red-intensely": { bottle: "img/perfumes/Lattafa Red Intensely.png", set: "img/perfumes/Lattafa Red Intensely (2).png" },

  // ÁRABE - Afnan
  "mandarin-sky": { bottle: "img/perfumes/ARMAF - MANDARIN SKY.png", set: "img/perfumes/ARMAF - MANDARIN SKY (2).png" },
  "m-sky-elixir": { bottle: "img/perfumes/Mandarin Sky Elixir.png", set: "img/perfumes/Mandarin Sky Elixir (2).png" },
  "m-sky-vintage": { bottle: "img/perfumes/Mandarin Sky Vintage.png", set: "img/perfumes/Mandarin Sky Vintage (2).png" },
  "9pm": { bottle: "img/perfumes/AFNAN - 9PM.png", set: "img/perfumes/AFNAN - 9PM (2).png" },
  "9pm-rebel": { bottle: "img/perfumes/9 PM Rebel.png", set: "img/perfumes/9 PM Rebel (2).png" },
  "9pm-elixir": { bottle: "img/perfumes/AFNAN - 9PM ELIXIR.png", set: "img/perfumes/AFNAN - 9PM ELIXIR (2).png" },
  "9pm-night-out": { bottle: "img/perfumes/AFNAN - 9PM NIGHT OUT.png", set: "img/perfumes/AFNAN - 9PM NIGHT OUT (2).png" },
  "9am": { bottle: "img/perfumes/Afnan 9 AM.png", set: "img/perfumes/Afnan 9 AM (2).png" },
  "9am-dive": { bottle: "img/perfumes/AFNAN - 9AM DIVE.png", set: "img/perfumes/AFNAN - 9AM DIVE (2).png" },
  "supremacy-colle": { bottle: "img/perfumes/Afnan Supremacy Collection.png", set: "img/perfumes/Afnan Supremacy Collection (2).png" },
  "supremacy-noi": { bottle: "img/perfumes/Afnan Supremacy NOIR.png", set: "img/perfumes/Afnan Supremacy NOIR (2).png" },

  // ÁRABE - Lattafa Odyssey
  "odyssey-aqua": { bottle: "img/perfumes/ARMAF - ODYSSEY AQUA.png", set: "img/perfumes/ARMAF - ODYSSEY AQUA (2).png" },
  "odyssey-homme": { bottle: "img/perfumes/Lattafa Odyssey Homme.png", set: "img/perfumes/Lattafa Odyssey Homme (2).png" },
  "homme-white": { bottle: "img/perfumes/Lattafa Homme White.png", set: "img/perfumes/Lattafa Homme White (2).png" },
  "odyssey-spectra": { bottle: "img/perfumes/Lattafa Odyssey Spectra.png", set: "img/perfumes/Lattafa Odyssey Spectra (2).png" },
  "odyssey-mega": { bottle: "img/perfumes/Lattafa Odyssey Mega.png", set: "img/perfumes/Lattafa Odyssey Mega (2).png" },
  "odyssey-limoni": { bottle: "img/perfumes/Lattafa Odyssey Limoni.png", set: "img/perfumes/Lattafa Odyssey Limoni (2).png" },
  "odyssey-artisto": { bottle: "img/perfumes/Lattafa Odyssey Artisto.png", set: "img/perfumes/Lattafa Odyssey Artisto (2).png" },

  // ÁRABE - Lattafa Mayar
  "mayar": { bottle: "img/perfumes/Lattafa Mayar.png", set: "img/perfumes/Lattafa Mayar (2).png" },
  "mayar-cherry-i": { bottle: "img/perfumes/Lattafa Mayar Cherry Intense.png", set: "img/perfumes/Lattafa Mayar Cherry Intense (2).png" },

  // ÁRABE - Rasasi Hawas
  "hawas-exotic": { bottle: "img/perfumes/Hawas Exotic.png", set: "img/perfumes/Hawas Exotic (2).png" },
  "hawas-ice": { bottle: "img/perfumes/RASASI - HAWAS ICE.png", set: "img/perfumes/RASASI - HAWAS ICE (2).png" },
  "hawas-fire": { bottle: "img/perfumes/RASASI - HAWAS FIRE.png", set: "img/perfumes/RASASI - HAWAS FIRE (2).png" },
  "hawas-kobra": { bottle: "img/perfumes/RASASI - HAWAS KOBRA.png", set: "img/perfumes/RASASI - HAWAS KOBRA (2).png" },
  "hawas-verde": { bottle: "img/perfumes/Hawas Verde.png", set: "img/perfumes/Hawas Verde (2).png" },
  "hawas-elixir": { bottle: "img/perfumes/Hawas Elixir.png", set: "img/perfumes/Hawas Elixir (2).png" },
  "hawas-tropical": { bottle: "img/perfumes/RASASI - HAWAS TROPICAL.png", set: "img/perfumes/RASASI - HAWAS TROPICAL (2).png" },
  "hawas-chrome": { bottle: "img/perfumes/RASASI - HAWAS CHROME.png", set: "img/perfumes/RASASI - HAWAS CHROME (2).png" },

  // ÁRABE - Otros
  "art-of-universe": { bottle: "img/perfumes/Art Of Universe.png", set: "img/perfumes/Art Of Universe (2).png" },
  "vulcan-feu": { bottle: "img/perfumes/FRENCH AVENUE - VULCAN FEU.png", set: "img/perfumes/FRENCH AVENUE - VULCAN FEU (2).png" },
  "amber-o-gold-e": { bottle: "img/perfumes/AL HARAMAIN - AMBER OUD GOLD EDITION.png", set: "img/perfumes/AL HARAMAIN - AMBER OUD GOLD EDITION (2).png" },
  "ao-aqua-dubai": { bottle: "img/perfumes/Amber Oud Aqua Dubai.png", set: "img/perfumes/Amber Oud Aqua Dubai (2).png" },
  "ao-dubai-night": { bottle: "img/perfumes/Amber Oud Dubai Night.png", set: "img/perfumes/Amber Oud Dubai Night (2).png" },
  "nitro-red": { bottle: "img/perfumes/DUMONT PARIS - NITRO RED.png", set: "img/perfumes/DUMONT PARIS - NITRO RED (2).png" },
  "liquid-brun": { bottle: "img/perfumes/liquid brun.png", set: "img/perfumes/liquid brun (2).png" },
  "jean-lowe-vibe": { bottle: "img/perfumes/Maison Alhambra Jean Lowe Vibe.png", set: "img/perfumes/Maison Alhambra Jean Lowe Vibe (2).png" },
  "jean-lowe-inmotel": { bottle: "img/perfumes/Maison Alhambra Jean Lowe Inmotel.png", set: "img/perfumes/Maison Alhambra Jean Lowe Inmotel (2).png" },
  "rayhaan-italia": { bottle: "img/perfumes/Rayhaan Italia.png", set: "img/perfumes/Rayhaan Italia (2).png" },

  // ÁRABE - Armaf Club de Nuit
  "cdn-intense-man": { bottle: "img/perfumes/ARMAF - CLUB DE NUIT INTENSE EDT.png", set: "img/perfumes/ARMAF - CLUB DE NUIT INTENSE EDT (2).png" },
  "cdn-urban-man-e": { bottle: "img/perfumes/ARMAF - CLUB DE NUIT URBAN MAN ELIXIR.png", set: "img/perfumes/ARMAF - CLUB DE NUIT URBAN MAN ELIXIR (2).png" },
  "cdn-preciux-i": { bottle: "img/perfumes/Club de Nuit Precieux I.png", set: "img/perfumes/Club de Nuit Precieux I (2).png" },

  // ÁRABE - Maison Alhambra / Otros
  "sceptre-malachite": { bottle: "img/perfumes/MAISON ALHAMBRA - SCEPTRE MALACHITE.png", set: "img/perfumes/MAISON ALHAMBRA - SCEPTRE MALACHITE (2).png" },
  "bright-peach": { bottle: "img/perfumes/Bright Peach.png", set: "img/perfumes/Bright Peach (2).png" },
  "paradise-garden": { bottle: "img/perfumes/Lattafa Paradise Garden.png", set: "img/perfumes/Lattafa Paradise Garden (2).png" },

  // COMBOS
  "combo-cuarteto": { bottle: "img/perfumes/Cuarteto Oriental Vainilla Freak.png", set: "img/perfumes/Cuarteto Oriental Vainilla Freak (2).png" },
  "combo-vainilla": { bottle: "img/perfumes/Cuarteto Oriental Vainilla Freak.png", set: "img/perfumes/Cuarteto Oriental Vainilla Freak (2).png" },

  // DESIGNER / NICHO
  "212-edt": { bottle: "img/perfumes/Carolina Herrera 212 EDT.png", set: "img/perfumes/Carolina Herrera 212 EDT (2).png" },
  "eros-edt": { bottle: "img/perfumes/Versace Eros EDT.png", set: "img/perfumes/Versace Eros EDT (2).png" },
  "eros-flame": { bottle: "img/perfumes/VERSACE - EROS FLAME.png", set: "img/perfumes/VERSACE - EROS FLAME (2).png" },
  "spicebomb-extreme": { bottle: "img/perfumes/Spicebomb Extreme.png", set: "img/perfumes/Spicebomb Extreme (2).png" },
  "azzaro-tmw-edp": { bottle: "img/perfumes/AZZARO.-AZZARO THE MOSTH WANTED INTENSE EDP.png", set: "img/perfumes/AZZARO.-AZZARO THE MOSTH WANTED INTENSE EDP (2).png" },
  "tmw-parfum": { bottle: "img/perfumes/AZZARO.-AZZARO THE MOSTH WANTED PARFUM.png", set: "img/perfumes/AZZARO.-AZZARO THE MOSTH WANTED PARFUM (2).png" },
  "swy-intensely": { bottle: "img/perfumes/EMPORIO ARMANI - STRONGER WITH YOU INTENSELY.png", set: "img/perfumes/EMPORIO ARMANI - STRONGER WITH YOU INTENSELY (2).png" },
  "swy-absolutely": { bottle: "img/perfumes/EMPORIO ARMANI - STRONGER WITH YOU ABSOLUTELY.png", set: "img/perfumes/EMPORIO ARMANI - STRONGER WITH YOU ABSOLUTELY (2).png" },
  "ultra-male": { bottle: "img/perfumes/Jean Paul Gaultier Ultra Male.png", set: "img/perfumes/Jean Paul Gaultier Ultra Male (2).png" },
  "le-male-elixir": { bottle: "img/perfumes/JEAN PAUL GAULTIER - LE MALE ELIXIR.png", set: "img/perfumes/JEAN PAUL GAULTIER - LE MALE ELIXIR EDT.png" },
  "le-beau-le-parfum": { bottle: "img/perfumes/JEAN PAUL GAULTIER - LE BEAU LE PARFUM.png", set: "img/perfumes/JEAN PAUL GAULTIER - LE BEAU LE PARFUM (2).png" },
  "victory-elixir": { bottle: "img/perfumes/Paco Rabanne Victory Elixir.png", set: "img/perfumes/Paco Rabanne Victory Elixir (2).png" },
  "purple-melancholia": { bottle: "img/perfumes/Purple Melancholia.png", set: "img/perfumes/Purple Melancholia (2).png" },
  "bir-intense": { bottle: "img/perfumes/Burberry Burberry Brit Intense.png", set: "img/perfumes/Burberry Burberry Brit Intense (2).png" },
  "b-man-in-black": { bottle: "img/perfumes/Bvlgari Bvlgari Man In Black.png", set: "img/perfumes/Bvlgari Bvlgari Man In Black (2).png" },
  "sauvage-edt": { bottle: "img/perfumes/Dior Sauvage EDT.png", set: "img/perfumes/Dior Sauvage EDT (2).png" },
  "dylan-blue": { bottle: "img/perfumes/Versace Dylan Blue.png", set: "img/perfumes/Versace Dylan Blue (2).png" },
  "adg-profondo-edp": { bottle: "img/perfumes/GIORGIO ARMANI .-ACQUA DI GIO PROFONDO EDP.png", set: "img/perfumes/GIORGIO ARMANI .-ACQUA DI GIO PROFONDO EDP (2).png" },
  "1-million-lucky": { bottle: "img/perfumes/Paco Rabanne 1 Million Lucky.png", set: "img/perfumes/Paco Rabanne 1 Million Lucky (2).png" },
  "invictus-elixir": { bottle: "img/perfumes/PACO RABANNE -INVICTUS ELIXIR.png", set: "img/perfumes/PACO RABANNE -INVICTUS ELIXIR (2).png" },
  "reserve-privee": { bottle: "img/perfumes/Armani Reserve Privée.png", set: "img/perfumes/Armani Reserve Privée (2).png" },
  "cedrat-boise-int": { bottle: "img/perfumes/Mancera Cedrat Boise Intense.png", set: "img/perfumes/Mancera Cedrat Boise Intense (2).png" },
  "m-red-tobacco": { bottle: "img/perfumes/Mancera Mancera Red Tobacco.png", set: "img/perfumes/Mancera Mancera Red Tobacco (2).png" },
  "by-the-fireplace": { bottle: "img/perfumes/Maison Margiela By The Fireplace.png", set: "img/perfumes/Maison Margiela By The Fireplace (2).png" },
  "erba-pura": { bottle: "img/perfumes/Xerjoff Erba Pura.png", set: "img/perfumes/Xerjoff Erba Pura (2).png" },
  "nautica-voyage": { bottle: "img/perfumes/Nautica Nautica Voyage.png", set: "img/perfumes/Nautica Nautica Voyage (2).png" }
};

/* ============================================================
   PRECIOS MAYORISTAS — Frascos completos (ml)
   Fuente: HOJA DE PRECIOS MAYORISTAS.xlsx (junio 2026).
   Valores por unidad — REFERENCIALES, no definitivos.
   Cada单元行: { unit, m4, m12 } = precio unitario / 4+ uds / 12+ uds
   ============================================================ */
window.CRUZIAL_WHOLESALE = {
  /* Lattafa */
  "khamrah-clasico":    { unit: 130, m4: 122, m12: 114 },
  "khamrah-qahwa":      { unit: 130, m4: 122, m12: 114 },
  "khamrah-dukhan":     { unit: 130, m4: 122, m12: 114 },
  "khamrah-waha":       { unit: 145, m4: 137, m12: 129 },
  "eclaire":            { unit: 130, m4: 118, m12: 106 },
  "eclaire-banoffi":    { unit: 120, m4: 108, m12: 96 },
  "eclaire-pistache":   { unit: 120, m4: 108, m12: 96 },
  "oud-for-glory":      { unit: 130, m4: 118, m12: 106 },
  "fakhar-black":       { unit: 130, m4: 118, m12: 106 },
  "angham":             { unit: 130, m4: 118, m12: 106 },
  "yara-pink":          { unit: 120, m4: 108, m12: 96 },
  "yara-candy":         { unit: 120, m4: 108, m12: 96 },
  "yara-elixir":        { unit: 130, m4: 118, m12: 106 },
  "honor-and-glory":    { unit: 130, m4: 118, m12: 106 },
  "sublime":            { unit: 130, m4: 118, m12: 106 },
  "red-intensely":      { unit: 145, m4: 133, m12: 121 },
  "mashrabya":          { unit: 120, m4: 108, m12: 96 },
  "mayar":              { unit: 130, m4: 118, m12: 106 },
  "mayar-cherry-i":     { unit: 130, m4: 118, m12: 106 },
  "yum-yum":            { unit: 130, m4: 118, m12: 106 },
  "qaed-al-fursan":     { unit: 120, m4: 108, m12: 96 },
  "odyssey-homme":      { unit: 120, m4: 108, m12: 96 },
  "homme-white":        { unit: 120, m4: 108, m12: 96 },
  "odyssey-spectra":    { unit: 120, m4: 108, m12: 96 },
  "odyssey-mega":       { unit: 120, m4: 108, m12: 96 },
  "odyssey-limoni":     { unit: 120, m4: 108, m12: 96 },
  "odyssey-artisto":    { unit: 130, m4: 118, m12: 106 },
  "zanzibar-limited-e": { unit: 120, m4: 108, m12: 96 },
  "asad-clasico":       { unit: 120, m4: 108, m12: 96 },
  "asad-bourbon":       { unit: 130, m4: 118, m12: 106 },

  /* Afnan */
  "9pm":                { unit: 130, m4: 118, m12: 106 },
  "9pm-rebel":          { unit: 130, m4: 118, m12: 106 },
  "9pm-elixir":         { unit: 130, m4: 118, m12: 106 },
  "9pm-night-out":      { unit: 145, m4: 133, m12: 121 },
  "9am":                { unit: 120, m4: 108, m12: 96 },
  "9am-dive":           { unit: 160, m4: 148, m12: 136 },
  "mandarin-sky":       { unit: 125, m4: 113, m12: 101 },
  "m-sky-elixir":       { unit: 130, m4: 118, m12: 106 },
  "m-sky-vintage":      { unit: 125, m4: 113, m12: 101 },
  "supremacy-colle":    { unit: 130, m4: 118, m12: 106 },
  "supremacy-noi":      { unit: 125, m4: 113, m12: 101 },

  /* Armaf */
  "cdn-intense-man":    { unit: 130, m4: 118, m12: 106 },
  "cdn-urban-man-e":    { unit: 160, m4: 148, m12: 136 },
  "cdn-preciux-i":      { unit: 185, m4: 173, m12: 161 },
  "odyssey-aqua":       { unit: 125, m4: 113, m12: 101 },

  /* Rasasi */
  "hawas-ice":          { unit: 155, m4: 143, m12: 131 },
  "hawas-exotic":       { unit: 165, m4: 153, m12: 141 },
  "hawas-fire":         { unit: 145, m4: 133, m12: 121 },
  "hawas-kobra":        { unit: 145, m4: 133, m12: 121 },
  "hawas-verde":        { unit: 155, m4: 143, m12: 131 },
  "hawas-elixir":       { unit: 145, m4: 133, m12: 121 },
  "hawas-tropical":     { unit: 145, m4: 133, m12: 121 },
  "hawas-chrome":       { unit: 155, m4: 143, m12: 131 },

  /* Otros árabes */
  "art-of-universe":    { unit: 155, m4: 143, m12: 131 },
  "vulcan-feu":         { unit: 145, m4: 133, m12: 121 },
  "amber-o-gold-e":     { unit: 165, m4: 153, m12: 141 },
  "ao-aqua-dubai":      { unit: 165, m4: 153, m12: 141 },
  "ao-dubai-night":     { unit: 175, m4: 163, m12: 151 },
  "nitro-red":          { unit: 130, m4: 118, m12: 106 },
  "liquid-brun":        { unit: 130, m4: 118, m12: 106 },
  "jean-lowe-vibe":     { unit: 125, m4: 113, m12: 101 },
  "jean-lowe-inmotel":  { unit: 125, m4: 113, m12: 101 },
  "rayhaan-italia":     { unit: 125, m4: 113, m12: 101 },
  "sceptre-malachite":  { unit: 120, m4: 108, m12: 96 },
  "bharara-king":       { unit: 200, m4: 188, m12: 176 },
  "lovely-cherry":      { unit: 145, m4: 133, m12: 121 },
  "bright-peach":       { unit: 145, m4: 133, m12: 121 },

  /* Designer / Nicho */
  "eros-edt":           { unit: 350, m4: 335, m12: 320 },
  "eros-flame":         { unit: 350, m4: 335, m12: 320 },
  "sauvage-edt":        { unit: 380, m4: 364, m12: 348 },
  "dylan-blue":         { unit: 370, m4: 354, m12: 338 },
  "adg-profondo-edp":   { unit: 420, m4: 404, m12: 388 },
  "spicebomb-extreme":  { unit: 420, m4: 404, m12: 388 },
  "azzaro-tmw-edp":     { unit: 350, m4: 335, m12: 320 },
  "tmw-parfum":         { unit: 420, m4: 404, m12: 388 },
  "swy-intensely":      { unit: 420, m4: 404, m12: 388 },
  "swy-absolutely":     { unit: 420, m4: 404, m12: 388 },
  "le-male-elixir":     { unit: 380, m4: 364, m12: 348 },
  "le-beau-le-parfum":  { unit: 420, m4: 404, m12: 388 },
  "victory-elixir":     { unit: 400, m4: 384, m12: 368 },
  "invictus-elixir":    { unit: 400, m4: 384, m12: 368 },
  "1-million-lucky":    { unit: 420, m4: 404, m12: 388 },
  "purple-melancholia": { unit: 435, m4: 419, m12: 403 },
  "bir-intense":        { unit: 430, m4: 414, m12: 398 },
  "b-man-in-black":     { unit: 430, m4: 414, m12: 398 },
  "cedrat-boise-int":   { unit: 480, m4: 464, m12: 448 },
  "m-red-tobacco":      { unit: 480, m4: 464, m12: 448 },
  "erba-pura":          { unit: 750, m4: 730, m12: 710 },
  "by-the-fireplace":   { unit: 430, m4: 414, m12: 398 },
  "nautica-voyage":     { unit: 120, m4: 108, m12: 96 },
  "212-edt":            { unit: 350, m4: 335, m12: 320 },
  "reserve-privee":     { unit: 420, m4: 404, m12: 388 },
  "paradise-garden":    { unit: 380, m4: 364, m12: 348 }
};

/* Contenido explícito de combos (confirmed by client) */
window.CRUZIAL_COMBO_CONTENTS = {
  "combo-cuarteto": {
    name: "Cuarteto Oriental",
    desc: "4 fragancias árabes seleccionadas por Cruzial",
    perfumes: ["Khamrah Clásico", "Khamrah Qahwa", "Khamrah Dukhan", "Khamrah Waha"],
    ml: 10,
    atomizaciones: "560–600"
  },
  "combo-vainilla": {
    name: "Vainilla Freak",
    desc: "2 Yara + Eclaire — para amantes de la vainilla",
    perfumes: ["Yara Pink", "Yara Candy", "Eclaire"],
    ml: 10,
    atomizaciones: "420–450"
  },
  "combo-tulum": {
    name: "Set Tulum",
    desc: "Fresco y playero — para clima cálido",
    perfumes: ["Odyssey Aqua", "Hawas Tropical", "Supremacy Collection"],
    ml: 10,
    atomizaciones: "420–450"
  }
};

/* ============================================================
   REGLAS DE REGALO — Decant de cortesía
   1 frasco → 1 decant 2 ml gratis
   2–3 frascos → 1 decant 2 ml gratis
   4+ frascos → 2 decants 2 ml gratis
   El cliente elige qué perfumes quiere como regalo.
   ============================================================ */
window.CRUZIAL_GIFT_RULES = [
  { min: 1, max: 3, freeDecants: 1, label: "1 DECANT 2 ML" },
  { min: 4, max: Infinity, freeDecants: 2, label: "2 DECANTS 2 ML" }
];

/* Mensaje regalo por compra al detal */
const GIFT_MESSAGE = "🎁 Regalo: Decant de 2 ml de cualquier perfume árabe del catálogo, a tu elección.";

window.CRUZIAL_PRODUCTS = [
  /* ================= PERFUMERÍA ÁRABE ================= */
  P("khamrah-clasico", "Lattafa", "Khamrah Clásico", "unisex", "arab", "Gourmand", "EDP", T121626, ["Vainilla", "Canela", "Ámbar"], M.m1, { bestseller: true, bottle: { 100: 380 }, desc: "Dulce, cálido y boozy: vainilla con canela sobre una base de ámbar. Un clásico de la perfumería árabe que se siente abrigador." }),
  P("khamrah-qahwa", "Lattafa", "Khamrah Qahwa", "unisex", "arab", "Gourmand", "EDP", T121626, ["Café", "Vainilla", "Ámbar"], M.m2, { bestseller: true }),
  P("khamrah-dukhan", "Lattafa", "Khamrah Dukhan", "unisex", "arab", "Especiado", "EDP", T121626, ["Incienso", "Vainilla", "Humo"], M.m3),
  P("khamrah-waha", "Lattafa", "Khamrah Waha", "unisex", "arab", "Ámbar", "EDP", T131728, ["Ámbar", "Coco", "Vainilla"], M.m4),
  P("mashrabya", "Lattafa", "Mashrabya", "unisex", "arab", "Amaderado", "EDP", T111524, ["Madera", "Rosas", "Ámbar"], M.m5),
  P("asad-elixir", "Lattafa", "Asad Elixir", "men", "arab", "Especiado", "EDP", T121626, ["Especias", "Café", "Cuero"], M.m6, { bestseller: true, bottle: { 100: 360 } }),
  P("asad-clasico", "Lattafa", "Asad Clásico", "men", "arab", "Especiado", "EDP", T111524, ["Especias", "Vainilla", "Ámbar"], M.m7),
  P("asad-bourbon", "Lattafa", "Asad Bourbon", "men", "arab", "Especiado", "EDP", T121626, ["Ron", "Especias", "Madera"], M.m8),
  P("zanzibar-limited-e", "Lattafa", "Zanzibar Limited Edition", "men", "arab", "Amaderado", "EDP", T111524, ["Madera", "Ámbar", "Especias"], M.m1),
  P("yara-pink", "Lattafa", "Yara Pink", "women", "arab", "Floral", "EDP", T111524, ["Flores", "Frutos rojos", "Vainilla"], M.m2),
  P("yara-candy", "Lattafa", "Yara Candy", "women", "arab", "Gourmand", "EDP", T111524, ["Algodón dulce", "Fresa", "Vainilla"], M.m3),
  P("yara-elixir", "Lattafa", "Yara Elixir", "women", "arab", "Floral", "EDP", T121626, ["Flores blancas", "Ámbar", "Vainilla"], M.m4),
  P("mandarin-sky", "Afnan", "Mandarin Sky", "men", "arab", "Gourmand", "EDP", T121626, ["Mandarina", "Vainilla", "Caramelo"], M.m5),
  P("m-sky-elixir", "Afnan", "Mandarin Sky Elixir", "men", "arab", "Gourmand", "EDP", T121626, ["Mandarina", "Ámbar", "Cacao"], M.m6),
  P("m-sky-vintage", "Afnan", "Mandarin Sky Vintage", "men", "arab", "Amaderado", "EDP", T121626, ["Madera", "Ámbar", "Cítricos"], M.m7),
  P("odyssey-aqua", "Lattafa", "Odyssey Aqua", "men", "arab", "Fresco", "EDP", T121626, ["Acuático", "Cítricos", "Madera"], M.m8),
  P("odyssey-homme", "Lattafa", "Odyssey Homme", "men", "arab", "Fresco", "EDP", T111524, ["Lavanda", "Ámbar", "Madera"], M.m1),
  P("homme-white", "Lattafa", "Homme White", "men", "arab", "Cítrico", "EDP", T111524, ["Bergamota", "Especias", "Ámbar"], M.m2),
  P("odyssey-spectra", "Lattafa", "Odyssey Spectra", "men", "arab", "Fresco", "EDP", T111524, ["Acuático", "Jazmín", "Ámbar"], M.m3),
  P("odyssey-mega", "Lattafa", "Odyssey Mega", "men", "arab", "Amaderado", "EDP", T111524, ["Madera", "Ámbar", "Cítricos"], M.m4),
  P("odyssey-limoni", "Lattafa", "Odyssey Limoni", "men", "arab", "Cítrico", "EDP", T111524, ["Limón", "Cedro", "Menta"], M.m5),
  P("odyssey-artisto", "Lattafa", "Odyssey Artisto", "men", "arab", "Especiado", "EDP", T121626, ["Especias", "Cuero", "Ámbar"], M.m6),
  P("mayar", "Lattafa", "Mayar", "women", "arab", "Floral", "EDP", T121626, ["Flores blancas", "Ámbar", "Vainilla"], M.m7),
  P("mayar-cherry-i", "Lattafa", "Mayar Cherry Intense", "women", "arab", "Gourmand", "EDP", T121626, ["Cereza", "Flores", "Vainilla"], M.m8),
  P("sublime", "Lattafa", "Sublime", "women", "arab", "Floral", "EDP", T121626, ["Flores", "Ámbar", "Almizcle"], M.m1),
  P("oud-for-glory", "Lattafa", "Oud For Glory", "men", "arab", "Amaderado", "EDP", T121626, ["Oud", "Especias", "Ámbar"], M.m2),
  P("honor-and-glory", "Lattafa", "Honor And Glory", "men", "arab", "Gourmand", "EDP", T121626, ["Piña", "Caramelo", "Especias"], M.m3),
  P("eclaire", "Lattafa", "Eclaire", "women", "arab", "Gourmand", "EDP", T121626, ["Vainilla", "Caramelo", "Ámbar"], M.m4, { bestseller: true }),
  P("eclaire-banoffi", "Lattafa", "Eclaire Banoffi", "women", "arab", "Gourmand", "EDP", T111524, ["Plátano", "Caramelo", "Vainilla"], M.m5),
  P("eclaire-pistache", "Lattafa", "Eclaire Pistache", "women", "arab", "Gourmand", "EDP", T111524, ["Pistacho", "Vainilla", "Almendra"], M.m6),
  P("yum-yum", "Lattafa", "Yum Yum", "women", "arab", "Gourmand", "EDP", T121626, ["Praliné", "Flores", "Vainilla"], M.m7),
  P("angham", "Lattafa", "Angham", "women", "arab", "Gourmand", "EDP", T121626, ["Vainilla", "Ámbar", "Flores"], M.m8),
  P("hawas-exotic", "Rasasi", "Hawas Exotic", "men", "arab", "Fresco", "EDP", T131728, ["Acuático", "Mango", "Ámbar"], M.m1),
  P("hawas-ice", "Rasasi", "Hawas Ice", "men", "arab", "Fresco", "EDP", T121626, ["Acuático", "Menta", "Ámbar"], M.m2, { bestseller: true, bottle: { 100: 380 } }),
  P("hawas-fire", "Rasasi", "Hawas Fire", "men", "arab", "Especiado", "EDP", T121626, ["Especias", "Ámbar", "Madera"], M.m3),
  P("hawas-kobra", "Rasasi", "Hawas Kobra", "men", "arab", "Fresco", "EDP", T121626, ["Acuático", "Cítricos", "Ámbar"], M.m4),
  P("hawas-verde", "Rasasi", "Hawas Verde", "men", "arab", "Fresco", "EDP", T131728, ["Verde", "Acuático", "Cítricos"], M.m5),
  P("hawas-elixir", "Rasasi", "Hawas Elixir", "men", "arab", "Fresco", "EDP", T121626, ["Acuático", "Ámbar", "Especias"], M.m6),
  P("hawas-tropical", "Rasasi", "Hawas Tropical", "men", "arab", "Fresco", "EDP", T121626, ["Coco", "Fruta tropical", "Ámbar"], M.m7),
  P("9pm", "Afnan", "9 PM", "men", "arab", "Gourmand", "EDP", T121626, ["Manzana", "Canela", "Vainilla"], M.m8, { bestseller: true, bottle: { 100: 350 } }),
  P("9pm-rebel", "Afnan", "9 PM Rebel", "men", "arab", "Especiado", "EDP", T121626, ["Especias", "Vainilla", "Ámbar"], M.m1),
  P("9pm-elixir", "Afnan", "9 PM Elixir", "men", "arab", "Gourmand", "EDP", T121626, ["Vainilla", "Ámbar", "Especias"], M.m2),
  P("9pm-night-out", "Afnan", "9 PM Night Out", "men", "arab", "Especiado", "EDP", T131728, ["Especias", "Cuero", "Ámbar"], M.m3),
  P("9am", "Afnan", "9 AM", "men", "arab", "Fresco", "EDP", T111524, ["Cítricos", "Acuático", "Ámbar"], M.m4),
  P("9am-dive", "Afnan", "9 AM Dive", "men", "arab", "Fresco", "EDP", T121626, ["Acuático", "Verde", "Madera"], M.m5),
  P("art-of-universe", "Lattafa", "Art Of Universe", "men", "arab", "Especiado", "EDP", T131728, ["Especias", "Ámbar", "Cuero"], M.m6),
  P("liquid-brun", "French Avenue", "Liquid Brun", "men", "arab", "Especiado", "EDP", T121626, ["Canela", "Ámbar", "Vainilla"], M.m7, { bestseller: true, bottle: { 100: 450 } }),
  P("vulcan-feu", "French Avenue", "Vulcan Feu", "men", "arab", "Especiado", "EDP", T131728, ["Fuego", "Especias", "Ámbar"], M.m8),
  P("amber-o-gold-e", "Al Haramain", "Amber Oud Gold Elixir", "unisex", "arab", "Ámbar", "EDP", T131728, ["Ámbar", "Coco", "Vainilla"], M.m1),
  P("ao-aqua-dubai", "Al Haramain", "Amber Oud Aqua Dubai", "men", "arab", "Fresco", "EDP", T131728, ["Acuático", "Bergamota", "Ámbar"], M.m2),
  P("ao-dubai-night", "Al Haramain", "Amber Oud Dubai Night", "men", "arab", "Ámbar", "EDP", T141830, ["Ámbar", "Cuero", "Especias"], M.m3),
  P("nitro-red", "Dumont Paris", "Nitro Red", "men", "arab", "Fresco", "EDP", T121626, ["Frutal", "Acuático", "Ámbar"], M.m4),
  P("red-intensely", "Lattafa", "Red Intensely", "men", "arab", "Gourmand", "EDP", T131728, ["Frutos rojos", "Vainilla", "Ámbar"], M.m5),
  P("cdn-intense-man", "Armaf", "Club de Nuit Intense Man", "men", "arab", "Cítrico", "EDP", T121626, ["Piña", "Abedul", "Ámbar"], M.m6, { bestseller: true, bottle: { 105: 420 } }),
  P("cdn-urban-man-e", "Armaf", "Club de Nuit Urban Man Elixir", "men", "arab", "Fresco", "EDP", T121729, ["Cítricos", "Verde", "Ámbar"], M.m7),
  P("cdn-preciux-i", "Armaf", "Club de Nuit Precious I", "men", "arab", "Amaderado", "EDP", T223048, ["Piña", "Cedro", "Ámbar"], M.m8),
  P("supremacy-colle", "Afnan", "Supremacy Collection", "men", "arab", "Cítrico", "EDP", T131728, ["Piña", "Madera", "Ámbar"], M.m8),
  P("supremacy-noi", "Afnan", "Supremacy NOI", "men", "arab", "Cítrico", "EDP", T121626, ["Piña", "Cedro", "Almizcle"], M.m1),
  P("sceptre-malachite", "Maison Alhambra", "Sceptre Malachite", "men", "arab", "Amaderado", "EDP", T111424, ["Madera", "Ámbar", "Especias"], M.m2),
  P("lovely-cherry", "Maison Alhambra", "Lovely Cherry", "women", "arab", "Gourmand", "EDP", T131728, ["Cereza", "Almendra", "Vainilla"], M.m6, { discontinued: true, desc: "Cereza, almendra y vainilla sobre una base golosa. Producto descontinuado: ya no se repone al agotar el stock restante." }),
  P("bright-peach", "Maison Alhambra", "Bright Peach", "women", "arab", "Gourmand", "EDP", T131728, ["Melocotón", "Flores", "Vainilla"], M.m3, { discontinued: true, desc: "Melocotón, flores blancas y vainilla en una composición dulce y luminosa. Producto descontinuado: ya no se repone al agotar el stock restante." }),
  P("qaed-al-fursan", "Lattafa", "Qaed Al Fursan", "men", "arab", "Amaderado", "EDP", T111524, ["Azafrán", "Madera", "Ámbar"], M.m4),
  P("bharara-king", "Bharara", "Bharara King", "men", "arab", "Amaderado", "EDP", T131728, ["Especias", "Cuero", "Ámbar"], M.m1),
  P("jean-lowe-vibe", "Maison Alhambra", "Jean Lowe Vibe", "men", "arab", "Fresco", "EDP", T121626, ["Cítricos", "Acuático", "Madera"], M.m5),
  P("jean-lowe-inmotel", "Maison Alhambra", "Jean Lowe Inmotel", "men", "arab", "Cítrico", "EDP", T121626, ["Bergamota", "Ámbar", "Vainilla"], M.m6),
  P("fakhar-black", "Lattafa", "Fakhar Black", "men", "arab", "Floral", "EDP", T121626, ["Lavanda", "Geranio", "Vainilla"], M.m7),
  P("rayhaan-italia", "Rayhaan", "Rayhaan Italia", "men", "arab", "Cítrico", "EDP", T121626, ["Cítricos", "Especias", "Ámbar"], M.m8),
  P("hawas-chrome", "Rasasi", "Hawas Chrome", "men", "arab", "Fresco", "EDP", T131728, ["Acuático", "Cítricos", "Metálico"], M.m1),
  P("royal-blend-sequoia", "Maison Alhambra", "Royal Blend Sequoia", "men", "arab", "Amaderado", "EDP", T121626, ["Cedro", "Especias", "Ámbar"], M.m5),

  /* ================= COMBOS ÁRABES ================= */
  P("combo-cuarteto", "", "Cuarteto Oriental", "unisex", "combo", "Ámbar", "EDP", { 3: 40, 5: 55, 10: 89 }, ["4 fragancias", "Orientales", "Selección"], M.m4, { desc: "Khamrah Clásico, Khamrah Qahwa, Khamrah Dukhan y Khamrah Waha — 4 fragancias árabes de la línea Khamrah (Lattafa). Rinde hasta 600 atomizaciones en su formato 10 ml.", tag: "Combo" }),
  P("combo-vainilla", "", "Vainilla Freak", "unisex", "combo", "Gourmand", "EDP", { 3: 27, 5: 39, 10: 65 }, ["Vainilla", "Gourmand", "Dulce"], M.m2, { desc: "Yara Pink, Yara Candy y Eclaire — 3 fragancias gourmand para amantes de la vainilla. Rinde hasta 450 atomizaciones en su formato 10 ml.", tag: "Combo" }),
  P("combo-tulum", "", "Set Tulum", "unisex", "combo", "Fresco", "EDP", { 3: 31, 5: 42, 10: 71 }, ["Fresco", "Cálido", "Veraniego"], M.m6, { desc: "Odyssey Aqua, Hawas Tropical y Supremacy Collection — 3 fragancias frescas con espíritu playero. Rinde hasta 450 atomizaciones en su formato 10 ml.", tag: "Combo" }),

  /* ================= PERFUMERÍA DE DISEÑADOR Y NICHO ================= */
  P("212-edt", "Carolina Herrera", "212 EDT", "men", "designer", "Fresco", "EDT", T223048, ["Bergamota", "Flor de naranjo", "Madera"], M.m1),
  P("eros-edt", "Versace", "Eros EDT", "men", "designer", "Fresco", "EDT", T223048, ["Menta", "Manzana", "Vainilla"], M.m2, { bestseller: true, bottle: { 100: 580 } }),
  P("eros-flame", "Versace", "Eros Flame", "men", "designer", "Especiado", "EDP", T223048, ["Mandarina", "Rosas", "Vainilla"], M.m3),
  P("spicebomb-extreme", "Viktor & Rolf", "Spicebomb Extreme", "men", "designer", "Especiado", "EDP", T243251, ["Canela", "Tabaco", "Vainilla"], M.m4, { bottle: { 90: 680 } }),
  P("azzaro-tmw-edp", "Azzaro", "The Most Wanted EDP", "men", "designer", "Especiado", "EDP", T223048, ["Manzana", "Cardamomo", "Ámbar"], M.m5),
  P("swy-intensely", "Armani", "Stronger With You Intensely", "men", "designer", "Gourmand", "EDP", T243251, ["Canela", "Ron", "Vainilla"], M.m6),
  P("swy-absolutely", "Armani", "Stronger With You Absolutely", "men", "designer", "Amaderado", "EDP", T263456, ["Madera", "Ámbar", "Café"], M.m7),
  P("ultra-male", "Jean Paul Gaultier", "Ultra Male", "men", "designer", "Fresco", "EDT", T243251, ["Pera", "Vainilla", "Lavanda"], M.m8, { bottle: { 125: 650 }, discontinued: true, desc: "Pera, vainilla y lavanda sobre una base ambarina golosa. Producto descontinuado: ya no se repone al agotar el stock restante." }),
  P("le-male-elixir", "Jean Paul Gaultier", "Le Male Elixir", "men", "designer", "Especiado", "EDP", T243251, ["Miel", "Canela", "Tabaco"], M.m1, { bestseller: true, bottle: { 75: 600 } }),
  P("le-beau-le-parfum", "Jean Paul Gaultier", "Le Beau Le Parfum", "men", "designer", "Fresco", "EDP", T243251, ["Coco", "Madera", "Especias"], M.m2, { bottle: { 100: 680 } }),
  P("paradise-garden", "Lattafa", "Paradise Garden", "unisex", "designer", "Floral", "EDP", T243251, ["Flores", "Coco", "Ámbar"], M.m3),
  P("victory-elixir", "Paco Rabanne", "Victory Elixir", "men", "designer", "Especiado", "EDP", T243251, ["Especias", "Ámbar", "Café"], M.m4, { bottle: { 100: 650 } }),
  P("purple-melancholia", "Valentino", "Purple Melancholia", "unisex", "niche", "Floral", "EDP", T263456, ["Violeta", "Flores", "Ámbar"], M.m5), // brand: CLIENT_CONFIRMED 2026-08-30
  P("bir-intense", "Burberry", "Burberry Brit Intense", "men", "designer", "Amaderado", "EDP", T263456, ["Romero", "Cedro", "Ámbar"], M.m6, { bottle: { 100: 720 } }),
  P("b-man-in-black", "Bvlgari", "Bvlgari Man In Black", "men", "designer", "Amaderado", "EDP", T263456, ["Ron", "Cuero", "Especias"], M.m7, { bottle: { 100: 760 } }),
  P("sauvage-edt", "Dior", "Sauvage EDT", "men", "designer", "Fresco", "EDT", T223048, ["Bergamota", "Pimienta", "Ámbar"], M.m8, { bestseller: true, bottle: { 100: 650 } }),
  P("dylan-blue", "Versace", "Dylan Blue", "men", "designer", "Fresco", "EDP", T303869, ["Bergamota", "Agua", "Almizcle"], M.m1, { bottle: { 100: 620 } }),
  P("adg-profondo-edp", "Armani", "Acqua di Gio Profondo EDP", "men", "designer", "Fresco", "EDP", T263456, ["Marino", "Bergamota", "Madera"], M.m2, { bottle: { 100: 700 } }),
  P("1-million-lucky", "Paco Rabanne", "1 Million Lucky", "men", "designer", "Gourmand", "EDT", T263456, ["Ciruela", "Avellana", "Ámbar"], M.m3, { bottle: { 100: 780 } }),
  P("invictus-elixir", "Paco Rabanne", "Invictus Elixir", "men", "designer", "Fresco", "EDP", T243251, ["Acuático", "Ámbar", "Madera"], M.m1),
  P("reserve-privee", "Armani", "Reserve Privée", "men", "designer", "Amaderado", "EDP", T263456, ["Madera", "Ámbar", "Vainilla"], M.m4),
  P("cedrat-boise-int", "Mancera", "Cedrat Boise Intense", "men", "niche", "Cítrico", "EDP", T263456, ["Limón", "Cedro", "Almizcle"], M.m5, { bottle: { 100: 820 } }),
  P("m-red-tobacco", "Mancera", "Mancera Red Tobacco", "men", "niche", "Especiado", "EDP", T263456, ["Tabaco", "Canela", "Ámbar"], M.m6, { bottle: { 100: 850 } }),
  P("tmw-parfum", "Azzaro", "The Most Wanted Parfum", "men", "designer", "Especiado", "Parfum", T243251, ["Manzana", "Toffee", "Ámbar"], M.m7, { bottle: { 100: 700 } }),
  P("by-the-fireplace", "Maison Margiela", "By The Fireplace", "unisex", "designer", "Gourmand", "EDP", T263456, ["Castaña", "Vainilla", "Madera"], M.m8, { bottle: { 100: 750 } }),
  P("erba-pura", "Xerjoff", "Erba Pura", "unisex", "niche", "Gourmand", "EDP", T404889, ["Fruta", "Vainilla", "Almizcle"], M.m2, { bestseller: true, bottle: { 50: 900, 100: 1350 } }),
  P("nautica-voyage", "Nautica", "Nautica Voyage", "men", "designer", "Acuático", "EDT", T121626, ["Marino", "Manzana", "Madera"], M.m5)
];

/* Enriquecer productos con imágenes reales */
window.CRUZIAL_PRODUCTS.forEach(p => {
  const imgs = IMG_MAP[p.id];
  if (imgs) {
    p.img = imgs.set || imgs.bottle || null;
    p.imgBottle = imgs.bottle || null;
    p.imgSet = imgs.set || imgs.bottle || null;
  } else {
    p.img = null;
    p.imgBottle = null;
    p.imgSet = null;
  }
});