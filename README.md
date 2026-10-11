# GitHub Pages: redirect-only

Since 2026-10-11 GitHub Pages publishes this branch (`pages-redirect`) instead of the root of `master`.
Every old address of the legacy storefront (`abel-castill0.github.io/cruzialparfums/<page>?<query>`) is sent to
`https://cruzial.pe/<page>?<query>`, where the V2 app maps legacy pages and product ids to their current URLs
(apps/web/src/domains/routing/legacy-route-resolver.ts). The old storefront, its prices and its contact number are no
longer published. The legacy files are untouched on `master` and in its history.

Restore the old publication (not recommended): Settings → Pages → Source: branch `master`, folder `/ (root)`, or
`gh api -X PUT repos/Abel-Castill0/cruzialparfums/pages -f "source[branch]=master" -f "source[path]=/"`.
Unpublish completely: Settings → Pages → Unpublish site.
