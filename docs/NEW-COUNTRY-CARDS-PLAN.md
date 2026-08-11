# Plan — add UK, Philippines and Northeast India cards to the countries page

**Request:** three new cards on `countries.html`. Content comes later; images will be
dropped in once filenames are agreed.

**Status:** plan only. Nothing executed.

---

## 1. The existing pattern

Every card on `countries.html` follows this exactly:

```html
<div class="col-lg-3 col-md-6 col-12">
  <a href="air-ambulance-{slug}" class="country-card">
    <img src="img/{name}-country.webp" alt="Air Ambulance in {Name}" loading="lazy">
    <div class="overlay">
      <span>Air Ambulance in</span>
      <h4>{Name}</h4>
    </div>
  </a>
</div>
```

32 cards today. New ones go at the end of the grid, before the
`<!--Above Country Mentioned by 8-->` comment.

---

## 2. The decision that has to be made first ⚠️

**A card links to a page. Those three pages do not exist.**

```
air-ambulance-uk.html              does not exist
air-ambulance-philippines.html     does not exist
air-ambulance-northeast-india.html does not exist
```

Adding cards alone puts **three new dead links on the hub page** — the same defect class
just cleaned up across the last several commits (35 country canonicals pointing at 404s,
32 broken hub links, a breadcrumb routing through a missing page).

| Option | Result |
|---|---|
| **A. Cards + stub pages** ✅ recommended | Links work immediately. Stubs are clones of an existing country page with the name swapped and the body left for real copy. Nothing 404s at any point. |
| B. Cards only | Three 404s live on the hub until the pages are written. |
| C. Cards commented out | No 404s, but nothing visible either — so the cards do not actually ship. |

**Recommendation: A.** A stub carries the correct `<head>`, canonical, nav, footer and
schema, with placeholder body copy. "Add the content later" then means editing one section
of a working page rather than building it from nothing.

If B is chosen deliberately, the cards should not be deployed to production until the
pages exist.

---

## 3. Naming

| | Slug / URL | Image file | Card label |
|---|---|---|---|
| UK | `air-ambulance-uk` | `img/uk-country.webp` | `UK` |
| Philippines | `air-ambulance-philippines` | `img/philippines-country.webp` | `Philippines` |
| Northeast India | `air-ambulance-northeast-india` | `img/northeast-india-country.webp` | `Northeast India` |

**UK vs United Kingdom.** The site already abbreviates — `air-ambulance-uae`, labelled
`UAE`, not "United Arab Emirates". `air-ambulance-uk` keeps that consistent and matches
how people actually search for this service. Say so if you would rather have
`air-ambulance-united-kingdom`; it is a one-word change now and a redirect later.

**Northeast India — two things to flag, both your call:**

1. It is a *region*, not a country, on a page of countries. The page is titled "Air
   Ambulance Services Worldwide" and already includes Dubai (a city), so this is
   consistent with what is there — worth a conscious decision rather than an accident.
2. **Keyword overlap.** `air-ambulance-india` and `air-ambulance-to-india` already exist.
   A third India-targeting page competes with both unless it is written for a genuinely
   different intent — Guwahati, Imphal, Agartala, Shillong, Dibrugarh — rather than
   generic "air ambulance India" terms. Worth deciding the angle before the copy is
   written, not after.

---

## 4. Image specification — what to drop into `/img/`

All 30 existing country images were converted to WebP and capped at 600 px in an earlier
commit. New images must match, or they undo that work.

| | |
|---|---|
| **Format** | **WebP** — not JPG or PNG |
| **Width** | **600 px** |
| **Shape** | Square (600×600) matches 18 of 30 existing; landscape is fine |
| **File size** | Under **100 KB**; existing range is 24–98 KB, average 57 KB |

**Exact filenames:**

```
img/uk-country.webp
img/philippines-country.webp
img/northeast-india-country.webp
```

**Framing note:** the card renders at roughly **285 × 220 px** with `object-fit: cover`,
so the image is centre-cropped to a landscape rectangle. Keep the subject central —
anything near the top or bottom edge of a square image will be cut off.

If you only have JPG or PNG, hand them over as-is and they can be converted and resized
here to match the rest of the library.

---

## 5. Steps

1. Add three cards to `countries.html` in the established pattern.
2. *(Option A)* Create the three stub pages by cloning an existing country page —
   swap country name, title, description, canonical, and the schema `@id` values.
3. *(Option A)* Add the three URLs to `sitemap.xml`.
4. You drop the three WebP files into `/img/`.
5. Verify (§6).

---

## 6. Verification

```bash
# every card link resolves to a real page
python scratchpad/linkcheck2.py        # expect: all references resolve

# the three images exist, are WebP, and are within budget
ls -l img/uk-country.webp img/philippines-country.webp img/northeast-india-country.webp

# card count went 32 -> 35
grep -c 'country-card' countries.html

# no page claims a canonical that does not exist
# JSON-LD still parses on the new pages
```

Until step 4 is done the three cards will show a broken image on the hub page — expected,
and the reason to keep this off production until the files land.

---

## 7. Estimate

| Step | Effort |
|---|---|
| 1 — three cards | 10 min |
| 2 — three stub pages | 30 min |
| 3 — sitemap | 5 min |
| 5 — verification | 15 min |
| **Total** | **~1 h** |
