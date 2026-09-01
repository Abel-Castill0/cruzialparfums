# Responsive closure — progress

DONE (verified live, not assumed):
- Header SVG icons unified across all 10 real pages (parity script: .claude/scripts/check_header_parity.py, auto-discovers *.html)
- Mobile menu: dark (ink-deep), full-viewport (no gutters), no redundant logo, root-cause duplicate local override removed
- .product-grid: one XS/MOBILE/TABLET/DESKTOP breakpoint ladder (see assets/styles.css RESPONSIVE block), duplicate local overrides in index.html/catalog.html removed
- Card whitespace bug: align-items:start (was default stretch), price white-space:nowrap
- Home "Los Más Deseados": mobile rail / tablet 2-col / desktop featured composition (3 real buckets)
- Mayorista: table -> mobile cards via CSS + data-label (desktop keeps real <table>)
- Combo Builder P1: root cause was inline style="grid-template-columns:1.5fr 1fr" etc. in combos.html beating every media query regardless of viewport. Inline styles removed; responsive rules now actually apply. Verified @700px: 1 column, summary CTA fully visible.
- Combo Builder: sticky mobile CTA bar (#cb-sticky-bar), syncs from real state (no duplicated calc), WA float auto-hides via IntersectionObserver while bar is in view
- Hero mobile: single CTA only (secondary hidden <=767px) on all slides
- WhatsApp hidden from header <=767px (still floats)
- Back-to-top hidden <=640px
- Hero autoplay: 5000ms desktop, no autoplay on coarse pointer

TODO (explicitly not done, be honest if asked):
- Nosotros: photo framing / composition pass never done
- Contacto / Checkout / legal pages: no dedicated responsive QA pass, only inherited shared-CSS fixes
- Card optical-scale outliers (212 EDT / Eros EDT / Eros Flame etc.) not audited
- No automated multi-viewport audit script exists (Playwright unavailable, no network to install; did not try system Chrome/Edge executablePath route)
- Full 320-2560px matrix not run; verification was targeted (390/700/900/desktop spot checks)
- Accessibility smoke (focus trap, Escape, keyboard) not explicitly tested this round
- No production deploy / push yet

BLOCKED:
- Firefox/WebKit unavailable (Playwright install needs network)

Last commits this phase: see `git log --oneline -8`.
