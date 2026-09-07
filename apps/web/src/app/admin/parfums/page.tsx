import type { Metadata } from "next";
import { AdminUnitPage } from "@/components/admin/admin-unit-page";

export const metadata: Metadata = { title: "Parfums" };

const areas = [
  "Productos",
  "Variantes",
  "Decants",
  "Frascos",
  "Disponibilidad",
  "Combos",
  "Promociones",
  "Mayorista",
  "Pedidos",
  "Media",
  "Settings",
  "Auditoría",
] as const;

export default function AdminParfumsPage() {
  return <AdminUnitPage unitLabel="Cruzial Parfums" areas={areas} />;
}
