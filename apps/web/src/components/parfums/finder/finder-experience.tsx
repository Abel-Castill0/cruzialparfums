"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  addParfumsCartLine,
  PARFUMS_CART_UPDATED_EVENT,
} from "@/domains/carts/parfums-cart";
import type { CatalogProduct } from "@/domains/catalog/types";
import {
  EMPTY_FINDER_ANSWERS,
  FINDER_FEELING_LABELS,
  FINDER_INTENSITY_LABELS,
  findPerfumes,
  finderConfidence,
  finderScoreLabel,
  finderWhyText,
  listFinderFamilies,
  listFinderTopNotes,
  type FinderAnswers,
  type FinderFeeling,
  type FinderIntensity,
} from "@/domains/finder/finder-rules";
import styles from "./finder.module.css";

const steps = ["forWhom", "feelings", "families", "intensity", "notes"] as const;
type FinderStep = (typeof steps)[number];

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

function toggleLimited<T>(values: readonly T[], value: T, limit?: number) {
  if (values.includes(value)) return values.filter((candidate) => candidate !== value);
  if (limit && values.length >= limit) return [...values.slice(1), value];
  return [...values, value];
}

function Results({ products, answers, onRestart, onNotice }: {
  products: CatalogProduct[];
  answers: FinderAnswers;
  onRestart: () => void;
  onNotice: (message: string) => void;
}) {
  const results = findPerfumes(products, answers);
  const confidence = finderConfidence(results);
  const heading = confidence === "weak"
    ? "No encontramos una coincidencia perfecta"
    : confidence === "close"
      ? "Estas opciones encajan bien contigo"
      : "Tu mejor coincidencia";
  const intro = confidence === "weak"
    ? "Estas son las opciones que más se acercan a lo que nos contaste. Compáralas antes de elegir."
    : confidence === "close"
      ? "Varias fragancias respondieron de forma similar a tus preferencias."
      : "Resultado calculado con tus respuestas, datos del catálogo y una clasificación editorial de intensidad.";

  function add(product: CatalogProduct) {
    const size = 3;
    const mutation = addParfumsCartLine(localStorage, {
      productId: product.legacyId,
      variantId: `decant-${size}ml`,
      quantity: 1,
    });
    if (!mutation.persisted) {
      onNotice("No pudimos guardar la selección. Revisa el almacenamiento del navegador.");
      return;
    }
    window.dispatchEvent(new Event(PARFUMS_CART_UPDATED_EVENT));
    onNotice(`${product.brand} ${product.name} · 3 ml añadido`);
  }

  return (
    <div className={styles.results} data-finder-results>
      <p className={styles.resultEyebrow}>Tu selección Cruzial</p>
      <h2 id="finder-title">{heading}</h2>
      <p className={styles.resultIntro}>{intro}</p>
      <p className={styles.methodNote}>La afinidad no mide rendimiento ni garantiza que una fragancia te guste; organiza coincidencias entre tus respuestas y el catálogo.</p>
      <div className={styles.resultList}>
        {results.map((result, index) => (
          <article className={`${styles.resultCard} ${index === 0 ? styles.topResult : ""}`} key={result.product.legacyId}>
            <Link className={styles.resultMedia} href={`/parfums/productos/${result.product.slug}` as Route}>
              {result.product.imageUrl ? <Image src={result.product.imageUrl} alt={result.product.imageAlt} fill sizes="96px" className={styles.resultImage} /> : null}
            </Link>
            <div className={styles.resultBody}>
              <span className={styles.score}>{finderScoreLabel(result.score)} <em>{result.score}/100</em></span>
              <span className={styles.resultBrand}>{result.product.brand}</span>
              <h3><Link href={`/parfums/productos/${result.product.slug}` as Route}>{result.product.name}</Link></h3>
              <p>{finderWhyText(result.reasons)}</p>
              <div className={styles.resultActions}>
                <Link href={`/parfums/productos/${result.product.slug}` as Route}>Ver perfume</Link>
                <button type="button" onClick={() => add(result.product)}>Probar 3 ml <span aria-hidden="true">+</span></button>
              </div>
              <small>Decants desde {money(Math.min(...Object.values(result.product.decantPrices)))} · 3 / 5 / 10 ml</small>
            </div>
          </article>
        ))}
      </div>
      <div className={styles.resultFooter}>
        <button type="button" data-finder-restart onClick={onRestart}>Empezar de nuevo</button>
        <Link href={"/parfums/catalogo" as Route}>Ver todo el catálogo <span aria-hidden="true">→</span></Link>
      </div>
    </div>
  );
}

export function FinderExperience({ products }: { products: CatalogProduct[] }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [answers, setAnswers] = useState<FinderAnswers>(() => ({
    ...EMPTY_FINDER_ANSWERS,
    feelings: [],
    families: [],
    notes: [],
  }));
  const [notice, setNotice] = useState("");
  const families = useMemo(() => listFinderFamilies(products), [products]);
  const notes = useMemo(() => listFinderTopNotes(products), [products]);
  const step = steps[stepIndex] as FinderStep;

  useEffect(() => {
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = priorOverflow; };
  }, []);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("[data-step-option], [data-finder-restart]")?.focus();
  }, [showResults, stepIndex]);

  function close() {
    router.push("/parfums/catalogo" as Route);
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
    if (stepIndex === steps.length - 1) setShowResults(true);
    else setStepIndex((current) => current + 1);
  }

  function restart() {
    setAnswers({ ...EMPTY_FINDER_ANSWERS, feelings: [], families: [], notes: [] });
    setStepIndex(0);
    setShowResults(false);
  }

  function announce(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
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
          {showResults ? (
            <Results products={products} answers={answers} onRestart={restart} onNotice={announce} />
          ) : (
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
          )}
        </div>
      </div>
      <div className={styles.toast} role="status" aria-live="polite">{notice}</div>
    </div>
  );
}
