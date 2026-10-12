import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Parfums shell and home behaviour: hero + header, the search dialog, the
// recommender (finder) open/close/complete flow, the cart drawer layering, and
// the Import TikTok module. Read-only: it never submits an order.

async function firstPurchasableCardAdd(page: Page) {
  await page.goto("/parfums/catalogo");
  const card = page
    .locator("[data-product-card]")
    .filter({ has: page.getByRole("button", { name: /^Añadir/ }) })
    .first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /^Añadir/ }).click();
  // The catalog hero hides the header (and its cart button) by design, and how far the click scrolls depends on image
  // layout: on a tall tablet it can stop with the hero still in view. Leave the hero explicitly, as accessibility.spec does.
  await page.evaluate(() => window.scrollTo(0, (document.querySelector("[data-home-hero]") as HTMLElement).offsetHeight + 100));
}

test.describe("parfums home hero and header", () => {
  test("the hero owns the first screen with one headline and two actions; the header appears after it", async ({ page }) => {
    await page.goto("/parfums");
    const hero = page.locator("[data-home-hero]");
    await expect(hero).toBeVisible();
    const artwork = hero.locator("img");
    await expect(artwork).toHaveCount(1);
    // Desktop art is the 21:9 crop; on phones a <source> swaps in the official logo (currentSrc), see hero-carousel.tsx.
    await expect(artwork).toHaveAttribute("src", /hero-wide-21x9\.webp/);

    const viewport = page.viewportSize()!;
    const box = (await hero.boundingBox())!;
    // Desktop: art + headline strip. Phones: a compact navy hero (45% / 42% of the screen) so the product carousel peeks.
    const phoneLayout = viewport.width < 768 || (viewport.width <= 1100 && viewport.height > viewport.width);
    expect(box.height).toBeGreaterThan(viewport.height * (phoneLayout ? 0.4 : 0.8));
    // One headline and two actions sit on the image; no other copy does.
    await expect(hero.getByRole("heading", { level: 1 })).toHaveText(/Perfumería de descubrimiento/);
    await expect(hero.locator("h2, h3, p")).toHaveCount(0);
    await expect(hero.getByRole("link", { name: "Explorar catálogo" })).toBeVisible();
    await expect(hero.getByRole("link", { name: "Arma tu combo" })).toBeVisible();

    const header = page.locator("header").first();
    await expect(header).toBeHidden();

    await page.evaluate(() => window.scrollTo(0, window.innerHeight + 300));
    await expect(header).toBeVisible();
  });

  // The headline must sit below the wordmark block (never over it), and the actions must be real 44px controls.
  test("hero headline stays below the artwork wordmark band and its actions are keyboard-reachable 44px controls", async ({ page }) => {
    await page.goto("/parfums");
    const hero = page.locator("[data-home-hero]");
    const heroBox = (await hero.boundingBox())!;
    const titleBox = (await hero.getByRole("heading", { level: 1 }).boundingBox())!;
    // The wordmark (baked in the desktop art, the official logo on phones) is the first block; the headline starts below it.
    const artBox = (await hero.locator("picture").boundingBox())!;
    expect(titleBox.y).toBeGreaterThanOrEqual(artBox.y + artBox.height - 2);
    expect(heroBox.y + heroBox.height).toBeGreaterThan(titleBox.y + titleBox.height);

    const primary = hero.getByRole("link", { name: "Explorar catálogo" });
    const secondary = hero.getByRole("link", { name: "Arma tu combo" });
    for (const link of [primary, secondary]) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    await primary.focus();
    await page.keyboard.press("Tab");
    await expect(secondary).toBeFocused();
    const ring = await secondary.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outline: parseFloat(style.outlineWidth), outlineStyle: style.outlineStyle, shadow: style.boxShadow };
    });
    expect(ring.outlineStyle !== "none" && ring.outline > 0 || ring.shadow !== "none").toBe(true);
  });

  // Hero F (docs/hero-variants.md): the phone hero is 45% of the screen (42% on short ones) precisely so the product carousel
  // peeks under it. Same three viewports the design was verified at. One engine is enough: the layout, not the browser, is
  // under test (Chromium resizes freely; the phone/tablet projects would repeat it).
  for (const [width, height] of [[375, 667], [360, 640], [320, 568]] as const) {
    test(`phone hero ${width}x${height}: the first carousel card peeks at least 40px above the fold`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "viewport is set explicitly; run once");
      await page.setViewportSize({ width, height });
      // Reveal slides content in 20px (translateY) when it scrolls into view; with reduced motion it sits at its layout position.
      // Measure the layout, not the animation frame the test happened to catch.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/parfums");
      const card = page.locator("[data-marquee-card]").first();
      await expect(card).toBeAttached();
      // Visible height of the card = viewport height minus the card's top edge (a card is taller than the peek, so its
      // bottom edge is below the fold by design). Measured from layout, not from a screenshot.
      const peek = await card.evaluate((element) => window.innerHeight - element.getBoundingClientRect().top);
      expect(peek, `first card visible px at ${width}x${height}`).toBeGreaterThanOrEqual(40);
      // The hero stays a compact panel: it must not creep back to a full-screen hero.
      const heroHeight = (await page.locator("[data-home-hero]").boundingBox())!.height;
      expect(heroHeight).toBeLessThanOrEqual(height * 0.5);
    });
  }

  test("hero logo: phones load the official logo.jpeg (byte-identical), desktop loads the 21:9 crop", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "viewport is set explicitly; run once");
    const heroImage = page.locator("[data-home-hero] img");

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/parfums");
    await expect.poll(() => heroImage.evaluate((image: HTMLImageElement) => image.currentSrc)).toContain("logo-official.jpeg");
    await expect(page.locator("[data-home-hero]")).toHaveCSS("background-color", "rgb(11, 31, 61)"); // --ds-color-navy

    // The file served is the brand's logo.jpeg untouched: no keying, no recompression.
    const served = await request.get("/parfums/hero/logo-official.jpeg");
    expect(served.ok()).toBe(true);
    const original = readFileSync(resolve(process.cwd(), "../../logo.jpeg"));
    expect(Buffer.compare(await served.body(), original), "logo-official.jpeg must equal the repo-root logo.jpeg").toBe(0);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/parfums");
    await expect.poll(() => heroImage.evaluate((image: HTMLImageElement) => image.currentSrc)).toContain("hero-wide-21x9");
  });

  // The hero image is the LCP element on every screen. F first shipped it through getImageProps, which defaults to
  // loading="lazy" and drops Next's preload: Lighthouse flagged "LCP lazy-loaded" (1.1s of load delay, 44% of the mobile LCP).
  test("hero LCP image is eager, high priority and preloaded once for the screen that shows it", async ({ page }) => {
    const heroRequests: string[] = [];
    page.on("request", (request) => {
      const url = decodeURIComponent(request.url());
      if (/hero-wide-21x9|logo-official/.test(url)) heroRequests.push(url);
    });
    await page.goto("/parfums");
    const image = page.locator("[data-home-hero] img");
    await expect(image).toHaveAttribute("loading", "eager");
    await expect(image).toHaveAttribute("fetchpriority", "high");
    await page.waitForLoadState("networkidle");

    // The preload scanner reads the server HTML, and React reconciles <head> links after hydration: assert on the HTML, not the live DOM.
    const html = await (await page.request.get("/parfums")).text();
    const state = await page.evaluate((serverHtml) => {
      const hero = document.querySelector("[data-home-hero] img") as HTMLImageElement;
      const links = [...new DOMParser().parseFromString(serverHtml, "text/html").querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]')];
      const pictureSource = document.querySelector<HTMLSourceElement>("[data-home-hero] picture source:not([media])");
      return {
        currentSrc: hero.currentSrc,
        desktopSourceSrcset: pictureSource?.getAttribute("srcset") ?? null,
        preloads: links.map((link) => ({
          media: link.getAttribute("media"),
          href: link.getAttribute("href"),
          srcset: link.getAttribute("imagesrcset"),
          sizes: link.getAttribute("imagesizes"),
          fetchPriority: link.getAttribute("fetchpriority"),
          appliesHere: link.media ? window.matchMedia(link.media).matches : true,
        })),
      };
    }, html);

    // One preload per screen class, each gated by a media query so a phone never downloads the desktop art (and vice versa).
    expect(state.preloads).toHaveLength(2);
    for (const link of state.preloads) {
      expect(link.media, "every hero preload carries a media query").toBeTruthy();
      expect(link.fetchPriority).toBe("high");
    }
    const applicable = state.preloads.filter((link) => link.appliesHere);
    expect(applicable, "exactly one preload applies to this viewport").toHaveLength(1);
    const [preload] = applicable;
    if (preload!.srcset) {
      // Desktop: same srcset and sizes as the <picture> source, so the browser picks the same candidate for both.
      expect(preload!.srcset).toBe(state.desktopSourceSrcset);
      expect(preload!.sizes).toBe("100vw");
      expect(state.currentSrc).toContain("hero-wide-21x9");
    } else {
      // Phones: the preload is the file the <img> ends up showing.
      expect(new URL(preload!.href!, page.url()).href).toBe(state.currentSrc);
      expect(state.currentSrc).toContain("logo-official.jpeg");
    }
    // The preload is consumed, not duplicated: the hero asset is requested exactly once.
    expect(heroRequests, heroRequests.join("\n")).toHaveLength(1);
  });

  test("the navigation stays hidden until the visitor leaves the hero", async ({ page }) => {
    await page.goto("/parfums");
    const hero = page.locator("[data-home-hero]");
    const height = (await hero.boundingBox())!.height;
    await expect(page.locator("header").first()).toBeHidden();
    await page.evaluate((y) => window.scrollTo(0, y), height + 100);
    await expect(page.locator("header").first()).toBeVisible();
  });

  test("the catalog hero also hides the header until the visitor scrolls past it", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    const hero = page.locator("[data-home-hero]");
    const height = (await hero.boundingBox())!.height;
    await expect(page.locator("header").first()).toBeHidden();
    await page.evaluate((y) => window.scrollTo(0, y), height + 100);
    await expect(page.locator("header").first()).toBeVisible();
  });
});

test.describe("parfums search", () => {
  test("opens over the whole viewport, takes focus and typing, finds products and closes with Escape", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    const catalogHero = page.locator("[data-home-hero]");
    const heroHeight = (await catalogHero.boundingBox())!.height;
    await page.evaluate((y) => window.scrollTo(0, y), heroHeight + 100);
    const trigger = page.getByRole("button", { name: "Buscar fragancias" }).first();
    await trigger.click();

    const panel = page.getByRole("dialog", { name: "Buscar fragancias" });
    await expect(panel).toBeVisible();
    const viewport = page.viewportSize()!;
    const box = (await panel.boundingBox())!;
    // Regression: a backdrop-filter on the header used to squash the dialog
    // to the header's height.
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);

    const input = panel.getByRole("searchbox");
    await expect(input).toBeFocused();
    await page.keyboard.type("zzzzzz");
    await expect(panel.getByText(/No encontramos coincidencias/)).toBeVisible();

    await input.fill("a");
    await expect(panel.locator("[data-search-result]").first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe("parfums recommender", () => {
  test("closing returns to the same page and position; completing hands over to the catalog", async ({ page }) => {
    await page.goto("/parfums/catalogo?type=arab");
    const opener = page.getByRole("link", { name: /Encontrar mi fragancia/ }).first();
    await opener.focus();
    await page.evaluate(() => window.scrollTo(0, 700));
    const before = await page.evaluate(() => window.scrollY);

    // Escape, the X and a click outside all go back where the visitor was.
    for (const close of [
      () => page.keyboard.press("Escape"),
      () => page.getByRole("button", { name: "Cerrar buscador de fragancias" }).last().click(),
      // Click outside: only where the panel leaves an outside (on a phone it
      // fills the screen, so there is nothing to click).
      async () => {
        const panelBox = await page.locator("[data-finder-panel]").boundingBox();
        if (panelBox && panelBox.x > 12) await page.mouse.click(4, Math.round(page.viewportSize()!.height / 2));
        else await page.keyboard.press("Escape");
      },
    ]) {
      await opener.press("Enter");
      // The modal is an intercepted route: on a cold server (empty image cache, parallel projects) the first soft
      // navigation can take longer than the 5s default. Same behaviour on master (1 of 3 cold runs).
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
      await close();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page).toHaveURL(/\/parfums\/catalogo\?type=arab$/);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 40);
      await expect(opener).toBeFocused();
    }

    // Completing keeps the filters and shows the recommendation.
    await opener.press("Enter");
    await page.getByRole("button", { name: /Para mí/ }).click();
    await page.getByRole("button", { name: /Siguiente/ }).click();
    await page.getByRole("button", { name: /Fresco/ }).first().click();
    await page.getByRole("button", { name: /Siguiente/ }).click();
    await page.getByRole("button", { name: /Siguiente/ }).click();
    await page.getByRole("button", { name: /Moderado/ }).click();
    await page.getByRole("button", { name: /Siguiente/ }).click();
    await page.getByRole("button", { name: /Ver mi selección/ }).click();

    await expect(page).toHaveURL(/type=arab/);
    await expect(page).toHaveURL(/rw=mi/);
    await expect(page.locator("#recomendacion")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a partial or forged recommendation in the URL is ignored", async ({ page }) => {
    await page.goto("/parfums/catalogo?rw=mi");
    await expect(page.locator("#recomendacion")).toHaveCount(0);
  });
});

test.describe("parfums cart drawer", () => {
  test("covers the viewport, shows the line and total, and a pending toast never sits over them", async ({ page }) => {
    await firstPurchasableCardAdd(page);
    await page.getByRole("button", { name: /Abrir carrito/ }).click();

    const drawer = page.locator("[data-cart-drawer]");
    await expect(drawer).toBeVisible();
    const viewport = page.viewportSize()!;
    const box = (await drawer.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);

    const checkout = drawer.getByRole("link", { name: /Revisar y continuar/ });
    await expect(checkout).toBeVisible();
    // Poll: the drawer slides in, so the hit test is only meaningful once it
    // has settled in place.
    await expect
      .poll(() =>
        checkout.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return element.contains(hit);
        }),
      )
      .toBe(true);

    // No horizontal overflow inside a cart line, even at 320px.
    const overflow = await drawer.locator("[data-cart-line]").first().evaluate((line) => line.scrollWidth - line.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("import TikTok module", () => {
  test("loads the Import consolidado video only after play, with an accessible link", async ({ page }) => {
    await page.goto("/import");
    const section = page.locator("section", { has: page.locator("#home-video-title") });
    await expect(section).toBeVisible();
    await expect(section.getByRole("link", { name: /Ver en TikTok/ })).toHaveAttribute(
      "href",
      "https://www.tiktok.com/@cruzialperu/video/7657015388252720402",
    );
    await expect(section.locator("iframe")).toHaveCount(0);
    await section.getByRole("button", { name: /Reproducir video/ }).click();
    await expect(section.locator("iframe")).toHaveAttribute(
      "src",
      /^https:\/\/www\.tiktok\.com\/player\/v1\/7657015388252720402/,
    );
  });

  test("the CSP frames TikTok and nothing else", async ({ request }) => {
    const response = await request.get("/import");
    const csp = response.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("frame-src 'self' https://www.tiktok.com");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

test.describe("browser console hygiene", () => {
  // A preloaded stylesheet nobody uses ("preloaded using link preload but not used") and an unknown Permissions-Policy
  // feature both log to the console on every visit. Next preloads the root not-found boundary's CSS on each route, so that
  // CSS lives in globals.css, and interest-cohort (FLoC, removed from browsers) is not in the header any more.
  for (const path of ["/parfums", "/parfums/catalogo"]) {
    test(`${path} logs no preload or Permissions-Policy warnings`, async ({ page }) => {
      // The dev server emits one CSS chunk per module and preloads those it does not render yet; only the production build is meaningful here.
      test.skip(process.env.E2E_SERVER === "dev", "dev-server chunking preloads per-module CSS");
      const noisy: string[] = [];
      page.on("console", (message) => {
        if (["warning", "error"].includes(message.type()) && /preload|Permissions-Policy/i.test(message.text())) noisy.push(message.text());
      });
      const response = await page.goto(path);
      expect(response?.headers()["permissions-policy"] ?? "").not.toContain("interest-cohort");
      await page.waitForLoadState("networkidle");
      // The "not used" warning fires a few seconds after the load event.
      await page.waitForTimeout(4000);
      expect(noisy, noisy.join("\n")).toEqual([]);
    });
  }
});
