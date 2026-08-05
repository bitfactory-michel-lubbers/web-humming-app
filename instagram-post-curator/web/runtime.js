// This is the bookmarklet's actual logic. It runs INSIDE your own,
// already-logged-in instagram.com tab when you click the bookmarklet —
// there is no server, no separate login, and this page (wherever it's
// hosted) never sees your Instagram session. It only reads the source
// below to build the bookmarklet link; the code itself executes in your
// browser, on the real instagram.com.
//
// Known unknown, stated plainly: whether Instagram's Content-Security-Policy
// lets this code call the vision API directly (fetch to
// api.anthropic.com / api.openai.com) hasn't been verified against a live
// session — that isn't something that can be tested without your actual
// logged-in browser. If the console shows a CSP/network error on that
// fetch, that's what's happening, and this needs a small relay added as a
// fallback. Say so if you hit that and it'll get fixed.
(function () {
  const OVERLAY_ID = "ig-cover-picker-overlay";
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed; top: 16px; right: 16px; width: 360px; max-height: 80vh;
    overflow-y: auto; background: #111; color: #eee; font: 13px/1.4 -apple-system, sans-serif;
    border-radius: 10px; padding: 14px; z-index: 2147483647; box-shadow: 0 8px 30px rgba(0,0,0,.5);
  `;
  overlay.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong>Instagram Cover Picker</strong>
      <button id="ig-cp-close" style="background:none;border:none;color:#aaa;font-size:16px;cursor:pointer;">✕</button>
    </div>
    <div id="ig-cp-log" style="white-space:pre-wrap;"></div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("ig-cp-close").onclick = () => overlay.remove();

  const logEl = document.getElementById("ig-cp-log");
  function log(msg) {
    const line = document.createElement("div");
    line.textContent = msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function randomDelay(min, max) {
    return sleep(min + Math.random() * (max - min));
  }

  function getApiConfig() {
    let provider = localStorage.getItem("ig_cp_provider");
    let key = localStorage.getItem("ig_cp_api_key");
    if (!key) {
      provider = prompt(
        'Which vision API do you have a key for? Type "anthropic" or "openai":',
        "anthropic"
      );
      key = prompt(`Paste your ${provider} API key (stored only in this browser's localStorage):`);
      if (provider && key) {
        localStorage.setItem("ig_cp_provider", provider.trim());
        localStorage.setItem("ig_cp_api_key", key.trim());
      }
    }
    return { provider: (provider || "anthropic").trim(), key: (key || "").trim() };
  }

  async function pickBestCoverIndex(imageUrls, caption) {
    const { provider, key } = getApiConfig();
    if (!key) throw new Error("No API key set.");

    const prompt =
      `You are picking which single photo from a ${imageUrls.length}-slide Instagram carousel ` +
      `should be the COVER (the first slide, shown in the profile grid). Judge purely on which ` +
      `image is the strongest thumbnail: composition, subject clarity, visual impact at small size. ` +
      (caption ? `Caption for context: "${caption}". ` : "") +
      `Respond with ONLY the slide number (1-${imageUrls.length}), nothing else.`;

    let res, text;
    if (provider === "anthropic") {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 16,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                ...imageUrls.map((url) => ({
                  type: "image",
                  source: { type: "url", url },
                })),
              ],
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Anthropic API error: ${JSON.stringify(data)}`);
      text = (data.content || []).map((b) => b.text || "").join("");
    } else {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 16,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
              ],
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`OpenAI API error: ${JSON.stringify(data)}`);
      text = data.choices[0].message.content;
    }

    const match = text.match(/\d+/);
    if (!match) throw new Error(`Couldn't parse a slide number from: "${text}"`);
    const chosen = parseInt(match[0], 10);
    if (chosen < 1 || chosen > imageUrls.length) {
      throw new Error(`Vision model returned out-of-range slide number: ${chosen}`);
    }
    return chosen - 1;
  }

  function findGridCarousels(limit) {
    const anchors = Array.from(
      document.querySelectorAll('article a[href*="/p/"], article a[href*="/reel/"]')
    );
    const posts = [];
    for (const a of anchors) {
      if (posts.length >= limit) break;
      const hasCarouselIcon = !!a.querySelector('svg[aria-label="Carousel"]');
      if (!hasCarouselIcon) continue;
      const img = a.querySelector("img");
      posts.push({ href: a.href, caption: img ? img.alt : "" });
    }
    return posts;
  }

  async function readCarouselSlides(postUrl) {
    history.pushState({}, "", postUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await sleep(1200);

    const slides = [];
    const seen = new Set();
    const captureCurrent = () => {
      const imgs = Array.from(
        document.querySelectorAll('article ul li img, article div[role="button"] img')
      );
      const visible = imgs.find((img) => {
        const rect = img.getBoundingClientRect();
        return rect.width > 200 && !img.closest('[aria-hidden="true"]');
      });
      const src = (visible || imgs[0])?.src;
      if (src && !seen.has(src)) {
        seen.add(src);
        slides.push(src);
      }
    };

    captureCurrent();
    for (let i = 0; i < 20; i++) {
      const next = document.querySelector('button[aria-label="Next"]');
      if (!next || next.offsetParent === null) break;
      next.click();
      await randomDelay(400, 800);
      captureCurrent();
    }
    return slides;
  }

  async function main() {
    if (!location.pathname.match(/^\/[^/]+\/?$/)) {
      log("Go to your own profile page (instagram.com/yourusername) and click this again.");
      return;
    }

    log("Scanning your grid for carousel posts...");
    const carousels = findGridCarousels(12);
    log(`Found ${carousels.length} carousel post(s) in the visible grid.`);

    for (const post of carousels) {
      log(`\n${post.href}`);
      try {
        const slides = await readCarouselSlides(post.href);
        log(`  ${slides.length} slides read.`);
        const bestIndex = await pickBestCoverIndex(slides, post.caption);
        log(`  Suggested cover: slide ${bestIndex + 1} of ${slides.length}${bestIndex === 0 ? " (already the cover)" : ""}`);
      } catch (err) {
        log(`  Error: ${err.message}`);
      }
      await randomDelay(800, 1500);
    }

    log("\nDone. This only reports suggestions — it does not change any post yet.");
  }

  main();
})();
