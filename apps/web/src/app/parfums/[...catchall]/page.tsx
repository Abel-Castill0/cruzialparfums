import { notFound } from "next/navigation";

// Next.js's automatic 404 handling for a genuinely unmatched URL always
// renders the ROOT app/not-found.tsx (documented: "the root app/not-found.js
// ... handle[s] any unmatched URLs for your whole application") — it does
// NOT walk down to app/parfums/not-found.tsx on its own. That dedicated
// Parfums 404 (with its own copy, catalog/home CTAs and institutional
// styling) only renders when something inside a matched /parfums/* segment
// throws notFound(). This catch-all is that trigger: it matches every
// /parfums/* path that isn't one of the real routes above, renders inside
// parfums/layout.tsx (so header/footer/announcement/WhatsApp float are
// still present, unlike the bare root 404), and immediately calls
// notFound() so the nearest boundary — app/parfums/not-found.tsx — renders
// instead of the generic root one.
export default function ParfumsCatchAll() {
  notFound();
}
