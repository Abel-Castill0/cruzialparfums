/**
 * Schematic ("tile grid") layout of Lima Metropolitana's 43 districts, north at
 * the top. It is a reference sketch, not a to-scale map: it needs no map
 * provider, tile requests or third-party scripts.
 */
export type LimaDistrict = {
  /** Name as shown to customers. */
  name: string;
  /** Short label that fits a tile on a phone; "|" marks a line break. */
  short: string;
  col: number;
  row: number;
};

export const LIMA_DISTRICTS: readonly LimaDistrict[] = [
  { name: "Ancón", short: "Ancón", col: 3, row: 0 },
  { name: "Santa Rosa", short: "Sta.|Rosa", col: 3, row: 1 },
  { name: "Puente Piedra", short: "Pte.|Piedra", col: 2, row: 2 },
  { name: "Carabayllo", short: "Carabay.", col: 3, row: 2 },
  { name: "San Martín de Porres", short: "SMP", col: 1, row: 3 },
  { name: "Los Olivos", short: "Los|Olivos", col: 2, row: 3 },
  { name: "Comas", short: "Comas", col: 3, row: 3 },
  { name: "Rímac", short: "Rímac", col: 2, row: 4 },
  { name: "Independencia", short: "Indep.", col: 3, row: 4 },
  { name: "San Juan de Lurigancho", short: "SJL", col: 4, row: 4 },
  { name: "San Miguel", short: "San|Miguel", col: 0, row: 5 },
  { name: "Pueblo Libre", short: "Pueblo|Libre", col: 1, row: 5 },
  { name: "Cercado de Lima", short: "Cercado", col: 2, row: 5 },
  { name: "El Agustino", short: "Agustino", col: 3, row: 5 },
  { name: "Santa Anita", short: "Sta.|Anita", col: 4, row: 5 },
  { name: "Ate", short: "Ate", col: 5, row: 5 },
  { name: "Chaclacayo", short: "Chaclac.", col: 6, row: 5 },
  { name: "Lurigancho-Chosica", short: "Chosica", col: 7, row: 5 },
  { name: "Magdalena del Mar", short: "Magdal.", col: 0, row: 6 },
  { name: "Jesús María", short: "Jesús|María", col: 1, row: 6 },
  { name: "Breña", short: "Breña", col: 2, row: 6 },
  { name: "La Victoria", short: "La|Victoria", col: 3, row: 6 },
  { name: "San Luis", short: "San|Luis", col: 4, row: 6 },
  { name: "La Molina", short: "La|Molina", col: 5, row: 6 },
  { name: "Cieneguilla", short: "Cieneg.", col: 6, row: 6 },
  { name: "San Isidro", short: "San|Isidro", col: 1, row: 7 },
  { name: "Lince", short: "Lince", col: 2, row: 7 },
  { name: "Surquillo", short: "Surquil.", col: 3, row: 7 },
  { name: "San Borja", short: "San|Borja", col: 4, row: 7 },
  { name: "Santiago de Surco", short: "Surco", col: 5, row: 7 },
  { name: "Miraflores", short: "Miraflor.", col: 1, row: 8 },
  { name: "Barranco", short: "Barranco", col: 2, row: 8 },
  { name: "Chorrillos", short: "Chorrill.", col: 3, row: 8 },
  { name: "San Juan de Miraflores", short: "SJM", col: 4, row: 8 },
  { name: "Villa María del Triunfo", short: "VMT", col: 5, row: 8 },
  { name: "Pachacámac", short: "Pachac.", col: 6, row: 8 },
  { name: "Villa El Salvador", short: "VES", col: 3, row: 9 },
  { name: "Lurín", short: "Lurín", col: 5, row: 9 },
  { name: "Punta Hermosa", short: "Pta.|Hermosa", col: 3, row: 10 },
  { name: "Punta Negra", short: "Pta.|Negra", col: 4, row: 10 },
  { name: "San Bartolo", short: "San|Bartolo", col: 3, row: 11 },
  { name: "Santa María del Mar", short: "Sta. M.|del Mar", col: 4, row: 11 },
  { name: "Pucusana", short: "Pucusana", col: 3, row: 12 },
];

export const LIMA_GRID_COLS = 8;
export const LIMA_GRID_ROWS = 13;

/**
 * Districts where the motorizado does not reach every zone, so the delivery
 * point is agreed over WhatsApp (or the customer picks a Shalom agency).
 *
 * PROVENANCE (provisional, owner to confirm): there is no official list of
 * "zonas rojas" for couriers. This starts from the eight Lima districts the
 * national government placed under a state of emergency for crime in 2025 (see
 * Panamericana / Radio Nacional / Mininter coverage). The 2026 decrees cover
 * ALL of Lima and Callao, so they cannot narrow the list. The wording shown to
 * customers is deliberately neutral ("acceso restringido") and never blocks an
 * order: the motorizado is always quoted and agreed over WhatsApp.
 */
export const MOTORIZADO_RESTRICTED_DISTRICTS: readonly string[] = [
  "Ate",
  "Carabayllo",
  "Comas",
  "Puente Piedra",
  "San Martín de Porres",
  "San Juan de Lurigancho",
  "Villa María del Triunfo",
  "Villa El Salvador",
];

export function isMotorizadoRestricted(district: string) {
  return MOTORIZADO_RESTRICTED_DISTRICTS.includes(district);
}

export function isLimaDistrict(district: string) {
  return LIMA_DISTRICTS.some((item) => item.name === district);
}
