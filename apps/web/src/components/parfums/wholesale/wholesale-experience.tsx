"use client";

import Image from "next/image";
import { useMemo, useState, type FormEvent } from "react";
import { Breadcrumbs } from "@/components/parfums/navigation/breadcrumbs";
import {
  filterWholesaleOffers,
  type WholesaleOffer,
  type WholesaleOfferFilter,
  type WholesalePolicy,
} from "@/domains/wholesale/wholesale-offer";
import {
  buildWholesaleInquiryMessage,
  buildWholesaleProductMessage,
  buildWhatsAppUrl,
} from "@/domains/whatsapp/parfums-message-builder";
import styles from "./wholesale.module.css";

const filters: { value: WholesaleOfferFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "arab", label: "Árabes" },
  { value: "designer", label: "Designer" },
  { value: "niche", label: "Nicho" },
];

const typeLabel: Record<WholesalePolicy["commercialType"], string> = {
  arab: "Árabe",
  designer: "Designer",
  niche: "Nicho",
};

function money(amount: string) {
  return `S/ ${amount}`;
}

function variantLabel(offer: WholesaleOffer) {
  return `Frasco ${offer.variant.sizeMl} ml`;
}

/**
 * Public wholesale surface. Everything priced here comes from the published
 * catalog (bottle variants with confirmed price authority) and from the
 * client-confirmed per-category policy in the database. There are no
 * referential/legacy tiers anymore: if a bottle has no confirmed price it is
 * simply not published, and therefore not listed.
 */
export function WholesaleExperience({
  offers,
  policies,
  storeName,
  whatsappNumber,
}: {
  offers: WholesaleOffer[];
  policies: WholesalePolicy[];
  storeName: string;
  whatsappNumber: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WholesaleOfferFilter>("all");
  const visible = useMemo(() => filterWholesaleOffers(offers, query, filter), [offers, query, filter]);
  const minQuantity = policies[0]?.minQuantity ?? null;

  function productUrl(offer: WholesaleOffer) {
    return buildWhatsAppUrl(whatsappNumber, buildWholesaleProductMessage({
      storeName,
      brand: offer.product.brand,
      productName: offer.product.name,
      variantLabel: variantLabel(offer),
      basePriceAmount: offer.basePriceAmount,
      policy: offer.policy && offer.wholesaleUnitPriceAmount
        ? {
          minQuantity: offer.policy.minQuantity,
          discountAmount: offer.policy.discountAmount,
          wholesaleUnitPriceAmount: offer.wholesaleUnitPriceAmount,
        }
        : null,
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
          <p>Frascos completos sellados para tiendas, barberías, salones, creadores y revendedores. Revisa el precio por unidad y confirma disponibilidad por WhatsApp.</p>
          <a href="#tarifas">Ver frascos <span aria-hidden="true">↓</span></a>
        </div>
      </section>

      <section className={styles.features} aria-label="Características del servicio mayorista">
        <div><span>◆</span><strong>Frascos completos</strong><p>Solo presentaciones selladas del catálogo. Los decants no aplican a mayorista.</p></div>
        <div><span>◇</span><strong>Descuento por categoría</strong><p>Precio por unidad según el tipo de fragancia.</p></div>
        <div><span>◈</span><strong>Atención directa</strong><p>Confirmación final por WhatsApp.</p></div>
        <div><span>✦</span><strong>Envío nacional</strong><p>Agencia Shalom, Lima y todo el Perú.</p></div>
      </section>

      {policies.length > 0 ? (
        <section className={styles.policyLine} aria-labelledby="linea-mayorista-heading">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Condición mayorista</p>
              <h2 id="linea-mayorista-heading">Descuento por <em>categoría</em>.</h2>
            </div>
            <p>
              {policies.map((policy) => `${typeLabel[policy.commercialType]} −S/ ${policy.discountAmount}`).join(" · ")} por unidad,
              {minQuantity ? ` desde ${minQuantity} frascos de la misma categoría en un pedido.` : " según cantidad."}
            </p>
          </div>
          <ul className={styles.policyGrid}>
            {policies.map((policy) => (
              <li key={policy.commercialType} className={styles.policyChip}>
                <span className={styles.policyBrand}>{typeLabel[policy.commercialType]}</span>
                <span className={styles.policyName}>−S/ {policy.discountAmount} · desde {policy.minQuantity} uds</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.catalog} id="tarifas">
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>Frascos disponibles</p><h2>Precio por <em>unidad</em>.</h2></div>
          <p>Precio de frasco publicado y precio mayorista aplicando el descuento de su categoría. La disponibilidad se confirma al cotizar.</p>
        </div>
        <div className={styles.toolbar}>
          <label><span className="sr-only">Buscar fragancia mayorista</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por marca o fragancia…" /></label>
          <div className={styles.filterList} aria-label="Filtrar frascos por tipo">
            {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}
          </div>
        </div>
        <div className={styles.count} role="status">{visible.length} {visible.length === 1 ? "frasco" : "frascos"}</div>

        {visible.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th aria-label="Imagen" /><th>Marca</th><th>Fragancia</th><th>Presentación</th><th>Precio frasco</th><th>Mayorista{minQuantity ? ` (${minQuantity}+ uds)` : ""}</th><th aria-label="Acción" /></tr></thead>
              <tbody>
                {visible.map((offer) => (
                  <tr key={offer.variant.dbVariantId ?? `${offer.product.slug}-${offer.variant.variantId}`} data-wholesale-row>
                    <td className={styles.media}>{offer.product.bottleImageUrl ? <Image src={offer.product.bottleImageUrl} alt="" width={56} height={70} sizes="56px" /> : null}</td>
                    <td className={styles.brand}>{offer.product.brand}</td>
                    <td className={styles.name}>{offer.product.name}</td>
                    <td data-label="Presentación">{variantLabel(offer)}</td>
                    <td data-label="Precio frasco"><strong>{money(offer.basePriceAmount)}</strong></td>
                    <td data-label="Mayorista">
                      {offer.wholesaleUnitPriceAmount ? <strong>{money(offer.wholesaleUnitPriceAmount)}</strong> : <span>A confirmar</span>}
                    </td>
                    <td className={styles.action}><a href={productUrl(offer)} target="_blank" rel="noopener noreferrer" aria-label={`Cotizar ${offer.product.name} ${variantLabel(offer)} por WhatsApp`}>Cotizar <span aria-hidden="true">↗</span></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.tableNote}>* Precios en soles (PEN). El descuento mayorista aplica al alcanzar la cantidad mínima de frascos de la misma categoría en un pedido; el total se confirma por WhatsApp.</p>
          </div>
        ) : offers.length === 0 ? (
          <div className={styles.empty}><strong>Sin frascos publicados por ahora</strong><p>Los precios de frascos completos están en confirmación. Escríbenos por WhatsApp y te indicamos qué presentaciones selladas están disponibles.</p><a href="#cotizar">Solicitar cotización</a></div>
        ) : (
          <div className={styles.empty}><strong>Sin coincidencias</strong><p>Prueba otra búsqueda o cambia el tipo de fragancia.</p><button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Limpiar filtros</button></div>
        )}
      </section>

      <section className={styles.steps}>
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Cómo funciona</p><h2>Cotización <em>personalizada</em>.</h2></div><p>El total final depende de fragancia, cantidad y disponibilidad.</p></div>
        <div className={styles.stepGrid}>
          <article><span>01</span><h3>Cuéntanos tu negocio</h3><p>Indica las fragancias y el volumen estimado.</p></article>
          <article><span>02</span><h3>Revisa la cotización</h3><p>Confirmamos disponibilidad y el precio por unidad según cantidad.</p></article>
          <article><span>03</span><h3>Coordina el pedido</h3><p>Continúa en WhatsApp para acordar pago y entrega por Shalom.</p></article>
        </div>
      </section>

      <section className={styles.formSection} id="cotizar">
        <div><p className={styles.eyebrow}>Formulario mayorista</p><h2>Cuéntanos tu <em>negocio</em>.</h2><p>Completa los datos y abrirás una conversación con la información lista para revisar. Enviar no confirma un pedido.</p></div>
        <form onSubmit={submit} className={styles.form}>
          <h3>Solicitar cotización</h3>
          <label>Nombre y apellido<input name="name" required placeholder="Tu nombre" /></label>
          <label>Nombre de tu negocio<input name="business" placeholder="Ej. Barbería El Faro" /></label>
          <label>WhatsApp<input name="phone" type="tel" required inputMode="tel" placeholder="9XX XXX XXX" /></label>
          <label>Volumen estimado<select name="volume" defaultValue="Menos de 40 unidades"><option>Menos de 40 unidades</option><option>40 – 80 unidades</option><option>80+ unidades</option><option>Aún no lo sé</option></select></label>
          <label>Fragancias de interés<textarea name="message" rows={3} placeholder="Ej. Khamrah × 20, Hawas Ice × 20…" /></label>
          <button type="submit">Continuar en WhatsApp <span aria-hidden="true">↗</span></button>
          <small>Se abrirá WhatsApp para confirmar disponibilidad y el total.</small>
        </form>
      </section>
    </>
  );
}
