"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import {
  PARFUMS_CART_UPDATED_EVENT,
  readParfumsCart,
} from "@/domains/carts/parfums-cart";
import { resolveParfumsCart } from "@/domains/carts/parfums-cart-pricing";
import type { CatalogProduct } from "@/domains/catalog/types";
import { cartIdentity } from "@/domains/catalog/types";
import { CartLine } from "@/components/parfums/cart/cart-line";
import { useParfumsCart } from "@/components/parfums/cart/use-parfums-cart";
import type { HeaderSearchProduct } from "./site-header";
import { BagIcon, MenuIcon, SearchIcon } from "./shell-icons";
import styles from "./parfums-shell.module.css";

type NavItem = { href: string; label: string };

function useDialogState() {
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => setOpen(true), []);
  const closeDialog = useCallback(() => setOpen(false), []);
  return { open, openDialog, closeDialog };
}

function useDialogAccessibility(
  open: boolean,
  close: () => void,
  containerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !containerRef.current) return;

      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (!containerRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    // Focus on the next frame: the dialog flips from visibility:hidden to
    // visible in this same commit, and focusing a not-yet-visible element is
    // silently ignored (typing then went nowhere).
    let frame = 0;
    let attempts = 0;
    const focusWhenVisible = () => {
      const target = containerRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      target?.focus();
      // Under reduced motion the visibility flip can land a frame or two
      // later; keep trying briefly until focus really moved inside.
      if (target && document.activeElement !== target && attempts < 12) {
        attempts += 1;
        frame = requestAnimationFrame(focusWhenVisible);
      }
    };
    frame = requestAnimationFrame(focusWhenVisible);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [close, containerRef, open]);
}

export function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button className={styles.iconButton} type="button" onClick={onOpen} aria-label="Buscar fragancias" title="Buscar">
      <SearchIcon />
    </button>
  );
}

export function CartTrigger({ onOpen, products }: { onOpen: () => void; products: readonly CatalogProduct[] }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(
      resolveParfumsCart(readParfumsCart(localStorage), products)
        .reduce((sum, line) => sum + line.quantity, 0),
    );
    update();
    window.addEventListener("storage", update);
    window.addEventListener(PARFUMS_CART_UPDATED_EVENT, update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener(PARFUMS_CART_UPDATED_EVENT, update);
    };
  }, [products]);

  return (
    <button className={styles.iconButton} type="button" onClick={onOpen} aria-label={`Abrir carrito, ${count} ${count === 1 ? "producto" : "productos"}`} title="Carrito">
      <BagIcon />
      <span className={`${styles.cartCount} ${count > 0 ? styles.cartCountVisible : ""}`}>{count}</span>
    </button>
  );
}

function SearchPanel({ products, open, onClose }: { products: HeaderSearchProduct[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeAndReset = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);
  useDialogAccessibility(open, closeAndReset, panelRef);

  const needle = query.trim();
  const results = useMemo(() => {
    const lowered = needle.toLocaleLowerCase("es");
    if (!lowered) return [];
    return products
      .filter((product) =>
        `${product.brand} ${product.name} ${product.notes.join(" ")} ${product.family}`
          .toLocaleLowerCase("es")
          .includes(lowered),
      )
      .slice(0, 8);
  }, [products, needle]);

  const catalogHref = `/parfums/catalogo?search=${encodeURIComponent(needle)}` as Route;

  function moveThroughResults(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[data-search-result]") ?? []);
    if (items.length === 0) return;
    event.preventDefault();
    const input = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") (items[current + 1] ?? items[0])?.focus();
    else if (current <= 0) input?.focus();
    else items[current - 1]?.focus();
  }

  return (
    <div
      ref={panelRef}
      className={`${styles.searchPanel} ${open ? styles.panelOpen : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Buscar fragancias"
      aria-hidden={!open}
      inert={!open}
      onKeyDown={moveThroughResults}
    >
      <button type="button" className={styles.closePanel} onClick={closeAndReset} aria-label="Cerrar búsqueda">×</button>
      <form
        className={styles.searchInner}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (!needle) return;
          closeAndReset();
          router.push(catalogHref);
        }}
      >
        <p className={styles.eyebrow}>Buscar en Cruzial</p>
        <input data-autofocus className={styles.searchInput} type="search" enterKeyHint="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Marca, perfume o nota…" autoComplete="off" aria-label="Buscar fragancias" />
        <div className={styles.searchResults} aria-live="polite">
          {needle && results.length === 0 ? <p>No encontramos coincidencias para “{needle}”. Prueba con otra marca o nota.</p> : null}
          {results.map((product) => (
            <Link key={product.slug} data-search-result href={`/parfums/productos/${product.slug}` as Route} onClick={closeAndReset}>
              <span>{product.brand}</span>
              <strong>{product.name}</strong>
              {product.discontinued ? <small>Descontinuado</small> : null}
            </Link>
          ))}
          {needle && results.length > 0 ? (
            <Link data-search-result className={styles.searchAll} href={catalogHref} onClick={closeAndReset}>
              Ver todo en el catálogo <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

function CartDrawer({ open, onClose, products }: { open: boolean; onClose: () => void; products: readonly CatalogProduct[] }) {
  const drawerRef = useRef<HTMLElement>(null);
  const { lines, total, persistenceError, setQuantity, remove } = useParfumsCart(products);
  useDialogAccessibility(open, onClose, drawerRef);
  return (
    <>
      <button type="button" aria-label="Cerrar carrito" className={`${styles.drawerOverlay} ${open ? styles.drawerOpen : ""}`} onClick={onClose} />
      <aside ref={drawerRef} className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`} data-cart-drawer aria-label="Carrito de compras" aria-modal="true" role="dialog" aria-hidden={!open} inert={!open}>
        <div className={styles.drawerHead}>
          <strong>Tu selección</strong>
          <button data-autofocus type="button" onClick={onClose} aria-label="Cerrar carrito">×</button>
        </div>
        <div className={styles.drawerItems} aria-live="polite">
          {lines.length === 0 ? (
            <div className={styles.drawerEmpty}>
              <BagIcon size={28} />
              <strong>Tu selección está vacía</strong>
              <p>Explora la colección y añade tu primera fragancia.</p>
              <Link href={"/parfums/catalogo" as Route} onClick={onClose}>Ver catálogo</Link>
            </div>
          ) : lines.map((line) => (
            <CartLine
              key={line.key}
              line={line}
              compact
               onQuantity={(quantity) => setQuantity(cartIdentity(line.product), line.variant.variantId, quantity)}
               onRemove={() => remove(cartIdentity(line.product), line.variant.variantId)}
            />
          ))}
          {persistenceError ? <p className={styles.drawerError} role="alert">No pudimos guardar el cambio. Revisa el almacenamiento del navegador.</p> : null}
        </div>
        <div className={styles.drawerFoot}>
          <div><span>Total estimado</span><strong>{money(total)}</strong></div>
          {lines.length > 0 ? (
            <Link href={"/parfums/checkout" as Route} onClick={onClose}>Revisar y continuar <span aria-hidden="true">→</span></Link>
          ) : (
            <button type="button" disabled>Revisar y continuar</button>
          )}
          <small>El total final, stock y envío se confirman en WhatsApp.</small>
        </div>
      </aside>
    </>
  );
}

export function MobileMenu({ navItems, open, onClose }: { navItems: readonly NavItem[]; open: boolean; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(open, onClose, menuRef);
  return (
    <div ref={menuRef} className={`${styles.mobileMenu} ${open ? styles.menuOpen : ""}`} role="dialog" aria-label="Menú de navegación" aria-modal="true" aria-hidden={!open} inert={!open}>
      <button data-autofocus type="button" className={styles.closeMobile} onClick={onClose} aria-label="Cerrar menú">×</button>
      {navItems.map((item) => <Link key={item.href} href={item.href as Route} onClick={onClose}>{item.label}</Link>)}
      <div className={styles.menuSeparator} aria-hidden="true" />
      <Link href={"/parfums/nosotros" as Route} className={styles.menuSecondary} onClick={onClose}>Nosotros</Link>
      <Link href={"/parfums/contacto" as Route} className={styles.menuSecondary} onClick={onClose}>Contacto</Link>
      <small>CRUZIAL PARFUMS · LIMA / PERÚ</small>
    </div>
  );
}

export function HeaderActions({ products, cartProducts, navItems }: { products: HeaderSearchProduct[]; cartProducts: CatalogProduct[]; navItems: readonly NavItem[] }) {
  const search = useDialogState();
  const cart = useDialogState();
  const menu = useDialogState();
  return (
    <>
      <SearchTrigger onOpen={search.openDialog} />
      <CartTrigger onOpen={cart.openDialog} products={cartProducts} />
      <button className={`${styles.iconButton} ${styles.mobileToggle}`} type="button" onClick={menu.openDialog} aria-label="Abrir menú"><MenuIcon /></button>
      <SearchPanel products={products} open={search.open} onClose={search.closeDialog} />
      <CartDrawer open={cart.open} onClose={cart.closeDialog} products={cartProducts} />
      <MobileMenu navItems={navItems} open={menu.open} onClose={menu.closeDialog} />
    </>
  );
}
