// Walks your own Instagram profile grid (using the session saved by
// `npm run login`) and exports, in current grid order:
//   - a downloaded copy of each thumbnail image
//   - the post/reel URL
//   - the post type (image / carousel / reel)
//   - a caption preview (pulled from the thumbnail's alt text — Instagram
//     embeds the first part of the caption there, so this needs no extra
//     page visits)
//
// Usage:
//   npm run scrape -- <your-username> [--limit 60] [--headed]
//
// Output goes to output/posts.json and output/thumbnails/, plus a
// output/grid-preview.html you can open locally to eyeball the current
// layout. Share the output/ folder with an AI assistant to get suggestions
// on reordering for visual cohesiveness.

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectGridPosts, fetchImageBuffer, randomDelay } from "./grid.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, "..", "auth.json");
const OUTPUT_DIR = path.join(__dirname, "..", "output");
const THUMBS_DIR = path.join(OUTPUT_DIR, "thumbnails");

function parseArgs(argv) {
  const args = { username: null, limit: 60, headed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") {
      args.limit = parseInt(argv[++i], 10);
    } else if (a === "--headed") {
      args.headed = true;
    } else if (!a.startsWith("--")) {
      args.username = a.replace(/^@/, "");
    }
  }
  return args;
}

async function ensureLoggedIn() {
  try {
    await fs.access(AUTH_FILE);
  } catch {
    console.error(`\nNo saved session found at ${AUTH_FILE}.`);
    console.error("Run `npm run login` first.\n");
    process.exit(1);
  }
}

async function downloadThumbnail(page, url, destPath) {
  const buffer = await fetchImageBuffer(page, url);
  await fs.writeFile(destPath, buffer);
}

function buildPreviewHtml(posts) {
  const cells = posts
    .map(
      (p) => `
      <a class="cell" href="${p.url}" target="_blank" rel="noopener">
        <img src="thumbnails/${p.file}" alt="${(p.caption_preview || "").replace(/"/g, "&quot;")}" loading="lazy" />
        <span class="badge">#${p.order} · ${p.type}</span>
      </a>`
    )
    .join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Instagram grid preview</title>
<style>
  body { margin: 0; background: #fafafa; font-family: -apple-system, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; max-width: 900px; margin: 0 auto; }
  .cell { position: relative; display: block; aspect-ratio: 1 / 1; overflow: hidden; }
  .cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .badge { position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,0.6); color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 4px; }
  h1 { text-align: center; font-size: 18px; padding: 16px; }
</style>
</head>
<body>
  <h1>Current grid order (top-left = newest)</h1>
  <div class="grid">
${cells}
  </div>
</body>
</html>`;
}

async function main() {
  const { username, limit, headed } = parseArgs(process.argv.slice(2));
  if (!username) {
    console.error("\nUsage: npm run scrape -- <your-instagram-username> [--limit 60] [--headed]\n");
    process.exit(1);
  }

  await ensureLoggedIn();
  await fs.mkdir(THUMBS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();

  console.log(`\nOpening profile: instagram.com/${username}`);
  await page.goto(`https://www.instagram.com/${username}/`, {
    waitUntil: "domcontentloaded",
  });

  const loginWall = await page
    .locator('input[name="username"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (loginWall) {
    console.error("\nYour saved session looks expired. Run `npm run login` again.\n");
    await browser.close();
    process.exit(1);
  }

  await page.waitForSelector('article a[href*="/p/"], article a[href*="/reel/"]', {
    timeout: 15000,
  });

  console.log(`Collecting up to ${limit} posts (this scrolls slowly on purpose)...`);
  const rawPosts = await collectGridPosts(page, limit);
  console.log(`Found ${rawPosts.length} posts. Downloading thumbnails...`);

  const posts = [];
  for (let i = 0; i < rawPosts.length; i++) {
    const raw = rawPosts[i];
    const order = i + 1;
    const idPart = raw.href.match(/\/(p|reel)\/([^/]+)/);
    const postId = idPart ? idPart[2] : `post${order}`;
    const file = `${String(order).padStart(3, "0")}_${postId}.jpg`;
    const destPath = path.join(THUMBS_DIR, file);

    if (raw.thumbnail) {
      try {
        await downloadThumbnail(page, raw.thumbnail, destPath);
      } catch (err) {
        console.warn(`  Couldn't download thumbnail for post ${order}: ${err.message}`);
      }
    }

    posts.push({
      order,
      url: raw.href,
      type: raw.type,
      file,
      caption_preview: raw.alt || "",
    });

    await randomDelay(150, 400);
  }

  await fs.writeFile(
    path.join(OUTPUT_DIR, "posts.json"),
    JSON.stringify(
      {
        username,
        scraped_at_grid_order: "1 = newest / top-left of profile grid",
        count: posts.length,
        posts,
      },
      null,
      2
    )
  );

  await fs.writeFile(path.join(OUTPUT_DIR, "grid-preview.html"), buildPreviewHtml(posts));

  console.log(`\nDone. Wrote:`);
  console.log(`  ${path.join(OUTPUT_DIR, "posts.json")}`);
  console.log(`  ${path.join(OUTPUT_DIR, "grid-preview.html")}`);
  console.log(`  ${THUMBS_DIR}/ (${posts.length} images)`);
  console.log(`\nOpen grid-preview.html locally, or share the output/ folder with`);
  console.log(`your AI assistant to get suggestions on reordering for cohesiveness.\n`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
