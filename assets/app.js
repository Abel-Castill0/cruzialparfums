/* ============================================================
   CRUZIAL PARFUMS — Lógica de la tienda
   Carrito en localStorage · Pedido por WhatsApp
   ============================================================ */

const PRODUCTS = window.CRUZIAL_PRODUCTS || [];
const CONFIG = window.CRUZIAL_CONFIG || { WA_NUMBER: "51999999999", STORE: "Cruzial Parfums" };
const WA = CONFIG.WA_NUMBER;
const money = n => "S/ " + n.toFixed(2);

/* ---------- Utilidades ---------- */
function debounce(fn, wait){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
function hashStr(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%997;return h}
function shade(hex,p){const n=parseInt(hex.slice(1),16);const r=Math.max(0,Math.min(255,(n>>16)+p));const g=Math.max(0,Math.min(255,((n>>8)&255)+p));const b=Math.max(0,Math.min(255,(n&255)+p));return `rgb(${r},${g},${b})`}
function initials(brand){return brand.split(/\s+/).map(w=>w[0]).join("").slice(0,3).toUpperCase()}
function imgError(el){
  const parent = el.parentElement;
  if(!parent) return;
  const id = el.src.match(/\/([^\/]+?)\.(?:png|jpg|webp)$/i);
  if(id && window.CRUZIAL_PRODUCTS){
    const p = window.CRUZIAL_PRODUCTS.find(x=>el.alt && el.alt.includes(x.name));
    if(p) parent.innerHTML = bottleSVG(p);
  }
}

/* ---------- Generador de botellas SVG ---------- */
function bottleSVG(p){
  const v = hashStr(p.id);
  const bodyW = 84 + (v%3)*8;
  const capH = 26 + (v%3)*6;
  const gid = "c" + p.id;
  const caps = {
    gold:["#e8d5a3","#7a5c22","#c9a962"],
    noir:["#2a2826","#0a0908","#161412"],
    silver:["#ececee","#8f8f95","#b9b9bf"]
  };
  const capTones = caps[["gold","noir","silver"][v%3]];
  const bodyY = 56 + capH;
  const bodyH = 292 - 20 - bodyY;
  const bx = 100 - bodyW/2;
  const neckY = 26 + capH - 8;
  const inits = initials(p.brand);
  return `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${p.brand} ${p.name}">
    <defs>
      <linearGradient id="${gid}gl" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${p.mood.a}"/><stop offset="1" stop-color="${p.mood.b}"/>
      </linearGradient>
      <linearGradient id="${gid}liq" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${p.mood.liquid}"/><stop offset="1" stop-color="${shade(p.mood.b,-14)}"/>
      </linearGradient>
      <linearGradient id="${gid}cap" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${capTones[0]}"/><stop offset=".55" stop-color="${capTones[2]}"/><stop offset="1" stop-color="${capTones[1]}"/>
      </linearGradient>
    </defs>
    <ellipse cx="100" cy="292" rx="54" ry="5.5" fill="#000" opacity=".38"/>
    <rect x="${100-capH/2}" y="26" width="${capH}" height="${capH}" rx="7" fill="url(#${gid}cap)"/>
    <rect x="${100-capH/2+6}" y="32" width="5" height="${capH-12}" rx="2.5" fill="#fff" opacity=".32"/>
    <rect x="90" y="${neckY}" width="20" height="36" fill="${p.mood.b}" opacity=".45"/>
    <rect x="87" y="${neckY+30}" width="26" height="7" rx="3" fill="url(#${gid}cap)"/>
    <rect x="${bx}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="26" fill="url(#${gid}gl)" opacity=".94" stroke="rgba(255,255,255,.16)"/>
    <rect x="${bx+4}" y="${bodyY+52}" width="${bodyW-8}" height="${bodyH-62}" rx="22" fill="url(#${gid}liq)" opacity=".9"/>
    <rect x="${bx+9}" y="${bodyY+12}" width="11" height="${bodyH-24}" rx="5.5" fill="#fff" opacity=".16"/>
    <rect x="${bx+bodyW-16}" y="${bodyY+18}" width="5" height="${bodyH-38}" rx="2.5" fill="#fff" opacity=".08"/>
    <rect x="76" y="${bodyY+bodyH-64}" width="48" height="44" rx="3" fill="#f2ead7" opacity=".95"/>
    <rect x="77.5" y="${bodyY+bodyH-62.5}" width="45" height="41" rx="2.5" fill="none" stroke="#9a7a3c" stroke-width="1" opacity=".6"/>
    <text x="100" y="${bodyY+bodyH-40}" text-anchor="middle" font-family="Cormorant Garamond,Georgia,serif" font-size="13" letter-spacing="3" fill="#14100a">${inits}</text>
    <line x1="${bx+14}" y1="${bodyY+bodyH-20}" x2="${bx+bodyW-14}" y2="${bodyY+bodyH-20}" stroke="#9a7a3c" stroke-width="1" opacity=".7"/>
  </svg>`;
}
function glow(p){return `radial-gradient(circle at 50% 40%,${p.mood.glow}2e,transparent 62%)`}

/* ---------- Carrito ---------- */
/* JSON.parse sin try/catch: un valor corrupto en localStorage.cruzial_cart
   (editado a mano, extensión de terceros, versión previa incompatible)
   lanzaba una excepción no controlada en la primera lectura del carrito,
   rompiendo la inicialización de toda la página. También se filtran los
   items cuyo producto ya no existe en PRODUCTS (ej. tras quitar un
   producto de data.js) -- sin esto, renderCart()/renderDrawer() revientan
   al hacer p.brand sobre un `p` undefined dentro de un .map(). */
function getCart(){
  let raw;
  try{
    raw = JSON.parse(localStorage.getItem("cruzial_cart") || "[]");
  }catch{
    localStorage.removeItem("cruzial_cart");
    return [];
  }
  if(!Array.isArray(raw)) return [];
  return raw.filter(i => i && typeof i === "object" && typeof i.key === "string" && PRODUCTS.some(p => p.id === i.id));
}
const saveCart = c => { localStorage.setItem("cruzial_cart", JSON.stringify(c)); updateCartCount(); renderDrawer(); };
function updateCartCount(){
  const count = getCart().reduce((s,i)=>s+i.qty,0);
  document.querySelectorAll(".cart-count").forEach(x=>{x.textContent=count;x.classList.toggle("show",count>0)});
}
function addToCart(id,size=2,qty=1,group="decant"){
  const p = PRODUCTS.find(x=>x.id===id); if(!p) return;
  const price = group==="bottle" ? p.bottle?.[size] : p.price[size];
  if(!price) return;
  const key = id+"-"+size+"-"+group; const cart = getCart();
  const ex = cart.find(i=>i.key===key);
  if(ex) ex.qty += qty; else cart.push({key,id,size,qty,price,group});
  saveCart(cart);
  toast(`${p.brand} ${p.name} · ${group==="bottle"?"frasco ":""}${size} ml — añadido`);
}
function removeFromCart(key){ saveCart(getCart().filter(i=>i.key!==key)); renderCart(); }
function changeQty(key,delta){
  const c = getCart(); const i = c.find(x=>x.key===key); if(!i) return;
  i.qty += delta; if(i.qty<=0){ saveCart(c.filter(x=>x.key!==key)); renderCart(); } else { saveCart(c); renderCart(); }
}

/* ---------- Composición visual de combos (confirmed by client, ver CRUZIAL_COMBO_CONTENTS en data.js) ---------- */
function comboThumbsHTML(p){
  const contents = window.CRUZIAL_COMBO_CONTENTS && window.CRUZIAL_COMBO_CONTENTS[p.id];
  if(!contents) return "";
  const items = contents.perfumes.map(name => PRODUCTS.find(x => x.name === name)).filter(Boolean);
  if(!items.length) return "";
  return `<div class="combo-thumbs" aria-hidden="true">
    ${items.map(item => {
      const img = item.imgBottle || item.imgSet || item.img;
      return img
        ? `<span class="combo-thumb"><img src="${img}" alt="" loading="lazy" decoding="async"></span>`
        : `<span class="combo-thumb combo-thumb-svg">${bottleSVG(item)}</span>`;
    }).join("")}
  </div>
  <p class="combo-thumb-caption">${contents.perfumes.join(" · ")}</p>`;
}
/* Versión compacta (una línea) para carrito/drawer/checkout, donde no hay
   espacio para las miniaturas — mismo dato confirmado por el cliente. */
function comboContentsLine(p){
  const contents = window.CRUZIAL_COMBO_CONTENTS && window.CRUZIAL_COMBO_CONTENTS[p.id];
  if(!contents || !contents.perfumes?.length) return "";
  return `<div class="cart-combo-contents">Incluye: ${contents.perfumes.join(" · ")}</div>`;
}

/* ---------- Tarjeta de producto ---------- */
function productCard(p, mode){
  const isBottle = mode === "bottle";
  const prices = isBottle ? p.bottle : p.price;
  const min = Math.min(...Object.values(prices));
  const minSize = isBottle ? Math.min(...Object.keys(p.bottle)) : 1;
  const bottle = p.bottle ? Math.min(...Object.values(p.bottle)) : null;
  const bSize = p.bottle ? Math.min(...Object.keys(p.bottle)) : null;
  const qSize = isBottle ? minSize : 3;
  const qGroup = isBottle ? "bottle" : "decant";
  const brand = p.brand ? `<span class="card-brand">${p.brand}</span>` : "";
  const cardImg = p.imgBottle || p.imgSet || p.img;
  const mediaClass = cardImg ? " has-photo" : "";
  const media = cardImg
    ? `<img src="${cardImg}" alt="${p.brand} ${p.name}" class="card-img" loading="lazy" decoding="async">`
    : bottleSVG(p);
  if(p.discontinued){
    return `<article class="product-card is-discontinued">
      <a href="product.html?id=${p.id}">
        <div class="card-media${mediaClass}" style="--glow:${glow(p)}">
          ${media}
          <span class="tag tag-discontinued">Descontinuado</span>
        </div>
        <div class="card-body">
          ${brand}
          <h3 class="card-name">${p.name}</h3>
          <div class="card-meta"><span>Sin reposición</span><b class="muted">Agotado</b></div>
        </div>
      </a>
    </article>`;
  }
  /* Estructura sin <button>/<a> anidados dentro de otro <a> (HTML5 no
     permite contenido interactivo anidado; antes funcionaba solo porque
     JS hacía stopPropagation en el quick-add, pero rompía semántica y
     lectores de pantalla). El link de imagen queda aria-hidden porque
     el link del cuerpo ya anuncia el producto; el quick-add y el cross-
     sell de frasco completo son ahora enlaces/botones hermanos reales,
     no anidados. */
  const bottleCrossSell = isBottle && p.price
    ? `<a class="card-bottle" href="product.html?id=${p.id}">Prueba antes en decant · desde ${money(Math.min(...Object.values(p.price)))} <span>→</span></a>`
    : !isBottle && bottle
    ? `<a class="card-bottle" href="product.html?id=${p.id}&variant=bottle">Frasco completo · desde ${money(bottle)} (${bSize} ml) <span>→</span></a>`
    : "";
  return `<article class="product-card">
    <div class="card-media${mediaClass}" style="--glow:${glow(p)}">
      <a class="card-media-link" href="product.html?id=${p.id}" tabindex="-1" aria-hidden="true">${media}</a>
      <span class="tag">${p.tag}</span>
      <button class="quick-add" data-add="${p.id}" data-size="${qSize}" data-group="${qGroup}" aria-label="Añadir ${p.name}">+</button>
    </div>
    <div class="card-body">
      <a class="card-body-link" href="product.html?id=${p.id}">
        ${brand}
        <h3 class="card-name">${p.name}</h3>
        ${p.type === "combo" ? comboThumbsHTML(p) : ""}
        <div class="card-meta"><span>${isBottle?`frasco ${minSize} ml`:"desde 3 ml"}</span><b>${money(min)}</b></div>
      </a>
      ${bottleCrossSell}
      ${!isBottle ? `<div class="card-gift">${GIFT_MESSAGE}</div>` : ""}
    </div>
  </article>`;
}
function attachAddHandlers(){
  document.querySelectorAll("[data-add]").forEach(b=>{
    b.addEventListener("click",e=>{
      e.preventDefault(); e.stopPropagation();
      addToCart(b.dataset.add, Number(b.dataset.size||2), 1, b.dataset.group||"decant");
    });
  });
}

/* ---------- Home: destacados ---------- */
function renderFeatured(filter="all"){
  const el = document.getElementById("featured-grid"); if(!el) return;
  const items = PRODUCTS.filter(p=>!p.discontinued && (filter==="all"||p.gender===filter||p.type===filter)).slice(0,8);
  el.innerHTML = items.map(productCard).join("");
  attachAddHandlers();
}
function initPills(){
  document.querySelectorAll(".pill").forEach(b=>{
    b.addEventListener("click",()=>{
      document.querySelectorAll(".pill").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      renderFeatured(b.dataset.filter);
    });
  });
}

/* ---------- Buscador ---------- */
function initSearch(){
  const panel = document.querySelector("[data-search-panel]"), overlay = document.querySelector("[data-overlay]"),
        input = document.getElementById("global-search"), results = document.getElementById("search-results");
  if(!panel) return;
  const open = ()=>{ panel.classList.add("open"); overlay.classList.add("active"); setTimeout(()=>input?.focus(),200); };
  const close = ()=>{ panel.classList.remove("open"); overlay.classList.remove("active"); };
  document.querySelector("[data-open-search]")?.addEventListener("click",open);
  document.querySelector("[data-close-search]")?.addEventListener("click",close);
  overlay?.addEventListener("click",close);
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") close(); });
  input?.addEventListener("input",debounce(()=>{
    const q = input.value.toLowerCase().trim();
    const list = q
      ? PRODUCTS.filter(p=>(p.brand+" "+p.name+" "+p.notes.join(" ")+" "+p.family).toLowerCase().includes(q))
      : PRODUCTS.slice(0,6);
    /* El buscador no excluía descontinuados y los mostraba sin ninguna
       marca visual ni distinción del catálogo (donde sí se atenúan y se
       etiquetan) -- un usuario podía buscar, encontrar un producto sin
       reposición y no tener forma de saberlo hasta entrar. Mismo
       tratamiento que .product-card.is-discontinued, no ocultarlos. */
    results.innerHTML = list.length ? list.map(p=>{
      const searchImg = p.imgBottle || p.imgSet || p.img;
      const priceOrStatus = p.discontinued
        ? `<span class="s-price s-discontinued">Descontinuado</span>`
        : `<span class="s-price">${money(Math.min(...Object.values(p.price)))}</span>`;
      return `
      <a class="search-item${p.discontinued ? " is-discontinued" : ""}" href="product.html?id=${p.id}">
        ${searchImg ? `<img src="${searchImg}" alt="${p.brand} ${p.name}" class="search-img" loading="lazy" decoding="async">` : bottleSVG(p)}
        <span><span class="s-brand">${p.brand}</span><span class="s-name">${p.name}</span></span>
        ${priceOrStatus}
      </a>`;
    }).join("") : `<p class="search-empty">No encontramos nada con "${input.value.trim()}". Prueba con otra marca o nota olfativa.</p>`;
  },150));
}

/* ---------- Home: frascos completos ---------- */
function renderBottles(){
  const el = document.getElementById("bottle-grid"); if(!el) return;
  const items = PRODUCTS.filter(p=>p.bottle && !p.discontinued)
    .sort((a,b)=>Math.min(...Object.values(a.price))-Math.min(...Object.values(b.price)))
    .slice(0,4);
  el.innerHTML = items.map(p=>productCard(p,"bottle")).join("");
  attachAddHandlers();
}

/* ---------- Home: combos ---------- */
function renderCombos(){
  const el = document.getElementById("combo-grid"); if(!el) return;
  el.innerHTML = PRODUCTS.filter(p=>p.type==="combo").map(p=>productCard(p,"decant")).join("");
  attachAddHandlers();
}

/* ---------- Arma tu combo ---------- */
function initComboBuilder(){
  const picker = document.getElementById("cb-picker"); if(!picker) return;
  const eligible = PRODUCTS.filter(p=>p.type!=="combo" && !p.discontinued);
  const search = document.getElementById("cb-search");
  const sizePills = document.querySelectorAll("#cb-size-pills .pill");
  const selectedList = document.getElementById("cb-selected");
  const emptyHint = document.getElementById("cb-empty-hint");
  const countEl = document.getElementById("cb-count");
  const totalEl = document.getElementById("cb-total");
  const sendBtn = document.getElementById("cb-send");
  const limitNote = document.getElementById("cb-limit-note");
  const MIN_ITEMS = 3;
  const MAX_ITEMS = 6;

  let size = 3;
  const selected = new Set();

  const renderPicker = (q = "") => {
    const query = q.toLowerCase().trim();
    const list = query
      ? eligible.filter(p => `${p.brand} ${p.name} ${p.family}`.toLowerCase().includes(query))
      : eligible;
    const atLimit = selected.size >= MAX_ITEMS;
    picker.innerHTML = list.map(p => {
      const isSelected = selected.has(p.id);
      const disabled = atLimit && !isSelected;
      const thumbImg = p.imgBottle || p.imgSet || p.img;
      const thumb = thumbImg
        ? `<img src="${thumbImg}" alt="" loading="lazy" decoding="async">`
        : bottleSVG(p);
      return `
      <button type="button" class="cb-item${isSelected ? " selected" : ""}" data-id="${p.id}" role="option"
        aria-selected="${isSelected}" aria-pressed="${isSelected}" aria-label="${isSelected ? `Quitar ${p.name} de tu combo` : `Añadir ${p.name} a tu combo`}"
        ${disabled ? "disabled" : ""}>
        <span class="cb-item-check" aria-hidden="true">✓</span>
        <span class="cb-item-thumb">${thumb}</span>
        <span class="cb-item-info">
          <span class="cb-item-brand">${p.brand || p.tag}</span>
          <span class="cb-item-name">${p.name}</span>
          <span class="cb-item-price">${money(p.price[size])}</span>
        </span>
      </button>`;
    }).join("") || `<p class="cb-no-results">No encontramos fragancias con ese nombre.</p>`;
    picker.querySelectorAll(".cb-item").forEach(btn => {
      btn.addEventListener("click", () => toggle(btn.dataset.id));
    });
  };

  const toggle = (id) => {
    if (selected.has(id)) selected.delete(id);
    else {
      if (selected.size >= MAX_ITEMS) { toast(`Máximo ${MAX_ITEMS} fragancias por combo`); return; }
      selected.add(id);
    }
    renderPicker(search.value);
    renderSummary();
  };

  const renderSummary = () => {
    const items = [...selected].map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
    countEl.textContent = `${items.length}/${MAX_ITEMS} fragancias`;
    emptyHint.style.display = items.length ? "none" : "block";
    if(limitNote) limitNote.style.display = items.length >= MAX_ITEMS ? "block" : "none";
    selectedList.innerHTML = items.map(p => {
      const thumbImg = p.imgBottle || p.imgSet || p.img;
      const thumb = thumbImg ? `<img src="${thumbImg}" alt="" loading="lazy" decoding="async">` : bottleSVG(p);
      return `
      <li>
        <span class="cb-selected-thumb">${thumb}</span>
        <span class="cb-selected-name">${p.name}</span>
        <span class="cb-item-line-price">${money(p.price[size])}</span>
        <button type="button" class="cb-remove" data-id="${p.id}" aria-label="Quitar ${p.name}">×</button>
      </li>`;
    }).join("");
    selectedList.querySelectorAll(".cb-remove").forEach(b => {
      b.addEventListener("click", () => toggle(b.dataset.id));
    });
    const total = items.reduce((s, p) => s + p.price[size], 0);
    totalEl.textContent = money(total);
    sendBtn.disabled = items.length < MIN_ITEMS;
  };

  sizePills.forEach(pill => {
    pill.addEventListener("click", () => {
      sizePills.forEach(x => { x.classList.remove("active"); x.setAttribute("aria-pressed","false"); });
      pill.classList.add("active");
      pill.setAttribute("aria-pressed","true");
      size = Number(pill.dataset.size);
      renderPicker(search.value);
      renderSummary();
    });
  });

  search.addEventListener("input", debounce(() => renderPicker(search.value), 150));

  sendBtn.addEventListener("click", () => {
    const items = [...selected].map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
    if (items.length < MIN_ITEMS) return;
    const total = items.reduce((s, p) => s + p.price[size], 0);
    const lines = items.map(p => `• ${p.brand ? p.brand + " " : ""}${p.name} — ${money(p.price[size])}`).join("\n");
    const msg = `Hola ${CONFIG.STORE}. Quiero armar mi propio combo de ${items.length} fragancias en ${size} ml cada una:\n\n${lines}\n\nTOTAL ESTIMADO: ${money(total)}\n\nQuedo atento/a a la confirmación de stock y total final.`;
    window.open(`https://wa.me/${WA}?text=${encodeURIComponent(msg)}`, "_blank");
    toast("Tu combo se abrió en WhatsApp");
  });

  renderPicker();
  renderSummary();
}

/* ---------- Catálogo ---------- */
function initCatalog(){
  const grid = document.getElementById("catalog-grid"); if(!grid) return;
  const gender = document.getElementById("gender-filter"), family = document.getElementById("family-filter"),
        type = document.getElementById("type-filter"), format = document.getElementById("format-filter"),
        price = document.getElementById("price-filter"),
        sort = document.getElementById("sort-filter"), count = document.getElementById("result-count"),
        search = document.getElementById("catalog-search");
  const qs = new URLSearchParams(location.search);
  if(qs.get("family")) family.value = qs.get("family");
  if(qs.get("gender")) gender.value = qs.get("gender");
  if(qs.get("type")) type.value = qs.get("type");
  if(qs.get("format")) format.value = qs.get("format");
  if(qs.get("price")) price.value = qs.get("price");
  const minP = p => Math.min(...Object.values(p.price));
  const run = ()=>{
    let items = [...PRODUCTS];
    if(search && search.value.trim()){
      const q = search.value.trim().toLowerCase();
      items = items.filter(p=>(p.brand+" "+p.name+" "+p.notes.join(" ")+" "+p.family).toLowerCase().includes(q));
    }
    if(gender.value!=="all") items = items.filter(p=>p.gender===gender.value);
    if(family.value!=="all") items = items.filter(p=>p.family===family.value);
    if(type.value!=="all") items = items.filter(p=>p.type===type.value);
    if(format.value==="bottle") items = items.filter(p=>p.bottle);
    /* Presupuesto: cortes elegidos según la distribución real de precios
       en data.js (69/99 productos ≤S/15, ninguno pasa de S/40) -- no los
       tramos genéricos de S/15/25/40/41+ que dejarían un tramo vacío. */
    if(price.value==="15") items = items.filter(p=>minP(p)<=15);
    else if(price.value==="25") items = items.filter(p=>minP(p)>15 && minP(p)<=25);
    else if(price.value==="26+") items = items.filter(p=>minP(p)>25);
    if(sort.value==="priceAsc") items.sort((a,b)=>minP(a)-minP(b));
    if(sort.value==="priceDesc") items.sort((a,b)=>minP(b)-minP(a));
    if(sort.value==="name") items.sort((a,b)=>a.name.localeCompare(b.name));
    count.textContent = items.length + (items.length===1?" perfume":" perfumes");
    /* Bug real: items.map(productCard) pasa el índice del array como 2º
       argumento (semántica implícita de Array.map), así que productCard
       recibía un número en vez de "bottle"/"decant" y el filtro "Frasco
       completo" no cambiaba nada — la card seguía en modo decant siempre. */
    const cardMode = format.value === "bottle" ? "bottle" : "decant";
    grid.innerHTML = items.length ? items.map(p => productCard(p, cardMode)).join("")
      : `<div class="empty-state"><strong>Sin resultados</strong>Prueba ajustando los filtros o buscando otra familia olfativa.</div>`;
    attachAddHandlers();
    renderChips();
  };
  /* Chips de filtro activo: un <select> con borde dorado sigue leyéndose
     como formulario. Resumir la selección como chips removibles (un
     patrón real de descubrimiento editorial) sin reconstruir el dropdown
     nativo -- misma accesibilidad de teclado, cero riesgo nuevo. */
  const activeFiltersEl = document.getElementById("active-filters");
  const filterDefs = [
    {el: gender, label: "Género"}, {el: family, label: "Familia"},
    {el: type, label: "Tipo"}, {el: format, label: "Formato"}, {el: price, label: "Presupuesto"}
  ];
  const renderChips = () => {
    if(!activeFiltersEl) return;
    const active = filterDefs.filter(f => f.el && f.el.value !== "all");
    activeFiltersEl.innerHTML = active.map(f => `
      <span class="filter-chip"><b>${f.label}:</b> ${f.el.selectedOptions[0].textContent}
        <button type="button" data-reset-filter aria-label="Quitar filtro ${f.label}">×</button>
      </span>`).join("");
    activeFiltersEl.querySelectorAll("[data-reset-filter]").forEach((btn,i)=>{
      btn.addEventListener("click",()=>{ active[i].el.value="all"; run(); });
    });
  };
  [gender,family,type,format,price,sort].forEach(x=>x?.addEventListener("change",run));
  search?.addEventListener("input",debounce(run,150));
  document.querySelector("[data-clear-filters]")?.addEventListener("click",()=>{
    gender.value=family.value=type.value=format.value=price.value="all"; sort.value="featured";
    if(search) search.value="";
    run();
  });
  /* Hoja inferior de filtros en mobile: mismo bloque de controles del DOM,
     solo se le agrega/quita .open (ver CSS, @media max-width:900px). */
  const sheet = document.getElementById("toolbar-controls");
  const sheetOverlay = document.querySelector("[data-close-filter-sheet]");
  const openSheet = ()=>{ sheet.classList.add("open"); sheetOverlay.classList.add("open"); document.body.style.overflow="hidden"; };
  const closeSheet = ()=>{ sheet.classList.remove("open"); sheetOverlay.classList.remove("open"); document.body.style.overflow=""; };
  document.querySelector("[data-open-filter-sheet]")?.addEventListener("click",openSheet);
  sheetOverlay?.addEventListener("click",closeSheet);
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeSheet(); });
  run();
}

/* ---------- Wholesale table (mayorista.html) ---------- */
function initWholesaleTable(){
  const tbody = document.getElementById("wholesale-tbody");
  const searchInput = document.getElementById("wholesale-search");
  const filterBtns = document.querySelectorAll("#wholesale-filters .filter-tag");
  if(!tbody) return;

  const WA = window.CRUZIAL_CONFIG?.WA_NUMBER || "51924590921";
  const WHOLESALE = window.CRUZIAL_WHOLESALE || {};
  const PRODUCTS = window.CRUZIAL_PRODUCTS || [];

  /* Build rows from products that have wholesale pricing */
  const rows = PRODUCTS.filter(p => WHOLESALE[p.id] && p.type !== "combo").map(p => {
    const w = WHOLESALE[p.id];
    const waText = encodeURIComponent(
      `Hola, quiero cotizar ${p.name} (${p.brand || "Cruzial"}).\n` +
      `Cantidad: ___ unidades.\n` +
      `Precio referencial: S/${w.unit} (unit.) / S/${w.m4} (4+ uds) / S/${w.m12} (12+ uds).\n` +
      `Tipo de compra: Mayorista.\n` +
      `¿Tiene decants de cortesía?`
    );
    return {
      id: p.id,
      img: p.imgBottle || p.imgSet || p.img || "",
      brand: p.brand || "—",
      name: p.name,
      type: p.type,
      unit: w.unit,
      m4: w.m4,
      m12: w.m12,
      waUrl: `https://wa.me/${WA}?text=${waText}`
    };
  });

  /* Sort by brand then name */
  rows.sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));

  function renderRows(list){
    tbody.innerHTML = list.map(r => `
      <tr data-type="${r.type}">
        <td class="thumb-col">${r.img
          ? `<img src="${r.img}" alt="" loading="lazy" decoding="async">`
          : `<span class="thumb-placeholder" aria-hidden="true"></span>`}</td>
        <td class="brand-col">${r.brand}</td>
        <td class="name-col">${r.name}</td>
        <td class="price-col">S/ ${r.unit}</td>
        <td class="price-col">S/ ${r.m4}</td>
        <td class="price-col">S/ ${r.m12}</td>
        <td class="action-col"><a href="${r.waUrl}" target="_blank" rel="noopener" class="wa-link" aria-label="Cotizar ${r.name} por WhatsApp">↗</a></td>
      </tr>
    `).join("");
  }

  /* Filter + search */
  let activeFilter = "all";
  let searchTerm = "";

  function applyFilters(){
    let filtered = rows;
    if(activeFilter !== "all") filtered = filtered.filter(r => r.type === activeFilter);
    if(searchTerm){
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(r => r.brand.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    }
    renderRows(filtered);
  }

  searchInput?.addEventListener("input", e => {
    searchTerm = e.target.value;
    applyFilters();
  });

  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter;
      applyFilters();
    });
  });

  renderRows(rows);
}


/* ---------- Página de producto ---------- */
function initProduct(){
  const box = document.getElementById("product-page"); if(!box) return;
  const id = new URLSearchParams(location.search).get("id");
  const p = id ? PRODUCTS.find(x=>x.id===id) : null;
  /* Antes: sin id caía en "aventus" y un id inexistente caía en
     PRODUCTS[0] -- un enlace roto mostraba OTRO perfume real en
     silencio, en vez de un estado "no encontrado". Eso es incorrecto
     para SEO (contenido duplicado bajo muchas URLs) y para confianza
     del usuario (cree que ve el producto que buscaba). */
  if(!p){
    document.title = "Fragancia no encontrada · Cruzial Parfums";
    const metaRobots = document.querySelector('meta[name="robots"]');
    if(metaRobots) metaRobots.content = "noindex, follow";
    box.innerHTML = `<div class="empty-state" style="margin:60px auto;max-width:520px">
      <strong>Fragancia no encontrada</strong>
      <p>Esta fragancia ya no está disponible o el enlace es incorrecto.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:24px">
        <a class="btn btn-dark" href="catalog.html">Volver al catálogo <span>→</span></a>
        <button type="button" class="btn btn-outline" data-open-finder>Encontrar una fragancia similar</button>
      </div>
    </div>`;
    return;
  }
  const related = PRODUCTS.filter(x=>x.id!==p.id && (x.gender===p.gender || x.family===p.family)).slice(0,4);
  const fallback = PRODUCTS.filter(x=>x.id!==p.id).slice(0,4);
  const rel = (related.length?related:fallback).slice(0,4);
  document.title = `${p.name}${p.brand ? " — " + p.brand : ""} · Cruzial Parfums`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if(metaDesc) metaDesc.content = `${p.name}${p.brand ? " de " + p.brand : ""} — Decants de 3, 5 y 10 ml. Notas, concentración y compra por WhatsApp. Cruzial Parfums.`;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if(ogTitle) ogTitle.content = `${p.name}${p.brand ? " — " + p.brand : ""} · Cruzial Parfums`;
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if(ogDesc) ogDesc.content = `Decants de ${p.name}${p.brand ? " de " + p.brand : ""}. 3, 5 y 10 ml. Compra por WhatsApp.`;
  const ogImage = document.querySelector('meta[property="og:image"]');
  if(ogImage && p.imgBottle) ogImage.content = location.origin + '/' + p.imgBottle;
  else if(ogImage && p.img) ogImage.content = location.origin + '/' + p.img;
  const canonical = document.querySelector('link[rel="canonical"]');
  if(canonical) canonical.href = location.origin + '/product.html?id=' + p.id;
  const twImage = document.querySelector('meta[name="twitter:image"]');
  if(twImage && p.imgBottle) twImage.content = location.origin + '/' + p.imgBottle;
  else if(twImage && p.img) twImage.content = location.origin + '/' + p.img;
  const schemaScript = document.querySelector('script[type="application/ld+json"]');
  if(schemaScript) {
    const productUrl = location.origin + '/product.html?id=' + p.id;
    const productImage = p.imgBottle ? location.origin + '/' + p.imgBottle : p.img ? location.origin + '/' + p.img : location.origin + '/logo.jpeg';
    const minPrice = Math.min(...Object.values(p.price));
    const maxPrice = Math.max(...Object.values(p.price));
    const schemaData = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": p.name + (p.brand ? " — " + p.brand : ""),
      "description": p.desc || (p.name + " — Decants de 3, 5 y 10 ml. Compra por WhatsApp en Cruzial Parfums."),
      "brand": {"@type": "Brand", "name": p.brand || "Cruzial Parfums"},
      "image": productImage,
      "url": productUrl,
      "offers": {
        "@type": "AggregateOffer",
        "priceCurrency": "PEN",
        "lowPrice": String(minPrice),
        "highPrice": String(maxPrice),
        "offerCount": "3",
        "availability": p.discontinued ? "https://schema.org/Discontinued" : "https://schema.org/InStock",
        "seller": {"@type": "Organization", "name": "Cruzial Parfums"}
      }
    };
    if(p.family) schemaData.category = p.family;
    if(p.gender) schemaData.additionalProperty = [{"@type": "PropertyValue", "name": "Género", "value": p.gender}];
    schemaScript.textContent = JSON.stringify(schemaData);
  }
  const typeLabel = p.type==="arab" ? "PERFUMERÍA ÁRABE" : p.type==="combo" ? "COMBO ÁRABE" : p.type==="niche" ? "NICHO" : "DESIGNER";
  /* ?variant=bottle: enlace directo desde el catálogo/cross-sell para
     elegir frasco completo sellado (venta minorista, una unidad) sin
     pasar por Mayorista, que es venta por volumen. */
  const wantsBottle = new URLSearchParams(location.search).get("variant") === "bottle" && !!p.bottle;
  const decantSizes = Object.keys(p.price).map(Number).sort((a,b)=>a-b);
  const decantBtns = decantSizes.map((s,i)=>`
    <button class="size-btn ${i===0 && !wantsBottle?"active":""}" data-size="${s}" data-group="decant" data-price="${p.price[s]}">
      <b>${s} ml</b><span>${money(p.price[s])}</span>
    </button>`).join("");
  const bottleBtns = p.bottle ? Object.entries(p.bottle).map(([s,v],i)=>`
    <button class="size-btn ${i===0 && wantsBottle?"active":""}" data-size="${s}" data-group="bottle" data-price="${v}">
      <b>${s} ml</b><span>${money(v)}</span>
    </button>`).join("") : "";
  const hasStagePhoto = !!(p.imgBottle || p.img);
  const stageMedia = p.imgBottle
    ? `<img id="product-stage-img" src="${p.imgBottle}" alt="${p.brand} ${p.name}" class="product-img" loading="lazy" decoding="async">`
    : p.img
    ? `<img id="product-stage-img" src="${p.img}" alt="${p.brand} ${p.name}" class="product-img" loading="lazy" decoding="async">`
    : bottleSVG(p);
  box.innerHTML = `
  <section class="product-detail">
    <div class="product-stage${hasStagePhoto ? " has-photo" : ""}" style="--glow:${glow(p)}">
      ${stageMedia}
      <span class="tag${p.discontinued?" tag-discontinued":""}">${p.discontinued?"Descontinuado":p.tag}</span>
    </div>
    <div class="product-info">
      <span class="eyebrow">${typeLabel} · ${p.conc}</span>
      ${p.brand ? `<span class="brandline">${p.brand}</span>` : ""}
      <h1>${p.name}</h1>
      <div class="subline">${p.gender==="men"?"Hombre":p.gender==="women"?"Mujer":"Unisex"} · ${p.family}</div>
      <p class="desc">${p.desc}</p>
      <div class="meta-row">
        <div><span>Concentración</span><b>${p.conc}</b></div>
        <div><span>Familia</span><b>${p.family}</b></div>
        <div><span>Desde</span><b>${money(p.price[Math.min(...Object.keys(p.price).map(Number))])}</b></div>
      </div>
      ${p.type === "combo" ? `
      <div class="note-block">
        <div class="note-title">INCLUYE</div>
        ${comboThumbsHTML(p)}
      </div>` : `
      <div class="note-block">
        <div class="note-title">NOTAS PRINCIPALES</div>
        <div class="note-chips">${p.notes.map(n=>`<span>${n}</span>`).join("")}</div>
      </div>`}
      ${p.discontinued ? `
      <div class="discontinued-notice">
        <strong>Este perfume fue descontinuado.</strong>
        <p>Ya no se repone al agotar el stock restante. Consulta si aún queda unidad disponible, o pide una recomendación de un aroma similar.</p>
      </div>
      <div class="detail-actions">
        <a class="btn btn-outline full" target="_blank" rel="noopener" href="https://wa.me/${WA}?text=${encodeURIComponent(`Hola ${CONFIG.STORE}, quiero saber si aún queda ${p.brand} ${p.name} (descontinuado), o una alternativa similar.`)}">Consultar disponibilidad <span>↗</span></a>
      </div>` : `
      <div class="note-block">
        <div class="note-title">DECANT · ${decantSizes.join(" · ")} ML</div>
        <div class="size-row">${decantBtns}</div>
        <p class="atom-note">≈ ${CONFIG.ATOMIZACIONES[decantSizes[0]]} atomizaciones · ${p.type==="arab"?"Decant clásico":"Decant clásico (3 ml) / Premium (5 y 10 ml)"}</p>
        ${p.bottle ? `
        <div class="note-title bottle-label">FRASCO COMPLETO · ORIGINAL SELLADO</div>
        <div class="size-row">${bottleBtns}</div>` : ""}
      </div>
      <div class="total-line"><span>Cantidad</span><div class="cart-controls" id="qty-stepper">
        <button data-qminus aria-label="Menos">−</button><span class="qty">1</span><button data-qplus aria-label="Más">+</button>
      </div></div>
      <div class="detail-actions">
        <button class="btn btn-primary" id="detail-add">Añadir al carrito <span>+</span></button>
        <a class="btn btn-outline" id="detail-consult" target="_blank" rel="noopener" href="#">Consultar <span>↗</span></a>
      </div>
      <p class="detail-note">Envío, disponibilidad y total final se confirman por WhatsApp. Sin pagos dentro de la web.</p>
      <div class="gift-banner">${GIFT_MESSAGE}</div>
      ${p.bottle ? `
      <div class="cross-sell-bottle">
        <div class="cross-sell-icon">✦</div>
        <div>
          <strong>¿Necesitas varias unidades?</strong>
          <p>Para pedidos por volumen (tiendas, barberías, revendedores) tenemos tarifas especiales en Mayorista.</p>
        </div>
        <a class="btn btn-outline btn-sm" href="mayorista.html">Ver Mayorista <span>→</span></a>
      </div>` : ""}
      `}
    </div>
  </section>
  <section class="relacionados">
    <div class="section-heading">
      <div><p class="eyebrow">COMPLETA TU SELECCIÓN</p><h2 class="h2">También te <em>interesará</em></h2></div>
      <a class="text-link" href="catalog.html">Ver catálogo completo <span>→</span></a>
    </div>
    <div class="product-grid">${rel.map(productCard).join("")}</div>
  </section>`;
  let size = wantsBottle ? Math.min(...Object.keys(p.bottle).map(Number)) : decantSizes[0],
      qty = 1, group = wantsBottle ? "bottle" : "decant";
  const atomNote = document.querySelector(".atom-note");
  const updateAtom = ()=>{
    if(!atomNote) return;
    if(group==="bottle"){ atomNote.textContent = "Frasco original sellado · 100% auténtico"; return; }
    const pres = p.type==="arab" ? "decant clásico" : size===3 ? "decant clásico" : "decant premium";
    atomNote.textContent = `≈ ${CONFIG.ATOMIZACIONES[size]} atomizaciones · ${pres}`;
  };
  updateAtom();
  if(wantsBottle) document.querySelector(".bottle-label")?.scrollIntoView?.({block:"center",behavior:"smooth"});
  const stageImg = document.getElementById("product-stage-img");
  const updateStageImage = ()=>{
    if(!stageImg || !p.imgBottle) return;
    const newSrc = group === "bottle" ? p.imgBottle : (p.imgSet || p.imgBottle);
    if(stageImg.src !== newSrc) {
      stageImg.style.opacity = "0";
      stageImg.style.transform = "scale(0.96)";
      setTimeout(()=>{
        stageImg.src = newSrc;
        stageImg.style.opacity = "1";
        stageImg.style.transform = "scale(1)";
      }, 250);
    }
  };
  const consultLink = document.getElementById("detail-consult");
  const updateConsultLink = ()=>{
    if(!consultLink) return;
    let msg;
    if(p.type === "combo"){
      const contents = window.CRUZIAL_COMBO_CONTENTS && window.CRUZIAL_COMBO_CONTENTS[p.id];
      const unitPrice = group === "bottle" ? p.bottle[size] : p.price[size];
      const total = unitPrice * qty;
      const lines = contents ? contents.perfumes.map(n => `• ${n}`).join("\n") : "";
      msg = `Hola ${CONFIG.STORE}, quiero pedir el combo ${p.name} en tamaño ${size} ml${qty>1?` (x${qty})`:""}${contents ? `, que incluye:\n${lines}` : ""}.\n\nTotal: ${money(total)}\n\n¿Cómo puedo realizar el pago?`;
    } else {
      msg = `Hola ${CONFIG.STORE}, quiero consultar por ${p.brand} ${p.name}.`;
    }
    consultLink.href = `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
  };
  updateConsultLink();
  document.querySelectorAll(".size-btn").forEach(b=>{
    b.addEventListener("click",()=>{
      document.querySelectorAll(".size-btn").forEach(x=>x.classList.remove("active"));
      b.classList.add("active"); size = Number(b.dataset.size); group = b.dataset.group;
      updateAtom();
      updateStageImage();
      updateConsultLink();
    });
  });
  const stepper = document.getElementById("qty-stepper");
  if(stepper){
    const qtyEl = stepper.querySelector(".qty");
    stepper.querySelector("[data-qminus]").addEventListener("click",()=>{ qty = Math.max(1,qty-1); qtyEl.textContent = qty; updateConsultLink(); });
    stepper.querySelector("[data-qplus]").addEventListener("click",()=>{ qty = Math.min(99,qty+1); qtyEl.textContent = qty; updateConsultLink(); });
  }
  document.getElementById("detail-add")?.addEventListener("click",()=>addToCart(p.id,size,qty,group));
  attachAddHandlers();
}

/* ---------- Carrito + checkout ---------- */
function renderCart(){
  const box = document.getElementById("cart-items"), total = document.getElementById("cart-total");
  if(!box || !total) return;
  const cart = getCart();
  if(!cart.length){
    box.innerHTML = `<div class="empty-cart">
      <strong>Tu selección está vacía</strong>
      <p>Explora la colección y añade tus primeras fragancias.</p>
      <a class="btn btn-outline" href="catalog.html">Ir al catálogo <span>→</span></a>
    </div>`;
    total.textContent = money(0); return;
  }
  let sum = 0;
  box.innerHTML = cart.map(i=>{
    const p = PRODUCTS.find(x=>x.id===i.id);
    const sub = i.price*i.qty; sum += sub;
    const label = i.group==="bottle" ? `Frasco ${i.size} ml` : `${i.size} ml`;
    const cartImg = p.imgBottle || p.img;
    const thumb = cartImg
      ? `<img src="${cartImg}" alt="${p.brand} ${p.name}" class="cart-thumb-img" loading="lazy" decoding="async">`
      : `<div class="cart-thumb" style="--glow:${glow(p)}">${bottleSVG(p)}</div>`;
    return `<div class="cart-row">
      ${thumb}
      <div>
        <span class="brand">${p.brand}</span>
        <h3>${p.name}</h3>
        <div class="variant">${label} · ${money(i.price)}</div>
        ${p.type === "combo" ? comboContentsLine(p) : ""}
        <div class="cart-controls">
          <button data-minus="${i.key}" aria-label="Menos">−</button>
          <span class="qty">${i.qty}</span>
          <button data-plus="${i.key}" aria-label="Más">+</button>
          <button class="remove" data-remove="${i.key}">Eliminar</button>
        </div>
      </div>
      <strong class="line-total">${money(sub)}</strong>
    </div>`;
  }).join("");
  total.textContent = money(sum);
  document.querySelectorAll("[data-minus]").forEach(b=>b.addEventListener("click",()=>changeQty(b.dataset.minus,-1)));
  document.querySelectorAll("[data-plus]").forEach(b=>b.addEventListener("click",()=>changeQty(b.dataset.plus,1)));
  document.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",()=>removeFromCart(b.dataset.remove)));
}
function initCartActions(){
  document.getElementById("clear-cart")?.addEventListener("click",()=>{ saveCart([]); renderCart(); });
}
/* Shared submit feedback: runs onSend() immediately — synchronously, in the
   same click/submit call stack — so window.open() still carries the user's
   click activation and isn't caught by popup blockers, then shows a
   confirmed state on the button for a moment so the tap feels acknowledged. */
function withSubmitFeedback(form, onSend){
  const btn = form.querySelector("button[type=submit]");
  if(!btn){ onSend(); return; }
  const original = btn.innerHTML;
  onSend();
  btn.disabled = true;
  btn.setAttribute("aria-busy","true");
  btn.innerHTML = `<span>Abierto en WhatsApp ✓</span>`;
  setTimeout(()=>{
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    btn.innerHTML = original;
  }, 1800);
}

function initOrderForm(){
  const form = document.getElementById("order-form"); if(!form) return;
  form.addEventListener("submit",e=>{
    e.preventDefault();
    if(!form.reportValidity()) return;
    const cart = getCart();
    if(!cart.length){ toast("Tu selección está vacía"); return; }
    const d = Object.fromEntries(new FormData(form));
    withSubmitFeedback(form, ()=>{
      let total = 0;
      const lines = cart.map(i=>{
        const p = PRODUCTS.find(x=>x.id===i.id); total += i.price*i.qty;
        const label = i.group==="bottle" ? `Frasco ${i.size} ml` : `${i.size} ml`;
        const contents = p.type === "combo" && window.CRUZIAL_COMBO_CONTENTS?.[p.id];
        const comboLine = contents?.perfumes?.length ? `\n   Incluye: ${contents.perfumes.join(" · ")}` : "";
        return `${label} ${p.brand} ${p.name} ×${i.qty} = ${money(i.price*i.qty)}${comboLine}`;
      });
      const msg =
`Hola ${CONFIG.STORE}. Quiero realizar este pedido:

${lines.join("\n")}

TOTAL ESTIMADO: ${money(total)}

— MIS DATOS —
Nombre: ${d.name}
WhatsApp: ${d.phone}
Distrito: ${d.district}
Entrega: ${d.delivery}
Nota: ${d.note||"—"}

Quedo atento/a a la confirmación de stock, envío y total final.`;
      window.open(`https://wa.me/${WA}?text=${encodeURIComponent(msg)}`,"_blank");
      toast("Pedido abierto en WhatsApp");
    });
  });
}

/* ---------- Formularios informativos → WhatsApp ---------- */
function initInfoForms(){
  document.querySelectorAll("[data-wa-form]").forEach(form=>{
    form.addEventListener("submit",e=>{
      e.preventDefault();
      if(!form.reportValidity()) return;
      const intent = form.dataset.waForm;
      const d = Object.fromEntries(new FormData(form));
      withSubmitFeedback(form, ()=>{
        const msg = intent==="wholesale"
          ? `Hola ${CONFIG.STORE}. Quiero información sobre precios por MAYOR.\n\nNombre: ${d.name}\nNegocio: ${d.business||"—"}\nWhatsApp: ${d.phone}\nVolumen estimado: ${d.volume||"—"}\nMensaje: ${d.message||"—"}`
          : `Hola ${CONFIG.STORE}. Quiero contactarme.\n\nNombre: ${d.name}\nWhatsApp: ${d.phone}\nMotivo: ${d.topic||"—"}\nMensaje: ${d.message||"—"}`;
        window.open(`https://wa.me/${WA}?text=${encodeURIComponent(msg)}`,"_blank");
        toast("Mensaje abierto en WhatsApp");
        form.reset();
      });
    });
  });
}

/* ---------- Drawer del carrito ---------- */
function renderDrawer(){
  const list = document.getElementById("drawer-items"), total = document.getElementById("drawer-total");
  if(!list) return;
  const cart = getCart();
  if(!cart.length){
    list.innerHTML = `<div class="drawer-empty"><strong>Tu selección está vacía</strong><p>Explora la colección y añade tus primeras fragancias.</p></div>`;
    total.textContent = money(0);
    return;
  }
  let sum = 0;
  list.innerHTML = cart.map(i=>{
    const p = PRODUCTS.find(x=>x.id===i.id); sum += i.price*i.qty;
    const drawerImg = p.imgBottle || p.img;
    const thumb = drawerImg
      ? `<img src="${drawerImg}" alt="${p.brand} ${p.name}" class="drawer-thumb-img" loading="lazy" decoding="async">`
      : `<div class="cart-thumb" style="--glow:${glow(p)}">${bottleSVG(p)}</div>`;
    return `<div class="drawer-item">
      ${thumb}
      <div>
        <h4>${p.name}</h4>
        <small>${p.brand} · ${i.group==="bottle"?"frasco ":""}${i.size} ml</small>
        ${p.type === "combo" ? comboContentsLine(p) : ""}
        <div class="d-qty">
          <button data-dminus="${i.key}" aria-label="Menos">−</button>
          <span>${i.qty}</span>
          <button data-dplus="${i.key}" aria-label="Más">+</button>
        </div>
      </div>
      <span class="d-price">${money(i.price*i.qty)}</span>
    </div>`;
  }).join("");
  total.textContent = money(sum);
  list.querySelectorAll("[data-dminus]").forEach(b=>b.addEventListener("click",()=>changeQty(b.dataset.dminus,-1)));
  list.querySelectorAll("[data-dplus]").forEach(b=>b.addEventListener("click",()=>changeQty(b.dataset.dplus,1)));
}
function initDrawer(){
  const drawer = document.getElementById("cart-drawer"), overlay = document.getElementById("drawer-overlay");
  if(!drawer) return;
  const open = ()=>{ drawer.classList.add("open"); overlay.classList.add("active"); document.body.style.overflow="hidden"; };
  const close = ()=>{ drawer.classList.remove("open"); overlay.classList.remove("active"); document.body.style.overflow=""; };
  document.querySelectorAll("[data-open-cart]").forEach(b=>b.addEventListener("click",e=>{ e.preventDefault(); open(); }));
  document.querySelectorAll("[data-close-cart]").forEach(b=>b.addEventListener("click",close));
  overlay?.addEventListener("click",close);
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") close(); });
}

/* ---------- Menú móvil ---------- */
function initMobileMenu(){
  const menu = document.getElementById("mobile-menu");
  if(!menu) return;
  var lastFocused = null;
  var triggers = document.querySelectorAll("[data-open-menu]");
  triggers.forEach(function(b){
    b.setAttribute("aria-controls","mobile-menu");
    b.setAttribute("aria-expanded","false");
  });
  triggers.forEach(b=>b.addEventListener("click",()=>{
    lastFocused = document.activeElement;
    menu.classList.add("open"); document.body.style.overflow="hidden";
    triggers.forEach(function(t){t.setAttribute("aria-expanded","true")});
    var firstLink = menu.querySelector("a");
    if(firstLink) setTimeout(function(){firstLink.focus()},100);
  }));
  document.querySelectorAll("[data-close-menu], .mobile-menu a").forEach(b=>b.addEventListener("click",()=>{
    menu.classList.remove("open"); document.body.style.overflow="";
    triggers.forEach(function(t){t.setAttribute("aria-expanded","false")});
    if(lastFocused) lastFocused.focus();
  }));
  menu.addEventListener("keydown",function(e){
    if(e.key==="Escape"){
      menu.classList.remove("open"); document.body.style.overflow="";
      triggers.forEach(function(t){t.setAttribute("aria-expanded","false")});
      if(lastFocused) lastFocused.focus();
      return;
    }
    // PACKAGE 02 — trampa de foco: mientras el menú está abierto, Tab/Shift+Tab
    // se quedan dentro de él en lugar de escapar hacia el contenido de fondo.
    if(e.key==="Tab" && menu.classList.contains("open")){
      var focusable = menu.querySelectorAll("a[href], button:not([disabled])");
      if(!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    }
  });
}

/* ---------- Header + reveal ---------- */
function initHeader(){
  const header = document.querySelector(".site-header");
  if(!header) return;
  const onScroll = ()=> header.classList.toggle("scrolled", window.scrollY > 24);
  onScroll(); window.addEventListener("scroll", onScroll, {passive:true});
}
function initReveal(){
  /* Tarjetas y grillas (producto, colección, combo, testimonio, editorial...) no
     llevan la clase .reveal en su HTML porque se renderizan en runtime — se la
     asignamos aquí, con un stagger calculado por posición dentro de su grilla,
     para que entren en cascada al hacer scroll. Nativo, sin dependencias externas:
     mismo efecto que un stagger de ScrollTrigger, sin el peso ni la fragilidad
     de animar por rAF en una librería de terceros (ver nota en el reporte de auditoría). */
  const CARD_SELECTOR = ".product-card, .collection-card, .combo-card, .testimonial-card, .editorial-card, .badge-item, .step, .step-item, .contact-card, .info-card, .value-card, .feature-card, .team-card, .mini-stat";
  document.querySelectorAll(CARD_SELECTOR).forEach(el=>{
    if(el.classList.contains("reveal")) return;
    el.classList.add("reveal");
    const siblings = Array.from(el.parentElement ? el.parentElement.children : []).filter(s=>s.matches(CARD_SELECTOR));
    const i = siblings.indexOf(el);
    if(i > 0) el.style.transitionDelay = Math.min(i * 70, 420) + "ms";
  });
  const obs = new IntersectionObserver(entries=>{
    entries.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add("in"); obs.unobserve(en.target); } });
  },{threshold:.12});
  document.querySelectorAll(".reveal").forEach(el=>obs.observe(el));
}

/* ---------- Toast ---------- */
function toast(text){
  let t = document.getElementById("cruzial-toast");
  if(!t){
    t = document.createElement("div");
    t.id = "cruzial-toast"; t.className = "toast";
    t.setAttribute("role","status");
    t.setAttribute("aria-live","polite");
    t.setAttribute("aria-atomic","true");
    document.body.appendChild(t);
  }
  t.textContent = text;
  requestAnimationFrame(()=>t.classList.add("show"));
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(()=>t.classList.remove("show"), 2600);
}

/* ---------- Newsletter ---------- */
/* ---------- Botellas en arte estático ---------- */
function initArt(){
  /* Estas imágenes visten el hero, las tarjetas de "La Colección" y los
     paneles split-art: siempre están al inicio de la página o justo
     debajo del pliegue, y son pocas (nunca más de 5–6 por página). Se
     cargan eager — loading="lazy" aquí solo arriesgaba una tarjeta en
     blanco mientras el navegador decidía si "ya se veían" o no. */
  document.querySelectorAll("[data-bottle]").forEach(el=>{
    const p = PRODUCTS.find(x=>x.id===el.dataset.bottle);
    if(p){
      el.style.setProperty("--glow", glow(p));
      const artImg = p.imgBottle || p.img;
      el.innerHTML = artImg
        ? `<img src="${artImg}" alt="${p.brand} ${p.name}" class="art-media" decoding="async">`
        : bottleSVG(p);
    }
  });
}

/* ---------- 3D Tilt on product cards ---------- */
function initTilt(){
  if(matchMedia("(pointer:fine)").matches===false) return;
  document.querySelectorAll(".product-card").forEach(function(card){
    card.addEventListener("mousemove",function(e){
      var r=card.getBoundingClientRect();
      var x=(e.clientX-r.left)/r.width-.5;
      var y=(e.clientY-r.top)/r.height-.5;
      card.style.transform="translateY(-6px) perspective(600px) rotateX("+(-y*8)+"deg) rotateY("+(x*8)+"deg) scale(1.02)";
      card.style.transition="transform .15s ease-out";
    });
    card.addEventListener("mouseleave",function(){
      card.style.transform="";
      card.style.transition="all .55s cubic-bezier(.22,1,.36,1)";
    });
  });
}

/* ---------- Button Ripple effect ---------- */
function initRipple(){
  document.querySelectorAll(".btn-primary, .btn-outline").forEach(function(btn){
    btn.style.position="relative";
    btn.style.overflow="hidden";
    btn.addEventListener("click",function(e){
      var r=btn.getBoundingClientRect();
      var d=Math.max(r.width,r.height);
      var span=document.createElement("span");
      span.className="ripple-effect";
      span.style.width=span.style.height=d+"px";
      span.style.left=(e.clientX-r.left-d/2)+"px";
      span.style.top=(e.clientY-r.top-d/2)+"px";
      btn.appendChild(span);
      setTimeout(function(){span.remove()},700);
    });
  });
}

/* ---------- Init ---------- */
document.addEventListener("error",function(e){
  if(e.target.tagName==="IMG" && !e.target.dataset.bottle){
    const p = window.CRUZIAL_PRODUCTS.find(x=>x.name && e.target.alt && e.target.alt.includes(x.name));
    if(p && e.target.parentElement){
      e.target.style.display="none";
      const svg=document.createElement("div");
      svg.innerHTML=bottleSVG(p);
      svg.querySelector("svg").style.cssText="width:100%;height:100%";
      e.target.parentElement.replaceChild(svg,e.target);
    }
  }
},true);
initArt();
updateCartCount();
initPills();
renderFeatured();
renderCombos();
renderBottles();
initSearch();
initCatalog();
initComboBuilder();
initWholesaleTable();
initProduct();
renderCart();
initCartActions();
initOrderForm();
initInfoForms();
renderDrawer();
initDrawer();
initMobileMenu();
initHeader();
initReveal();
initTilt();
initRipple();
initAnalytics();

/* ---------- Page loader ---------- */
window.addEventListener("load",function(){
  var loader=document.getElementById("page-loader");
  if(loader) setTimeout(function(){loader.classList.add("hide")},400);
});

/* ---------- GA4 Event Tracking ---------- */
function initAnalytics(){
  document.addEventListener("click",function(e){
    var btn=e.target.closest(".btn-primary, .quick-add, [data-add]");
    if(btn){
      var label=btn.textContent.trim()||"CTA";
      var product=btn.dataset.add||"";
      if(typeof gtag==="function"){
        gtag("event","click",{event_category:"CTA",event_label:label,product_id:product});
      }
    }
    var wa=e.target.closest(".wa-float, a[href*='wa.me']");
    if(wa){
      if(typeof gtag==="function"){
        gtag("event","whatsapp_click",{event_category:"Contact"});
      }
    }
  });
  document.querySelectorAll("form").forEach(function(f){
    f.addEventListener("submit",function(){
      if(typeof gtag==="function"){
        gtag("event","form_submit",{event_category:"Form",form_id:f.id||"unknown"});
      }
    });
  });
}

/* ---------- Page exit transitions ---------- */
document.addEventListener("DOMContentLoaded",function(){
  document.querySelectorAll('a[href]').forEach(function(a){
    var href=a.getAttribute("href");
    if(!href||href.startsWith("#")||href.startsWith("javascript:")||a.target==="_blank") return;
    a.addEventListener("click",function(e){
      if(e.metaKey||e.ctrlKey||e.shiftKey) return;
      e.preventDefault();
      document.body.classList.add("page-exit","out");
      setTimeout(function(){window.location.href=href},350);
    });
  });
});
/* Si el navegador restaura esta página desde el bfcache (botón "atrás"), el
   DOM vuelve exactamente como quedó al salir — con "page-exit out" todavía
   puesto y la página en opacity:0 para siempre, porque DOMContentLoaded no
   se dispara de nuevo en una restauración de bfcache. Sin esto, "atrás"
   deja la página en blanco hasta que el usuario hace F5. */
window.addEventListener("pageshow",function(e){
  if(e.persisted) document.body.classList.remove("page-exit","out");
});