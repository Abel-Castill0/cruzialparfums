import Link from "next/link";
import type { Route } from "next";
import styles from "./admin-ui.module.css";

// Shared, presentation-only admin building blocks. They never decide what a
// visitor may see or do — callers pass already-authorized data and omit
// mutation controls for read-only members.

export type AdminTone = "neutral" | "healthy" | "attention" | "danger";

const TONE_CLASS: Record<AdminTone, string | undefined> = {
  neutral: styles.toneNeutral,
  healthy: styles.toneHealthy,
  attention: styles.toneAttention,
  danger: styles.toneDanger,
};

const TONE_GLYPH: Record<AdminTone, string> = {
  neutral: "○",
  healthy: "✓",
  attention: "!",
  danger: "×",
};

export function AdminPage({
  width = "default",
  children,
}: {
  width?: "default" | "wide";
  children: React.ReactNode;
}) {
  return <div className={`${styles.page} ${width === "wide" ? styles.pageWide : ""}`}>{children}</div>;
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderText}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className={styles.pageDescription}>{description}</p> : null}
        {meta ? <p className={styles.pageMeta}>{meta}</p> : null}
      </div>
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </header>
  );
}

/** Text + glyph, never color alone. */
export function StatusBadge({ tone, children }: { tone: AdminTone; children: React.ReactNode }) {
  return (
    <span className={`${styles.badge} ${TONE_CLASS[tone]}`}>
      <span aria-hidden="true" className={styles.badgeGlyph}>{TONE_GLYPH[tone]}</span>
      {children}
    </span>
  );
}

export function AdminSection({
  title,
  description,
  id,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className={styles.section} aria-labelledby={headingId} id={id}>
      <div className={styles.sectionHead}>
        <h2 id={headingId}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Notice({
  tone,
  title,
  children,
  action,
}: {
  tone: AdminTone;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${styles.notice} ${TONE_CLASS[tone]}`} role={tone === "danger" ? "alert" : undefined}>
      <span aria-hidden="true" className={styles.noticeGlyph}>{TONE_GLYPH[tone]}</span>
      <div className={styles.noticeBody}>
        <strong>{title}</strong>
        {children ? <div className={styles.noticeText}>{children}</div> : null}
        {action ? <div className={styles.noticeAction}>{action}</div> : null}
      </div>
    </div>
  );
}

export function ActionLink({
  href,
  variant = "secondary",
  external = false,
  children,
}: {
  href: string;
  variant?: "primary" | "secondary" | "quiet";
  external?: boolean;
  children: React.ReactNode;
}) {
  const className = `${styles.actionLink} ${variant === "primary" ? styles.actionPrimary : variant === "quiet" ? styles.actionQuiet : styles.actionSecondary}`;
  if (external) {
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer">
        {children} <span aria-hidden="true">↗</span>
        <span className={styles.srOnly}> (se abre en una pestaña nueva)</span>
      </a>
    );
  }
  return (
    <Link href={href as Route} className={className}>
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}

export type AttentionItem = {
  key: string;
  title: string;
  detail?: string;
  href: string;
  actionLabel: string;
  tone: AdminTone;
};

/** Only real, non-zero items belong here — callers omit anything they
 * cannot derive safely instead of rendering a zero or placeholder row. */
export function AttentionList({ items, label }: { items: readonly AttentionItem[]; label: string }) {
  return (
    <ul className={styles.attentionList} aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className={`${styles.attentionItem} ${TONE_CLASS[item.tone]}`}>
          <span aria-hidden="true" className={styles.attentionGlyph}>{TONE_GLYPH[item.tone]}</span>
          <div className={styles.attentionText}>
            <strong>{item.title}</strong>
            {item.detail ? <span>{item.detail}</span> : null}
          </div>
          <Link href={item.href as Route} className={styles.attentionAction}>
            {item.actionLabel} <span aria-hidden="true">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type ChecklistRowState = "complete" | "attention" | "not_started" | "blocked" | "unknown";

const CHECK_TONE: Record<ChecklistRowState, AdminTone> = {
  complete: "healthy",
  attention: "attention",
  not_started: "neutral",
  blocked: "neutral",
  unknown: "attention",
};

export type ChecklistRow = {
  key: string;
  title: string;
  state: ChecklistRowState;
  stateLabel: string;
  detail: string;
  href: string | null;
  actionLabel: string | null;
};

export function Checklist({ rows, label }: { rows: readonly ChecklistRow[]; label: string }) {
  return (
    <ol className={styles.checklist} aria-label={label}>
      {rows.map((row, index) => (
        <li key={row.key} className={`${styles.checkRow} ${row.state === "blocked" ? styles.checkBlocked : ""}`}>
          <span className={`${styles.checkNumber} ${row.state === "complete" ? styles.checkNumberDone : ""}`} aria-hidden="true">
            {row.state === "complete" ? "✓" : index + 1}
          </span>
          <div className={styles.checkText}>
            <strong>{row.title}</strong>
            <span>{row.detail}</span>
          </div>
          <div className={styles.checkMeta}>
            <StatusBadge tone={CHECK_TONE[row.state]}>{row.stateLabel}</StatusBadge>
            {row.href && row.actionLabel ? (
              <Link href={row.href as Route} className={styles.checkAction}>
                {row.actionLabel}
                <span className={styles.srOnly}>: {row.title}</span> <span aria-hidden="true">→</span>
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className={styles.empty}>
      <span aria-hidden="true" className={styles.emptyGlyph}>✓</span>
      <div>
        <strong>{title}</strong>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}

export function FactList({ items }: { items: readonly { term: string; value: React.ReactNode }[] }) {
  return (
    <dl className={styles.facts}>
      {items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Buttons for forms/client controls. Links use ActionLink instead. */
export function adminButtonClass(variant: "primary" | "secondary" | "danger" | "quiet" = "secondary"): string {
  const tone =
    variant === "primary"
      ? styles.buttonPrimary
      : variant === "danger"
        ? styles.buttonDanger
        : variant === "quiet"
          ? styles.buttonQuiet
          : styles.buttonSecondary;
  return `${styles.button} ${tone}`;
}

/** The one thing the owner should do next. Exactly one primary action
 * belongs in `children`; anything else must be visually secondary. */
export function NextStepCard({
  eyebrow = "Siguiente paso",
  title,
  tone = "neutral",
  children,
  footer,
}: {
  eyebrow?: string;
  title: string;
  tone?: AdminTone;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className={`${styles.nextStep} ${TONE_CLASS[tone]}`}>
      <p className={styles.nextEyebrow}>
        <span aria-hidden="true" className={styles.nextGlyph}>{TONE_GLYPH[tone]}</span>
        {eyebrow}
      </p>
      <strong className={styles.nextTitle}>{title}</strong>
      {children ? <div className={styles.nextBody}>{children}</div> : null}
      {footer ? <div className={styles.nextFooter}>{footer}</div> : null}
    </div>
  );
}

export type ProgressStepState = "done" | "current" | "upcoming" | "stopped";

export type ProgressStep = {
  key: string;
  title: string;
  detail?: string;
  state: ProgressStepState;
};

const PROGRESS_STATE_TEXT: Record<ProgressStepState, string> = {
  done: "completado",
  current: "paso actual",
  upcoming: "pendiente",
  stopped: "detenido aquí",
};

const PROGRESS_GLYPH: Record<ProgressStepState, string> = {
  done: "✓",
  current: "●",
  upcoming: "○",
  stopped: "×",
};

/** Honest progression: callers only mark a step done when the data proves
 * it, and a terminal branch (e.g. cancelled) is a "stopped" step. */
export function ProgressTracker({ steps, label }: { steps: readonly ProgressStep[]; label: string }) {
  return (
    <ol className={styles.progress} aria-label={label}>
      {steps.map((step) => (
        <li
          key={step.key}
          className={`${styles.progressStep} ${styles[`progress_${step.state}`] ?? ""}`}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span aria-hidden="true" className={styles.progressMarker}>{PROGRESS_GLYPH[step.state]}</span>
          <div className={styles.progressText}>
            <strong>
              {step.title}
              <span className={styles.srOnly}> ({PROGRESS_STATE_TEXT[step.state]})</span>
            </strong>
            {step.detail ? <span>{step.detail}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Progressive disclosure for expert/technical evidence. Native
 * <details> keeps it keyboard- and screen-reader-operable without JS. */
export function Disclosure({
  summary,
  hint,
  defaultOpen = false,
  children,
}: {
  summary: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className={styles.disclosure} open={defaultOpen || undefined}>
      <summary>
        <span className={styles.disclosureSummary}>{summary}</span>
        {hint ? <span className={styles.disclosureHint}>{hint}</span> : null}
      </summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}

export type FilterTab = {
  key: string;
  label: string;
  href: string;
  count?: number | null;
  current: boolean;
  tone?: AdminTone;
};

/** Link-based filter tabs: the URL stays the source of truth, so back,
 * refresh and shared links keep the same view. */
export function FilterTabs({ tabs, label }: { tabs: readonly FilterTab[]; label: string }) {
  return (
    <nav aria-label={label} className={styles.tabs}>
      <ul>
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link
              href={tab.href as Route}
              className={`${styles.tab} ${tab.current ? styles.tabCurrent : ""}`}
              aria-current={tab.current ? "page" : undefined}
            >
              {tab.label}
              {typeof tab.count === "number" ? (
                <span className={`${styles.tabCount} ${tab.tone && tab.count > 0 ? TONE_CLASS[tab.tone] : ""}`}>
                  {tab.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Pagination({
  page,
  totalPages,
  hrefFor,
  label = "Paginación",
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  label?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className={styles.pagination} aria-label={label}>
      {page > 1 ? (
        <Link href={hrefFor(page - 1) as Route} className={styles.pageLink}>← Anterior</Link>
      ) : (
        <span className={`${styles.pageLink} ${styles.pageDisabled}`} aria-disabled="true">← Anterior</span>
      )}
      <span className={styles.pageStatus}>Página {page} de {totalPages}</span>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1) as Route} className={styles.pageLink}>Siguiente →</Link>
      ) : (
        <span className={`${styles.pageLink} ${styles.pageDisabled}`} aria-disabled="true">Siguiente →</span>
      )}
    </nav>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href as Route} className={styles.backLink}>
      <span aria-hidden="true">←</span> {children}
    </Link>
  );
}

/** Compact count strip. Only verified numbers belong here — pass null to
 * render "sin verificar" instead of a misleading zero. */
export function MetricStrip({
  items,
  label,
}: {
  items: readonly { key: string; label: string; value: number | null; tone?: AdminTone }[];
  label: string;
}) {
  return (
    <dl className={styles.metrics} aria-label={label}>
      {items.map((item) => (
        <div key={item.key} className={item.tone ? TONE_CLASS[item.tone] : undefined} data-toned={item.tone ? "true" : undefined}>
          <dt>{item.label}</dt>
          <dd>{item.value === null ? <span className={styles.metricUnknown}>Sin verificar</span> : item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type SaveStatusState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Per-section save feedback. It only ever describes the section it sits
 * in — independent mutations never share one "saved" message — and "saved"
 * is only shown after the server confirmed the write. */
export function SaveStatus({ state, message }: { state: SaveStatusState; message?: string | undefined }) {
  if (state === "idle") return <span className={styles.saveStatus} aria-live="polite" />;
  const text =
    state === "dirty"
      ? message ?? "Cambios sin guardar"
      : state === "saving"
        ? message ?? "Guardando…"
        : state === "saved"
          ? message ?? "Cambios guardados"
          : message ?? "No se pudo guardar. Tus cambios siguen en pantalla; revisa e inténtalo otra vez.";
  const tone = state === "saved" ? styles.saveSaved : state === "error" ? styles.saveError : state === "dirty" ? styles.saveDirty : "";
  return (
    <span className={`${styles.saveStatus} ${tone}`} role={state === "error" ? "alert" : undefined} aria-live={state === "error" ? undefined : "polite"}>
      {state === "saved" ? "✓ " : state === "dirty" ? "● " : state === "error" ? "× " : ""}
      {text}
    </span>
  );
}
