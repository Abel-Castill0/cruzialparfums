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

- **Two `.btn` systems (FIXED, 2026-08-31, same day as the finding
  above):** `assets/styles.css` had the shared button system
  (`.btn-primary`/`.btn-outline`/`.btn-ghost`, sharp corners, 17px/34px
  padding, 11px font, `.28em` tracking, uppercase); `index.html` and
  `catalog.html` carried an independent local `.btn` block
  (`.btn-dark`/`.btn-outline`/`.btn-gold`, rounded 8px corners, 14px/32px
  padding, 0.5px tracking) that every other page never had. Consolidated:
  local blocks deleted, `.btn-dark` usages renamed to `.btn-primary`,
  `.btn-gold` added properly to the shared system. Verified via
  `getComputedStyle` across all 12 HTML pages. Fusing it surfaced two real
  bugs the duplication had been hiding, not just a cosmetic mismatch:
  1. `product.html` has no local `<style>` block at all, so its cart-drawer
     "Ir al checkout" link (`class="btn btn-dark"`) had never had a
     background or text color — invisible on white.
  2. `assets/styles.css` still had `.newsletter button{padding:0 28px;...}`
     orphaned from the newsletter form removed rounds ago (see "No
     newsletter form" in `CLAUDE.md`). By tag-selector specificity it beat
     the new `.btn-gold` and crushed the Finder-invite button to 15px tall.
  Both fixed alongside the merge.

- **Same parallel-system pattern, found again in a systematic component
  audit (2026-08-31): `.pill`.** `combos.html`'s 3/5/10ml selector already
  used the shared `.pill`/`.pill.active` (uppercase, wide tracking, 100px
  radius). `index.html`'s "Todos/Mujer/Hombre/Unisex/Nicho" mood filter
  had its own local `.pill`/`.pill.active` (normal case, tighter tracking,
  different padding) — same class name, two different-looking components
  a few clicks apart. Fixed the same way: local override deleted. Also
  removed a confirmed-dead `.drawer.active` rule in both files (`initDrawer()`
  in `app.js` only ever toggles `.open`, never `.active` — `.drawer.open`
  in the shared stylesheet is what actually opens the cart drawer on every
  page, including these two; `.drawer.active` never fired). Checked
  `.overlay.active` before touching anything near it: that one IS live
  (`initSearch()` toggles it on the search-panel overlay), left alone.
  Audited the same way and found no collision: `.badge-*` (index-only, no
  shared equivalent), form `<input>`/`<select>` (no `.input`/`.select`
  component class exists anywhere to collide with). `.container`,
  `.drawer`, `.mobile-menu`, `.wa-float`, `.back-to-top`, `.search-input`
  are duplicated word-for-word between `index.html`/`catalog.html` (harmless
  DRY violation, not a visual bug — flagged here as a known "copy exists in
  two places" spot, not urgent) rather than genuinely conflicting.
