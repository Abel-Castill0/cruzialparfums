"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveStatus, adminButtonClass } from "@/components/admin/admin-ui";
import { MAX_NOTES_PER_PRODUCT, moveItem, sameOrder } from "@/domains/notes/note-forms";
import { setProductNotesAction } from "../../notas/actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import catalogStyles from "@/components/admin/catalog-workspace.module.css";
import styles from "../page.module.css";

export type NoteOption = { id: string; name: string };

/**
 * The notes of one perfume, in display order. The order is changed with up/down buttons (no drag and drop, decided in
 * docs/content-editor-architecture.md §6). Nothing is stored until «Guardar notas».
 */
export function ProductNotesEditor({
  productId,
  available,
  assignedIds,
  disabled,
}: {
  productId: string;
  /** Every active note of the business unit. */
  available: NoteOption[];
  /** The product's notes, already in order. */
  assignedIds: string[];
  disabled: boolean;
}) {
  const router = useRouter();
  const byId = new Map(available.map((note) => [note.id, note.name]));
  const initialIds = assignedIds.filter((id) => byId.has(id));
  const [saved, setSaved] = useState<string[]>(initialIds);
  const [ids, setIds] = useState<string[]>(initialIds);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dirty = !sameOrder(ids, saved);
  const remaining = available.filter((note) => !ids.includes(note.id));

  function change(next: string[]) {
    setIds(next);
    setJustSaved(false);
  }

  function add() {
    if (!choice || ids.includes(choice) || ids.length >= MAX_NOTES_PER_PRODUCT) return;
    change([...ids, choice]);
    setChoice("");
  }

  function save() {
    setError(null);
    const snapshot = [...ids];
    startTransition(async () => {
      try {
        const result = await setProductNotesAction(productId, snapshot);
        if (result.status === "error") setError(`${result.message} Las notas no se guardaron.`);
        else {
          setSaved(snapshot);
          setJustSaved(true);
          router.refresh();
        }
      } catch {
        setError("No pudimos confirmar el guardado. Recarga la página antes de volver a intentarlo.");
      }
    });
  }

  return (
    <section className={styles.section} aria-labelledby="notes-title">
      <div className={styles.sectionTitle}>
        <h2 id="notes-title">Notas y aromas</h2>
      </div>
      <p className={catalogStyles.muted}>
        Se muestran en la ficha del producto en este orden y alimentan el recomendador. Crea o renombra notas en{" "}
        <a href="/admin/parfums/notas">Notas y aromas</a>.
      </p>
      {error ? <p className={formStyles.error} role="alert">{error}</p> : null}

      <fieldset className={catalogStyles.card} disabled={disabled || isPending}>
        <legend className={catalogStyles.cardTitle}>Notas del producto ({ids.length})</legend>
        {ids.length === 0 ? <p className={catalogStyles.muted}>Este producto no tiene notas.</p> : null}
        <ol className={styles.categoryList} data-product-notes>
          {ids.map((id, index) => {
            const name = byId.get(id) ?? "Nota";
            return (
              <li key={id} className={styles.categoryChip} data-note={name}>
                <span>{index + 1}. {name}</span>
                <button type="button" className={adminButtonClass("quiet")} aria-label={`Subir ${name}`} disabled={index === 0} onClick={() => change(moveItem(ids, index, -1))}>↑</button>
                <button type="button" className={adminButtonClass("quiet")} aria-label={`Bajar ${name}`} disabled={index === ids.length - 1} onClick={() => change(moveItem(ids, index, 1))}>↓</button>
                <button type="button" className={adminButtonClass("quiet")} aria-label={`Quitar ${name}`} onClick={() => change(ids.filter((value) => value !== id))}>Quitar</button>
              </li>
            );
          })}
        </ol>

        <div className={catalogStyles.actionsRow}>
          <label>
            <span className={catalogStyles.muted}>Añadir una nota</span>{" "}
            <select value={choice} onChange={(event) => setChoice(event.target.value)} disabled={remaining.length === 0 || ids.length >= MAX_NOTES_PER_PRODUCT}>
              <option value="">{remaining.length === 0 ? "No quedan notas por añadir" : "Elige una nota…"}</option>
              {remaining.map((note) => <option key={note.id} value={note.id}>{note.name}</option>)}
            </select>
          </label>
          <button type="button" className={adminButtonClass("secondary")} onClick={add} disabled={!choice}>Añadir</button>
        </div>
      </fieldset>

      {!disabled ? (
        <div className={catalogStyles.actionsRow}>
          <button type="button" className={adminButtonClass("primary")} onClick={save} disabled={isPending || !dirty}>
            {isPending ? "Guardando…" : "Guardar notas"}
          </button>
          <SaveStatus
            state={isPending ? "saving" : dirty ? "dirty" : justSaved ? "saved" : "idle"}
            message={justSaved && !dirty && !isPending ? "Notas guardadas" : undefined}
          />
        </div>
      ) : null}
    </section>
  );
}
