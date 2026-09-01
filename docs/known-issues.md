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

- **14 products still on pre-migration photography (confirmed
  programmatically, 2026-09-01, NOT a CSS/display bug — a real content
  gap).** `assets/data.js`'s `IMG_MAP` has 190 image path references; 160
  point at the canonical `img/perfumes/webp/` set (white background,
  confirmed via corner-pixel sampling: 255,255,255), but 28 paths (14
  products × 2 images) still point directly at `img/perfumes/*.png` —
  sampled corners on those come back `(166,166,166)`, a visibly gray
  studio background, not the new white one. Checked programmatically
  (path extraction + `os.path.exists` + corner-pixel sampling across all
  190 refs, not a manual scan) and confirmed none of the 14 have a
  matching file anywhere in `img/perfumes/webp/` under any plausible name
  — this isn't a migration-script bug that skipped them, it's that no new
  photo was ever provided for these 14, same situation as the already-
  documented `sceptre-malachite` exception in `CLAUDE.md`, just a bigger
  list. Do NOT paper over this with CSS (background-color tricks, filters
  to fake white) — these products need real replacement photography from
  the client before they'll look consistent with the rest of the catalog.
  The 14: `yara-pink`, `eclaire`, `yum-yum`, `angham`, `mayar`,
  `hawas-elixir`, `hawas-tropical`, `hawas-chrome`, `vulcan-feu`,
  `jean-lowe-vibe`, `jean-lowe-inmotel`, `rayhaan-italia`,
  `swy-absolutely`, `adg-profondo-edp`.
  Re-verified independently on 2026-08-31 with a second, from-scratch
  script (`.claude/scripts/audit_image_backgrounds.py`, corner+edge
  luminance sampling, not a repeat of the same code) against the same
  188-path `IMG_MAP` — identical 14 products, identical conclusion. Also
  cross-checked `git log --follow` on a few of the flagged files (e.g.
  `Lattafa Mayar.png`, `LATTAFA - YARA PINK.png`): both trace to the
  2026-08-30 "real background removal on 194 product photos" commit — the
  flood-fill round `CLAUDE.md` already documents as damaging — with no
  later commit replacing them, confirming this is a genuine unresolved
  content gap, not an incomplete search of `img/perfumes/`.
  Went one step further on 2026-08-31 with
  `.claude/scripts/find_missing_photo_candidates.py`: walked the entire
  filesystem under `img/` (not `IMG_MAP`, not `git status`, not any single
  folder) — 365 image files total, tracked and untracked, every
  extension. Excluded the 188 already claimed by some product in
  `IMG_MAP`, leaving 177 unclaimed candidates, then fuzzy-matched each of
  the 14 missing products' brand+name against all 177. Nothing scored as
  a real match — every top hit is a same-brand sibling product that's
  already correctly claimed elsewhere (e.g. `yara-pink`'s best "match" is
  `LATTAFA - YARA ELIXIR.png`, a different fragrance, already
  `yara-elixir`'s own photo). Also confirmed no image directory exists
  outside `img/` at all (repo root has only `logo.jpeg`). This is as
  exhaustive as a filesystem search gets: the 14 replacement photos the
  client believes were uploaded are not present anywhere in the project
  under any name. Next step is a real photo from the client, not more
  searching.

## Stale `.hero::before` scrim silently washing out the full-bleed hero (fixed 2026-08-31)

`assets/styles.css` still carried `.hero::before` — a
`linear-gradient(90deg, rgba(255,255,255,.55) 0%, ... .12% 100%)` white
scrim, `position:absolute;inset:0` — built for an *earlier* hero layout
where `.hero-copy` (a white text card, still in the shared stylesheet,
now unused anywhere) sat on the left third of the photo and needed help
staying legible. When the hero was rebuilt as a full-bleed, text-free
photo (`<section class="hero"></section>`, CTAs moved to the separate
`.hero-cta-bar` below), nothing removed the old scrim — it kept painting
a 55%-opacity-on-the-left-fading-to-12%-on-the-right white haze directly
over the new photo, on every load, because `.hero::before` has no gating
class and index.html's local `<style>` block never mentioned `::before`.
Confirmed with evidence, not assumption, per the standing rule of
diffing local overrides against the shared file before touching them:
compared `img/hero/hero-crop.jpg` RAW (deep, high-contrast, no haze) against
the live render (visibly washed, worse on the left — exactly matching the
gradient's own 55%→12% left-to-right falloff) before concluding it was
CSS and not the source photo. Fix: deleted the `.hero::before` rule.
`.hero-copy`/`.hero-inner` are dead in the same way (no page references
them) but left alone in this change — cleanup, not a visual bug, and out
of scope for this fix.
