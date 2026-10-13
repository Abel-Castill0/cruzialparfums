import Image from "next/image";
import Link from "next/link";
import { describeImportGateDate, IMPORT_GATE_HEADLINE } from "@/domains/import/import-gate";
import { readImportGate } from "@/lib/catalog/import-gate";
import styles from "./page.module.css";

/**
 * Gateway: two doors and nothing else. The only furniture is a transparent
 * bar with the official mark and the seam between the two worlds.
 */
export default async function Home() {
  const gate = await readImportGate();
  const importClosed = gate.state === "closed";
  const importDate = gate.state === "closed" ? describeImportGateDate(gate.opensAt) : null;

  return (
    <main id="main" tabIndex={-1} className={styles.page} aria-label="Elige tu tienda Cruzial">
      <h1 className={styles.srOnly}>Cruzial: elige entre Parfums e Import</h1>
      <Image
        className={styles.logo}
        src="/parfums/hero/logo-official.jpeg"
        alt="Cruzial Perfumería"
        width={500}
        height={495}
        sizes="96px"
        priority
      />
      <span className={styles.seam} aria-hidden="true" />

      <Link
        className={styles.world}
        data-unit="parfums"
        href="/parfums"
        aria-label="Entrar a Cruzial Parfums"
      >
        <span className={styles.visual} aria-hidden="true">
          <Image
            src="/images/parfums-home/parfums-hero.webp"
            alt=""
            fill
            preload
            fetchPriority="high"
            sizes="(max-width: 700px) 100vw, 50vw"
            className={styles.parfumsImage}
          />
        </span>
        <span className={styles.copy}>
          <span className={styles.label}>Parfums</span>
          <span className={styles.line}>Decants, frascos y combos de perfumería árabe, de diseñador y nicho.</span>
          <span className={styles.enter}>
            <span className={styles.enterText}>Entrar</span>
            <span className={styles.arrow} aria-hidden="true">↗</span>
          </span>
        </span>
      </Link>

      <Link
        className={styles.world}
        data-unit="import"
        data-closed={importClosed ? "true" : undefined}
        href="/import"
        aria-label={importClosed ? `Entrar a Cruzial Import. ${IMPORT_GATE_HEADLINE}. ${importDate}` : "Entrar a Cruzial Import"}
      >
        <span className={styles.visual} aria-hidden="true">
          <Image
            src="/images/import-home/import-conditions-container.webp"
            alt=""
            fill
            preload
            fetchPriority="high"
            sizes="(max-width: 700px) 100vw, 50vw"
            className={styles.importImage}
          />
        </span>
        {importClosed ? (
          <span className={styles.closedVeil} aria-hidden="true" />
        ) : null}
        <span className={styles.copy}>
          <span className={styles.label}>Import</span>
          {importClosed ? (
            <span className={styles.closedNote}>
              <strong>{IMPORT_GATE_HEADLINE}</strong>
              <span>{importDate}</span>
            </span>
          ) : (
            <span className={styles.line}>Consolidados de perfumería: compra grupal por campaña.</span>
          )}
          <span className={styles.enter}>
            <span className={styles.enterText}>Entrar</span>
            <span className={styles.arrow} aria-hidden="true">↗</span>
          </span>
        </span>
      </Link>
    </main>
  );
}
