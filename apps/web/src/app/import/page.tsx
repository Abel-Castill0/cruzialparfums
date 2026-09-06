import type { Metadata } from "next";
import { UnitPlaceholder } from "@/components/storefront/unit-placeholder";
import { BUSINESS_UNITS } from "@/domains/platform/contracts";

export const metadata: Metadata = {
  title: "Import",
};

export default function ImportPage() {
  return <UnitPlaceholder unit={BUSINESS_UNITS[1]} />;
}
