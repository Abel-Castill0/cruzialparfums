"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  countParfumsCart,
  PARFUMS_CART_UPDATED_EVENT,
  readParfumsCart,
} from "@/domains/carts/parfums-cart";
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
    const preferred =
      containerRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    preferred?.focus();
    return () => {
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

export function CartTrigger({ onOpen }: { onOpen: () => void }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(countParfumsCart(readParfumsCart(localStorage)));
    update();
    window.addEventListener("storage", update);
    window.addEventListener(PARFUMS_CART_UPDATED_EVENT, update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener(PARFUMS_CART_UPDATED_EVENT, update);
    };
  }, []);

  return (
    <button className={styles.iconButton} type="button" onClick={onOpen} aria-label={`Abrir carrito, ${count} ${count === 1 ? "producto" : "productos"}`} title="Carrito">
      <BagIcon />
      <span className={`${styles.cartCount} ${count > 0 ? styles.cartCountVisible : ""}`}>{count}</span>
    </button>
  );
}

function SearchPanel({ products, open, onClose }: { products: HeaderSearchProduct[]; open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeAndReset = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);
  useDialogAccessibility(open, closeAndReset, panelRef);

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es");
    if (!needle) return [];
    return products
      .filter((product) =>
        `${product.brand} ${product.name} ${product.notes.join(" ")} ${product.family}`
          .toLocaleLowerCase("es")
          .includes(needle),
      )
      .slice(0, 8);
  }, [products, query]);

  return (
    <div ref={panelRef} className={`${styles.searchPanel} ${open ? styles.panelOpen : ""}`} role="dialog" aria-modal="true" aria-label="Buscar fragancias" aria-hidden={!open}>
      <button type="button" className={styles.closePanel} onClick={closeAndReset} aria-label="Cerrar búsqueda">×</button>
      <div className={styles.searchInner}>
        <p className={styles.eyebrow}>Buscar en Cruzial</p>
        <input data-autofocus className={styles.searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca por marca, perfume o nota…" autoComplete="off" aria-label="Buscar fragancias" />
        <div className={styles.searchResults} aria-live="polite">
          {query && results.length === 0 ? <p>No encontramos coincidencias.</p> : null}
          {results.map((product) => (
            <Link key={product.slug} href={`/parfums/productos/${product.slug}` as Route} onClick={closeAndReset}>
              <span>{product.brand}</span>
              <strong>{product.name}</strong>
              {product.discontinued ? <small>Descontinuado</small> : null}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const drawerRef = useRef<HTMLElement>(null);
  useDialogAccessibility(open, onClose, drawerRef);
  return (
    <>
      <button type="button" aria-label="Cerrar carrito" className={`${styles.drawerOverlay} ${open ? styles.drawerOpen : ""}`} onClick={onClose} />
      <aside ref={drawerRef} className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`} aria-label="Carrito de compras" aria-modal="true" role="dialog" aria-hidden={!open}>
        <div className={styles.drawerHead}>
          <strong>Tu selección</strong>
          <button data-autofocus type="button" onClick={onClose} aria-label="Cerrar carrito">×</button>
        </div>
        <div className={styles.drawerEmpty}>
          <BagIcon size={28} />
          <strong>Tu selección está vacía</strong>
          <p>Añade una fragancia para comenzar.</p>
        </div>
        <div className={styles.drawerFoot}>
          <div><span>Total estimado</span><strong>S/ 0.00</strong></div>
          <Link href={"/parfums/checkout" as Route}>Ir al checkout <span aria-hidden="true">→</span></Link>
        </div>
      </aside>
    </>
  );
}

export function MobileMenu({ navItems, open, onClose }: { navItems: readonly NavItem[]; open: boolean; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(open, onClose, menuRef);
  return (
    <div ref={menuRef} className={`${styles.mobileMenu} ${open ? styles.menuOpen : ""}`} role="dialog" aria-label="Menú de navegación" aria-modal="true" aria-hidden={!open}>
      <button data-autofocus type="button" className={styles.closeMobile} onClick={onClose} aria-label="Cerrar menú">×</button>
      {navItems.map((item) => <Link key={item.href} href={item.href as Route} onClick={onClose}>{item.label}</Link>)}
      <div className={styles.menuSeparator} aria-hidden="true" />
      <Link href={"/parfums/nosotros" as Route} className={styles.menuSecondary} onClick={onClose}>Nosotros</Link>
      <Link href={"/parfums/contacto" as Route} className={styles.menuSecondary} onClick={onClose}>Contacto</Link>
      <small>CRUZIAL PARFUMS · LIMA / PERÚ</small>
    </div>
  );
}

export function HeaderActions({ products, navItems }: { products: HeaderSearchProduct[]; navItems: readonly NavItem[] }) {
  const search = useDialogState();
  const cart = useDialogState();
  const menu = useDialogState();
  return (
    <>
      <SearchTrigger onOpen={search.openDialog} />
      <CartTrigger onOpen={cart.openDialog} />
      <button className={`${styles.iconButton} ${styles.mobileToggle}`} type="button" onClick={menu.openDialog} aria-label="Abrir menú"><MenuIcon /></button>
      <SearchPanel products={products} open={search.open} onClose={search.closeDialog} />
      <CartDrawer open={cart.open} onClose={cart.closeDialog} />
      <MobileMenu navItems={navItems} open={menu.open} onClose={menu.closeDialog} />
    </>
  );
}
