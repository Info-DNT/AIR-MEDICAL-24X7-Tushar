# Plan — integrating the `shashank` branch landing pages

**Request:** pull the `shashank` branch and implement its pages for India, UAE, UK,
Port Blair, Jammu & Kashmir, Philippines and Northeast India, without breaking anything
and without harming SEO or performance.

**Status:** plan only. Nothing pulled, merged or changed. Branch inspected read-only via
`git show origin/shashank:<file>`.

---

## 1. What the branch actually is

Not a feature branch of this site — a **separate standalone project**.

```
git merge-base origin/main origin/shashank  ->  NO COMMON ANCESTOR
88 commits, unrelated history
```

Contents:

```
air-ambulance-uae.html                    air-ambulance-portblair.html
air-ambulance-uk.html                     air-ambulance-jammu-kashmir.html
air-ambulance-philippines.html            air-ambulance-northeast-india.html
air-ambulance-india-to-international.html thank-you.html
styles.css   script.js   supabase-config.js   assets/
```

These are **conversion-focused ad landing pages**: Tailwind-based, no site navigation, no
site footer (0 markers found), their own stylesheet and their own form script. That is a
legitimate design for paid traffic — it is simply not the same site as `main`.

**A merge is the wrong tool here.** With unrelated histories, `git merge` would either
refuse or, with `--allow-unrelated-histories`, drop 7 files into the root and overwrite
whatever shares a name. This has to be a deliberate file-by-file integration.

---

## 2. The contradiction that has to be resolved first ⚠️

The branch disagrees with itself about where these pages live.

| Signal | Says |
|---|---|
| Asset paths — `/ads/styles.css`, `/ads/script.js`, `/ads/assets/…` | pages live under **`/ads/`** |
| Canonical tags — `https://airmedical24x7.com/air-ambulance-uae` | pages live at the **root** |

Both cannot be true. Deploying as-is means either broken styling (root) or canonicals
pointing at URLs the pages do not occupy (`/ads/`) — and a canonical pointing at the wrong
URL is the exact defect that had 35 country pages canonicalised to 404s before.

**This is the decision everything else depends on:**

**Option A — deploy under `/ads/`** (matches the asset paths)
- No collision with any existing page; nothing on the current site changes
- Ad traffic lands on purpose-built pages; organic keeps the current ones
- Requires: rewrite 7 canonicals to `/ads/…`, and `noindex` them so they never compete
  with the organic pages for the same queries

**Option B — deploy at the root, replacing existing pages** (matches the canonicals)
- Requires: rewrite every `/ads/…` asset path to root-relative
- **Replaces `air-ambulance-uae.html`**, a real content page currently live and indexed
- Replaces the five stubs added earlier this week
- Both organic and paid traffic hit the same page

Option A is lower risk and appears to be the branch's actual design intent. Option B is a
content decision about what the organic pages should be — not something to infer.

---

## 3. Blocking problems, whichever option is chosen

### 3a. Tailwind Play CDN 🔴 — the biggest issue

```html
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
```

This is the **Play CDN**, which Tailwind's own documentation states is not for production.
It ships a ~400 KB compiler and generates the stylesheet **in the browser on every page
load**, so it is render-blocking, causes a flash of unstyled content, and adds significant
main-thread work.

For context: the last performance pass on `main` cut mobile blocking time to 400 ms and
removed *every* third-party render-blocking origin. Adding the Play CDN would give that
back several times over.

**Fix:** compile Tailwind to a static stylesheet at build time and ship the output —
typically 10–20 KB after purging. Non-negotiable if these go anywhere near production.

### 3b. 55.4 MB of unoptimised images 🔴

```
png    28 files   35.2 MB      (average 1.26 MB each)
jpg    38 files   12.7 MB
jfif   11 files    3.7 MB
webp    1 file     0.01 MB
TOTAL            55.4 MB
```

`main` currently ships **3.7 MB** for its entire image library after conversion. Three
single PNGs here are 2.3 MB each.

**Fix:** the same treatment already applied to `main` — WebP, capped at display width.
Expect roughly 55 MB → 3–4 MB.

### 3c. Page weight

| Page | Size |
|---|---|
| air-ambulance-uae.html | **1,263 KB** (16,081 lines) |
| air-ambulance-uk.html | 594 KB |
| air-ambulance-india-to-international.html | 503 KB |
| the other four | 230–366 KB |

No base64 and only 11 KB of inline script — the HTML itself is genuinely that large,
mostly repeated inline SVG. A shared sprite would remove most of it.

### 3d. Missing SEO basics

| | |
|---|---|
| Meta description | **missing on 6 of 7 pages** (only the India page has one) |
| Robots meta | missing on all 7 |
| Structured data | 2 JSON-LD blocks per page — needs validating, and FAQ schema must match visible content |

### 3e. Three more third-party font origins

Manrope, Public Sans and Material Symbols, all from Google Fonts — after `main` was moved
to self-hosted, subsetted fonts specifically to remove that dependency.

### 3f. Asset filenames that will break on a web server

```
assets/flight medical escort.jfif          spaces
assets/FAA Logo.png                        spaces
assets/Andaman&nicobar(port…               & and parentheses
assets/airport_port_blair_andaman.jpg.jpg  doubled extension
```

Spaces and `&` in URLs are fragile and need encoding everywhere they are referenced.

---

## 4. Naming collisions

| Branch | `main` today | Conflict |
|---|---|---|
| `air-ambulance-portblair.html` | `air-ambulance-port-blair.html` | **Different slug.** Two URLs for one place |
| `air-ambulance-india-to-international.html` | `air-ambulance-india.html`, `air-ambulance-to-india.html` | A third India URL. Is this replacing one, or additional? |
| `air-ambulance-uae.html` | live, indexed content page | Full replacement |
| uk / philippines / northeast-india / jammu-kashmir | stubs added this week | Replacement is straightforward |

The branch also renames `air-ambulance-india` → `air-ambulance-india-to-international`
(commit `f88b241`). If that URL is live and indexed, the rename needs a 301 or its history
is lost.

---

## 5. Two smaller things worth knowing

- **The form is done correctly.** Turnstile plus the `submit-main-page` Edge Function —
  the same secure path `main` uses, not a direct database insert. No change needed.
- **`supabase-config.js` contains only the anon key**, same project. No `service_role`
  exposure. Safe.
- **The WhatsApp number differs**: these pages use `wa.me/16593005200`; the main site uses
  `wa.me/971565542001`. Intentional for ad tracking, or an oversight? Worth confirming.

---

## 6. Proposed sequence

Assuming **Option A** (`/ads/`), which is the lower-risk reading:

| # | Step | Why |
|---|---|---|
| 1 | Copy the 8 HTML files, `styles.css`, `script.js`, `supabase-config.js`, `assets/` into `/ads/` | Matches the paths already in the markup — zero rewriting |
| 2 | Convert `assets/` to WebP at display width | 55.4 MB → ~3–4 MB |
| 3 | Rename files containing spaces, `&`, doubled extensions; update references | URL safety |
| 4 | Replace the Tailwind Play CDN with a compiled, purged stylesheet | Removes ~400 KB and the runtime compile |
| 5 | Self-host the three new font families, or drop to the two already self-hosted | Removes third-party origins |
| 6 | Set canonicals to `/ads/…` and add `noindex, follow` | Stops paid pages competing with organic for the same terms |
| 7 | Add `/ads/` to `robots.txt` as disallowed, or rely on the noindex | Same reason |
| 8 | Validate all JSON-LD; add the 6 missing meta descriptions | Parity with the rest of the site |
| 9 | Verify: link check, JSON-LD parse, canonical resolution, image budget | Same gates used on every change this week |

If **Option B** (root) is chosen instead, insert before step 2: rewrite every `/ads/…`
reference to root-relative, decide the fate of `air-ambulance-uae` / `air-ambulance-india`,
resolve `portblair` vs `port-blair`, and add 301s for any URL that changes.

---

## 7. Estimate

| Phase | Effort |
|---|---|
| 1, 3 — file placement and renaming | 1 h |
| 2 — image conversion | 1 h |
| 4, 5 — Tailwind build and fonts | 2–3 h |
| 6, 7, 8 — SEO parity | 1 h |
| 9 — verification | 1 h |
| **Total** | **~6–7 h** |

Steps 2 and 4 are the ones that protect the performance work already done. Skipping them
and shipping the branch as-is would measurably regress the site.

---

## 8. What I need from you

1. **Option A (`/ads/`) or Option B (root)?**
2. If B: does `air-ambulance-uae.html` get replaced by the ad page?
3. `portblair` or `port-blair` as the canonical slug?
4. Is `air-ambulance-india-to-international` replacing `air-ambulance-india`, or additional?
5. Is `wa.me/16593005200` deliberate?

Nothing will be changed until these are settled.
