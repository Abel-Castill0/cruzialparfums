"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LIMA_DISTRICTS,
  isMotorizadoRestricted,
} from "@/domains/orders/lima-districts";
import {
  PARFUMS_MOTORIZADO_DELIVERY,
  PARFUMS_SHALOM_DELIVERY,
  shalomAgencyDelivery,
} from "@/domains/orders/parfums-delivery";
import { SHALOM_AGENCIES, type ShalomAgency } from "@/domains/orders/shalom-agencies";
import { DistrictMap, type DistrictTileState } from "./district-map";
import styles from "./shipping-selector.module.css";

export type ShippingSelection = { delivery: string; district: string; complete: boolean };

type Method = "shalom" | "motorizado";
/** Which Shalom pick the customer made: a listed agency, or "my agency is not listed". */
type ShalomPick = { kind: "agency"; id: string } | { kind: "other" } | null;

const METRO = new Set(LIMA_DISTRICTS.map((district) => district.name));
const REGION_FILTER = "__region__";
const SORTED_DISTRICTS = [...LIMA_DISTRICTS].map((district) => district.name).sort((a, b) => a.localeCompare(b, "es"));

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function directionsUrl(agency: ShalomAgency) {
  const query = agency.lat !== undefined && agency.lng !== undefined
    ? `${agency.lat},${agency.lng}`
    : encodeURIComponent(`Shalom ${agency.address}, ${agency.district}, Perú`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function ShippingSelector({
  districtValue,
  onDistrictChange,
  onChange,
  showMissing,
  districtError,
  deliveryError,
}: {
  /** Free-text district/city, used only when the customer's Shalom agency is not listed. */
  districtValue: string;
  onDistrictChange: (value: string) => void;
  onChange: (selection: ShippingSelection) => void;
  /** The customer tried to continue without finishing this step. */
  showMissing: boolean;
  districtError?: string | undefined;
  deliveryError?: string | undefined;
}) {
  const [method, setMethod] = useState<Method>("shalom");
  const [pick, setPick] = useState<ShalomPick>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [motoDistrict, setMotoDistrict] = useState("");

  const byDistrict = useMemo(() => {
    const map = new Map<string, ShalomAgency[]>();
    for (const agency of SHALOM_AGENCIES) map.set(agency.district, [...(map.get(agency.district) ?? []), agency]);
    return map;
  }, []);
  const regionCount = useMemo(() => SHALOM_AGENCIES.filter((agency) => !METRO.has(agency.district)).length, []);

  const selectedAgency = pick?.kind === "agency" ? SHALOM_AGENCIES.find((agency) => agency.id === pick.id) ?? null : null;

  const visible = useMemo(() => {
    const q = fold(query.trim());
    if (!q && filter === null) return [];
    return SHALOM_AGENCIES.filter((agency) => {
      if (filter === REGION_FILTER && METRO.has(agency.district)) return false;
      if (filter !== null && filter !== REGION_FILTER && agency.district !== filter) return false;
      return !q || fold(`${agency.district} ${agency.name} ${agency.address}`).includes(q);
    });
  }, [query, filter]);

  // Report the resolved choice to the form: the text the server validates, the
  // district it stores, and whether the step is finished.
  const selection = useMemo<ShippingSelection>(() => {
    if (method === "motorizado") {
      return { delivery: PARFUMS_MOTORIZADO_DELIVERY, district: motoDistrict, complete: motoDistrict !== "" };
    }
    if (selectedAgency) {
      return { delivery: shalomAgencyDelivery(selectedAgency), district: selectedAgency.district, complete: true };
    }
    return { delivery: PARFUMS_SHALOM_DELIVERY, district: pick?.kind === "other" ? districtValue : "", complete: pick?.kind === "other" };
  }, [method, motoDistrict, selectedAgency, pick, districtValue]);

  useEffect(() => {
    onChange(selection);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report on value changes only
  }, [selection.delivery, selection.district, selection.complete]);

  const missing = showMissing && !selection.complete;
  const restricted = method === "motorizado" && isMotorizadoRestricted(motoDistrict);

  function chooseMethod(next: Method) {
    setMethod(next);
    // The free-text district belongs to "my agency is not listed" only.
    onDistrictChange("");
  }

  function toggleFilter(district: string) {
    setFilter((current) => (current === district ? null : district));
  }

  const shalomTile = (district: string): DistrictTileState => {
    const count = byDistrict.get(district)?.length ?? 0;
    return count > 0 ? { count } : { disabled: true };
  };
  const motoTile = (district: string): DistrictTileState => ({ restricted: isMotorizadoRestricted(district) });

  return (
    <fieldset className={styles.shipping} id="checkout-shipping" tabIndex={-1} aria-describedby={missing ? "shipping-missing" : undefined}>
      <legend>Cómo quieres recibir tu pedido</legend>

      <div className={styles.methods} role="radiogroup" aria-label="Método de entrega">
        <label className={styles.method} data-checked={method === "shalom"}>
          <input type="radio" name="shipping-method" value="shalom" checked={method === "shalom"} onChange={() => chooseMethod("shalom")} />
          <strong>Agencia Shalom</strong>
          <span>Recoges en la agencia que elijas. Todo el Perú.</span>
        </label>
        <label className={styles.method} data-checked={method === "motorizado"}>
          <input type="radio" name="shipping-method" value="motorizado" checked={method === "motorizado"} onChange={() => chooseMethod("motorizado")} />
          <strong>Motorizado</strong>
          <span>Entrega en Lima. Se cotiza por WhatsApp.</span>
        </label>
      </div>

      {method === "shalom" ? (
        <div className={styles.panel} data-shalom-panel>
          <p className={styles.hint}>Elige tu distrito en el mapa o busca por nombre o dirección. Puedes recoger en cualquier agencia.</p>
          <div className={styles.searchRow}>
            <input
              type="search"
              className={styles.search}
              placeholder="Busca distrito, agencia o dirección"
              aria-label="Buscar agencia Shalom"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              enterKeyHint="search"
            />
            {query || filter !== null ? (
              <button type="button" className={styles.clear} onClick={() => { setQuery(""); setFilter(null); }}>Limpiar</button>
            ) : null}
          </div>

          <DistrictMap
            label="Mapa esquemático de distritos de Lima con agencias Shalom"
            selected={filter !== REGION_FILTER ? filter : null}
            onSelect={toggleFilter}
            tileState={shalomTile}
            describe={(district, state) => (state.count ? `${district}: ${plural(state.count, "agencia", "agencias")}` : `${district}: sin agencias`)}
          />
          <p className={styles.legend}>Esquema referencial, no está a escala. El número indica cuántas agencias hay.</p>
          <button
            type="button"
            className={styles.regionChip}
            aria-pressed={filter === REGION_FILTER}
            onClick={() => toggleFilter(REGION_FILTER)}
          >
            Otras ciudades de Lima región ({regionCount})
          </button>

          {selectedAgency && !visible.some((agency) => agency.id === selectedAgency.id) ? (
            <div className={styles.chosen} data-shalom-chosen>
              <span>Recogerás en</span>
              <strong>{selectedAgency.name}</strong>
              <small>{selectedAgency.address}</small>
            </div>
          ) : null}

          {visible.length > 0 ? (
            <ul className={styles.agencies} role="radiogroup" aria-label="Agencias Shalom disponibles">
              {visible.map((agency) => (
                <li key={agency.id}>
                  <label className={styles.agency} data-checked={selectedAgency?.id === agency.id}>
                    <input
                      type="radio"
                      name="shalom-agency"
                      value={agency.id}
                      checked={selectedAgency?.id === agency.id}
                      onChange={() => setPick({ kind: "agency", id: agency.id })}
                    />
                    <strong>{agency.name}</strong>
                    <span>{agency.district} · {agency.address}</span>
                    <small>{agency.hours}</small>
                  </label>
                  <a className={styles.directions} href={directionsUrl(agency)} target="_blank" rel="noopener noreferrer">
                    Cómo llegar <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : query || filter !== null ? (
            <p className={styles.empty} role="status">No encontramos agencias con ese criterio. Prueba otro distrito o elige «Mi agencia no aparece».</p>
          ) : null}

          <label className={styles.other} data-checked={pick?.kind === "other"}>
            <input type="radio" name="shalom-agency" value="other" checked={pick?.kind === "other"} onChange={() => { setPick({ kind: "other" }); onDistrictChange(""); }} />
            <strong>Mi agencia no aparece o envío a otra ciudad</strong>
            <span>Te confirmaremos la agencia por WhatsApp.</span>
          </label>
          {pick?.kind === "other" ? (
            <label className={styles.field}>
              Distrito / Ciudad
              <input id="checkout-district" required maxLength={120} autoComplete="address-level2" value={districtValue} onChange={(event) => onDistrictChange(event.target.value)} placeholder="Ej. Arequipa" aria-invalid={Boolean(districtError)} aria-describedby={districtError ? "checkout-district-error" : undefined} />
              {districtError ? <small id="checkout-district-error" className={styles.fieldError}>{districtError}</small> : null}
            </label>
          ) : null}
          <p className={styles.note}>Los horarios son referenciales y las agencias las tomamos de un directorio no oficial. Antes de enviar, confirmamos tu agencia por WhatsApp.</p>
        </div>
      ) : (
        <div className={styles.panel} data-motorizado-panel>
          <label className={styles.field}>
            Distrito de entrega
            <select id="checkout-motorizado-district" value={motoDistrict} onChange={(event) => setMotoDistrict(event.target.value)}>
              <option value="">Elige tu distrito</option>
              {SORTED_DISTRICTS.map((district) => <option key={district} value={district}>{district}</option>)}
            </select>
          </label>

          <DistrictMap
            label="Mapa esquemático de distritos de Lima con zonas de acceso restringido para el motorizado"
            selected={motoDistrict || null}
            onSelect={setMotoDistrict}
            tileState={motoTile}
            describe={(district, state) => (state.restricted ? `${district}: acceso restringido` : `${district}: se cotiza por WhatsApp`)}
          />
          <ul className={styles.keys} aria-label="Leyenda del mapa">
            <li><i className={styles.keyRestricted} aria-hidden="true" />Acceso restringido</li>
            <li><i className={styles.keyOpen} aria-hidden="true" />Se cotiza por WhatsApp</li>
          </ul>
          <p className={styles.legend}>Esquema referencial, no está a escala.</p>

          <div className={styles.callout} data-restricted={restricted} role="status">
            {!motoDistrict ? (
              <p>Elige tu distrito. El costo y la hora de entrega se acuerdan contigo por WhatsApp.</p>
            ) : restricted ? (
              <>
                <strong>Acceso restringido en {motoDistrict}</strong>
                <p>El motorizado no ingresa a todas las zonas de este distrito. Te escribimos por WhatsApp para acordar un punto de entrega seguro, o puedes recoger en una agencia Shalom.</p>
                <button type="button" className={styles.switch} onClick={() => chooseMethod("shalom")}>Prefiero recoger en Shalom</button>
              </>
            ) : (
              <>
                <strong>{motoDistrict}</strong>
                <p>Te cotizamos el motorizado por WhatsApp antes de confirmar tu pedido.</p>
              </>
            )}
          </div>
          <p className={styles.note}>¿Estás fuera de Lima Metropolitana? Elige Shalom, que llega a todo el Perú.</p>
        </div>
      )}

      {missing ? (
        <p id="shipping-missing" className={styles.missing} role="alert">
          {method === "motorizado" ? "Elige tu distrito para continuar." : "Elige una agencia Shalom para continuar."}
        </p>
      ) : null}
      {deliveryError ? <p className={styles.missing} role="alert">{deliveryError}</p> : null}
    </fieldset>
  );
}
