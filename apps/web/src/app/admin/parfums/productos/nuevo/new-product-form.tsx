"use client";

import { useActionState } from "react";
import { ProductFormFields } from "@/components/admin/product-form-fields";
import { createProductAction, type ActionState } from "../actions";
import type { Database } from "@/lib/supabase/database.types";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "../page.module.css";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];

const emptyDefaults = {
  slug: "",
  name: "",
  brand: "",
  shortDescription: "",
  description: "",
  gender: "",
  concentration: "",
  salesMode: "always_available",
  productionStatus: "active",
  publicationStatus: "draft",
  isFeatured: false,
  featuredRank: "",
  featuredFrom: "",
  featuredUntil: "",
};

const initialState: ActionState<ProductRow> = { status: "idle" };

export function NewProductForm() {
  const [state, formAction, pending] = useActionState(createProductAction, initialState);

  const fieldErrors = state.status === "field_errors" ? state.errors : {};

  return (
    <form action={formAction} className={styles.formWrapper} aria-busy={pending}>
      {state.status === "error" ? (
        <p className={formStyles.error} role="alert">{state.message}</p>
      ) : null}

      <ProductFormFields defaults={emptyDefaults} errors={fieldErrors} disabled={pending} />

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton} disabled={pending}>
          {pending ? "Creando…" : "Crear producto"}
        </button>
      </div>
    </form>
  );
}
