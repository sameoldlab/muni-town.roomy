/**
 * Social-unfurl tags must be static in `app.html`, not only in SeoMeta.
 *
 * Every route sets `ssr = false`, and the app builds with `adapter-static`.
 * The served HTML is therefore the `app.html` shell (copied verbatim into
 * `index.html`), and a page's `<svelte:head>` output — everything SeoMeta
 * emits — is produced only once the client bundle runs. Crawlers and chat
 * embedders (Twitter/X, Discord, Slack, iMessage, Facebook) fetch the raw
 * HTML and never execute that bundle, so an `og:image` that exists only at
 * runtime is invisible to them: the link unfurls with no image.
 *
 * This already happened once: the og image was added to SeoMeta and shipped
 * (deployed commit 28a86296) yet `https://roomy.space/` served zero og/twitter
 * tags, because the tags never reached the static shell. The fix keeps the
 * site-level defaults in `app.html`, where the static `description` already
 * lives for the same reason.
 *
 * Reads the tree, not a build — same rationale as `build-identity.test.ts`: a
 * full app-lite build is minutes of CI and OOM-prone on small hosts, and the
 * failure worth catching is structural (tags moved back into a component).
 * `scripts/build-prod.sh` additionally asserts the built `index.html` carries
 * them, so the two checks cover source and artifact respectively.
 *
 * Written against `node:test` + `node:assert` so it runs under both `bun test`
 * and `node --test --experimental-strip-types` (app-lite ships no test runner
 * of its own).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("social unfurl tags are present in the static shell", () => {
  const appHtml = read("../app.html");

  test("app.html declares the og:image the shell serves to crawlers", () => {
    // Absolute, because og:image must not be relative — a crawler resolves it
    // from its own origin, not the page's.
    assert.match(
      appHtml,
      /<meta\s+property="og:image"\s+content="https:\/\/roomy\.space\/roomy-og\.png"\s*\/>/
    );
  });

  test("app.html declares the tags an unfurl needs to render at all", () => {
    // og:title/og:description + twitter:card: without the card type X shows a
    // bare link instead of the large image.
    assert.match(appHtml, /property="og:title"/);
    assert.match(appHtml, /property="og:description"/);
    assert.match(appHtml, /property="og:site_name"/);
    assert.match(appHtml, /name="twitter:card"\s+content="summary_large_image"/);
    assert.match(appHtml, /name="twitter:image"/);
  });

  test("the og image referenced actually exists in static/", () => {
    // A tag pointing at a 404 unfurls as a broken/empty card.
    const png = readFileSync(new URL("../../static/roomy-og.png", import.meta.url));
    // PNG magic bytes — a renamed non-image would still serve 200 image/png
    // only if it really is a PNG; assert the signature so the tag cannot point
    // at a placeholder that crawlers reject.
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });

  test("SeoMeta keeps emitting the tags for in-app navigation", () => {
    // The static shell is the crawler fallback; SeoMeta still updates the head
    // for SPA navigation (space/room/profile titles). Both must exist — the
    // static tags alone would freeze the title after a client-side route change.
    const seo = read("./components/seo/SeoMeta.svelte");
    assert.match(seo, /property="og:image"/);
    assert.match(seo, /name="twitter:card"/);
    // The runtime default must equal the static default, or the head changes
    // the image the moment the bundle runs.
    assert.match(seo, /https:\/\/roomy\.space\/roomy-og\.png/);
  });

  test("build-prod.sh verifies the artifact before publishing", () => {
    // The source check above cannot see the transformed output; the build
    // asserts the shipped index.html carries the tags (same contract as the
    // OAuth-scope and build-identity verifications).
    const script = read("../../scripts/build-prod.sh");
    assert.match(script, /build-staging\/index\.html/);
    assert.match(script, /og:image/);
    assert.match(script, /twitter:card/);
  });
});
