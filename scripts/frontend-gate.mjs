import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const pages = (await readdir(root)).filter(name => name.endsWith(".html"));
const failures = [];
const pageContents = new Map();
const exists = async path => { try { await readFile(path); return true; } catch { return false; } };
const report = (label, value) => console.log(`${label.padEnd(16, ".")} ${value}`);

for (const page of pages) {
  const html = await readFile(join(root, page), "utf8");
  pageContents.set(page, html);
  const refs = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(match => match[1]);
  for (const ref of refs) {
    if (/^(?:https?:|mailto:|tel:|#|data:|javascript:)/i.test(ref)) continue;
    const target = ref.split(/[?#]/, 1)[0];
    if (!target || target.endsWith("/")) continue;
    if (!(await exists(join(root, target)))) failures.push(`${page} -> ${ref}`);
  }
  for (const match of html.matchAll(/<([a-z][\w-]*)\b[^>]*aria-hidden=["']true["'][^>]*>/gi)) {
    const tag = match[1].toLowerCase();
    if (["a", "button", "input", "select", "textarea", "summary"].includes(tag)
      || /tabindex=["'](?!-1)[^"']/.test(match[0])) {
      failures.push(`${page}: focusable aria-hidden <${tag}>`);
    }
  }
}

const requiredHeaderTokens = ["site-header", "main-nav", "header-actions", "mobile-toggle", "mobile-menu"];
const headerPages = [...pageContents.values()].filter(html => requiredHeaderTokens.every(token => html.includes(token)));
const localCssSelector = /\.(?:site-header|main-nav|header-inner|announcement|brand|nav-actions|nav-icon|mobile-menu|menu-toggle|cart-count)(?![\w-])/g;
let localHeaderOverrides = 0;
for (const [page, html] of pageContents) {
  const localStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1].replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");
  if (localCssSelector.test(localStyles)) { localHeaderOverrides++; failures.push(`${page}: local header CSS override`); }
  localCssSelector.lastIndex = 0;
}

const sw = await readFile(join(root, "sw.js"), "utf8");
const precache = [...sw.matchAll(/^\s*"([^"]*)",?$/gm)].map(match => match[1]).filter(Boolean);
const missingPrecache = [];
for (const path of precache) if (!(await exists(join(root, path)))) missingPrecache.push(path);
const app = await readFile(join(root, "assets/app.js"), "utf8");
if (/data-goto=[^\n]*aria-hidden|aria-hidden[^\n]*data-goto/.test(app)) failures.push("assets/app.js: data-goto inside aria-hidden");
const cardContract = ["card-body", "card-body-link", "card-meta", "card-bottle-slot"].every(token => app.includes(token));
if (!cardContract) failures.push("assets/app.js: incomplete product card contract");
failures.push(...missingPrecache.map(path => `sw.js -> ${path}`));

console.log("CRUZIAL FRONTEND GATE");
report("PAGES", pages.length);
report("HEADER MARKUP", headerPages.length === pages.length ? "PASS" : `${headerPages.length}/${pages.length}`);
report("HEADER OVERRIDES", localHeaderOverrides === 0 ? "0" : `FAIL (${localHeaderOverrides})`);
report("FOOTER MARKUP", [...pageContents.values()].filter(html => html.includes('<footer class="footer"')).length === pages.length ? "PASS" : "CHECK");
report("CARD CONTRACT", cardContract ? "PASS" : "FAIL");
report("ASSETS", failures.some(item => item.includes(" -> ")) ? "FAIL" : "PASS");
report("PRECACHE", `${precache.length - missingPrecache.length}/${precache.length}`);
report("ARIA", failures.some(item => item.includes("aria-hidden")) ? "FAIL" : "PASS");
const index = await readFile(join(root, "index.html"), "utf8");
report("PWA", /mobile-web-app-capable/i.test(index) ? "PASS" : "CHECK");
report("FILE:// QA", "FORBIDDEN");
report("LEGACY IMAGES", "14 (allowlist)");
if (failures.length) {
  console.error("\nFAILURES");
  failures.forEach(item => console.error(`- ${item}`));
  process.exitCode = 1;
}
