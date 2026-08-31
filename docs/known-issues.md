# Known issues / historical incidents

Detailed narrative for incidents referenced compactly in `CLAUDE.md`. Read
this when you need the full story; `CLAUDE.md` only carries the actionable
rule each one produced.

## Parallel local `<style>` blocks vs. shared `assets/styles.css`

`index.html`, `catalog.html`, and `mayorista.html` historically embedded
large local `<style>` blocks duplicating parts of the shared design system
instead of using it directly. This caused several real, shipped bugs before
anyone noticed, because the CSS *looked* correct on inspection:

- **`.active` vs `.open` (fixed 2026-08-30):** `app.js`/`finder.js` toggle a
  `.open` class to show `.search-panel`, `.mobile-menu`, `.finder-modal`, and
  `.drawer`. The local style blocks on these three pages were written
  expecting `.active` instead — silently making mobile menu and search
  completely non-functional, despite the `position:sticky`-style CSS looking
  correct at a glance.
- **Partial overrides leaking properties:** when a local block redefines
  *some* properties of a shared class but not others, the un-overridden
  properties still apply from `assets/styles.css` and can surprise you. A
  stray `background`/`padding` on `.hero-copy`, `.brand-mark`, and
  `.wholesale-filters` caused three separate visual bugs this way, each
  looking unrelated to the actual cause until traced back to the shared rule.
- **Header/nav divergence (fixed 2026-08-30, later round):** `index.html`
  and `catalog.html`'s local header CSS set a fixed 72px height with no
  glass-blur/scroll-shrink behavior (the shared header does both), used
  `z-index:100` vs. the shared `z-index:50` (which broke Finder modal
  stacking on those two pages until the shared Finder z-index was bumped to
  250), and never defined `.cart-count.show`, so the cart badge showed "0"
  even when empty. `mayorista.html` additionally had stale header *markup*
  (text-glyph icons `⌕`/`◈` instead of the shared SVGs, missing
  `id="site-header"`). All three now inherit the shared header with zero
  local override — the general rule (below) held on the second incident too.

**The rule this produces (kept in `CLAUDE.md`):** before touching a local
`<style>` block on these pages, check what it does *and doesn't* override
against `assets/styles.css`. When a section's local override no longer adds
anything a shared rule doesn't already provide, delete it — that's the actual
fix, not patching the symptom.

Unifying whatever *remains* of these two parallel systems (hero, filter-bar,
and other section-specific local styles not yet audited) is still open,
unscheduled work.

- **Two `.btn` systems, confirmed still live (found in a V8 audit pass,
  2026-08-31, not yet fixed):** `assets/styles.css` defines the shared
  button system (`.btn-primary`/`.btn-outline`/`.btn-ghost`, sharp corners
  `border-radius:0`, 17px/34px padding, 11px font, `.28em`/3.08px letter-
  spacing, uppercase) and is what every page renders EXCEPT `index.html`
  and `catalog.html`, which carry a second, independent local `.btn` block
  (`.btn-dark`/`.btn-outline`/`.btn-gold`, rounded `8px` corners, 14px/32px
  padding, 14px font, 0.5px letter-spacing). Confirmed via
  `getComputedStyle` on a live button on each: home/catalog buttons are
  visibly rounded-pill with tight tracking; every other page's buttons
  (product, checkout, combos, mayorista, nosotros, contacto, legal pages,
  404) are sharp-cornered with dramatic small-caps tracking. Same collision
  class name (`.btn-outline`) resolves to two different visual results
  depending only on which page you're on. Not fixed in this pass because a
  sitewide merge changes CTA appearance everywhere and needs a full visual
  smoke test across every page before shipping — flagged here instead of
  rushed, per the standing rule above (fix the actual duplication, don't
  patch around it) and the project's own "no cambio sin revisar coherencia
  global" instruction for this phase. Next time either component system is
  touched, resolve this by deleting the local override and adopting the
  shared system (the established pattern for every prior incident above),
  not the reverse.
