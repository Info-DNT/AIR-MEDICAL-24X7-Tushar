# Plan — restore the previous home banner layout

**Request:** change the homepage hero back to the earlier design — text on the left,
aircraft on the right. Banner only, nothing else.

**Status:** plan only. Nothing executed.

---

## 1. What the two designs actually are

| | Current (live) | Target (your 2nd screenshot) |
|---|---|---|
| Text column | right | **left** |
| Aircraft + crew | left | **right** |
| Blue gradient | right | **left** |
| Aircraft nose points | right | **left** |

This is not just a CSS flip. The **image itself is a different composition** — the gradient
is baked into the artwork, so the layout and the asset have to change together. Moving the
text without changing the image would put white text over the aircraft and leave the
gradient empty.

## 2. The target asset already exists — in git history

`img/home-banner-hq.png` (1024×576) is exactly the target composition: gradient on the
left, aircraft and crew on the right, "AIR MEDICAL 24X7" on the fuselage reading correctly.

It was **deleted in commit `b8de09c`** during the image cleanup, because nothing referenced
it at the time. It is fully recoverable:

```
git show 38691ac:img/home-banner-hq.png > img/home-banner-hq.png
```

**Mirroring the current image is not an option.** A horizontal flip would reverse the
"AIR MEDICAL 24X7" livery on the fuselage. The two files are separate renders, not
mirrors of each other — both read correctly, which a flip could not produce.

## 3. The one real trade-off: resolution ⚠️

| Asset | Size |
|---|---|
| Current hero source | 1600 × 900 |
| Target asset (`home-banner-hq.png`) | **1024 × 576** |

The hero spans the full viewport width. On a 1440–1920 px desktop the browser would
upscale a 1024 px source by 1.4–1.9×, so the aircraft will look **visibly softer than it
does today** on large screens. Below ~1100 px wide, and on all phones and tablets, there is
no visible difference.

Every other candidate in history was checked:

```
herorr.png        1920x1080  — a completely different, older stock photo
hero_premium.png  1024x1024  — wrong aspect ratio (square)
home-banner.jpg   1024x576   — same composition, JPEG, no better than the PNG
```

**Recommendation:** ask whoever produced the artwork for a 1920 px or 2560 px wide export
of the same composition. Drop it in and this plan runs unchanged at full quality. If that
is not available, proceed at 1024 px and accept the softness on large monitors — it is a
design-quality question, not a functional one.

## 4. Performance impact: neutral to slightly positive

Worth stating because it is the usual worry with a hero change.

- The asset stays WebP with the same `srcset` / `sizes` / `fetchpriority` / preload setup,
  so the LCP mechanics are unchanged.
- The largest candidate drops from 1600 px to 1024 px, so the file the browser picks on
  desktop gets **smaller**, not larger — roughly 69 KB → ~35 KB.
- No extra requests, no layout shift: `width`/`height` stay on the tag and the container
  keeps its `min-height`.

## 5. Scope — small and contained

Verified against the codebase:

```
pages using .home-hero / .hero-bg   1   (index.html only)
pages using .hero-header            10  (inline gradient, NO image — unaffected)
markup lines to change              1   (index.html:409)
CSS rules to change                 4   (object-position, 3 of them in media queries)
```

The other 9 hero pages use an inline gradient with no image, so they cannot be affected.

## 6. Steps

**Step 1 — restore and build the asset**
```
git show 38691ac:img/home-banner-hq.png > img/home-banner-hq.png
```
Generate the WebP set at 480 / 800 / 1024 — **cap at 1024, do not upscale**, which means
dropping the current 1200w and 1600w candidates from the srcset.

**Step 2 — move the text column** (`index.html:409`)
```html
<!-- from -->  <div class="row justify-content-end">
<!-- to   -->  <div class="row">
```
Bootstrap's default is `justify-content-start`, so removing the class is enough. The
`col-lg-5` column itself does not change.

**Step 3 — reframe the image**

The subject now sits on the right, so the crop has to hold the right side instead of the
left. Four rules:

| Line | Context | From | To |
|---|---|---|---|
| 274 | `max-width: 991.98px` | `5% center` | `right center` |
| 313 | `992–1400px` | `left center` | `right center` |
| 1432 | `max-width: 991.98px` | `left center` | `right center` |
| 1860 | `max-width: 991.98px` | `left center` | `right center` |

(Line 2406 is a different element and is left alone.)

**Step 4 — update the preload** so `imagesrcset` matches the new candidate list exactly.
A mismatch makes the browser download the image twice.

**Step 5 — mobile check.** On phones the hero has a near-opaque navy `::before` overlay at
0.9 and centred text. With the subject on the right, confirm the crop still shows the
aircraft rather than empty tarmac — `object-position` may want `right center` there too, or
`center` if the composition reads better.

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Softer aircraft on large desktops | **Certain at 1024 px** | Get a higher-res export; otherwise accept |
| Text lands over the aircraft at some widths | Medium | Check 1280 / 1440 / 1920 after the change — the gradient's usable width is fixed in the artwork |
| Preload/srcset mismatch causing a double download | Medium | Step 4; verify in DevTools Network that the hero is fetched once |
| Mobile crop shows empty tarmac | Medium | Step 5 |
| Other hero pages affected | **None** | They use an inline gradient with no image |

## 8. Estimate

| Step | Effort |
|---|---|
| 1 — restore + build WebP set | 15 min |
| 2–4 — markup, CSS, preload | 20 min |
| 5 — responsive check at 5 widths | 20 min |
| **Total** | **~1 h** |

Reverts in one commit if the softness is unacceptable.

---

## 9. Decision needed before starting

**Do you have a higher-resolution export of the target composition (1920 px or wider)?**

- **Yes** → send it, and this runs at full quality with no downside at all.
- **No** → I proceed with the 1024 px asset from git history, and the aircraft will be
  softer on large monitors. Everything else is identical.
