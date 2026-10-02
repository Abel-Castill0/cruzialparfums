"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CatalogProduct } from "@/domains/catalog/types";
import {
  EMPTY_FINDER_ANSWERS,
  FINDER_FEELING_LABELS,
  FINDER_INTENSITY_LABELS,
  listFinderFamilies,
  listFinderTopNotes,
  type FinderAnswers,
  type FinderFeeling,
  type FinderIntensity,
} from "@/domains/finder/finder-rules";
import { buildRecommendationHref } from "@/domains/finder/finder-url";
import styles from "./finder.module.css";

const steps = ["forWhom", "feelings", "families", "intensity", "notes"] as const;
type FinderStep = (typeof steps)[number];

function toggleLimited<T>(values: readonly T[], value: T, limit?: number) {
  if (values.includes(value)) return values.filter((candidate) => candidate !== value);
  if (limit && values.length >= limit) return [...values.slice(1), value];
  return [...values, value];
}

/**
 * The questionnaire only collects answers. Closing it (X, outside click or
 * Escape) returns to the page it was opened from, with focus back on the
 * control that opened it; only completing it navigates, to the catalog with
 * the recommendation for those answers. Nothing is recorded as completed
 * unless the last step is confirmed.
 */
export function FinderExperience({ products, catalogQuery = "", intercepted = false }: {
  products: CatalogProduct[];
  /** Catalog filters to keep when handing the recommendation over. */
  catalogQuery?: string;
  /** True when rendered as a modal over the page it was opened from. */
  intercepted?: boolean;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<FinderAnswers>(() => ({
    ...EMPTY_FINDER_ANSWERS,
    feelings: [],
    families: [],
    notes: [],
  }));
  const families = useMemo(() => listFinderFamilies(products), [products]);
  const notes = useMemo(() => listFinderTopNotes(products), [products]);
  const step = steps[stepIndex] as FinderStep;

  useEffect(() => {
    const priorOverflow = document.body.style.overflow;
    openerRef.current = document.activeElement;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = priorOverflow;
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("[data-step-option]")?.focus({ preventScroll: true });
  }, [stepIndex]);

  function close() {
    // Over a page: pop the modal entry and land exactly where the visitor was.
    // Opened directly (a shared link, a refresh): there is no page behind it,
    // so go to the home rather than a catalog nobody asked for.
    const hasPageBehind = intercepted || (window.history.length > 1 && document.referrer.startsWith(window.location.origin));
    if (hasPageBehind) router.back();
    else router.push("/parfums" as Route);
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function canAdvance() {
    if (step === "forWhom") return Boolean(answers.forWhom);
    if (step === "feelings") return answers.feelings.length > 0;
    if (step === "intensity") return Boolean(answers.intensity);
    return true;
  }

  function next() {
    if (!canAdvance()) return;
    if (stepIndex === steps.length - 1) {
      // Completed: replace this entry so Back returns to the original page,
      // not to a finished questionnaire.
      router.replace(buildRecommendationHref(answers, catalogQuery) as Route);
    } else {
      setStepIndex((current) => current + 1);
    }
  }

  let title = "";
  let subtitle = "";
  let options: { value: string | number; label: string; selected: boolean; action: () => void }[] = [];

  if (step === "forWhom") {
    title = "¿Para quién buscas?";
    subtitle = "Sirve como contexto; no limita la selección a un género.";
    options = [
      { value: "mi", label: "Para mí", selected: answers.forWhom === "mi", action: () => setAnswers((current) => ({ ...current, forWhom: "mi" })) },
      { value: "regalar", label: "Para regalar", selected: answers.forWhom === "regalar", action: () => setAnswers((current) => ({ ...current, forWhom: "regalar" })) },
    ];
  } else if (step === "feelings") {
    title = "¿Qué quieres sentir?";
    subtitle = "Elige hasta dos. Al elegir una tercera, se reemplaza la primera.";
    options = (Object.entries(FINDER_FEELING_LABELS) as [FinderFeeling, string][]).map(([value, label]) => ({
      value, label, selected: answers.feelings.includes(value),
      action: () => setAnswers((current) => ({ ...current, feelings: toggleLimited(current.feelings, value, 2) })),
    }));
  } else if (step === "families") {
    title = "¿Qué familias olfativas te atraen?";
    subtitle = "Opcional. Si no las conoces, puedes continuar sin elegir.";
    options = families.map((value) => ({
      value, label: value, selected: answers.families.includes(value),
      action: () => setAnswers((current) => ({ ...current, families: toggleLimited(current.families, value) })),
    }));
  } else if (step === "intensity") {
    title = "¿Qué intensidad prefieres?";
    subtitle = "Cuánto quieres que se note, según clasificación editorial de familia y concentración.";
    options = (Object.entries(FINDER_INTENSITY_LABELS) as unknown as [string, string][]).map(([rawValue, label]) => {
      const value = Number(rawValue) as FinderIntensity;
      return { value, label, selected: answers.intensity === value, action: () => setAnswers((current) => ({ ...current, intensity: value })) };
    });
  } else {
    title = "¿Alguna nota que te guste especialmente?";
    subtitle = "Opcional — hasta cuatro. Al elegir una quinta, se reemplaza la primera.";
    options = notes.map((value) => ({
      value, label: value, selected: answers.notes.includes(value),
      action: () => setAnswers((current) => ({ ...current, notes: toggleLimited(current.notes, value, 4) })),
    }));
  }

  return (
    <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="finder-title" onKeyDown={handleKeys}>
      <button type="button" className={styles.overlay} onClick={close} aria-label="Cerrar buscador de fragancias" />
      <div className={styles.panel} data-finder-panel ref={panelRef}>
        <header className={styles.head}>
          <span>Asesoría olfativa Cruzial</span>
          <button type="button" onClick={close} aria-label="Cerrar buscador de fragancias">×</button>
        </header>
        <div className={styles.body}>
          <>
              <div className={styles.progress}><span>{String(stepIndex + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</span><div><i style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div></div>
              <h1 id="finder-title">{title}</h1>
              <p className={styles.subtitle}>{subtitle}</p>
              <div className={`${styles.options} ${options.length > 8 ? styles.manyOptions : ""}`}>
                {options.map((option) => (
                  <button key={option.value} type="button" data-step-option aria-pressed={option.selected} className={option.selected ? styles.selected : ""} onClick={option.action}>
                    {option.label}<span aria-hidden="true">{option.selected ? "✓" : ""}</span>
                  </button>
                ))}
              </div>
              <nav className={styles.nav} aria-label="Pasos del buscador">
                <button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))}>Atrás</button>
                <button type="button" className={styles.next} disabled={!canAdvance()} onClick={next}>{stepIndex === steps.length - 1 ? "Ver mi selección" : "Siguiente"} <span aria-hidden="true">→</span></button>
              </nav>
            </>
        </div>
      </div>
    </div>
  );
}
