// Opens a real, visible Chromium window so you can log into Instagram yourself
// (including any 2FA/checkpoint). Nothing here reads or stores your password —
// once you're in, we save the authenticated session (cookies/local storage) to
// auth.json so the scrape script can reuse it without logging in again.
//
// Run this on your own computer, not in a headless/cloud environment — you
// need to see the window to type your credentials.

import { chromium } from "playwright";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, "..", "auth.json");

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.instagram.com/accounts/login/", {
    waitUntil: "domcontentloaded",
  });

  console.log("\nA browser window has opened.");
  console.log("Log into Instagram as you normally would (username, password,");
  console.log("any 2FA or 'confirm it's you' checkpoint Instagram shows you).");
  console.log("Once you can see your home feed, come back here and press Enter.\n");

  const rl = readline.createInterface({ input: stdin, output: stdout });
  await rl.question("Press Enter once you're logged in... ");
  rl.close();

  const stillOnLogin = await page
    .locator('form[id*="login"], input[name="username"]')
    .first()
    .isVisible()
    .catch(() => false);

  if (stillOnLogin) {
    console.log("\nHmm, this still looks like the login page. Finish logging in,");
    console.log("then rerun `npm run login`.");
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: AUTH_FILE });
  console.log(`\nSaved your session to ${AUTH_FILE}.`);
  console.log("This file is a live login token for your account — it's gitignored");
  console.log("by default. Never commit it or share it with anyone.");
  console.log("\nYou can now run: npm run scrape -- <your-username>");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
