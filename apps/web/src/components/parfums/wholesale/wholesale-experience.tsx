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
  { value: "arab", label: "Árabe" },
  { value: "designer", label: "Designer" },
  { value: "niche", label: "Nicho" },
];

const typeLabel: Record<WholesalePolicy["commercialType"], string> = {
  arab: "Árabe",
  designer: "Designer",
  niche: "Nicho",
};

const policyImage: Record<WholesalePolicy["commercialType"], string> = {
  arab: "/images/parfums-wholesale-runtime/wholesale-category-arab.webp",
  designer: "/images/parfums-wholesale-runtime/wholesale-category-designer.webp",
  niche: "/images/parfums-wholesale-runtime/wholesale-category-niche.webp",
};

const TRUST_ITEMS = [
  {
    title: "100% originales",
    text: "Frascos auténticos de las casas oficiales.",
    icon: (
      <>
        <path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8.7 12.2l2.2 2.2 4.4-4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    title: "Frascos completos",
    text: "Sellados y en perfecto estado desde fábrica.",
    icon: (
      <>
        <path d="M4 8.2L12 4l8 4.2v8.6L12 21l-8-4.2V8.2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M4 8.2L12 12l8-4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M12 12v9" stroke="currentColor" strokeWidth="1.3" />
      </>
    ),
  },
  {
    title: "Atención directa",
    text: "Confirmación final por WhatsApp.",
    icon: (
      <path d="M12 4a8 8 0 00-6.9 12l-1 3.5 3.6-1A8 8 0 1012 4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    ),
  },
  {
    title: "Envíos por Shalom",
    text: "Cobertura y costo se confirman por WhatsApp.",
    icon: (
      <>
        <path d="M3 7h11v9H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M14 10h4l3 3v3h-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="7.5" cy="17.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="17.5" cy="17.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      </>
    ),
  },
] as const;

const STEPS = [
  {
    number: "01",
    title: "Cuéntanos tu negocio",
    text: "Indica las fragancias y el volumen estimado.",
    icon: (
      <path d="M12 4a8 8 0 00-6.9 12l-1 3.5 3.6-1A8 8 0 1012 4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    ),
  },
  {
    number: "02",
    title: "Revisa la cotización",
    text: "Confirmamos disponibilidad y el precio por unidad según cantidad.",
    icon: (
      <>
        <path d="M7 3.5h7l4 4V20a1 1 0 01-1 1H7a1 1 0 01-1-1V4.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M14 3.5V8h4.2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M9 12.5h6M9 16h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </>
    ),
  },
  {
    number: "03",
    title: "Coordina el pedido",
    text: "Continúa en WhatsApp para acordar pago y entrega por Shalom.",
    icon: (
      <>
        <path d="M3 7h11v9H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M14 10h4l3 3v3h-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx="7.5" cy="17.5" r="1.6" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="17.5" cy="17.5" r="1.6" stroke="currentColor" strokeWidth="1.2" />
      </>
    ),
  },
] as const;

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

  function focusCategory(type: WholesalePolicy["commercialType"]) {
    setFilter(type);
    document.getElementById("tarifas")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <Breadcrumbs items={[{ label: "Parfums", href: "/parfums" }, { label: "Mayorista" }]} />
          <h1>Venta por <em>Mayor</em></h1>
          <p className={styles.heroLead}>Compra para tu negocio con mejores condiciones.</p>
          <p className={styles.heroText}>Frascos completos sellados para tiendas, barberías, salones, creadores y revendedores. Revisa el precio por unidad y confirma disponibilidad por WhatsApp.</p>
          <div className={styles.heroActions}>
            <a href="#cotizar" className={styles.heroCta}>Solicitar cotización <span aria-hidden="true">→</span></a>
            <a href="#tarifas" className={styles.heroCtaSecondary}>Ver frascos <span aria-hidden="true">→</span></a>
          </div>
        </div>
        <div className={styles.heroMedia}>
          <Image
            src="/images/parfums-wholesale-runtime/wholesale-hero.webp"
            alt="Frascos Cruzial Parfums en tonos negro y dorado sobre piedra natural"
            fill
            sizes="(max-width: 900px) 100vw, 50vw"
            preload
            className={styles.heroImage}
          />
        </div>
      </section>

      <section className={styles.trustStrip} aria-label="Condiciones del servicio mayorista">
        {TRUST_ITEMS.map((item) => (
          <div key={item.title}>
            <svg className={styles.trustIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">{item.icon}</svg>
            <span><strong>{item.title}</strong>{item.text}</span>
          </div>
        ))}
      </section>

      {policies.length > 0 ? (
        <section className={styles.policyLine} aria-labelledby="linea-mayorista-heading">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Condición mayorista</p>
              <h2 id="linea-mayorista-heading">Descuento por <em>categoría</em>.</h2>
            </div>
            {minQuantity ? <p>Desde {minQuantity} frascos de la misma categoría en un pedido.</p> : null}
          </div>
          <div className={styles.policyGrid}>
            {policies.map((policy) => (
              <button
                key={policy.commercialType}
                type="button"
                className={styles.policyCard}
                onClick={() => focusCategory(policy.commercialType)}
              >
                <span className={styles.policyMedia}>
                  <Image
                    src={policyImage[policy.commercialType]}
                    alt=""
                    fill
                    sizes="(max-width: 900px) 100vw, 33vw"
                    className={styles.policyImage}
                  />
                  <span className={styles.policyScrim} aria-hidden="true" />
                </span>
                <span className={styles.policyBody}>
                  <span className={styles.policyType}>{typeLabel[policy.commercialType]}</span>
                  <span className={styles.policyDiscount}>−S/ {policy.discountAmount}</span>
                  <span className={styles.policyMin}>desde {policy.minQuantity} uds.</span>
                </span>
                <span className={styles.policyArrow} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.catalog} id="tarifas">
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>Frascos disponibles</p><h2>Precio por <em>unidad</em>.</h2></div>
          <p>Precio publicado y disponibilidad se confirman por WhatsApp según tu categoría y cantidad.</p>
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
                    <td className={styles.presentation}>{variantLabel(offer)}</td>
                    <td className={styles.priceCell} data-label="Precio frasco"><strong>{money(offer.basePriceAmount)}</strong></td>
                    <td className={styles.wholesaleCell} data-label={`Mayorista${minQuantity ? ` (${minQuantity}+ uds)` : ""}`}>
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
          <div className={styles.empty}><strong>Sin precios publicados por ahora</strong><p>Los precios de frascos completos están en confirmación. Escríbenos por WhatsApp y te indicamos qué presentaciones selladas están disponibles.</p><a href="#cotizar">Solicitar cotización</a></div>
        ) : (
          <div className={styles.empty}><strong>Sin coincidencias</strong><p>Prueba otra búsqueda o cambia el tipo de fragancia.</p><button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Limpiar filtros</button></div>
        )}
      </section>

      <section className={styles.steps}>
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Cómo funciona</p><h2>Cotización <em>personalizada</em>.</h2></div><p>El total final depende de la fragancia, cantidad y disponibilidad.</p></div>
        <div className={styles.stepGrid}>
          {STEPS.map((step) => (
            <article key={step.number}>
              <svg className={styles.stepIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">{step.icon}</svg>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.formSection} id="cotizar">
        <div className={styles.formMedia}>
          <Image
            src="/images/parfums-wholesale-runtime/wholesale-form-editorial.webp"
            alt=""
            fill
            sizes="(max-width: 900px) 100vw, 50vw"
            className={styles.formImage}
          />
        </div>
        <div className={styles.formPanel}>
          <div className={styles.formIntro}>
            <p className={styles.eyebrow}>Formulario mayorista</p>
            <h2>Cuéntanos tu <em>negocio</em>.</h2>
            <p>Completa los datos y abrirás una conversación con la información lista para revisar. Enviar no confirma un pedido.</p>
          </div>
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
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="wholesale-final-cta-title">
        <div className={styles.finalCtaMedia}>
          <Image
            src="/images/parfums-wholesale-runtime/wholesale-final-cta.webp"
            alt=""
            fill
            sizes="100vw"
            className={styles.finalCtaImage}
          />
          <div className={styles.finalCtaScrim} aria-hidden="true" />
        </div>
        <div className={styles.finalCtaCopy}>
          <div>
            <p className={styles.eyebrow}>Cruzial Business</p>
            <h2 id="wholesale-final-cta-title">Lleva fragancias que<br />marcan la diferencia.</h2>
            <p>Originales. Selladas. Con el respaldo de Cruzial Parfums.</p>
            <a href="#cotizar" className={styles.finalCtaButton}>Solicitar cotización <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>
    </>
  );
}
