"use client";

import { useActionState, useState } from "react";
import { adminButtonClass } from "@/components/admin/admin-ui";
import type { ContentBlockType } from "@/lib/content/schemas";
import type { ContentPageSlug, ContentUnit } from "@/lib/content/registry";
import {
  resetContentBlockAction,
  saveCarouselItemsAction,
  saveContentBlockAction,
  setContentBlockVisibilityAction,
  type ContentActionState,
} from "./actions";
import styles from "./contenido.module.css";

const initial: ContentActionState = { status: "idle" };

export type ProductCandidate = { id: string; label: string };

export type AdminContentSection = {
  page: ContentPageSlug;
  unit: ContentUnit;
  key: string;
  blockType: ContentBlockType;
  label: string;
  description: string;
  canEdit: boolean;
  blockId: string | null;
  updatedAt: string | null;
  isVisible: boolean;
  content: { title?: string | undefined; body?: string | undefined; ctaLabel?: string | undefined; ctaHref?: string | undefined } | null;
  fallback: { title?: string | undefined; body?: string | undefined; ctaLabel?: string | undefined; ctaHref?: string | undefined };
  carouselIds: string[];
};

function Feedback({ state }: { state: ContentActionState }) {
  return (
    <p className={styles.feedback} role={state.status === "error" ? "alert" : "status"} data-state={state.status}>
      {state.status === "idle" ? "" : state.message}
    </p>
  );
}

function statusOf(section: AdminContentSection): { tone: string; text: string } {
  if (!section.blockId) return { tone: "original", text: "Usando el contenido original" };
  if (!section.isVisible) return { tone: "hidden", text: "Edición guardada · desactivada en la web" };
  return { tone: "custom", text: "Editado · aplicado en la web" };
}

const BLOCK_TYPE_LABEL: Record<ContentBlockType, string> = {
  hero: "Portada",
  text_banner: "Texto",
  carousel: "Carrusel",
};

function ValueFields({ section }: { section: AdminContentSection }) {
  const value = section.content ?? section.fallback;
  const disabled = !section.canEdit;
  // A section only offers a button when the template has one: the two doors of
  // the selector and the TikTok block have no button, so their destination and
  // label stay structural and are never editable.
  const hasCta = Boolean(section.fallback.ctaLabel);
  if (section.blockType === "hero") {
    return (
      <>
        <label className={styles.field}>
          <span>Título</span>
          <input name="title" required maxLength={80} defaultValue={value.title ?? ""} disabled={disabled} />
        </label>
        {hasCta ? (
          <>
            <label className={styles.field}>
              <span>Texto del botón</span>
              <input name="ctaLabel" maxLength={30} defaultValue={value.ctaLabel ?? ""} disabled={disabled} />
            </label>
            <label className={styles.field}>
              <span>Destino del botón</span>
              <input name="ctaHref" maxLength={2048} defaultValue={value.ctaHref ?? ""} placeholder="/parfums/catalogo" disabled={disabled} />
            </label>
          </>
        ) : null}
      </>
    );
  }
  if (section.blockType === "carousel") {
    return (
      <label className={styles.field}>
        <span>Título del carrusel (opcional)</span>
        <input name="title" maxLength={80} defaultValue={value.title ?? ""} disabled={disabled} />
      </label>
    );
  }
  return (
    <>
      <label className={styles.field}>
        <span>Título</span>
        <input name="title" required maxLength={80} defaultValue={value.title ?? ""} disabled={disabled} />
      </label>
      <label className={styles.field}>
        <span>Texto</span>
        <textarea name="body" rows={5} maxLength={2000} defaultValue={value.body ?? ""} disabled={disabled} />
        <small>Admite **negrita**, *cursiva*, listas con «- » y enlaces https. No admite HTML ni imágenes.</small>
      </label>
      {hasCta ? (
        <>
          <label className={styles.field}>
            <span>Texto del botón (opcional)</span>
            <input name="ctaLabel" maxLength={30} defaultValue={value.ctaLabel ?? ""} disabled={disabled} />
          </label>
          <label className={styles.field}>
            <span>Destino del botón (opcional)</span>
            <input name="ctaHref" maxLength={2048} defaultValue={value.ctaHref ?? ""} placeholder="/parfums/nosotros" disabled={disabled} />
          </label>
        </>
      ) : null}
    </>
  );
}

function SectionEditor({ section }: { section: AdminContentSection }) {
  const [state, formAction, pending] = useActionState(saveContentBlockAction.bind(null, section.page, section.key), initial);
  const status = statusOf(section);
  return (
    <li className={styles.card} data-section={section.key} data-status={status.tone}>
      <div className={styles.cardHead}>
        <div>
          <h3>{section.label}</h3>
          <p className={styles.cardDescription}>{section.description}</p>
        </div>
        <p className={styles.cardMeta}>
          <span className={styles.tag}>{BLOCK_TYPE_LABEL[section.blockType]}</span>
          <span className={styles.status}>{status.text}</span>
        </p>
      </div>

      <details className={styles.editor} open={false}>
        <summary>{section.canEdit ? "Editar" : "Ver contenido"}</summary>
        <form action={formAction} className={styles.form}>
          <input type="hidden" name="blockType" value={section.blockType} />
          <ValueFields section={section} />
          {section.canEdit ? (
            <label className={styles.check}>
              <input type="checkbox" name="isVisible" defaultChecked={section.blockId ? section.isVisible : true} disabled={pending} />
              Aplicar esta edición en la web
            </label>
          ) : null}
          {section.canEdit ? (
            <div className={styles.actions}>
              <button type="submit" className={adminButtonClass("primary")} disabled={pending}>
                {pending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          ) : (
            <p className={styles.readonly}>Acceso de solo lectura: un administrador puede modificar este contenido.</p>
          )}
          <Feedback state={state} />
        </form>
      </details>

      {section.blockId && section.canEdit ? <SectionControls section={section} /> : null}
    </li>
  );
}

function VisibilityControl({ section }: { section: AdminContentSection }) {
  const [state, formAction, pending] = useActionState(
    setContentBlockVisibilityAction.bind(null, section.page, section.unit, section.blockId!, section.updatedAt!),
    initial,
  );
  return (
    <form action={formAction} className={styles.inlineControl}>
      <input type="hidden" name="isVisible" value={section.isVisible ? "false" : "true"} />
      <button type="submit" className={adminButtonClass("secondary")} disabled={pending} aria-label={`${section.isVisible ? "Desactivar" : "Activar"} la edición de ${section.label} en la web`}>
        {section.isVisible ? "Desactivar" : "Activar"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

function ResetControl({ section }: { section: AdminContentSection }) {
  const [state, formAction, pending] = useActionState(
    resetContentBlockAction.bind(null, section.page, section.unit, section.blockId!),
    initial,
  );
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className={adminButtonClass("quiet")} onClick={() => setOpen(true)}>
        Restablecer
      </button>
    );
  }
  return (
    <form action={formAction} className={styles.inlineControl}>
      <label className={styles.check}>
        <input name="confirmReset" type="checkbox" required /> Confirmo volver al contenido original
      </label>
      <button type="submit" className={adminButtonClass("danger")} disabled={pending}>
        {pending ? "Restableciendo…" : "Restablecer"}
      </button>
      <button type="button" className={adminButtonClass("quiet")} onClick={() => setOpen(false)}>
        Cancelar
      </button>
      <Feedback state={state} />
    </form>
  );
}

function SectionControls({ section }: { section: AdminContentSection }) {
  return (
    <div className={styles.controls}>
      <VisibilityControl section={section} />
      <ResetControl section={section} />
    </div>
  );
}

function CarouselPicker({
  section,
  candidates,
}: {
  section: AdminContentSection;
  candidates: ProductCandidate[];
}) {
  const [state, formAction, pending] = useActionState(
    saveCarouselItemsAction.bind(null, section.page, section.unit, section.key),
    initial,
  );
  const [ids, setIds] = useState<string[]>(section.carouselIds);
  const [query, setQuery] = useState("");
  const selected = new Set(ids);
  const labels = new Map(candidates.map((candidate) => [candidate.id, candidate.label]));
  const normalized = query.trim().toLowerCase();
  const filtered = candidates.filter((candidate) => !normalized || candidate.label.toLowerCase().includes(normalized));

  const add = (id: string) => setIds((previous) => (previous.includes(id) ? previous : [...previous, id]));
  const remove = (id: string) => setIds((previous) => previous.filter((value) => value !== id));
  const move = (index: number, delta: number) =>
    setIds((previous) => {
      const target = index + delta;
      if (target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  return (
    <form action={formAction} className={styles.carousel}>
      {ids.map((id) => (
        <input key={id} type="hidden" name="product" value={id} />
      ))}
      <label className={styles.field}>
        <span>Buscar perfume para agregar</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre o marca"
          disabled={!section.canEdit || pending}
        />
      </label>

      <ol className={styles.selected} aria-label="Perfumes del carrusel, en orden">
        {ids.map((id, index) => (
          <li key={id}>
            <span className={styles.selectedName}>{labels.get(id) ?? "Perfume no disponible"}</span>
            {section.canEdit ? (
              <span className={styles.reorder}>
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0 || pending} aria-label={`Subir ${labels.get(id) ?? "perfume"}`}>
                  ↑
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === ids.length - 1 || pending} aria-label={`Bajar ${labels.get(id) ?? "perfume"}`}>
                  ↓
                </button>
                <button type="button" className={adminButtonClass("quiet")} onClick={() => remove(id)} disabled={pending}>
                  Quitar
                </button>
              </span>
            ) : null}
          </li>
        ))}
        {ids.length === 0 ? <li className={styles.empty}>Sin selección: la web usa la selección automática actual.</li> : null}
      </ol>

      {section.canEdit ? (
        <details className={styles.candidates}>
          <summary>Agregar perfumes ({filtered.length})</summary>
          <ul>
            {filtered.slice(0, 60).map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  className={adminButtonClass("quiet")}
                  onClick={() => add(candidate.id)}
                  disabled={pending || selected.has(candidate.id)}
                >
                  {selected.has(candidate.id) ? `✓ ${candidate.label}` : `+ ${candidate.label}`}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? <li>No hay perfumes publicados que coincidan.</li> : null}
          </ul>
        </details>
      ) : null}

      {section.canEdit ? (
        <div className={styles.actions}>
          <button type="submit" className={adminButtonClass("primary")} disabled={pending}>
            {pending ? "Guardando…" : "Guardar carrusel"}
          </button>
        </div>
      ) : null}
      <Feedback state={state} />
    </form>
  );
}

export function ContentPageEditor({
  sections,
  candidates,
}: {
  sections: AdminContentSection[];
  candidates: ProductCandidate[];
}) {
  return (
    <ul className={styles.list}>
      {sections.map((section) => (
        <SectionEditor key={section.key} section={section} />
      ))}
      {sections.some((section) => section.blockType === "carousel") ? (
        <li className={styles.card} data-section="carousel-products">
          <div className={styles.cardHead}>
            <div>
              <h3>Productos del carrusel de destacados</h3>
              <p className={styles.cardDescription}>Elige y ordena qué fragancias aparecen en la tira de la portada. Si no eliges ninguna, la web usa la selección automática.</p>
            </div>
          </div>
          {sections
            .filter((section) => section.blockType === "carousel")
            .map((section) => (
              <CarouselPicker key={section.key} section={section} candidates={candidates} />
            ))}
        </li>
      ) : null}
    </ul>
  );
}
