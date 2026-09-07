import Link from "next/link";
import styles from "./page.module.css";

const targets = [
  {
    href: "/admin/parfums",
    eyebrow: "Cruzial Parfums",
    label: "Administrar Parfums",
  },
  {
    href: "/admin/import",
    eyebrow: "Cruzial Import",
    label: "Administrar Import",
  },
] as const;

export default function AdminGatewayPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <strong>Cruzial Admin</strong>
        <Link href="/">Volver al sitio público</Link>
      </header>
      <p className={styles.notice}>
        Foundation — sin autenticación real todavía. Ninguna acción de esta
        sección es funcional ni segura hasta que exista un bootstrap de
        administrador confirmado.
      </p>
      <main className={styles.main}>
        <h1>¿Qué quieres administrar?</h1>
        <div className={styles.selector}>
          {targets.map((target) => (
            <Link key={target.href} href={target.href}>
              <span className={styles.selectorEyebrow}>{target.eyebrow}</span>
              <strong>{target.label}</strong>
            </Link>
          ))}
        </div>
      </main>
      <p className={styles.footer}>Acceso restringido cuando exista autenticación</p>
    </div>
  );
}
