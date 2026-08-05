// Shared helpers for walking the Instagram profile grid and fetching image
// bytes through an authenticated Playwright context.

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(minMs, maxMs) {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

export async function collectGridPosts(page, limit) {
  const seen = new Map(); // href -> { href, thumbnail, alt, type }
  let stagnantRounds = 0;

  while (seen.size < limit && stagnantRounds < 4) {
    const batch = await page.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll('article a[href*="/p/"], article a[href*="/reel/"]')
      );
      return anchors.map((a) => {
        const img = a.querySelector("img");
        const hasVideoIcon = !!a.querySelector(
          'svg[aria-label="Clip"], svg[aria-label="Reel"], svg[aria-label="Video"]'
        );
        const hasCarouselIcon = !!a.querySelector('svg[aria-label="Carousel"]');
        let type = "image";
        if (a.href.includes("/reel/") || hasVideoIcon) type = "reel";
        else if (hasCarouselIcon) type = "carousel";
        return {
          href: a.href,
          thumbnail: img ? img.src : null,
          alt: img ? img.alt : "",
          type,
        };
      });
    });

    const before = seen.size;
    for (const post of batch) {
      if (post.href && !seen.has(post.href)) {
        seen.set(post.href, post);
      }
    }

    if (seen.size === before) {
      stagnantRounds += 1;
    } else {
      stagnantRounds = 0;
    }

    if (seen.size >= limit) break;

    await page.mouse.wheel(0, 1800);
    await randomDelay(1200, 2600);
  }

  return Array.from(seen.values()).slice(0, limit);
}

export async function fetchImageBuffer(page, url) {
  const response = await page.context().request.get(url);
  return response.body();
}
