import Link from "next/link";
import type { Route } from "next";
import { StatusBadge, type AdminTone } from "./admin-ui";
import catalogStyles from "./catalog-workspace.module.css";

export type ComplaintListRow = {
  id: string;
  href: string;
  fullName: string;
  typeLabel: string;
  statusLabel: string;
  statusTone: AdminTone;
  /** null when there is nothing extra worth a badge (resolved, or well
   * within the deadline). */
  urgencyLabel: string | null;
  urgencyTone: AdminTone;
  createdRelative: string;
  createdAbsolute: string;
  /** "Responder antes del …" or "Resuelto el …" — already phrased. */
  deadlineLine: string;
};

/** Compact operational complaint rows shared by Parfums and Import. The
 * whole row is one link so keyboard users get a single tab stop per case. */
export function ComplaintList({ rows }: { rows: readonly ComplaintListRow[] }) {
  return (
    <ul className={catalogStyles.list} aria-label="Lista de reclamos">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={row.href as Route} className={`${catalogStyles.row} ${catalogStyles.rowNoThumb}`}>
            <span className={catalogStyles.identity}>
              <strong className={catalogStyles.name}>{row.fullName}</strong>
              <span className={catalogStyles.muted}>{row.typeLabel}</span>
            </span>
            <span className={catalogStyles.state}>
              <span className={catalogStyles.badges}>
                <StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge>
                {row.urgencyLabel ? <StatusBadge tone={row.urgencyTone}>{row.urgencyLabel}</StatusBadge> : null}
              </span>
            </span>
            <span className={catalogStyles.figures}>
              <span>{row.deadlineLine}</span>
              <time className={catalogStyles.muted} title={row.createdAbsolute}>
                Registrado {row.createdRelative}
                <span className={catalogStyles.srOnly}> ({row.createdAbsolute})</span>
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
