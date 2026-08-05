// Opens a single carousel post and walks through every slide, collecting
// each slide's full-size image URL in order.
//
// This is the most fragile part of the whole tool: Instagram's post-modal
// markup isn't a stable public API, so the selectors below are best-effort
// and will likely need small updates over time (see README).

import { randomDelay } from "./grid.js";

export async function extractCarouselSlides(page, postUrl) {
  await page.goto(postUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("article img", { timeout: 15000 });

  const slides = [];
  const seenSrcs = new Set();

  const captureCurrent = async () => {
    const src = await page.evaluate(() => {
      const imgs = Array.from(
        document.querySelectorAll('article ul li img, article div[role="button"] img')
      );
      const visible = imgs.find((img) => {
        const rect = img.getBoundingClientRect();
        return rect.width > 200 && img.closest('[aria-hidden="true"]') === null;
      });
      return (visible || imgs[0])?.src ?? null;
    });
    if (src && !seenSrcs.has(src)) {
      seenSrcs.add(src);
      slides.push(src);
    }
  };

  await captureCurrent();

  for (let i = 0; i < 20; i++) {
    const nextButton = page.locator('button[aria-label="Next"]').first();
    const isVisible = await nextButton.isVisible().catch(() => false);
    if (!isVisible) break;
    await nextButton.click();
    await randomDelay(400, 800);
    await captureCurrent();
  }

  return slides;
}
