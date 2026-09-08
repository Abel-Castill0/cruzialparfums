import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/auth/admin-session";
import { NewProductForm } from "./new-product-form";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function NewProductPage() {
  const result = await getAdminSession();
  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "parfums" && candidate.role === "admin",
  );
  // A viewer can browse the list/detail but never reaches the create form —
  // this mirrors the server-side check the action itself will repeat.
  if (!membership) redirect("/admin/parfums/productos");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/parfums/productos" className={styles.back}>
            ← Productos
          </Link>
          <h1>Nuevo producto</h1>
        </div>
      </header>
      <main>
        <NewProductForm />
      </main>
    </div>
  );
}
