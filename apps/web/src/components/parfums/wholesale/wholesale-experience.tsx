"use client";

import Image from "next/image";
import { useMemo, useState, type FormEvent } from "react";
import { Breadcrumbs } from "@/components/parfums/navigation/breadcrumbs";
import type { CatalogWholesaleProduct } from "@/domains/catalog/types";
import {
  filterWholesaleCatalog,
  type WholesaleFilter,
} from "@/domains/wholesale/wholesale-catalog";
import {
  getWholesaleCategoryDiscount,
  isWholesalePolicyEligible,
  WHOLESALE_MIN_QUANTITY,
} from "@/domains/wholesale/wholesale-policy";
import {
  buildWholesaleInquiryMessage,
  buildWholesaleProductMessage,
  buildWhatsAppUrl,
} from "@/domains/whatsapp/parfums-message-builder";
import styles from "./wholesale.module.css";

const filters: { value: WholesaleFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "arab", label: "Árabes" },
  { value: "designer", label: "Designer" },
  { value: "niche", label: "Nicho" },
];

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

export function WholesaleExperience({
  entries,
  storeName,
  whatsappNumber,
}: {
  entries: CatalogWholesaleProduct[];
  storeName: string;
  whatsappNumber: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WholesaleFilter>("all");
  const visible = useMemo(
    () => filterWholesaleCatalog(entries, query, filter),
    [entries, query, filter],
  );
  const policyLine = useMemo(
    () => entries.filter((entry) => isWholesalePolicyEligible(entry.product.legacyId)),
    [entries],
  );

  function productUrl(entry: CatalogWholesaleProduct) {
    return buildWhatsAppUrl(whatsappNumber, buildWholesaleProductMessage({
      storeName,
      brand: entry.product.brand,
      productName: entry.product.name,
      prices: entry.prices,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const message = buildWholesaleInquiryMessage({
      storeName,
      name: String(data.get("name") ?? ""),
      business: String(data.get("business") ?? ""),
      phone: String(data.get("phone") ?? ""),
      volume: String(data.get("volume") ?? ""),
      message: String(data.get("message") ?? ""),
    });
    window.open(buildWhatsAppUrl(whatsappNumber, message), "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <Breadcrumbs items={[{ label: "Parfums", href: "/parfums" }, { label: "Mayorista" }]} />
          <p className={styles.eyebrow}>Cruzial Business</p>
          <h1>Venta por <em>Mayor</em></h1>
          <p>Frascos completos para tiendas, barberías, salones, creadores y revendedores. Revisa los tramos legacy y confirma disponibilidad y tarifa exacta por WhatsApp.</p>
          <a href="#tarifas">Explorar tarifas <span aria-hidden="true">↓</span></a>
        </div>
      </section>

      <section className={styles.features} aria-label="Características del servicio mayorista">
        <div><span>◆</span><strong>Frascos completos</strong><p>Presentaciones selladas del catálogo.</p></div>
        <div><span>◇</span><strong>Tarifas escalonadas</strong><p>Referencias según volumen solicitado.</p></div>
        <div><span>◈</span><strong>Atención directa</strong><p>Cotización final por WhatsApp.</p></div>
        <div><span>✦</span><strong>Envío nacional</strong><p>Coordinación para todo el Perú.</p></div>
      </section>

      {policyLine.length > 0 ? (
        <section className={styles.policyLine} aria-labelledby="linea-mayorista-heading">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Línea mayorista confirmada</p>
              <h2 id="linea-mayorista-heading">Descuento por <em>categoría</em>.</h2>
            </div>
            <p>
              Árabe −S/ {getWholesaleCategoryDiscount("arab")} · Designer −S/ {getWholesaleCategoryDiscount("designer")} · Nicho −S/ {getWholesaleCategoryDiscount("niche")} por unidad.
              Existe una modalidad desde {WHOLESALE_MIN_QUANTITY} unidades — el detalle de cómo se cuentan se confirma al cotizar por WhatsApp.
            </p>
          </div>
          <ul className={styles.policyGrid}>
            {policyLine.map((entry) => (
              <li key={entry.product.legacyId} className={styles.policyChip}>
                <span className={styles.policyBrand}>{entry.product.brand}</span>
                <span className={styles.policyName}>{entry.product.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.catalog} id="tarifas">
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>Tarifas mayoristas</p><h2>Precios <em>referenciales</em>.</h2></div>
          <p>Valores de paridad legacy, no tarifas comerciales verificadas. Consulta precio exacto y stock antes de confirmar.</p>
        </div>
        <div className={styles.toolbar}>
          <label><span className="sr-only">Buscar fragancia mayorista</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por marca o fragancia…" /></label>
          <div className={styles.filterList} aria-label="Filtrar tarifas por tipo">
            {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}
          </div>
        </div>
        <div className={styles.count} role="status">{visible.length} {visible.length === 1 ? "fragancia" : "fragancias"}</div>

        {visible.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th aria-label="Imagen" /><th>Marca</th><th>Fragancia</th><th>Unidad</th><th>4+ uds</th><th>12+ uds</th><th aria-label="Acción" /></tr></thead>
              <tbody>
                {visible.map((entry) => (
                  <tr key={entry.product.legacyId} data-wholesale-row>
                    <td className={styles.media}>{entry.product.bottleImageUrl ? <Image src={entry.product.bottleImageUrl} alt="" width={56} height={70} sizes="56px" /> : null}</td>
                    <td className={styles.brand}>{entry.product.brand}</td>
                    <td className={styles.name}>{entry.product.name}</td>
                    <td data-label="Unidad"><strong>{money(entry.prices.unit)}</strong></td>
                    <td data-label="4+ uds"><strong>{money(entry.prices.m4)}</strong></td>
                    <td data-label="12+ uds"><strong>{money(entry.prices.m12)}</strong></td>
                    <td className={styles.action}><a href={productUrl(entry)} target="_blank" rel="noopener noreferrer" aria-label={`Cotizar ${entry.product.name} por WhatsApp`}>Consultar <span aria-hidden="true">↗</span></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.tableNote}>* Precios en soles. Datos de paridad legacy sujetos a disponibilidad y reconfirmación.</p>
          </div>
        ) : <div className={styles.empty}><strong>Sin coincidencias</strong><p>Prueba otra búsqueda o cambia el tipo de fragancia.</p><button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Limpiar filtros</button></div>}
      </section>

      <section className={styles.gift}>
        <span>✦</span><div><p className={styles.eyebrow}>Cortesía legacy</p><h2>Decants para acompañar tu pedido.</h2><p>1–3 frascos: 1 decant de 2 ml. Desde 4 frascos: 2 decants de 2 ml. La elección y vigencia se reconfirman al cotizar.</p></div>
      </section>

      <section className={styles.steps}>
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Cómo funciona</p><h2>Cotización <em>personalizada</em>.</h2></div><p>El precio final depende de fragancia, cantidad y disponibilidad.</p></div>
        <div className={styles.stepGrid}>
          <article><span>01</span><h3>Cuéntanos tu negocio</h3><p>Indica las fragancias y el volumen estimado.</p></article>
          <article><span>02</span><h3>Revisa la cotización</h3><p>Confirmamos stock y tarifas exactas según cantidad.</p></article>
          <article><span>03</span><h3>Coordina el pedido</h3><p>Continúa en WhatsApp para acordar pago y entrega.</p></article>
        </div>
      </section>

      <section className={styles.formSection} id="cotizar">
        <div><p className={styles.eyebrow}>Formulario mayorista</p><h2>Cuéntanos tu <em>negocio</em>.</h2><p>Completa los datos y abrirás una conversación con la información lista para revisar. Enviar no confirma un pedido.</p></div>
        <form onSubmit={submit} className={styles.form}>
          <h3>Solicitar tarifas</h3>
          <label>Nombre y apellido<input name="name" required placeholder="Tu nombre" /></label>
          <label>Nombre de tu negocio<input name="business" placeholder="Ej. Barbería El Faro" /></label>
          <label>WhatsApp<input name="phone" type="tel" required inputMode="tel" placeholder="9XX XXX XXX" /></label>
          <label>Volumen estimado<select name="volume" defaultValue="5 – 20 unidades"><option>5 – 20 unidades</option><option>20 – 50 unidades</option><option>50+ unidades</option><option>Aún no lo sé</option></select></label>
          <label>Fragancias de interés<textarea name="message" rows={3} placeholder="Ej. Khamrah × 4, Hawas Ice × 12…" /></label>
          <button type="submit">Continuar en WhatsApp <span aria-hidden="true">↗</span></button>
          <small>Se abrirá WhatsApp para confirmar disponibilidad y tarifa exacta.</small>
        </form>
      </section>
    </>
  );
}
