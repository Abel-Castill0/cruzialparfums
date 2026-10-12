import styles from "./skip-link.module.css";

// WCAG 2.4.1 Bypass Blocks. Plain server-rendered anchor: it works with JavaScript disabled because every storefront
// page declares <main id="main" tabIndex={-1}> in its static HTML. Mounted once in the root layout, so it is the
// first focusable element of every page.
// The admin has its own skip link (to #admin-content) and no main#main: globals.css hides this one there.
export function SkipLink() {
  return (
    <a className={styles.skipLink} href="#main" data-skip-link>
      Saltar al contenido
    </a>
  );
}
