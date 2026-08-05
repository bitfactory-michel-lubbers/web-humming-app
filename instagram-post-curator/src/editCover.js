// Attempts to open a published post's "Edit" screen and change which slide
// is the cover.
//
// IMPORTANT — READ BEFORE RELYING ON THIS: as far as we can tell, Instagram's
// normal "Edit" option on a published feed post only exposes caption,
// location, tagged people, and alt text — it does NOT expose reordering
// carousel slides or picking a different cover after the post is live.
// (Reels have a separate, unrelated "Edit cover" feature for the video
// thumbnail; that's not this.) Instagram's UI changes over time and we can't
// verify this live from here, so this function checks for a real reorder
// control before doing anything, and reports "unsupported" instead of
// pretending to succeed if it doesn't find one.
//
// If you find Instagram DOES expose a reorder control these days, open the
// Edit screen on one of your carousel posts, note what the control looks
// like (a screenshot helps), and the selectors below can be updated to
// actually drive it.

export async function attemptCoverChange(page, postUrl, targetIndex, { apply }) {
  await page.goto(postUrl, { waitUntil: "domcontentloaded" });

  const moreButton = page.locator('svg[aria-label="More options"]').first();
  const hasMoreButton = await moreButton.isVisible().catch(() => false);
  if (!hasMoreButton) {
    return {
      status: "error",
      message: "Couldn't find the post's \"More options\" (···) button.",
    };
  }
  await moreButton.click();

  const editOption = page.getByText("Edit", { exact: true }).first();
  const hasEditOption = await editOption.isVisible().catch(() => false);
  if (!hasEditOption) {
    return { status: "error", message: 'No "Edit" option in the post menu.' };
  }
  await editOption.click();
  await page.waitForTimeout(800);

  const reorderControl = page.locator(
    '[aria-label*="Rearrange" i], [aria-label*="Reorder" i], [draggable="true"]'
  );
  const hasReorder = (await reorderControl.count()) > 0;

  if (!hasReorder) {
    return {
      status: "unsupported",
      message:
        "No slide-reorder/cover control found on the Edit screen for this post. " +
        "Instagram's Edit screen for carousels appears to only expose caption, " +
        "location, tagged people, and alt text — not slide order.",
    };
  }

  if (!apply) {
    return {
      status: "dry-run",
      message: `Reorder control detected. Would move slide ${targetIndex + 1} to the front (rerun with --apply).`,
    };
  }

  throw new Error(
    "A reorder control was detected but automated dragging isn't wired up yet — " +
      "this is new territory, please share what the control looks like so it can be built correctly " +
      "instead of guessing at drag coordinates."
  );
}
