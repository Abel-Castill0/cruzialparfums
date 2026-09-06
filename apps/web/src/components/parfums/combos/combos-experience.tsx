"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Breadcrumbs } from "@/components/parfums/navigation/breadcrumbs";
import {
  addParfumsCartLine,
  PARFUMS_CART_UPDATED_EVENT,
} from "@/domains/carts/parfums-cart";
import {
  calculateComboTotal,
  canSendCombo,
  COMBO_MAX_ITEMS,
  COMBO_MIN_ITEMS,
  COMBO_SIZES,
  filterComboProducts,
  listComboEligibleProducts,
  resolveComboSelection,
  type ComboSize,
} from "@/domains/combos/combo-builder";
import type { CatalogProduct } from "@/domains/catalog/types";
import {
  buildCustomComboMessage,
  buildWhatsAppUrl,
} from "@/domains/whatsapp/parfums-message-builder";
import styles from "./combos.module.css";

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

function ComboCard({ combo, onAdded, preload }: { combo: CatalogProduct; onAdded: (message: string) => void; preload: boolean }) {
  const [size, setSize] = useState<ComboSize>(3);
  const price = combo.decantPrices[String(size)] ?? 0;

  function add() {
    const mutation = addParfumsCartLine(localStorage, {
      productId: combo.legacyId,
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
      <div className={styles.comboMedia}>
        {combo.imageUrl ? <Image src={combo.imageUrl} alt={combo.name} fill sizes="(max-width: 767px) calc(100vw - 32px), 33vw" className={styles.comboImage} preload={preload} /> : null}
        <span>Set legacy</span>
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
        <p className={styles.reconfirmation}>Composición de paridad legacy; se reconfirma por WhatsApp antes de continuar.</p>
        <div className={styles.comboSizes} aria-label={`Tamaño de ${combo.name}`}>
          {COMBO_SIZES.map((value) => (
            <button key={value} type="button" aria-pressed={size === value} className={size === value ? styles.selected : ""} onClick={() => setSize(value)}>{value} ml</button>
          ))}
        </div>
        <div className={styles.comboBuy}>
          <div><span>Total estimado</span><strong>{money(price)}</strong></div>
          <button type="button" onClick={add}>Añadir set <span aria-hidden="true">→</span></button>
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
  const [size, setSize] = useState<ComboSize>(3);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const visible = useMemo(() => filterComboProducts(eligible, query), [eligible, query]);
  const selected = useMemo(() => resolveComboSelection(eligible, selectedIds), [eligible, selectedIds]);
  const total = useMemo(() => calculateComboTotal(selected, size), [selected, size]);
  const ready = canSendCombo(selected.length);
  const message = buildCustomComboMessage({
    storeName,
    size,
    lines: selected.map((product) => ({
      brand: product.brand,
      name: product.name,
      subtotal: product.decantPrices[String(size)] ?? 0,
    })),
    total,
  });
  const whatsappUrl = buildWhatsAppUrl(whatsappNumber, message);

  function announce(messageText: string) {
    setNotice(messageText);
    window.setTimeout(() => setNotice(""), 2800);
  }

  function toggle(productId: string) {
    setSelectedIds((current) => {
      if (current.includes(productId)) return current.filter((id) => id !== productId);
      if (current.length >= COMBO_MAX_ITEMS) {
        announce(`El máximo es ${COMBO_MAX_ITEMS} fragancias. Quita una para cambiarla.`);
        return current;
      }
      return [...current, productId];
    });
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
        <p>Combos Cruzial</p>
        <h1>Arma tu selección,<br /><em>tu regla.</em></h1>
        <span>Elige un set de paridad legacy o combina de 3 a 6 fragancias. Stock, composición y total final se confirman por WhatsApp.</span>
        <div>
          <a href="#sets-armados">Ver sets <span aria-hidden="true">↓</span></a>
          <a href="#arma-combo">Armar mi combo <span aria-hidden="true">↓</span></a>
        </div>
      </header>

      <section className={styles.setsSection} id="sets-armados" aria-labelledby="sets-title">
        <div className={styles.sectionHead}>
          <div><p>Selecciones existentes</p><h2 id="sets-title">Tres sets de <em>paridad.</em></h2></div>
          <span>Se reproducen los nombres, precios y composiciones recibidos del sitio legacy, pendientes de reconfirmación comercial.</span>
        </div>
        <div className={styles.comboGrid}>
          {combos.map((combo, index) => <ComboCard key={combo.legacyId} combo={combo} onAdded={announce} preload={index === 0} />)}
        </div>
      </section>

      <section className={styles.builderSection} id="arma-combo" aria-labelledby="builder-title">
        <div className={styles.sectionHead}>
          <div><p>Hazlo a tu manera</p><h2 id="builder-title">Arma tu propio <em>combo.</em></h2></div>
          <span>Elige un tamaño y selecciona entre {COMBO_MIN_ITEMS} y {COMBO_MAX_ITEMS} fragancias. Cada precio se toma del catálogo actual.</span>
        </div>

        <div className={styles.builder} data-combo-builder>
          <div className={styles.pickerColumn}>
            <div className={styles.controls}>
              <div className={styles.sizeControl}>
                <span>Tamaño por fragancia</span>
                <div>
                  {COMBO_SIZES.map((value) => (
                    <button key={value} type="button" aria-pressed={size === value} className={size === value ? styles.selected : ""} onClick={() => setSize(value)}>{value} ml</button>
                  ))}
                </div>
              </div>
              <label className={styles.search}>
                <span className={styles.srOnly}>Buscar perfume para tu combo</span>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar perfume para añadir…" />
              </label>
            </div>

            <div className={styles.picker} role="listbox" aria-label="Selecciona fragancias para tu combo" aria-multiselectable="true">
              {visible.length === 0 ? <p className={styles.noResults}>No encontramos fragancias con ese nombre.</p> : null}
              {visible.map((product) => {
                const isSelected = selectedIds.includes(product.legacyId);
                const disabled = selectedIds.length >= COMBO_MAX_ITEMS && !isSelected;
                return (
                  <button
                    key={product.legacyId}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={disabled}
                    className={`${styles.pickerItem} ${isSelected ? styles.pickerSelected : ""}`}
                    onClick={() => toggle(product.legacyId)}
                    data-combo-option={product.legacyId}
                  >
                    <span className={styles.check} aria-hidden="true">✓</span>
                    <span className={styles.thumb}>{product.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="58px" className={styles.thumbImage} /> : null}</span>
                    <span className={styles.itemInfo}><small>{product.brand}</small><strong>{product.name}</strong><em>{money(product.decantPrices[String(size)] ?? 0)}</em></span>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className={styles.summary} aria-label="Resumen de tu combo" aria-live="polite">
            <div className={styles.summaryHead}><strong>Tu combo</strong><span>{selected.length}/{COMBO_MAX_ITEMS} fragancias</span></div>
            {selected.length === 0 ? <p className={styles.emptySummary}>Selecciona fragancias del listado para verlas aquí.</p> : (
              <ul>
                {selected.map((product) => (
                  <li key={product.legacyId}>
                    <span>{product.name}</span>
                    <strong>{money(product.decantPrices[String(size)] ?? 0)}</strong>
                    <button type="button" onClick={() => toggle(product.legacyId)} aria-label={`Quitar ${product.name} del combo`}>×</button>
                  </li>
                ))}
              </ul>
            )}
            {selected.length >= COMBO_MAX_ITEMS ? <p className={styles.limit}>Llegaste al máximo. Quita una fragancia para cambiarla.</p> : null}
            <div className={styles.summaryTotal}><span>Total estimado</span><strong data-combo-total>{money(total)}</strong></div>
            {!ready ? <p className={styles.minimum}>Selecciona {COMBO_MIN_ITEMS - selected.length} {COMBO_MIN_ITEMS - selected.length === 1 ? "fragancia más" : "fragancias más"} para continuar.</p> : <p className={styles.minimum}>Listo para enviar. Stock y total final se confirman en WhatsApp.</p>}
            {ready ? <a className={styles.send} href={whatsappUrl} target="_blank" rel="noopener noreferrer">Continuar en WhatsApp <span aria-hidden="true">↗</span></a> : <button className={styles.send} type="button" disabled>Continuar en WhatsApp</button>}
          </aside>
        </div>

        <div className={styles.mobileSticky} data-combo-sticky>
          <div><strong>{selected.length ? `${selected.length} seleccionada${selected.length === 1 ? "" : "s"}` : "Elige tus fragancias"}</strong><span>{ready ? money(total) : `mínimo ${COMBO_MIN_ITEMS}`}</span></div>
          {ready ? <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">Continuar <span aria-hidden="true">↗</span></a> : <button type="button" disabled>Continuar</button>}
        </div>
      </section>

      <div className={styles.catalogLink}><Link href={"/parfums/catalogo" as Route}>Seguir explorando el catálogo <span aria-hidden="true">→</span></Link></div>
      <div className={styles.toast} role="status" aria-live="polite">{notice}</div>
    </div>
  );
}
