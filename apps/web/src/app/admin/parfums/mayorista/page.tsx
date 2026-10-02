import { redirect } from "next/navigation";
import type { Route } from "next";

/** Mayorista is managed only in the isolated Cruzial Import workspace. */
export default function LegacyParfumsWholesaleRoute() {
  redirect("/admin/import/mayorista" as Route);
}
