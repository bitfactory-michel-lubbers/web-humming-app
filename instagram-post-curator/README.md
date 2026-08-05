# Instagram Post Curator

A small local tool that logs into Instagram in a real browser window (you type
your own credentials — nothing here ever sees or stores your password),
exports your own profile grid as thumbnails + metadata, and gives you a
`grid-preview.html` you can open to see your current layout. Share the
exported `output/` folder with an AI assistant to get suggestions on
reordering your posts for a more cohesive-looking grid.

**Run this on your own computer.** It opens a visible browser window for
login, which won't work in a headless/cloud environment.

## Setup

```bash
cd instagram-post-curator
npm install
npx playwright install chromium   # first time only
```

## 1. Log in

```bash
npm run login
```

A Chromium window opens to the Instagram login page. Log in exactly as you
normally would — username, password, any 2FA or "confirm it's you" checkpoint
Instagram shows you. Once you can see your home feed, go back to the
terminal and press Enter.

This saves your session (cookies/local storage) to `auth.json` so you don't
have to log in every time. **`auth.json` is a live login token for your
account — it's gitignored by default. Never commit it, upload it, or share
it with anyone.**

## 2. Export your grid

```bash
npm run scrape -- your_username --limit 60
```

This scrolls your profile slowly (with randomized delays — intentionally not
fast) and writes to `output/`:

- `posts.json` — each post's grid position (1 = newest, top-left), URL, type
  (image/carousel/reel), and a caption preview
- `thumbnails/` — a downloaded copy of every thumbnail, named so their sort
  order matches the grid
- `grid-preview.html` — open this locally to see your current 3-column grid

`output/` is gitignored — it's your content, not something this repo should
carry around.

## 3. Get curation suggestions

Point an AI assistant (e.g. open the `output/` folder in a Claude Code
session) at `posts.json` and the `thumbnails/` folder and ask for a better
ordering — cohesive color palette flow, alternating subject matter, spacing
out similar shots, etc. The assistant can look at the actual thumbnails and
captions to reason about visual flow the way a viewer scrolling your grid
would.

## 4. Auto-pick and apply carousel covers (experimental)

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY=sk-...
npm install @anthropic-ai/sdk         # or: npm install openai
npm run auto-cover -- your_username --limit 20
```

This walks your carousel posts, reads every slide in each one, asks a vision
model which slide would make the strongest cover, and reports what it would
change to `output/cover-suggestions.json`.

**It runs as a dry run by default and does not touch your live posts.** Pass
`--apply` once you've reviewed `cover-suggestions.json` and want it to try
applying a change for real.

Read this before expecting `--apply` to do anything:

> As far as we can tell, Instagram's normal "Edit" screen for a published
> carousel post only lets you change the caption, location, tagged people,
> and alt text — **not** which slide is the cover or the slide order. (Reels
> have a separate "Edit cover" feature for the video thumbnail; that's
> unrelated.) `src/editCover.js` checks for a real reorder control before
> doing anything and reports `"unsupported"` instead of pretending to
> succeed if it can't find one.
>
> Worth a 30-second check on your own account: open one of your carousel
> posts, tap `···` → `Edit`, and see if there's any option to reorder slides
> or change the cover. If Instagram *has* added that recently, tell me what
> it looks like (a screenshot helps) and `attemptCoverChange()` can be wired
> up to actually drive it — right now it deliberately stops short of
> guessing at drag coordinates for a control that might not exist.

## Notes and limits

- This is meant for reviewing **your own** account. Don't point it at other
  people's profiles.
- Instagram's automation detection can flag accounts that scrape
  aggressively. This tool caps how many posts it fetches per run and adds
  delays between actions, but there's no guarantee Instagram won't show a
  checkpoint or temporarily restrict the account — use at your own
  discretion, and don't run it back-to-back in a loop.
- `caption_preview` comes from the thumbnail's `alt` text (Instagram embeds
  the start of the caption there), not a full caption fetch — this keeps the
  tool from needing to open every single post individually.
- Instagram's page structure changes over time; if `npm run scrape` stops
  finding posts, the CSS selectors in `src/scrape.js` (search for
  `article a[href*="/p/"]`) likely need a small update.
