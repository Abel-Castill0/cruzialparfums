import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium, devices } = createRequire("file:///C:/dev/cruzialparfums/apps/web/package.json")("playwright");
// usage: node perf.mjs <base> <label> <runs> <out.json> <path...>
const [, , base, label, runsArg, out, ...paths] = process.argv;
const runs = Number(runsArg);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const browser = await chromium.launch();
const results = {};
for (const path of paths) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.newContext({ ...devices["Pixel 7"] });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Performance.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const types = {}; const reqs = new Map();
    cdp.on("Network.responseReceived", (e) => reqs.set(e.requestId, e.type));
    cdp.on("Network.loadingFinished", (e) => { const t = reqs.get(e.requestId) ?? "Other"; types[t] = (types[t] ?? 0) + e.encodedDataLength; });
    await page.addInitScript(() => {
      window.__m = { lcp: 0, tbt: 0, fcp: 0 };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__m.fcp = e.startTime; }).observe({ type: "paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.tbt += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true });
    });
    await page.goto(base + "/" + path.replace(/^\/+/, ""), { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(4000);
    const m = await page.evaluate(() => {
      const flight = [...document.scripts].map((s) => s.textContent ?? "").filter((t) => t.includes("__next_f")).reduce((n, t) => n + t.length, 0);
      return { ...window.__m, flightChars: flight, htmlChars: document.documentElement.outerHTML.length, cards: document.querySelectorAll("[data-product-card]").length, imgs: document.images.length, nodes: document.getElementsByTagName("*").length };
    });
    const perf = await cdp.send("Performance.getMetrics");
    const heap = perf.metrics.find((x) => x.name === "JSHeapUsedSize")?.value ?? 0;
    samples.push({ ...m, heapMB: heap / 1048576, docKB: (types.Document ?? 0) / 1024, scriptKB: (types.Script ?? 0) / 1024, imageKB: (types.Image ?? 0) / 1024, totalKB: Object.values(types).reduce((a, b) => a + b, 0) / 1024 });
    await ctx.close();
  }
  const keys = Object.keys(samples[0]);
  results[path] = Object.fromEntries(keys.map((k) => [k, Math.round(median(samples.map((s) => s[k])) * 10) / 10]));
}
await browser.close();
writeFileSync(out, JSON.stringify({ label, runs, results }, null, 1));
console.log(label, JSON.stringify(results, null, 1));
