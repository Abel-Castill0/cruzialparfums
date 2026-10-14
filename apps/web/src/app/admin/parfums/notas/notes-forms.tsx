"use client";

import { useActionState, useState } from "react";
import { adminButtonClass } from "@/components/admin/admin-ui";
import { NOTE_TYPES, NOTE_TYPE_LABELS } from "@/domains/notes/note-forms";
import { deleteNoteAction, saveNoteAction, type NotesActionState } from "./actions";
import styles from "./notas.module.css";

const initial: NotesActionState = { status: "idle" };

export type NoteRow = {
  id: string;
  name: string;
  type: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
  updatedAt: string;
  uses: number;
};

function Feedback({ state }: { state: NotesActionState }) {
  return (
    <p className={styles.feedback} role={state.status === "error" ? "alert" : "status"} data-state={state.status}>
      {state.status === "idle" ? "" : state.message}
    </p>
  );
}

function Fields({ note, disabled }: { note: NoteRow | null; disabled: boolean }) {
  return (
    <>
      <label>
        <span className={styles.label}>Nombre</span>
        <input name="name" required minLength={2} maxLength={60} defaultValue={note?.name} placeholder="Ej. Vainilla" disabled={disabled} />
      </label>
      <label>
        <span className={styles.label}>Tipo</span>
        <select name="type" defaultValue={note?.type ?? "general"} disabled={disabled}>
          {NOTE_TYPES.map((type) => <option key={type} value={type}>{NOTE_TYPE_LABELS[type]}</option>)}
        </select>
      </label>
      <label className={styles.wide}>
        <span className={styles.label}>Descripción (opcional)</span>
        <input name="description" maxLength={300} defaultValue={note?.description} disabled={disabled} />
      </label>
      <label className={styles.wide}>
        <span className={styles.label}>Imagen https (opcional)</span>
        <input name="imageUrl" type="url" maxLength={500} defaultValue={note?.imageUrl} placeholder="https://…" disabled={disabled} />
      </label>
      <label className={styles.check}>
        <input name="isActive" type="checkbox" defaultChecked={note?.isActive ?? true} disabled={disabled} /> Visible en la tienda
      </label>
    </>
  );
}

function DeleteControl({ note }: { note: NoteRow }) {
  const [state, formAction, pending] = useActionState(deleteNoteAction.bind(null, note.id), initial);
  const [open, setOpen] = useState(false);
  if (note.uses > 0) return <p className={styles.hint}>La usan {note.uses} producto(s): quítala de ellos o desactívala para eliminarla.</p>;
  if (!open) return <button type="button" className={adminButtonClass("quiet")} onClick={() => setOpen(true)}>Eliminar</button>;
  return (
    <form action={formAction} className={styles.confirm}>
      <label><input name="confirmDelete" type="checkbox" required /> Confirmo eliminar «{note.name}»</label>
      <button type="submit" className={adminButtonClass("danger")} disabled={pending}>{pending ? "Eliminando…" : "Eliminar"}</button>
      <button type="button" className={adminButtonClass("quiet")} onClick={() => setOpen(false)}>Cancelar</button>
      <Feedback state={state} />
    </form>
  );
}

export function NoteRowForm({ note, canEdit }: { note: NoteRow; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(saveNoteAction.bind(null, note.id, note.updatedAt), initial);
  return (
    <li className={styles.row} data-note={note.name}>
      <form action={formAction} className={styles.grid}>
        <Fields note={note} disabled={!canEdit || pending} />
        {canEdit ? <div className={styles.actions}><button type="submit" className={adminButtonClass("secondary")} disabled={pending}>{pending ? "Guardando…" : "Guardar nota"}</button></div> : null}
        <Feedback state={state} />
      </form>
      <p className={styles.hint}>{note.uses === 0 ? "Sin productos." : `${note.uses} producto(s).`}{note.isActive ? "" : " Oculta en la tienda."}</p>
      {canEdit ? <DeleteControl note={note} /> : null}
    </li>
  );
}

export function NewNoteForm() {
  const [state, formAction, pending] = useActionState(saveNoteAction.bind(null, "", ""), initial);
  return (
    <form action={formAction} className={`${styles.grid} ${styles.newRow}`}>
      <Fields note={null} disabled={pending} />
      <div className={styles.actions}><button type="submit" className={adminButtonClass("primary")} disabled={pending}>{pending ? "Creando…" : "Crear nota"}</button></div>
      <Feedback state={state} />
    </form>
  );
}
