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
}

test.describe("parfums home hero and header", () => {
  test("the hero owns the first screen with one hidden headline and one visible action; the header appears after it", async ({ page }) => {
    await page.goto("/parfums");
    const hero = page.locator("[data-home-hero]");
    await expect(hero).toBeVisible();
    const artwork = hero.locator("picture img");
    await expect(artwork).toHaveCount(1);
    const viewport = page.viewportSize()!;
    const box = (await hero.boundingBox())!;
    // Desktop (768px and up): the 21:9 crop + button strip. Phones: the 3:2 crop + button, ~40% of the screen so the product carousel peeks.
    const phoneLayout = viewport.width < 768;
    await expect.poll(() => artwork.evaluate((image: HTMLImageElement) => image.currentSrc)).toContain(phoneLayout ? "hero-mobile-3x2" : "hero-wide-21x9");
    // A portrait tablet (>= 768px wide) gets the 21:9 crop, which is short on a tall screen.
    const portrait = viewport.height > viewport.width;
    expect(box.height).toBeGreaterThan(viewport.height * (phoneLayout || portrait ? 0.3 : 0.8));
    // The h1 is always in the DOM (screen readers, search engines); no other copy sits in the hero.
    await expect(hero.getByRole("heading", { level: 1 })).toHaveText(/Perfumería de descubrimiento/);
    await expect(hero.locator("h2, h3, p")).toHaveCount(0);
    await expect(hero.getByRole("link", { name: "Explorar catálogo" })).toBeVisible();
    // Both layouts: no drawn text, one action. The h1 is a 1px visually hidden element.
    const title = (await hero.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(Math.max(title.width, title.height), "h1 is visually hidden (1px), not drawn").toBeLessThanOrEqual(1);
    await expect(hero.getByRole("link")).toHaveCount(1);

    const header = page.locator("header").first();
    await expect(header).toBeHidden();

    await page.evaluate(() => window.scrollTo(0, window.innerHeight + 300));
    await expect(header).toBeVisible();
  });

  // Both screens: "Explorar catálogo" is the only visible element under the art, centered, a real 44px control, never over the art.
  // Desktop also has even space above and below it in its strip.
  test("hero action is a keyboard-reachable 44px control centered under the art", async ({ page }) => {
    // The hero copy rises 20px on entry; measure the layout, not the animation frame the test happened to catch.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/parfums");
    const hero = page.locator("[data-home-hero]");
    const viewport = page.viewportSize()!;
    const heroBox = (await hero.boundingBox())!;
    const artBox = (await hero.locator("picture").boundingBox())!;
    const primary = hero.getByRole("link", { name: "Explorar catálogo" });
    const button = (await primary.boundingBox())!;
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(button.x + button.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
    // Under the art (never over the monogram and wordmark), inside the hero.
    expect(button.y).toBeGreaterThanOrEqual(artBox.y + artBox.height - 2);
    expect(button.y + button.height).toBeLessThanOrEqual(heroBox.y + heroBox.height + 1);
    await primary.focus();
    await expect(primary).toBeFocused();
    if (viewport.width >= 768) {
      const above = button.y - (artBox.y + artBox.height);
      const below = heroBox.y + heroBox.height - (button.y + button.height);
      expect(Math.abs(above - below), `space above ${above}px vs below ${below}px`).toBeLessThanOrEqual(4);
    }
  });

  // Phone hero (docs/hero-variants.md section 15): the art is capped at a third of the screen so the product carousel
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

  test("hero art: phones load the 3:2 crop, 768px and up the 21:9 crop (both pure crops of the original)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "viewport is set explicitly; run once");
    const heroImage = page.locator("[data-home-hero] picture img");

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/parfums");
    await expect.poll(() => heroImage.evaluate((image: HTMLImageElement) => image.currentSrc)).toContain("hero-mobile-3x2");

    await page.setViewportSize({ width: 767, height: 900 });
    await page.goto("/parfums");
    await expect.poll(() => heroImage.evaluate((image: HTMLImageElement) => image.currentSrc)).toContain("hero-mobile-3x2");

    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/parfums");
    await expect.poll(() => heroImage.evaluate((image: HTMLImageElement) => image.currentSrc)).toContain("hero-wide-21x9");
  });

  // The hero image is the LCP element on every screen. F first shipped it through getImageProps, which defaults to
  // loading="lazy" and drops Next's preload: Lighthouse flagged "LCP lazy-loaded" (1.1s of load delay, 44% of the mobile LCP).
  test("hero LCP image is eager, high priority and preloaded once for the screen that shows it", async ({ page }) => {
    const heroRequests: string[] = [];
    page.on("request", (request) => {
      const url = decodeURIComponent(request.url());
      if (/hero-wide-21x9|hero-mobile-3x2/.test(url)) heroRequests.push(url);
    });
    await page.goto("/parfums");
    const image = page.locator("[data-home-hero] picture img");
    await expect(image).toHaveAttribute("loading", "eager");
    await expect(image).toHaveAttribute("fetchpriority", "high");
    await page.waitForLoadState("networkidle");

    // The preload scanner reads the server HTML, and React reconciles <head> links after hydration: assert on the HTML, not the live DOM.
    const html = await (await page.request.get("/parfums")).text();
    const state = await page.evaluate((serverHtml) => {
      const hero = document.querySelector("[data-home-hero] picture img") as HTMLImageElement;
      const links = [...new DOMParser().parseFromString(serverHtml, "text/html").querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]')];
      const pictureSource = document.querySelector<HTMLSourceElement>("[data-home-hero] picture source[media]");
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
    expect(preload!.sizes).toBe("100vw");
    if (page.viewportSize()!.width >= 768) {
      // Desktop: same srcset and sizes as the <picture> source, so the browser picks the same candidate for both.
      expect(preload!.srcset).toBe(state.desktopSourceSrcset);
      expect(state.currentSrc).toContain("hero-wide-21x9");
    } else {
      // Phones: the preload names the srcset of the <img> the browser ends up showing.
      expect(preload!.srcset).toContain("hero-mobile-3x2");
      expect(state.currentSrc).toContain("hero-mobile-3x2");
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

  test("the catalog has no hero, so the header is there from the first screen", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    await expect(page.locator("[data-home-hero]")).toHaveCount(0);
    await expect(page.locator("header").first()).toBeVisible();
  });
});

test.describe("parfums search", () => {
  test("opens over the whole viewport, takes focus and typing, finds products and closes with Escape", async ({ page }) => {
    await page.goto("/parfums/catalogo");
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
    // The catalog no longer has a hero button: the recommender opens from the closing band ("¿No encuentras tu fragancia?").
    const opener = page.getByRole("link", { name: /Usar el Finder/ }).first();
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

  // The TikTok player asks for accelerometer/gyroscope and playback features; without them in `allow` the browser logs
  // "Permissions policy violation: accelerometer is not allowed in this document" and may refuse playback.
  test("the Parfums TikTok iframe is created on play, also after a client-side navigation, with the permissions the player asks for", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    // Take the brand link back to /parfums (a client-side navigation).
    await page.locator('header a[href="/parfums"]').first().click();
    await page.waitForURL("**/parfums");
    const section = page.locator("[data-home-video]");
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator("iframe")).toHaveCount(0);
    await section.getByRole("button", { name: /Reproducir video/ }).click();
    const frame = section.locator("iframe[data-tiktok-player]");
    await expect(frame).toHaveAttribute("src", /^https:\/\/www\.tiktok\.com\/player\/v1\/\d+/);
    const allow = (await frame.getAttribute("allow")) ?? "";
    for (const feature of ["autoplay", "fullscreen", "encrypted-media", "picture-in-picture", "accelerometer", "gyroscope"]) {
      expect(allow, `allow has ${feature}`).toContain(feature);
    }
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
