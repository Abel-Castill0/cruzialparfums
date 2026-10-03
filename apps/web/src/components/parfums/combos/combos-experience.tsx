"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Breadcrumbs } from "@/components/parfums/navigation/breadcrumbs";
import { COMBO_ART, COMBO_SET_ART } from "@/components/parfums/shared/combo-art";
import {
  addParfumsCartLine,
  PARFUMS_CART_UPDATED_EVENT,
} from "@/domains/carts/parfums-cart";
import { cartIdentity } from "@/domains/catalog/types";
import {
  addComboLine,
  availableComboSizes,
  calculateComboLinesTotal,
  canSendCombo,
  COMBO_MAX_ITEMS,
  COMBO_MIN_ITEMS,
  defaultComboSize,
  filterComboProducts,
  listComboEligibleProducts,
  removeComboLine,
  resolveComboLines,
  resolveComboMemberPhotos,
  setComboLineSize,
  type ComboLine,
  type ComboSize,
} from "@/domains/combos/combo-builder";
import type { CatalogProduct, CatalogProductType } from "@/domains/catalog/types";
import {
  buildCustomComboMessage,
  buildWhatsAppUrl,
} from "@/domains/whatsapp/parfums-message-builder";
import styles from "./combos.module.css";

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

const TYPE_FILTERS: { value: "all" | CatalogProductType; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "arab", label: "Árabe" },
  { value: "designer", label: "Designer" },
  { value: "niche", label: "Nicho" },
];

const POST_BUILDER_TRUST = [
  {
    title: "Originalidad absoluta",
    text: "Cada decant se prepara a partir de un frasco original de la casa oficial.",
    icon: (
      <>
        <path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8.7 12.2l2.2 2.2 4.4-4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    title: "Selección curada",
    text: "Menos volumen, más carácter: solo fragancias que pasan nuestro filtro entran al catálogo.",
    icon: (
      <path d="M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.6l-5.1 2.7 1.1-5.8-4.3-4 5.8-.7L12 3.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    ),
  },
  {
    title: "Atención humana",
    text: "Tu combo termina en una conversación real por WhatsApp antes de confirmar cualquier pedido.",
    icon: (
      <path
        d="M12 4a8 8 0 00-6.9 12l-1 3.5 3.6-1A8 8 0 1012 4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    ),
  },
] as const;

function ComboCard({ combo, products, onAdded, preload }: { combo: CatalogProduct; products: CatalogProduct[]; onAdded: (message: string) => void; preload: boolean }) {
  const sizes = availableComboSizes(combo);
  const art = COMBO_SET_ART[combo.slug] ?? (combo.imageUrl ? undefined : COMBO_ART[combo.slug]);
  const memberPhotos = useMemo(
    () => (combo.imageUrl || art ? [] : resolveComboMemberPhotos(combo.comboContent?.perfumes ?? [], products)),
    [art, combo, products],
  );
  const [size, setSize] = useState<ComboSize | null>(defaultComboSize(combo));
  const price = size === null ? null : combo.decantPrices[String(size)] ?? null;
  const compositionConfirmed = combo.comboContent?.verificationStatus === "official_pdf"
    || combo.comboContent?.verificationStatus === "client_confirmed";

  function add() {
    if (size === null || price === null || price <= 0) return;
    const mutation = addParfumsCartLine(localStorage, {
      productId: cartIdentity(combo),
      variantId: `decant-${size}ml`,
      quantity: 1,
    });
    if (!mutation.persisted) {
      onAdded("No pudimos guardar el set. Revisa el almacenamiento del navegador.");
      return;
    }
    window.dispatchEvent(new Event(PARFUMS_CART_UPDATED_EVENT));
    onAdded(`${combo.name} · ${size} ml por fragancia añadido`);
  }

  return (
    <article className={styles.comboCard} id={combo.slug} data-combo-card>
      <div className={`${styles.comboMedia} ${combo.imageUrl || art || memberPhotos.length ? "" : styles.comboMediaBare}`}>
        {art ? (
          <Image
            src={art.src}
            alt={art.alt}
            fill
            sizes="(max-width: 767px) calc(100vw - 32px), 33vw"
            className={styles.comboImage}
            style={{ objectPosition: art.position }}
            preload={preload}
          />
        ) : combo.imageUrl ? (
          <Image src={combo.imageUrl} alt={combo.name} fill sizes="(max-width: 767px) calc(100vw - 32px), 33vw" className={styles.comboImage} preload={preload} />
        ) : memberPhotos.length ? (
          <div className={styles.comboMosaic} data-count={memberPhotos.length}>
            {memberPhotos.map((photo) => (
              <span key={photo.id} className={styles.comboMosaicCell}>
                <Image src={photo.url} alt="" fill sizes="(max-width: 767px) 45vw, 16vw" className={styles.comboMosaicImage} />
              </span>
            ))}
          </div>
        ) : null}
        <span>Set Cruzial</span>
      </div>
      <div className={styles.comboBody}>
        <div>
          <p>{combo.family}</p>
          <h3>{combo.name}</h3>
        </div>
        <p className={styles.comboDesc}>{combo.comboContent?.desc}</p>
        <ul className={styles.composition}>
          {combo.comboContent?.perfumes.map((perfume) => <li key={perfume}>{perfume}</li>)}
        </ul>
        {compositionConfirmed ? null : (
          <p className={styles.reconfirmation}>Composición pendiente de reconfirmación; se valida por WhatsApp antes de continuar.</p>
        )}
        <div className={styles.comboFooter}>
          <div className={styles.comboSizes} role="group" aria-label={`Tamaño de ${combo.name}`}>
            {sizes.map((value) => (
              <button key={value} type="button" aria-pressed={size === value} className={size === value ? styles.selected : ""} onClick={() => setSize(value)}>{value} ml</button>
            ))}
          </div>
          <div className={styles.comboBuy}>
            <div><span>Total estimado</span><strong>{price === null ? "No disponible" : money(price)}</strong></div>
            <button type="button" onClick={add} disabled={price === null}>Añadir set <span aria-hidden="true">→</span></button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function CombosExperience({
  combos,
  products,
  whatsappNumber,
  storeName,
}: {
  combos: CatalogProduct[];
  products: CatalogProduct[];
  whatsappNumber: string;
  storeName: string;
}) {
  const eligible = useMemo(() => listComboEligibleProducts(products), [products]);
  const families = useMemo(
    () => Array.from(new Set(eligible.map((product) => product.family))).sort((a, b) => a.localeCompare(b, "es")),
    [eligible],
  );
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | CatalogProductType>("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [lines, setLines] = useState<ComboLine[]>([]);
  const [notice, setNotice] = useState("");

  const scoped = useMemo(
    () => eligible.filter((product) =>
      (typeFilter === "all" || product.type === typeFilter)
      && (familyFilter === "all" || product.family === familyFilter),
    ),
    [eligible, typeFilter, familyFilter],
  );
  const visible = useMemo(() => filterComboProducts(scoped, query), [scoped, query]);
  const filtersActive = query.trim().length > 0 || typeFilter !== "all" || familyFilter !== "all";
  const resolved = useMemo(() => resolveComboLines(eligible, lines), [eligible, lines]);
  const total = useMemo(() => calculateComboLinesTotal(resolved), [resolved]);
  const ready = canSendCombo(resolved.length);
  const message = buildCustomComboMessage({
    storeName,
    lines: resolved.map((entry) => ({
      brand: entry.product.brand,
      name: entry.product.name,
      subtotal: entry.price,
      variantLabel: `${entry.line.size} ml`,
    })),
    total,
  });
  const whatsappUrl = buildWhatsAppUrl(whatsappNumber, message);

  function announce(messageText: string) {
    setNotice(messageText);
    window.setTimeout(() => setNotice(""), 2800);
  }

  function toggle(product: CatalogProduct) {
    const productId = cartIdentity(product);
    const initialSize = defaultComboSize(product);
    if (initialSize === null) return;
    setLines((current) => {
      if (current.some((line) => line.productId === productId)) {
        return removeComboLine(current, productId);
      }
      if (current.length >= COMBO_MAX_ITEMS) {
        announce(`El máximo es ${COMBO_MAX_ITEMS} fragancias. Quita una para cambiarla.`);
        return current;
      }
      return addComboLine(current, productId, initialSize);
    });
  }

  function changeLineSize(productId: string, size: ComboSize) {
    setLines((current) => setComboLineSize(current, productId, size));
  }

  function resetFilters() {
    setQuery("");
    setTypeFilter("all");
    setFamilyFilter("all");
  }

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbWrap}>
        <Breadcrumbs items={[
          { label: "Parfums", href: "/parfums" as Route },
          { label: "Combos" },
        ]} />
      </div>

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Cruzial Parfums · Arma tu combo</p>
          <h1>Arma tu selección,<br /><em>tu regla.</em></h1>
          <p className={styles.heroText}>
            Elige un set Cruzial o combina de {COMBO_MIN_ITEMS} a {COMBO_MAX_ITEMS} fragancias de nuestra colección. Tú decides.
          </p>
          <p className={styles.heroNote}>Stock y total final se confirman por WhatsApp.</p>
          <div className={styles.heroActions}>
            {combos.length > 0 ? <a href="#sets-armados" className={styles.heroCta}>Ver sets curados <span aria-hidden="true">→</span></a> : null}
            <a href="#arma-combo" className={combos.length > 0 ? styles.heroCtaSecondary : styles.heroCta}>Armar mi combo <span aria-hidden="true">→</span></a>
          </div>
        </div>
        <div className={styles.heroMedia}>
          <Image
            src="/images/parfums-combos/combo-hero.webp"
            alt="Selección de fragancias Cruzial Parfums sobre piedra natural"
            fill
            sizes="(max-width: 900px) 100vw, 50vw"
            preload
            className={styles.heroImage}
          />
        </div>
      </header>

      <section className={styles.trustStrip} aria-label="Por qué armar tu combo en Cruzial">
        <div>
          <svg className={styles.trustIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path d="M8.7 12.2l2.2 2.2 4.4-4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span><strong>Fragancias 100% originales</strong>Frascos auténticos de casas oficiales.</span>
        </div>
        <div>
          <svg className={styles.trustIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 3h3v3H9zM9.5 6h2l1 2.4v10.6a1 1 0 01-1 1h-2a1 1 0 01-1-1V8.4L9.5 6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M15.5 9h1.6l.8 1.9v8.6a.8.8 0 01-.8.8h-1.6a.8.8 0 01-.8-.8v-8.6L15.5 9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
          <span><strong>{eligible.length} fragancias disponibles</strong>Árabe, designer y nicho en un solo lugar.</span>
        </div>
        <div>
          <svg className={styles.trustIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 7h11v9H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M14 10h4l3 3v3h-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <circle cx="7.5" cy="17.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="17.5" cy="17.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          <span><strong>Envíos a todo el Perú</strong>Por agencia Shalom, se confirman por WhatsApp.</span>
        </div>
      </section>

      {combos.length > 0 ? (
        <section className={styles.setsSection} id="sets-armados" aria-labelledby="sets-title">
          <div className={styles.sectionHead}>
            <div><p>Selecciones existentes</p><h2 id="sets-title">Sets <em>Cruzial.</em></h2></div>
            <span>Sets con composición y precio publicados del catálogo. Cada fragancia del set va en el tamaño elegido.</span>
          </div>
          <div className={styles.comboGrid}>
            {combos.map((combo, index) => <ComboCard key={cartIdentity(combo)} combo={combo} products={products} onAdded={announce} preload={index === 0} />)}
          </div>
        </section>
      ) : null}

      <section className={styles.builderSection} id="arma-combo" aria-labelledby="builder-title">
        <div className={styles.sectionHead}>
          <div><p>Hazlo a tu manera</p><h2 id="builder-title">Arma tu propio <em>combo.</em></h2></div>
          <span>Selecciona entre {COMBO_MIN_ITEMS} y {COMBO_MAX_ITEMS} fragancias y elige el tamaño de cada una por separado. Cada precio se toma del catálogo actual.</span>
        </div>

        <div className={styles.builder} data-combo-builder>
          <div className={styles.pickerColumn}>
            <div className={styles.controls}>
              <div className={styles.controlsRow}>
                <label className={styles.search}>
                  <span className={styles.srOnly}>Buscar perfume para tu combo</span>
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar fragancia, marca o familia…" />
                </label>
                <label className={styles.familySelect}>
                  <span className={styles.srOnly}>Filtrar por familia olfativa</span>
                  <select value={familyFilter} onChange={(event) => setFamilyFilter(event.target.value)}>
                    <option value="all">Todas las familias</option>
                    {families.map((family) => <option key={family} value={family}>{family}</option>)}
                  </select>
                </label>
              </div>
              <div className={styles.typeChips} role="group" aria-label="Filtrar por tipo de fragancia">
                {TYPE_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={typeFilter === filter.value}
                    className={typeFilter === filter.value ? styles.selected : ""}
                    onClick={() => setTypeFilter(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
                {filtersActive ? (
                  <button type="button" className={styles.resetFilters} onClick={resetFilters}>
                    Limpiar filtros ✕
                  </button>
                ) : null}
              </div>
            </div>

            <div className={styles.picker} role="listbox" aria-label="Selecciona fragancias para tu combo" aria-multiselectable="true">
              {visible.length === 0 ? (
                <div className={styles.noResults} role="option" aria-selected="false" aria-disabled="true">No encontramos fragancias con estos criterios.</div>
              ) : null}
              {visible.map((product) => {
                const line = lines.find((candidate) => candidate.productId === cartIdentity(product));
                const isSelected = Boolean(line);
                const disabled = lines.length >= COMBO_MAX_ITEMS && !isSelected;
                const referenceSize = line?.size ?? defaultComboSize(product);
                const referencePrice = referenceSize === null ? null : product.decantPrices[String(referenceSize)] ?? null;
                return (
                  <button
                    key={cartIdentity(product)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={disabled}
                    className={`${styles.pickerItem} ${isSelected ? styles.pickerSelected : ""}`}
                    onClick={() => toggle(product)}
                    data-combo-option={cartIdentity(product)}
                  >
                    <span className={styles.thumb}>{product.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="58px" className={styles.thumbImage} /> : null}</span>
                    <span className={styles.itemInfo}>
                      <small>{product.brand}</small>
                      <strong>{product.name}</strong>
                      <em>{referencePrice === null ? "No disponible" : <>{isSelected ? `${referenceSize} ml · ` : "desde "}{money(referencePrice)}</>}</em>
                    </span>
                    <span className={styles.pickerAction} aria-hidden="true">{isSelected ? "✓" : "+"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className={styles.summary} aria-label="Resumen de tu combo" aria-live="polite">
            <div className={styles.summaryHead}><strong>Tu combo</strong><span>{resolved.length}/{COMBO_MAX_ITEMS} fragancias</span></div>
            {resolved.length === 0 ? (
              <div className={styles.emptySummary}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9.5 3h5v3l1.4 2.8V19a2 2 0 01-2 2h-3.8a2 2 0 01-2-2V8.8L9.5 6V3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  <path d="M8 13h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                </svg>
                <p><strong>Aún no has agregado fragancias.</strong><br />Busca y selecciona entre {COMBO_MIN_ITEMS} y {COMBO_MAX_ITEMS} para armar tu combo.</p>
              </div>
            ) : (
              <ul>
                {resolved.map((entry) => (
                  <li key={cartIdentity(entry.product)}>
                    <div className={styles.summaryLine}>
                      <span className={styles.summaryThumb}>{entry.product.imageUrl ? <Image src={entry.product.imageUrl} alt="" fill sizes="48px" /> : null}</span>
                      <div>
                        <div className={styles.summaryLineHead}>
                          <span title={entry.product.name}>{entry.product.brand} · {entry.product.name}</span>
                          <strong>{money(entry.price)}</strong>
                          <button type="button" onClick={() => toggle(entry.product)} aria-label={`Quitar ${entry.product.name} del combo`}>×</button>
                        </div>
                        <div className={styles.summaryLineSizes} role="group" aria-label={`Tamaño de ${entry.product.name}`}>
                          {availableComboSizes(entry.product).map((value) => (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={entry.line.size === value}
                              className={entry.line.size === value ? styles.selected : ""}
                              onClick={() => changeLineSize(cartIdentity(entry.product), value)}
                            >
                              {value} ml
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {resolved.length >= COMBO_MAX_ITEMS ? <p className={styles.limit}>Llegaste al máximo. Quita una fragancia para cambiarla.</p> : null}
            <div className={styles.summaryTotal}><span>Total estimado</span><strong data-combo-total>{money(total)}</strong></div>
            {!ready ? <p className={styles.minimum}>Selecciona {COMBO_MIN_ITEMS - resolved.length} {COMBO_MIN_ITEMS - resolved.length === 1 ? "fragancia más" : "fragancias más"} para continuar.</p> : <p className={styles.minimum}>Listo para enviar. Stock y total final se confirman en WhatsApp.</p>}
            {ready ? <a className={styles.send} href={whatsappUrl} target="_blank" rel="noopener noreferrer">Continuar en WhatsApp <span aria-hidden="true">↗</span></a> : <button className={styles.send} type="button" disabled>Continuar en WhatsApp</button>}
          </aside>
        </div>

        <div className={styles.mobileSticky} data-combo-sticky>
          <div><strong>{resolved.length ? `${resolved.length} seleccionada${resolved.length === 1 ? "" : "s"}` : "Elige tus fragancias"}</strong><span>{ready ? money(total) : `mínimo ${COMBO_MIN_ITEMS}`}</span></div>
          {ready ? <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">Continuar <span aria-hidden="true">↗</span></a> : <button type="button" disabled>Continuar</button>}
        </div>
      </section>

      <section className={styles.postTrust} aria-label="Por qué elegir Cruzial Parfums">
        {POST_BUILDER_TRUST.map((item) => (
          <div key={item.title}>
            <svg className={styles.trustIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">{item.icon}</svg>
            <strong>{item.title}</strong>
            <p>{item.text}</p>
          </div>
        ))}
      </section>

      <div className={styles.decorative} aria-hidden="true">
        <Image
          src="/images/parfums-combos/combo-stone-flower.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.decorativeImage}
        />
      </div>

      <div className={styles.catalogLink}><Link href={"/parfums/catalogo" as Route}>Seguir explorando el catálogo <span aria-hidden="true">→</span></Link></div>
      <div className={styles.toast} role="status" aria-live="polite">{notice}</div>
    </div>
  );
}
