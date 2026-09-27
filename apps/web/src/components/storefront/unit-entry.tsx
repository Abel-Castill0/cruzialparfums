import Image from "next/image";
import Link from "next/link";
import type { BusinessUnit, BusinessUnitCode } from "@/domains/platform/contracts";
import styles from "./unit-entry.module.css";

type WorldPanelProps = {
  index: number;
  unit: BusinessUnit;
};

const PANEL_IMAGE: Record<BusinessUnitCode, { src: string; alt: string }> = {
  parfums: {
    src: "/images/home-redesign/home-parfums-packaging.png",
    alt: "Estuche Cruzial Parfums",
  },
  import: {
    src: "/images/home-redesign/home-import-port.png",
    alt: "Puerto de carga internacional, imagen editorial de Cruzial Import",
  },
};

export function WorldPanel({ index, unit }: WorldPanelProps) {
  const image = PANEL_IMAGE[unit.code];

  return (
    <Link className={styles.panel} data-unit={unit.code} href={unit.href}>
      <div className={styles.visual}>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes="(min-width: 720px) 50vw, 100vw"
          className={styles.visualImage}
        />
        {unit.code === "parfums" && (
          <div className={styles.accents} aria-hidden="true">
            <span className={styles.accentThumb}>
              <Image
                src="/images/home-redesign/home-parfums-vainilla.png"
                alt=""
                width={200}
                height={200}
                className={styles.accentImage}
              />
            </span>
            <span className={styles.accentThumb}>
              <Image
                src="/images/home-redesign/home-parfums-canela.png"
                alt=""
                width={200}
                height={200}
                className={styles.accentImage}
              />
            </span>
          </div>
        )}
      </div>

      <div className={styles.body}>
        <span className={styles.index} aria-hidden="true">
          {String(index).padStart(2, "0")}
        </span>
        <div className={styles.copy}>
          <p className={styles.kicker}>{unit.label}</p>
          <h2>{unit.promise}</h2>
          <p className={styles.scope}>{unit.scope.join(" · ")}</p>
        </div>
        <span className={styles.link}>
          Entrar a {unit.shortName}
          <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
}
