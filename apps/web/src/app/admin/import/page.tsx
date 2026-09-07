import type { Metadata } from "next";
import { AdminUnitPage } from "@/components/admin/admin-unit-page";

export const metadata: Metadata = { title: "Import" };

const areas = [
  "Productos",
  "Categorías",
  "Consolidado / Campañas",
  "Precios",
  "Disponibilidad",
  "Pedidos",
  "Clientes / Waitlist",
  "Delivery",
  "Adelantos",
  "Media",
  "Settings",
  "Auditoría",
] as const;

export default function AdminImportPage() {
  return <AdminUnitPage unitLabel="Cruzial Import" areas={areas} />;
}
