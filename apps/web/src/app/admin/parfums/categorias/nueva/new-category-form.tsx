"use client";

import { useActionState } from "react";
import { CategoryFormFields } from "@/components/admin/category-form-fields";
import type { CategoryParentOption } from "@/domains/admin-parfums/categories-repository";
import { createCategoryAction, type CategoryActionState } from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "../../productos/page.module.css";

const initialState: CategoryActionState = { status: "idle" };

export function NewCategoryForm({ parentOptions }: { parentOptions: CategoryParentOption[] }) {
  const [state, formAction, pending] = useActionState(createCategoryAction, initialState);
  const errors = state.status === "field_errors" ? state.errors : {};

  return (
    <form action={formAction} className={styles.formWrapper} aria-busy={pending}>
      {state.status === "error" ? <p className={formStyles.error} role="alert">{state.message}</p> : null}
      <CategoryFormFields
        defaults={{
          kind: "commercial_type",
          slug: "",
          name: "",
          description: "",
          parentId: "",
          publicationStatus: "draft",
          sortOrder: "0",
        }}
        parentOptions={parentOptions}
        errors={errors}
        disabled={pending}
      />
      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton} disabled={pending}>
          {pending ? "Creando…" : "Crear categoría"}
        </button>
      </div>
    </form>
  );
}
