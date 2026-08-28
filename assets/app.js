/* ============================================================
   CRUZIAL PARFUMS — Lógica de la tienda
   Carrito en localStorage · Pedido por WhatsApp
   ============================================================ */

const PRODUCTS = window.CRUZIAL_PRODUCTS || [];
const CONFIG = window.CRUZIAL_CONFIG || { WA_NUMBER: "51999999999", STORE: "Cruzial Parfums" };
const WA = CONFIG.WA_NUMBER;
const money = n => "S/ " + n.toFixed(2);

/* ---------- Utilidades ---------- */
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
const getCart = () => JSON.parse(localStorage.getItem("cruzial_cart") || "[]");
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
  const media = cardImg
    ? `<img src="${cardImg}" alt="${p.brand} ${p.name}" class="card-img" loading="lazy" decoding="async">`
    : bottleSVG(p);
  return `<article class="product-card">
    <a href="product.html?id=${p.id}">
      <div class="card-media" style="--glow:${glow(p)}">
        ${media}
        <span class="tag">${p.tag}</span>
        <button class="quick-add" data-add="${p.id}" data-size="${qSize}" data-group="${qGroup}" aria-label="Añadir ${p.name}">+</button>
      </div>
      <div class="card-body">
        ${brand}
        <h3 class="card-name">${p.name}</h3>
        <div class="card-meta"><span>${isBottle?`frasco ${minSize} ml`:"desde 3 ml"}</span><b>${money(min)}</b></div>
        ${isBottle && p.price ? `<div class="card-bottle">Prueba antes en decant · desde ${money(Math.min(...Object.values(p.price)))}</div>` : ""}
        ${!isBottle && bottle ? `<div class="card-bottle">Frasco completo · desde ${money(bottle)} (${bSize} ml)</div>` : ""}
        ${!isBottle ? `<div class="card-gift">${GIFT_MESSAGE}</div>` : ""}
      </div>
    </a>
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
  const items = PRODUCTS.filter(p=>filter==="all"||p.gender===filter||p.type===filter).slice(0,8);
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
  input?.addEventListener("input",()=>{
    const q = input.value.toLowerCase().trim();
    const list = q
      ? PRODUCTS.filter(p=>(p.brand+" "+p.name+" "+p.notes.join(" ")+" "+p.family).toLowerCase().includes(q))
      : PRODUCTS.slice(0,6);
    results.innerHTML = list.map(p=>{
      const searchImg = p.imgBottle || p.imgSet || p.img;
      return `
      <a class="search-item" href="product.html?id=${p.id}">
        ${searchImg ? `<img src="${searchImg}" alt="${p.brand} ${p.name}" class="search-img" loading="lazy" decoding="async">` : bottleSVG(p)}
        <span><span class="s-brand">${p.brand}</span><span class="s-name">${p.name}</span></span>
        <span class="s-price">${money(Math.min(...Object.values(p.price)))}</span>
      </a>`;
    }).join("");
  });
}

/* ---------- Home: frascos completos ---------- */
function renderBottles(){
  const el = document.getElementById("bottle-grid"); if(!el) return;
  const items = PRODUCTS.filter(p=>p.bottle)
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

/* ---------- Catálogo ---------- */
function initCatalog(){
  const grid = document.getElementById("catalog-grid"); if(!grid) return;
  const gender = document.getElementById("gender-filter"), family = document.getElementById("family-filter"),
        type = document.getElementById("type-filter"), format = document.getElementById("format-filter"),
        sale = document.getElementById("sale-filter"),
        sort = document.getElementById("sort-filter"), count = document.getElementById("result-count");
  const qs = new URLSearchParams(location.search);
  if(qs.get("family")) family.value = qs.get("family");
  if(qs.get("gender")) gender.value = qs.get("gender");
  if(qs.get("type")) type.value = qs.get("type");
  if(qs.get("format")) format.value = qs.get("format");
  const run = ()=>{
    let items = [...PRODUCTS];
    if(gender.value!=="all") items = items.filter(p=>p.gender===gender.value);
    if(family.value!=="all") items = items.filter(p=>p.family===family.value);
    if(type.value!=="all") items = items.filter(p=>p.type===type.value);
    if(format.value==="bottle") items = items.filter(p=>p.bottle);
    if(sale.checked) items = items.filter(p=>p.bestseller);
    const minP = p => Math.min(...Object.values(p.price));
    if(sort.value==="priceAsc") items.sort((a,b)=>minP(a)-minP(b));
    if(sort.value==="priceDesc") items.sort((a,b)=>minP(b)-minP(a));
    if(sort.value==="name") items.sort((a,b)=>a.name.localeCompare(b.name));
    count.textContent = items.length + (items.length===1?" perfume":" perfumes");
    grid.innerHTML = items.length ? items.map(productCard).join("")
      : `<div class="empty-state"><strong>Sin resultados</strong>Prueba ajustando los filtros o buscando otra familia olfativa.</div>`;
    attachAddHandlers();
  };
  [gender,family,type,format,sale,sort].forEach(x=>x?.addEventListener("change",run));
  document.querySelector("[data-clear-filters]")?.addEventListener("click",()=>{
    gender.value=family.value=type.value=format.value="all"; sale.checked=false; sort.value="featured"; run();
  });
  run();
}

/* ---------- Página de producto ---------- */
function initProduct(){
  const box = document.getElementById("product-page"); if(!box) return;
  const id = new URLSearchParams(location.search).get("id") || "aventus";
  const p = PRODUCTS.find(x=>x.id===id) || PRODUCTS[0];
  const related = PRODUCTS.filter(x=>x.id!==p.id && (x.gender===p.gender || x.family===p.family)).slice(0,4);
  const fallback = PRODUCTS.filter(x=>x.id!==p.id).slice(0,4);
  const rel = (related.length?related:fallback).slice(0,4);
  document.title = `${p.name}${p.brand ? " — " + p.brand : ""} · Cruzial Parfums`;
  const typeLabel = p.type==="arab" ? "PERFUMERÍA ÁRABE" : p.type==="combo" ? "COMBO ÁRABE" : p.type==="niche" ? "NICHO" : "DESIGNER";
  const decantSizes = Object.keys(p.price).map(Number).sort((a,b)=>a-b);
  const decantBtns = decantSizes.map((s,i)=>`
    <button class="size-btn ${i===0?"active":""}" data-size="${s}" data-group="decant" data-price="${p.price[s]}">
      <b>${s} ml</b><span>${money(p.price[s])}</span>
    </button>`).join("");
  const bottleBtns = p.bottle ? Object.entries(p.bottle).map(([s,v])=>`
    <button class="size-btn" data-size="${s}" data-group="bottle" data-price="${v}">
      <b>${s} ml</b><span>${money(v)}</span>
    </button>`).join("") : "";
  const stageMedia = p.imgBottle
    ? `<img id="product-stage-img" src="${p.imgBottle}" alt="${p.brand} ${p.name}" class="product-img" loading="lazy" decoding="async">`
    : p.img
    ? `<img id="product-stage-img" src="${p.img}" alt="${p.brand} ${p.name}" class="product-img" loading="lazy" decoding="async">`
    : bottleSVG(p);
  box.innerHTML = `
  <section class="product-detail">
    <div class="product-stage" style="--glow:${glow(p)}">
      ${stageMedia}
      <span class="tag">${p.tag}</span>
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
      <div class="note-block">
        <div class="note-title">NOTAS PRINCIPALES</div>
        <div class="note-chips">${p.notes.map(n=>`<span>${n}</span>`).join("")}</div>
      </div>
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
        <a class="btn btn-outline" target="_blank" rel="noopener" href="https://wa.me/${WA}?text=${encodeURIComponent(`Hola ${CONFIG.STORE}, quiero consultar por ${p.brand} ${p.name}.`)}">Consultar <span>↗</span></a>
      </div>
      <p class="detail-note">Envío, disponibilidad y total final se confirman por WhatsApp. Sin pagos dentro de la web.</p>
      <div class="gift-banner">${GIFT_MESSAGE}</div>
    </div>
  </section>
  <section class="relacionados">
    <div class="section-heading">
      <div><p class="eyebrow">COMPLETA TU SELECCIÓN</p><h2 class="h2">También te <em>interesará</em></h2></div>
      <a class="text-link" href="catalog.html">Ver catálogo completo <span>→</span></a>
    </div>
    <div class="product-grid">${rel.map(productCard).join("")}</div>
  </section>`;
  let size = decantSizes[0], qty = 1, group = "decant";
  const atomNote = document.querySelector(".atom-note");
  const updateAtom = ()=>{
    if(!atomNote) return;
    if(group==="bottle"){ atomNote.textContent = "Frasco original sellado · 100% auténtico"; return; }
    const pres = p.type==="arab" ? "decant clásico" : size===3 ? "decant clásico" : "decant premium";
    atomNote.textContent = `≈ ${CONFIG.ATOMIZACIONES[size]} atomizaciones · ${pres}`;
  };
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
  document.querySelectorAll(".size-btn").forEach(b=>{
    b.addEventListener("click",()=>{
      document.querySelectorAll(".size-btn").forEach(x=>x.classList.remove("active"));
      b.classList.add("active"); size = Number(b.dataset.size); group = b.dataset.group;
      updateAtom();
      updateStageImage();
    });
  });
  const stepper = document.getElementById("qty-stepper");
  const qtyEl = stepper.querySelector(".qty");
  stepper.querySelector("[data-qminus]").addEventListener("click",()=>{ qty = Math.max(1,qty-1); qtyEl.textContent = qty; });
  stepper.querySelector("[data-qplus]").addEventListener("click",()=>{ qty = Math.min(99,qty+1); qtyEl.textContent = qty; });
  document.getElementById("detail-add").addEventListener("click",()=>addToCart(p.id,size,qty,group));
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
function initOrderForm(){
  const form = document.getElementById("order-form"); if(!form) return;
  form.addEventListener("submit",e=>{
    e.preventDefault();
    const cart = getCart();
    if(!cart.length){ toast("Tu selección está vacía"); return; }
    const d = Object.fromEntries(new FormData(form));
    let total = 0;
    const lines = cart.map(i=>{
      const p = PRODUCTS.find(x=>x.id===i.id); total += i.price*i.qty;
      const label = i.group==="bottle" ? `Frasco ${i.size} ml` : `${i.size} ml`;
      return `${label} ${p.brand} ${p.name} ×${i.qty} = ${money(i.price*i.qty)}`;
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
}

/* ---------- Formularios informativos → WhatsApp ---------- */
function initInfoForms(){
  document.querySelectorAll("[data-wa-form]").forEach(form=>{
    form.addEventListener("submit",e=>{
      e.preventDefault();
      const intent = form.dataset.waForm;
      const d = Object.fromEntries(new FormData(form));
      const msg = intent==="wholesale"
        ? `Hola ${CONFIG.STORE}. Quiero información sobre precios por MAYOR.\n\nNombre: ${d.name}\nNegocio: ${d.business||"—"}\nWhatsApp: ${d.phone}\nVolumen estimado: ${d.volume||"—"}\nMensaje: ${d.message||"—"}`
        : `Hola ${CONFIG.STORE}. Quiero contactarme.\n\nNombre: ${d.name}\nWhatsApp: ${d.phone}\nMotivo: ${d.topic||"—"}\nMensaje: ${d.message||"—"}`;
      window.open(`https://wa.me/${WA}?text=${encodeURIComponent(msg)}`,"_blank");
      toast("Mensaje abierto en WhatsApp");
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
  document.querySelectorAll("[data-open-menu]").forEach(b=>b.addEventListener("click",()=>{
    lastFocused = document.activeElement;
    menu.classList.add("open"); document.body.style.overflow="hidden";
    var firstLink = menu.querySelector("a");
    if(firstLink) setTimeout(function(){firstLink.focus()},100);
  }));
  document.querySelectorAll("[data-close-menu], .mobile-menu a").forEach(b=>b.addEventListener("click",()=>{
    menu.classList.remove("open"); document.body.style.overflow="";
    if(lastFocused) lastFocused.focus();
  }));
  menu.addEventListener("keydown",function(e){
    if(e.key==="Escape"){
      menu.classList.remove("open"); document.body.style.overflow="";
      if(lastFocused) lastFocused.focus();
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
    document.body.appendChild(t);
  }
  t.textContent = text;
  requestAnimationFrame(()=>t.classList.add("show"));
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(()=>t.classList.remove("show"), 2600);
}

/* ---------- Newsletter ---------- */
function initNewsletter(){
  const form = document.getElementById("newsletter-form");
  if(!form) return;
  form.addEventListener("submit",e=>{
    e.preventDefault();
    toast("Bienvenido a Cruzial Parfums");
    form.reset();
  });
}

/* ---------- Botellas en arte estático ---------- */
function initArt(){
  document.querySelectorAll("[data-bottle]").forEach(el=>{
    const p = PRODUCTS.find(x=>x.id===el.dataset.bottle);
    if(p){
      el.style.setProperty("--glow", glow(p));
      const artImg = p.imgBottle || p.img;
      el.innerHTML = artImg
        ? `<img src="${artImg}" alt="${p.brand} ${p.name}" style="width:100%;height:100%;object-fit:contain" loading="lazy" decoding="async">`
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
initNewsletter();
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