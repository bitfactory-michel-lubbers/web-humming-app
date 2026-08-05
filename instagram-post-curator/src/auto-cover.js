// The full pipeline:
//   1. Reuse your saved login (from `npm run login`)
//   2. Find your carousel posts
//   3. Read all slides of each carousel
//   4. Ask a vision model which slide is the strongest cover
//   5. Try to apply that as the post's cover
//
// By default this is a DRY RUN — it reports what it *would* change without
// touching your live posts. Pass --apply to actually attempt the change.
// Step 5 may report "unsupported" — see src/editCover.js for why.
//
// Usage:
//   npm run auto-cover -- <your-username> [--limit 20] [--apply] [--headed]
//
// Requires ANTHROPIC_API_KEY or OPENAI_API_KEY in your environment.

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectGridPosts, fetchImageBuffer, randomDelay } from "./grid.js";
import { extractCarouselSlides } from "./carousels.js";
import { pickBestCoverIndex } from "./vision.js";
import { attemptCoverChange } from "./editCover.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, "..", "auth.json");
const OUTPUT_DIR = path.join(__dirname, "..", "output");

function parseArgs(argv) {
  const args = { username: null, limit: 20, apply: false, headed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (a === "--apply") args.apply = true;
    else if (a === "--headed") args.headed = true;
    else if (!a.startsWith("--")) args.username = a.replace(/^@/, "");
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

async function main() {
  const { username, limit, apply, headed } = parseArgs(process.argv.slice(2));
  if (!username) {
    console.error(
      "\nUsage: npm run auto-cover -- <your-instagram-username> [--limit 20] [--apply] [--headed]\n"
    );
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error("\nSet ANTHROPIC_API_KEY or OPENAI_API_KEY before running this.\n");
    process.exit(1);
  }

  await ensureLoggedIn();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log(apply ? "Running in APPLY mode — this will attempt real changes." : "Running in dry-run mode (no changes will be made). Pass --apply to change anything for real.");

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();

  console.log(`\nOpening profile: instagram.com/${username}`);
  await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: "domcontentloaded" });

  const loginWall = await page.locator('input[name="username"]').first().isVisible().catch(() => false);
  if (loginWall) {
    console.error("\nYour saved session looks expired. Run `npm run login` again.\n");
    await browser.close();
    process.exit(1);
  }

  await page.waitForSelector('article a[href*="/p/"], article a[href*="/reel/"]', { timeout: 15000 });

  console.log(`Scanning up to ${limit} posts for carousels...`);
  const allPosts = await collectGridPosts(page, limit);
  const carousels = allPosts.filter((p) => p.type === "carousel");
  console.log(`Found ${carousels.length} carousel post(s) out of ${allPosts.length} scanned.`);

  const results = [];

  for (const post of carousels) {
    console.log(`\n${post.href}`);
    try {
      const slideUrls = await extractCarouselSlides(page, post.href);
      console.log(`  ${slideUrls.length} slides found. Downloading for vision analysis...`);

      const buffers = [];
      for (const url of slideUrls) {
        buffers.push(await fetchImageBuffer(page, url));
        await randomDelay(150, 350);
      }

      const bestIndex = await pickBestCoverIndex(buffers, { caption: post.alt });
      console.log(`  Vision model picked slide ${bestIndex + 1} of ${slideUrls.length} as the best cover.`);

      let editResult;
      if (bestIndex === 0) {
        editResult = { status: "already-cover", message: "Slide 1 is already the cover — nothing to change." };
      } else {
        editResult = await attemptCoverChange(page, post.href, bestIndex, { apply });
      }
      console.log(`  ${editResult.status}: ${editResult.message}`);

      results.push({
        url: post.href,
        slideCount: slideUrls.length,
        bestIndex,
        ...editResult,
      });
    } catch (err) {
      console.warn(`  Failed on this post: ${err.message}`);
      results.push({ url: post.href, status: "error", message: err.message });
    }

    await randomDelay(1000, 2000);
  }

  await fs.writeFile(
    path.join(OUTPUT_DIR, "cover-suggestions.json"),
    JSON.stringify({ username, apply, results }, null, 2)
  );

  console.log(`\nWrote ${path.join(OUTPUT_DIR, "cover-suggestions.json")}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
