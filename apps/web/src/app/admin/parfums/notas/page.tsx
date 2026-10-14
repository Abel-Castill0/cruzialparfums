import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminPage, AdminPageHeader, AdminSection, EmptyState, Notice } from "@/components/admin/admin-ui";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewNoteForm, NoteRowForm } from "./notes-forms";
import styles from "./notas.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notas y aromas" };

export default async function ParfumsNotesPage() {
  const session = await getAdminSession();
  if (session.status === "signed_out") redirect("/admin/login");
  if (session.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (session.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
  if (session.status !== "ok") redirect("/admin");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  if (!membership) redirect("/admin");
  const canEdit = membership.role === "admin";

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="Cruzial Parfums" title="Notas y aromas" />
        <Notice tone="danger" title="El backend de administración no está configurado." />
      </AdminPage>
    );
  }

  const [notesResult, linksResult] = await Promise.all([
    supabase.from("notes").select("id,name,type,description,image_url,is_active,updated_at").eq("business_unit_id", membership.businessUnitId).order("name"),
    supabase.from("product_notes").select("note_id"),
  ]);
  if (notesResult.error || linksResult.error) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="Cruzial Parfums" title="Notas y aromas" />
        <Notice tone="danger" title="No se pudieron cargar las notas">Recarga la página. Si el problema continúa, revisa Operaciones.</Notice>
      </AdminPage>
    );
  }

  const uses = new Map<string, number>();
  for (const link of linksResult.data ?? []) uses.set(link.note_id, (uses.get(link.note_id) ?? 0) + 1);
  const notes = notesResult.data ?? [];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Cruzial Parfums"
        title="Notas y aromas"
        description="El catálogo de notas que se asignan a los perfumes. Se ven en la ficha del producto y alimentan el recomendador."
        meta={canEdit ? "Asigna las notas a cada perfume desde su ficha, con el orden que quieras." : "Acceso de solo lectura: un administrador de Parfums puede modificar las notas."}
      />
      <AdminSection
        id="catalogo"
        title={`Notas (${notes.length})`}
        description="Una nota que usan productos no se elimina: quítala de ellos o desactívala. Los nombres con otra ortografía (Vainilla / vainilla) cuentan como la misma nota."
      >
        {notes.length === 0 ? <EmptyState title="Todavía no hay notas">Crea la primera abajo.</EmptyState> : null}
        <ul className={styles.list}>
          {notes.map((note) => (
            <NoteRowForm
              key={note.id}
              note={{ id: note.id, name: note.name, type: note.type, description: note.description ?? "", imageUrl: note.image_url ?? "", isActive: note.is_active, updatedAt: note.updated_at, uses: uses.get(note.id) ?? 0 }}
              canEdit={canEdit}
            />
          ))}
        </ul>
        {canEdit ? <NewNoteForm /> : null}
      </AdminSection>
    </AdminPage>
  );
}
