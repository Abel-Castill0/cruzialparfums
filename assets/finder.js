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
  return PRODUCTS.filter(p => !p.discontinued && p.type !== "combo");
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

/* ---------- Familias "deseadas" a partir de selección directa + feelings ---------- */
function finderDesiredFamilies(answers){
  const set = new Set(answers.families || []);
  (answers.feelings || []).forEach(feel => {
    Object.entries(FAMILY_TRAITS).forEach(([fam, t]) => {
      if(t.feelings.includes(feel)) set.add(fam);
    });
  });
  return set;
}

/* ---------- Scoring determinista, 0–100, cada eje con peso fijo y justificado ----------
   familia 40 · notas 30 · intensidad 20 · contexto (regalo/unisex) 10 = 100 posible.
   Un eje sin respuesta del usuario no penaliza: aporta un crédito neutro parcial,
   así el total nunca queda inflado ni castigado por preguntas que el usuario saltó. */
function finderScore(p, answers){
  let score = 0;
  const reasons = [];

  const desiredFamilies = finderDesiredFamilies(answers);
  if(desiredFamilies.size){
    if(desiredFamilies.has(p.family)){
      score += 40;
      reasons.push(`familia ${p.family.toLowerCase()}`);
    } else {
      const pw = (FAMILY_TRAITS[p.family] || {}).warmth;
      const clusterMatch = [...desiredFamilies].some(f => (FAMILY_TRAITS[f]||{}).warmth === pw);
      if(clusterMatch) score += 16;
    }
  } else {
    score += 20;
  }

  if(answers.notes && answers.notes.length){
    const overlap = p.notes.filter(n => answers.notes.includes(n));
    if(overlap.length){
      score += Math.min(30, Math.round((overlap.length / answers.notes.length) * 30));
      reasons.push(`notas de ${overlap.slice(0,2).join(" y ").toLowerCase()}`);
    }
  } else {
    score += 15;
  }

  if(answers.intensity){
    const diff = Math.abs(finderProductIntensity(p) - answers.intensity);
    score += diff === 0 ? 20 : diff === 1 ? 10 : 0;
  } else {
    score += 10;
  }

  if(answers.forWhom === "regalar"){
    score += p.gender === "unisex" ? 10 : 5;
  } else {
    score += 8;
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

const FINDER_LOW_CONFIDENCE = 55;

function finderResults(answers){
  const scored = finderCatalog().map(p => ({ p, ...finderScore(p, answers) }));
  scored.sort((a,b) => b.score - a.score);
  return scored.slice(0, 4);
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
    sub = "Opcional — si no las conoces, sáltalo y decidimos por tu respuesta anterior.";
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

function finderWhyText(reasons){
  if(!reasons.length) return "Una opción equilibrada dentro de lo que nos contaste.";
  return "Coincide en " + reasons.join(" y ") + ".";
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
      <span class="finder-score">${score}% afinidad</span>
      ${p.brand ? `<span class="finder-brand">${p.brand}</span>` : ""}
      <h4><a href="product.html?id=${p.id}">${p.name}</a></h4>
      <p class="finder-why">${finderWhyText(reasons)}</p>
      <div class="finder-result-actions">
        <a class="btn btn-outline" href="product.html?id=${p.id}">Ver perfume</a>
        <button class="btn btn-primary" data-finder-add="${p.id}" data-size="3">Probar en decant <span>+</span></button>
      </div>
      <div class="finder-result-price">Decants desde ${money(minP)} · 3 · 5 · 10 ml</div>
    </div>
  </article>`;
}

function finderRenderResults(){
  const results = finderResults(finderState.answers);
  const top = results[0];
  const rest = results.slice(1,4);
  const lowConfidence = !top || top.score < FINDER_LOW_CONFIDENCE;

  return `
    <div class="finder-results">
      <p class="finder-results-eyebrow">Tu selección Cruzial</p>
      <h3 class="finder-q">${lowConfidence ? "No encontramos una coincidencia perfecta" : "Tu mejor coincidencia"}</h3>
      <p class="finder-sub">${lowConfidence
        ? "Estas son las opciones que más se acercan a lo que nos contaste — vale la pena revisarlas de cerca."
        : "Calculada solo con datos reales del catálogo: familia, notas e intensidad."}</p>

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
