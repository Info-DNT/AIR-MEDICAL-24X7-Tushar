# Getting to 90+ on mobile and desktop, and staying there

Measured 10 Sep 2026 against the live site with Lighthouse 13.4.1 locally. The
local desktop run reproduces PageSpeed Insights almost exactly (Perf 66 vs PSI 67,
TBT 700 ms vs 700 ms, CLS 0.022 vs 0.022), so the numbers below are trustworthy
and the same harness can verify every change.

## Baseline

|                        | desktop     | mobile        | target for 90+ |
| ---------------------- | ----------- | ------------- | -------------- |
| **Performance**        | **66**      | **38**        | 90+            |
| Accessibility          | 80          | 75            | 95+            |
| First Contentful Paint | 0.9 s       | 3.8 s         | ≤ 1.8 s        |
| Largest Contentful Paint | 1.4 s     | 6.6 s         | ≤ 2.5 s        |
| **Total Blocking Time**| **700 ms**  | **3,080 ms**  | ≤ 200 ms       |
| Cumulative Layout Shift| 0.022       | 0.051         | ≤ 0.1 ✓        |
| Speed Index            | 1.9 s       | 4.4 s         | ≤ 3.4 s        |
| Time to Interactive    | 3.0 s       | 19.0 s        | —              |

The desktop screenshot is the flattering half. Mobile scores 38, and mobile is
what Google ranks on.

On desktop every metric is already green except one. TBT carries 30% of the score
and is scoring near zero, which is essentially the entire 34-point gap.

## Where the time actually goes

JavaScript evaluation, attributed by script:

| script                              | desktop      | mobile        |
| ----------------------------------- | ------------ | ------------- |
| gtag `G-GMZS28VD8M` (GA4, via GTM)  | 520 ms       | 1,450 ms      |
| gtag `AW-16644189187`               | 66 ms        | 802 ms        |
| `gtm.js` container `GTM-KG4BQ6SM`   | 128 ms       | 449 ms        |
| gtag `AW-10787559741`               | 306 ms       | —             |
| gtag `AW-16646697649` (via GTM)     | 66 ms        | 226 ms        |
| Cloudflare Turnstile                | 101 ms       | 438 ms        |
| **the site's own JS**               | **22 ms**    | **321 ms**    |

**The site's own code is not the problem.** On desktop it accounts for 22 ms of
1,117 ms of script evaluation. Google tags account for roughly 87%. Seven of the
eight longest main-thread tasks belong to Google; the single worst is a 1,437 ms
task from GA4 on mobile.

Ten Google tag scripts load, for five distinct tag IDs:

```
GTM-KG4BQ6SM      gtm.js container   hardcoded in the page
AW-16644189187    gtag config        hardcoded  (+ re-fetched by the gtag runtime)
AW-10787559741    gtag config        hardcoded  (+ re-fetched by the gtag runtime)
G-GMZS28VD8M      gtag config        owned by the GTM container
AW-16646697649    gtag config        owned by the GTM container
```

A tag id fetched a second time with a `&gtm=` parameter is the gtag.js runtime
re-requesting a config the page registered — it does **not** mean the GTM
container owns that tag. See Stage 2: acting on that misreading would have
deleted both Ads accounts.

The page already defers tags until first interaction, with a 3.5-second safety
fallback. Lighthouse never interacts, but the fallback fires well inside the
trace window, so the full cost still lands in the measured score.

## Stage 0 — Deploy the nginx config that is already written

**This is the largest single win and it needs no code change.**

CSS and JS are served completely uncompressed:

| asset               | served     | gzipped | encoding   |
| ------------------- | ---------- | ------- | ---------- |
| bootstrap.min.css   | 169,377 B  | 22,933  | **none**   |
| style.css           | 56,209 B   | 11,742  | **none**   |
| config.js           | 17,389 B   | 6,187   | **none**   |
| main.js             | 5,684 B    | 2,274   | **none**   |
| site-fonts.css      | 3,603 B    | 1,072   | **none**   |

**221 KB of avoidable transfer on every first visit.** HTML is gzipped, so gzip is
on but `gzip_types` never received the CSS and JS types.

`nginx.conf` in this repo already fixes this — it has the full `gzip_types` list
and a comment calling it "the single biggest performance item on this server". It
has simply never been applied to the box. The runbook is `docs/AWS-APPLY-RUNBOOK.md`.

- Effort: one config apply, already scripted in `tools/apply-nginx-config.sh`
- Risk: low — the script dry-runs, traps errors and auto-rolls-back
- Expected: mobile FCP/LCP/SI improve by roughly 1 s on throttled 4G

## Stage 1 — Hero image to WebP

`img/home-page-header.jfif` is 218 KB. `img/home-page-header.webp` already exists
on disk (currently untracked) and is **the same photograph** — 1600×900, mean
pixel difference 1.6/255. It is 69 KB.

- Saves 149 KB on the LCP element with no visual change
- Keep the `.jfif` as the `<picture>`/`image-set` fallback if you want belt-and-braces
- Risk: very low. Verify with a pixel diff before and after

## Stage 2 — One gtag.js for both Ads destinations  ✅ DONE

**The original plan for this stage was wrong, and testing caught it.**

The plan said `AW-16644189187` and `AW-10787559741` were duplicates already
carried by the GTM container, so the hardcoded snippets could simply be deleted
with "no tracking lost". That inference came from seeing both tag ids fetched a
second time with a `&gtm=` parameter.

A controlled test disproved it. Rewriting the live document in flight to remove
the hardcoded block, then counting which tags still load:

```
AW-10787559741   present BEFORE 3/3   AFTER 0/3
AW-16644189187   present BEFORE 3/3   AFTER 0/3
AW-16646697649   present BEFORE 3/3   AFTER 3/3   (genuinely GTM's)
G-GMZS28VD8M     present BEFORE 3/3   AFTER 3/3   (genuinely GTM's)
```

The `&gtm=` URLs are the gtag.js runtime re-fetching configs the *page*
registered — not GTM owning those tags. Deleting the block would have removed
both Ads accounts outright, including the one `gtag_report_conversion()` targets.
**That change was not made.**

What was done instead is safe and verified: gtag.js supports several destinations
per library load, so both accounts are now configured from **one** script download
rather than two.

```js
g1.src = 'https://www.googletagmanager.com/gtag/js?id=AW-16644189187';
window.gtag('config', 'AW-16644189187');
window.gtag('config', 'AW-10787559741');   // second destination, no second download
```

Verified against the live page before applying, and against the modified files
afterwards: both accounts still register, the Ads pixels still fire (3 pings,
unchanged), `gtag_report_conversion` is intact, and there are no console errors.
One 472 KB download and its parse are gone — roughly 300 ms desktop, 800 ms mobile.

Applied to all 61 pages carrying the block.

**Still outstanding and needing GTM console access (yours, not mine):** moving
both Ads tags into the GTM container properly, which is what would allow the page
snippets to be removed altogether. That is Option B in Stage 3.

## Stage 3 — The tag loading decision (needs your call)

Even after Stage 2, GA4 plus GTM plus one Ads tag still cost roughly 2,100 ms of
main-thread time on mobile. Mobile cannot reach 90 while that runs during load.

This is a business decision, not a technical one, so I am not making it for you:

**Option A — extend the fallback (best score).** Load tags only on real interaction
and push the safety timer out past the measurement window, or drop it entirely.
Mobile TBT falls to roughly 350 ms.
*Cost:* visitors who bounce without interacting are never counted. GA4 session
counts will drop, and Ads conversion attribution and remarketing audiences shrink.
On an ads-driven site this is real money — it should not be chosen casually.

**Option B — consolidate inside GTM (safe middle).** Move every tag into the one
container, remove the standalone GA4 config, and use GTM triggers. Fewer script
downloads, all tracking preserved.
*Expected:* mobile TBT roughly 1,200–1,500 ms. Better, but likely still short of 90.

**Option C — server-side GTM.** Google's server-side tagging moves execution off
the browser entirely. Best of both: full attribution, near-zero client cost.
*Cost:* a Google Cloud tagging server, roughly $30–120/month, plus setup.

My recommendation: **Stage 2 now** (free, no downside), then **Option C** if the
ads budget justifies it, otherwise **Option A** with consent-mode conversion
linking so click conversions still fire.

## Stage 4 — Load Turnstile only when it is needed

Cloudflare Turnstile costs 438 ms on mobile and is only required when someone
submits the enquiry form. Load it on first focus of a form field instead of at
page load.

- Expected: −438 ms mobile TBT
- Risk: low — must be loaded and rendered before the submit handler runs. Needs a
  guard so a fast submit waits for the widget rather than failing.

## Stage 5 — CSS

- **Minify `style.css`** — 56 KB, unminified. Saves 38 KB. Mechanical, low risk.
- **Unused CSS is 187 KB**, almost all of Bootstrap. Do *not* blind-purge across
  62 pages; that is how things silently break. If pursued, generate a purge
  allowlist from all 62 pages plus the JS-injected class names, then diff-render
  every page before and after.
- **Three render-blocking stylesheets.** Inlining critical above-the-fold CSS and
  loading the rest async is worth roughly 300 ms of FCP, but it is the highest-risk
  item here. Do it last, only after the cheap wins are banked and measured.

## Stage 6 — Accessibility, 80 → 95+

All confirmed by parsing `index.html`:

| issue                              | count | fix                                                  |
| ---------------------------------- | ----- | ---------------------------------------------------- |
| No `<main>` landmark               | 1     | wrap the page body content in `<main>`                |
| Heading levels skipped             | 7     | e.g. h1 → h3, h2 → h6, h2 → h5                        |
| Form controls with no label        | 18    | `aria-label`, or a visually-hidden `<label for>`      |
| Links with no discernible name     | 9     | `aria-label` on icon-only social and arrow buttons    |
| Insufficient colour contrast       | —     | reported by PSI; needs per-element measurement        |

These are cheap, carry no performance risk, and also feed the new "Agentic
Browsing" category (currently 1/3), which flags the accessibility tree directly.

## Stage 7 — Make 90+ stick  ✅ BUILT

A Stop hook now audits the working tree whenever a `.html`, `.css` or `.js` file
has changed, and wakes Claude to fix it if the budget is exceeded.

- `tools/perf-audit.py` serves the repo locally — threaded, and gzipping CSS/JS
  the way nginx.conf and GitHub Pages do — then runs Lighthouse on mobile and
  desktop and compares against `perf-budget.json`.
- `tools/perf-audit-hook.sh` skips in ~0.3 s when no front-end file changed, so
  it costs nothing on a docs-only turn. It runs in the background and only
  interrupts on a real regression.

**A caveat worth knowing.** Lighthouse is noisy: on identical code, desktop TBT
was observed anywhere from 23 ms to 517 ms, and the desktop score from 76 to 91.
The budget is therefore calibrated from the *worst* of several runs plus a
margin, which means it reliably catches a meaningful regression — a heavy script,
an unoptimised image — but will not notice a two-point drift. Tightening it to
catch small changes would produce false alarms, and a guard that cries wolf gets
switched off.

Recalibrate after a genuine improvement with
`python tools/perf-audit.py --calibrate`, never to excuse a red run.

The original guidance below still stands for the CI side:



A score that is fixed once drifts back. To hold it:

1. **Commit a Lighthouse budget** — `lighthouse-budget.json` with caps on total
   JS, image bytes and third-party count.
2. **Run Lighthouse in CI on every push** to the homepage plus two representative
   pages, failing the build under 90.
3. **Cap the tags.** Most regressions on sites like this come from a new tag being
   added in the GTM UI, which never touches this repo. The CI check is the only
   thing that will catch that, so it matters more than any single fix here.
4. Re-check monthly against CrUX field data, which is what actually affects
   ranking — the lab score is a proxy.

## Expected outcome

| stage                          | desktop | mobile |
| ------------------------------ | ------- | ------ |
| baseline                       | 66      | 38     |
| + Stage 0 gzip                 | ~72     | ~52    |
| + Stage 1 hero WebP            | ~74     | ~58    |
| + Stage 2 de-duplicate tags    | ~82     | ~66    |
| + Stage 4 Turnstile lazy       | ~85     | ~71    |
| + Stage 5 CSS minify           | ~87     | ~75    |
| + Stage 3 Option A **or** C    | **95+** | **90+**|

Stages 0–2, 4 and 5 are low-risk and get desktop comfortably past 90. **Mobile
90+ is not reachable without Stage 3** — the third-party tag execution is simply
larger than the entire mobile budget. That decision is the gate on the goal.

Figures for stages 0–2 are derived from measured byte and millisecond counts;
those past that are estimates and should be re-measured at each step rather than
trusted.

## Verification

Re-run after each stage and compare, rather than assuming:

```bash
export CHROME_PATH=".../chrome.exe"
lighthouse https://airmedical24x7.com/ --preset=desktop --output=json \
  --output-path=lh-desktop.json --chrome-flags="--headless=new"
lighthouse https://airmedical24x7.com/ --output=json \
  --output-path=lh-mobile.json --chrome-flags="--headless=new"
```

Lighthouse varies a few points run to run, so take the median of three and aim
for 95 in the lab to hold 90 in the wild.
