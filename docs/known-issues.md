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
