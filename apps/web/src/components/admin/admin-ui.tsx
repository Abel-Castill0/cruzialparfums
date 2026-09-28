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
