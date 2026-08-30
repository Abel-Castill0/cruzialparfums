/* ============================================================
   CRUZIAL PERFUME FINDER — "Encuentra tu fragancia"
   ============================================================
   Recomendador determinista, 100% local: sin IA externa, sin
   backend, sin dependencia nueva. Solo usa PRODUCTS (data.js).

   DISCIPLINA DE DATOS — ver CLAUDE.md → ZERO INVENTED COMMERCE:
   - No se inventan notas, intensidad ni "pirámide olfativa" por
     producto. Las únicas señales que entran al cálculo son campos
     reales que YA existen en cada producto: family, notes[], conc,
     gender. Nada se agrega a data.js para esto.
   - FAMILY_TRAITS (abajo) NO es un dato de producto — es una
     convención general de la industria del perfume (familia →
     ánimo/intensidad típicos), la misma que usa cualquier casa o
     sitio de referencia al agrupar Amaderado/Ámbar como "cálidos" y
     Cítrico/Acuático como "frescos". Se aplica por igual a cualquier
     producto de esa familia — no es una medición de un frasco
     específico, y se documenta así también en el resultado visible.
   - Las listas de familias y notas que ve el usuario se calculan en
     vivo desde PRODUCTS, nunca se hardcodean — si el catálogo
     cambia, el cuestionario nunca queda desalineado con los datos.
   - Si una búsqueda no tiene una coincidencia sólida, el resultado
     lo dice explícitamente en vez de fingir un match perfecto.
   ============================================================ */

/* ---------- Clasificación por familia (convención editorial, no dato de producto) ---------- */
const FAMILY_TRAITS = {
  "Fresco":    { feelings:["fresco","limpio"],              warmth:"cool", baseIntensity:1 },
  "Acuático":  { feelings:["fresco","limpio"],               warmth:"cool", baseIntensity:1 },
  "Cítrico":   { feelings:["fresco","limpio"],               warmth:"cool", baseIntensity:1 },
  "Floral":    { feelings:["elegante","sensual"],            warmth:"neutral", baseIntensity:2 },
  "Gourmand":  { feelings:["dulce","calido"],                warmth:"warm", baseIntensity:2 },
  "Ámbar":     { feelings:["calido","misterioso","sensual"], warmth:"warm", baseIntensity:3 },
  "Amaderado": { feelings:["calido","misterioso","elegante"],warmth:"warm", baseIntensity:3 },
  "Especiado": { feelings:["intenso","misterioso"],          warmth:"warm", baseIntensity:4 },
};
const FEELING_LABELS = {
  fresco:"Fresco", dulce:"Dulce", calido:"Cálido",
  intenso:"Intenso", elegante:"Elegante", misterioso:"Misterioso",
};
const INTENSITY_LABELS = ["", "Sutil", "Moderado", "Intenso", "Muy intenso"];

/* ---------- Universo de respuestas — derivado de PRODUCTS, nunca hardcodeado ---------- */
function finderCatalog(){
  return PRODUCTS.filter(p => !p.discontinued && p.type !== "combo" && finderDataQuality(p) !== "insufficient");
}
function finderAvailableFamilies(){
  const set = new Set(finderCatalog().map(p => p.family));
  // Orden fijo por afinidad (frío → cálido) en vez de orden de aparición en data.js
  const order = Object.keys(FAMILY_TRAITS);
  return order.filter(f => set.has(f));
}
function finderTopNotes(limit){
  const counts = {};
  finderCatalog().forEach(p => p.notes.forEach(n => counts[n] = (counts[n]||0) + 1));
  return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, limit).map(([n]) => n);
}

/* ---------- Modelo de intensidad — derivado de family + conc, ambos reales ---------- */
function finderProductIntensity(p){
  const base = (FAMILY_TRAITS[p.family] || {baseIntensity:2}).baseIntensity;
  let tier = base;
  if(p.conc === "EDT") tier -= 1;
  if(p.conc === "Parfum") tier += 1;
  return Math.max(1, Math.min(4, tier));
}

/* ---------- Calidad de datos por producto — política antes de puntuar ----------
   COMPLETE: tiene family, notes, conc y gender — los 4 campos reales que usa
   el scoring. PARTIAL: le falta alguno pero conserva señal usable — participa
   con el resultado final atenuado (×0.85), nunca con la misma confianza que
   uno completo. INSUFFICIENT: sin family y sin notes — no hay nada real que
   comparar, se excluye del Finder (nunca del catálogo ni de ninguna otra
   parte del sitio). Verificado hoy: los 93 productos activos están COMPLETE
   — esto es una red de seguridad para cuando el catálogo crezca, no una
   corrección de datos actuales. */
function finderDataQuality(p){
  const hasFamily = !!p.family;
  const hasNotes = Array.isArray(p.notes) && p.notes.length > 0;
  const hasConc = !!p.conc;
  const hasGender = !!p.gender;
  if(hasFamily && hasNotes && hasConc && hasGender) return "complete";
  if(hasFamily || hasNotes) return "partial";
  return "insufficient";
}

/* ---------- Pesos — datos directos pesan más que heurísticas editoriales ----------
   family (selección directa) 25 + notes (selección directa) 30 = 55 de datos
   reales, contra feelings (afinidad editorial) 20 + intensity (heurística
   family+conc) 15 = 35, más context (desempate) 10. Family y feelings quedan
   separados a propósito — antes "¿qué quieres sentir?" se expandía en un
   conjunto de familias y sumaba dentro del mismo eje que "¿qué familia
   eliges?", contando la misma preferencia dos veces sin que se notara. */
const FINDER_WEIGHTS = { family:25, notes:30, feelings:20, intensity:15, context:10 };
const FINDER_LOW_CONFIDENCE = 55;

/* ---------- Scoring — normalizado sobre lo realmente respondido ----------
   score = (puntos obtenidos ÷ puntos disponibles según lo que el usuario SÍ
   contestó) × 100. Una pregunta que el usuario saltó no suma un crédito
   neutro inventado ni resta — simplemente no entra al denominador. Así un
   "72% afinidad" siempre significa lo mismo: 72% de lo que pudimos medir con
   las respuestas que diste, nunca un número inflado o reducido por preguntas
   opcionales que decidiste no responder. */
function finderScore(p, answers){
  let obtained = 0, available = 0;
  const reasons = { direct: [], editorial: [] };

  if(answers.families && answers.families.length){
    available += FINDER_WEIGHTS.family;
    if(answers.families.includes(p.family)){
      obtained += FINDER_WEIGHTS.family;
      reasons.direct.push(`familia ${p.family.toLowerCase()}`);
    }
  }

  if(answers.notes && answers.notes.length){
    available += FINDER_WEIGHTS.notes;
    const overlap = p.notes.filter(n => answers.notes.includes(n));
    if(overlap.length){
      obtained += (overlap.length / answers.notes.length) * FINDER_WEIGHTS.notes;
      reasons.direct.push(`notas de ${overlap.slice(0,2).join(" y ").toLowerCase()}`);
    }
  }

  if(answers.feelings && answers.feelings.length){
    available += FINDER_WEIGHTS.feelings;
    const traits = FAMILY_TRAITS[p.family] || { feelings: [] };
    const matched = answers.feelings.filter(f => traits.feelings.includes(f));
    if(matched.length){
      obtained += (matched.length / answers.feelings.length) * FINDER_WEIGHTS.feelings;
      reasons.editorial.push(matched.map(f => FEELING_LABELS[f].toLowerCase()).join(" y "));
    }
  }

  if(answers.intensity){
    available += FINDER_WEIGHTS.intensity;
    const diff = Math.abs(finderProductIntensity(p) - answers.intensity);
    const frac = diff === 0 ? 1 : diff === 1 ? 0.5 : 0;
    obtained += frac * FINDER_WEIGHTS.intensity;
    if(diff === 0) reasons.editorial.push(`intensidad ${INTENSITY_LABELS[answers.intensity].toLowerCase()}`);
  }

  if(answers.forWhom){
    available += FINDER_WEIGHTS.context;
    // Desempate suave, no señal fuerte: un unisex es una apuesta de regalo
    // ligeramente más segura, pero nunca decide la recomendación por sí solo.
    obtained += (answers.forWhom === "regalar" ? (p.gender === "unisex" ? 1 : 0.7) : 0.8) * FINDER_WEIGHTS.context;
  }

  const quality = finderDataQuality(p);
  let score = available > 0 ? (obtained / available) * 100 : 0;
  if(quality === "partial") score *= 0.85;

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons, quality };
}

function finderResults(answers){
  const scored = finderCatalog().map(p => ({ p, ...finderScore(p, answers) }));
  scored.sort((a,b) => b.score - a.score);
  return scored.slice(0, 4);
}

/* "clear": el top tiene ventaja real sobre el segundo · "close": van casi
   empatados, ninguno es claramente "el mejor" · "weak": el propio top no
   llega al umbral de confianza. Cada caso usa un lenguaje de resultado
   distinto — ver finderRenderResults(). */
function finderConfidence(results){
  if(!results.length || results[0].score < FINDER_LOW_CONFIDENCE) return "weak";
  const gap = results[0].score - (results[1] ? results[1].score : 0);
  return gap < 8 ? "close" : "clear";
}

function finderScoreLabel(score){
  if(score >= 85) return "Excelente coincidencia";
  if(score >= 70) return "Muy buena coincidencia";
  if(score >= FINDER_LOW_CONFIDENCE) return "Buena coincidencia";
  return "Coincidencia parcial";
}

/* ============================================================
   ESTADO + FLUJO
   ============================================================ */
const FINDER_STEPS = ["forWhom","feelings","families","intensity","notes"];
let finderState = null;

function finderReset(){
  finderState = {
    step: 0,
    answers: { forWhom:null, feelings:[], families:[], intensity:null, notes:[] },
  };
}

function finderCanAdvance(){
  const key = FINDER_STEPS[finderState.step];
  const a = finderState.answers;
  if(key === "forWhom") return !!a.forWhom;
  if(key === "feelings") return a.feelings.length > 0;
  if(key === "families") return true; // opcional
  if(key === "intensity") return !!a.intensity;
  if(key === "notes") return true; // opcional
  return true;
}

/* ============================================================
   RENDER
   ============================================================ */
function finderRenderProgress(){
  const total = FINDER_STEPS.length;
  return `<div class="finder-progress"><span>${String(finderState.step+1).padStart(2,"0")} / ${String(total).padStart(2,"0")}</span><div class="finder-bar"><div class="finder-bar-fill" style="width:${((finderState.step+1)/total)*100}%"></div></div></div>`;
}

function finderOptionButton(value, label, selected, multi){
  return `<button type="button" class="finder-opt${selected?" is-selected":""}" data-value="${value}" data-multi="${multi?"1":"0"}">${label}${multi?`<span class="finder-check">${selected?"✓":""}</span>`:""}</button>`;
}

function finderRenderStep(){
  const key = FINDER_STEPS[finderState.step];
  const a = finderState.answers;
  let title = "", sub = "", body = "";

  if(key === "forWhom"){
    title = "¿Para quién buscas?";
    sub = "Puede orientar la selección, no es obligatorio ajustarse a un género.";
    body = `<div class="finder-grid finder-grid-2">
      ${finderOptionButton("mi","Para mí", a.forWhom==="mi")}
      ${finderOptionButton("regalar","Para regalar", a.forWhom==="regalar")}
    </div>`;
  }
  else if(key === "feelings"){
    title = "¿Qué quieres sentir?";
    sub = "Elige hasta dos.";
    const opts = Object.keys(FEELING_LABELS);
    body = `<div class="finder-grid finder-grid-3">
      ${opts.map(f => finderOptionButton(f, FEELING_LABELS[f], a.feelings.includes(f), true)).join("")}
    </div>`;
  }
  else if(key === "families"){
    title = "¿Qué familias olfativas te atraen?";
    sub = "Opcional — si no las conoces, sáltalo: lo que respondiste sobre cómo quieres sentirte ya cuenta.";
    const fams = finderAvailableFamilies();
    body = `<div class="finder-grid finder-grid-2">
      ${fams.map(f => finderOptionButton(f, f, a.families.includes(f), true)).join("")}
    </div>`;
  }
  else if(key === "intensity"){
    title = "¿Qué intensidad prefieres?";
    sub = "Cuánto quieres que se note.";
    body = `<div class="finder-grid finder-grid-2">
      ${[1,2,3,4].map(t => finderOptionButton(t, INTENSITY_LABELS[t], a.intensity===t)).join("")}
    </div>`;
  }
  else if(key === "notes"){
    title = "¿Alguna nota que te guste especialmente?";
    sub = "Opcional — hasta cuatro.";
    const notes = finderTopNotes(16);
    body = `<div class="finder-grid finder-grid-4">
      ${notes.map(n => finderOptionButton(n, n, a.notes.includes(n), true)).join("")}
    </div>`;
  }

  return `
    ${finderRenderProgress()}
    <h3 class="finder-q">${title}</h3>
    <p class="finder-sub">${sub}</p>
    ${body}
  `;
}

/* Frase humana construida SOLO con las señales que realmente coincidieron —
   nunca describe una característica del perfume que no venga de un match real. */
function finderWhyText(reasons){
  const editorial = reasons.editorial || [];
  const direct = reasons.direct || [];
  if(!editorial.length && !direct.length) return "Una opción equilibrada dentro de lo que nos contaste.";
  const parts = [];
  if(editorial.length) parts.push(`buscabas algo ${editorial.join(" y ")}`);
  if(direct.length) parts.push(`comparte ${direct.join(" y ")} con tu selección`);
  return "Coincide porque " + parts.join("; ") + ".";
}

function finderProductMini(p, score, reasons){
  const img = p.imgBottle || p.imgSet || p.img;
  const minP = Math.min(...Object.values(p.price));
  return `
  <article class="finder-result-card">
    <a href="product.html?id=${p.id}" class="finder-result-media">
      ${img ? `<img src="${img}" alt="${p.brand} ${p.name}" loading="lazy" decoding="async">` : ""}
    </a>
    <div class="finder-result-body">
      <span class="finder-score">${finderScoreLabel(score)} <em>${score}/100</em></span>
      ${p.brand ? `<span class="finder-brand">${p.brand}</span>` : ""}
      <h4><a href="product.html?id=${p.id}">${p.name}</a></h4>
      <p class="finder-why">${finderWhyText(reasons)}</p>
      <div class="finder-result-actions">
        <a class="btn btn-outline" href="product.html?id=${p.id}">Ver perfume</a>
        <button class="btn btn-primary" data-finder-add="${p.id}" data-size="3">Probar en decant <span>+</span></button>
      </div>
      <div class="finder-result-price"><b>Decants desde ${money(minP)}</b><span>3 · 5 · 10 ml</span></div>
    </div>
  </article>`;
}

function finderRenderResults(){
  const results = finderResults(finderState.answers);
  const top = results[0];
  const rest = results.slice(1,4);
  const confidence = finderConfidence(results);

  const heading = confidence === "weak" ? "No encontramos una coincidencia perfecta"
    : confidence === "close" ? "Estas opciones encajan bien contigo"
    : "Tu mejor coincidencia";
  const sub = confidence === "weak"
    ? "Estas son las opciones que más se acercan a lo que nos contaste — vale la pena revisarlas de cerca."
    : confidence === "close"
    ? "Varias fragancias respondieron igual de bien a tus respuestas; te mostramos las mejores."
    : "Resultado calculado a partir de tus preferencias y los datos del catálogo, con una clasificación editorial de intensidad.";

  return `
    <div class="finder-results">
      <p class="finder-results-eyebrow">Tu selección Cruzial</p>
      <h3 class="finder-q">${heading}</h3>
      <p class="finder-sub">${sub}</p>

      ${top ? `<div class="finder-top">${finderProductMini(top.p, top.score, top.reasons)}</div>` : `<p class="finder-sub">No hay productos activos que evaluar en este momento.</p>`}

      ${rest.length ? `
      <p class="finder-also">También podrían gustarte</p>
      <div class="finder-alt-grid">
        ${rest.map(r => finderProductMini(r.p, r.score, r.reasons)).join("")}
      </div>` : ""}

      <div class="finder-result-footer">
        <button class="btn btn-outline" data-finder-restart>Empezar de nuevo</button>
        <a class="btn btn-ghost" href="catalog.html">Ver todo el catálogo <span>→</span></a>
      </div>
    </div>
  `;
}

function finderRenderNav(){
  const isFirst = finderState.step === 0;
  return `
    <div class="finder-nav">
      <button class="btn btn-ghost" data-finder-back ${isFirst?"disabled":""}>Atrás</button>
      <button class="btn btn-primary" data-finder-next ${finderCanAdvance()?"":"disabled"}>${finderState.step === FINDER_STEPS.length-1 ? "Ver mi selección" : "Siguiente"} <span>→</span></button>
    </div>`;
}

function finderRender(){
  const body = document.getElementById("finder-body");
  if(!body) return;
  if(finderState.step === "results"){
    body.innerHTML = finderRenderResults();
  } else {
    body.innerHTML = finderRenderStep() + finderRenderNav();
  }
  finderBindStepEvents();
}

function finderBindStepEvents(){
  const body = document.getElementById("finder-body");
  body.querySelectorAll(".finder-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = FINDER_STEPS[finderState.step];
      const val = btn.dataset.value;
      const multi = btn.dataset.multi === "1";
      const a = finderState.answers;
      if(key === "forWhom") a.forWhom = val;
      else if(key === "intensity") a.intensity = Number(val);
      else if(key === "feelings"){
        const i = a.feelings.indexOf(val);
        if(i>-1) a.feelings.splice(i,1);
        else { if(a.feelings.length>=2) a.feelings.shift(); a.feelings.push(val); }
      }
      else if(key === "families"){
        const i = a.families.indexOf(val);
        if(i>-1) a.families.splice(i,1); else a.families.push(val);
      }
      else if(key === "notes"){
        const i = a.notes.indexOf(val);
        if(i>-1) a.notes.splice(i,1);
        else { if(a.notes.length>=4) a.notes.shift(); a.notes.push(val); }
      }
      finderRender();
    });
  });
  const back = body.querySelector("[data-finder-back]");
  if(back) back.addEventListener("click", () => { if(finderState.step>0){ finderState.step--; finderRender(); } });
  const next = body.querySelector("[data-finder-next]");
  if(next) next.addEventListener("click", () => {
    if(!finderCanAdvance()) return;
    if(finderState.step === FINDER_STEPS.length-1) finderState.step = "results";
    else finderState.step++;
    finderRender();
  });
  const restart = body.querySelector("[data-finder-restart]");
  if(restart) restart.addEventListener("click", () => { finderReset(); finderRender(); });
  body.querySelectorAll("[data-finder-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      addToCart(btn.dataset.finderAdd, Number(btn.dataset.size), 1, "decant");
    });
  });
}

/* ============================================================
   MODAL — abrir / cerrar (mismo patrón que el buscador y el carrito)
   ============================================================ */
function initFinder(){
  const modal = document.getElementById("finder-modal");
  if(!modal) return;
  const overlay = modal.querySelector("[data-finder-overlay]");
  const triggers = document.querySelectorAll("[data-open-finder]");
  let lastFocused = null;

  const open = () => {
    lastFocused = document.activeElement;
    finderReset();
    finderRender();
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    const firstBtn = modal.querySelector(".finder-opt, .finder-close");
    if(firstBtn) setTimeout(() => firstBtn.focus(), 100);
  };
  const close = () => {
    modal.classList.remove("open");
    document.body.style.overflow = "";
    if(lastFocused) lastFocused.focus();
  };

  triggers.forEach(t => t.addEventListener("click", (e) => { e.preventDefault(); open(); }));
  modal.querySelectorAll("[data-finder-close]").forEach(b => b.addEventListener("click", close));
  overlay?.addEventListener("click", close);
  modal.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){ close(); return; }
    if(e.key === "Tab"){
      const focusable = modal.querySelectorAll("a[href], button:not([disabled])");
      if(!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    }
  });
}

initFinder();
