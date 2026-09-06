import styles from "./parfums-shell.module.css";

export function AnnouncementBar() {
  return (
    <div className={styles.announcement} role="status">
      Envíos a todo el Perú <span aria-hidden="true">·</span> 100% Originales{" "}
      <span aria-hidden="true">·</span> Decants Premium
    </div>
  );
}
