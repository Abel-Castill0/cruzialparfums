import type { Route } from "next";
import Link from "next/link";
import { Reveal } from "@/components/storefront/home/reveal";
import type { CatalogProduct } from "@/domains/catalog/types";
import { listFinderFamilies, listFinderTopNotes } from "@/domains/finder/finder-rules";
import styles from "./finder-discovery.module.css";

export type DiscoveryFamily = { family: string; count: number };

/** Families that really exist in the catalog, with how many fragrances each has. */
export function listDiscoveryFamilies(fragrances: readonly CatalogProduct[]): DiscoveryFamily[] {
  const counts = new Map<string, number>();
  for (const product of fragrances) {
    if (!product.hidden) counts.set(product.family, (counts.get(product.family) ?? 0) + 1);
  }
  return listFinderFamilies(fragrances)
    .map((family) => ({ family, count: counts.get(family) ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);
}

/**
 * Discovery module: the questionnaire plus shortcuts built from the real
 * catalog (its olfactory families and most common notes). Every shortcut
 * opens the catalog through the filters/search it already has.
 */
export function FinderDiscovery({ fragrances }: { fragrances: readonly CatalogProduct[] }) {
  const families = listDiscoveryFamilies(fragrances).slice(0, 8);
  const notes = listFinderTopNotes(fragrances, 8);
  if (families.length === 0 && notes.length === 0) return null;

  return (
    <section className={styles.discovery} aria-labelledby="finder-discovery-title">
      <Reveal className={styles.inner}>
        <div className={styles.lead}>
          <h2 id="finder-discovery-title">
            ¿No sabes por dónde <em>empezar</em>?
          </h2>
          <p>
            Responde 5 preguntas y recibe opciones explicables del catálogo. Reglas deterministas, no inteligencia artificial.
          </p>
          <Link href={"/parfums/finder" as Route} className={styles.cta}>
            Iniciar el recomendador <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className={styles.shortcuts}>
          {families.length > 0 ? (
            <div>
              <h3>Por familia olfativa</h3>
              <ul>
                {families.map(({ family, count }) => (
                  <li key={family}>
                    <Link href={`/parfums/catalogo?family=${encodeURIComponent(family)}` as Route}>
                      {family} <span>{count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {notes.length > 0 ? (
            <div>
              <h3>Notas más presentes</h3>
              <ul>
                {notes.map((note) => (
                  <li key={note}>
                    <Link href={`/parfums/catalogo?search=${encodeURIComponent(note)}` as Route}>{note}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Reveal>
    </section>
  );
}
