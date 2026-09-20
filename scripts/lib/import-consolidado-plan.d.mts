export interface PopulationProduct {
  canonical_id: string;
  slug: string;
  name: string;
  brand: string | null;
}

export interface PopulationPresentation {
  product_canonical_id: string;
  stable_key: string;
  label: string;
}

export interface PopulationOffer {
  product_canonical_id: string;
  pres_stable_key: string;
  pres_label: string;
  price_amount: string;
  availability_status: "unconfirmed" | "available" | "out_of_stock";
}

export interface PopulationPlan {
  products: PopulationProduct[];
  presentations: PopulationPresentation[];
  offers: PopulationOffer[];
  skipped: Array<{ reason: string }>;
  stats: {
    conflicts: number;
  };
}

export function buildPopulationPlan(reviewed: unknown, overrides: unknown): PopulationPlan;
