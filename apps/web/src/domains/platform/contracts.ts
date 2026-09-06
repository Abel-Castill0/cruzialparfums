import type { Route } from "next";

export type BusinessUnitCode = "parfums" | "import";
export type SalesMode = "campaign" | "always_available" | "catalog_only";
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "open"
  | "paused"
  | "closed"
  | "fulfilled";

export type BusinessUnit = {
  code: BusinessUnitCode;
  label: string;
  shortName: string;
  promise: string;
  scope: readonly string[];
  href: Route;
};

export const BUSINESS_UNITS = [
  {
    code: "parfums",
    label: "CRUZIAL PARFUMS",
    shortName: "Parfums",
    promise: "Entrega inmediata",
    scope: ["Decants", "Perfumes sellados"],
    href: "/parfums",
  },
  {
    code: "import",
    label: "CRUZIAL IMPORT",
    shortName: "Import",
    promise: "Importaciones",
    scope: ["Consolidados", "Relojes", "Más"],
    href: "/import",
  },
] as const satisfies readonly BusinessUnit[];

export const CART_STORAGE_KEYS = {
  parfums: "cruzial:v2:cart:parfums",
  import: "cruzial:v2:cart:import",
} as const satisfies Record<BusinessUnitCode, string>;

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "open",
  "paused",
  "closed",
  "fulfilled",
] as const satisfies readonly CampaignStatus[];
