# Parking lot

Decisions raised and deliberately deferred. Nothing here is broken; each is a choice
waiting on a call.

---

## 1. `air-ambulance-uae` and `air-ambulance-seychelles` in the sitemap

**Parked 19 Aug 2026.**

Both are in `sitemap.xml` and answer `200` today. But their files were deleted in `070ee16`,
and `nginx.conf` 301s them:

```
/air-ambulance-uae         -> /united-arabs
/air-ambulance-seychelles  -> /countries
```

So after the next config deploy, two sitemap entries will point at redirects. Not broken —
Google follows them — just wasted crawl budget and a mixed signal.

| Option | Effect |
|---|---|
| Drop both from the sitemap | Consistent with the pages being gone |
| `git revert 070ee16` | Restores both pages, removes the redirects |
| Leave it | Tolerated; costs a little crawl budget |

`seychelles-country.webp` is also now an unused image — the only one of the 35 not
referenced by a card.

---

## 2. Duplicate `Cache-Control` header on images

`expires 1y` emits its own `Cache-Control`, and the `add_header` beside it adds a second, so
images ship the header twice. Browsers take the first; nothing breaks. Raised once and left
alone. One-line fix in `nginx.conf` whenever it is wanted.

---

## 3. HSTS `preload`

`nginx.conf` sets `Strict-Transport-Security ... includeSubDomains; preload`. The header
alone does nothing until the domain is submitted at hstspreload.org, so nothing happens by
accident — but once submitted, removal takes months to reach browsers. The one directive in
that file that is genuinely hard to undo, and worth a deliberate decision rather than being
inherited.

---

## 4. Per-post keywords for blog pages

All three pre-rendered posts carry the template's `content="Air Medical 24X7"` — the same
string on every post. Faithful to what the template has always had, but not keywords in any
useful sense. Deriving them per post from the category and title is a small change to
`build_page()` in `tools/build-blog-pages.py`. Google has ignored this tag since 2009, so it
changes nothing for ranking.

---

## 5. Drift detection for the pre-rendered blog pages

`blogs/*.html` are build artifacts committed to the repo, and nothing warns when they fall
behind `blogs-detail.html`. That is exactly how the keywords tag went missing from them for
five days. A `--check` mode on `tools/build-blog-pages.py`, mirroring the one
`tools/build-config.py` already has, would catch it. ~20 minutes.

---

## 6. The country pages are 89% identical to each other

Measured: across 8 sampled country pages, 281 words are shared by all of them and roughly
117 are unique to each. They are standalone files, but clearly produced by copying one page
and changing the country name.

Not a code problem — an SEO one. Google treats near-duplicate pages as thin content and
usually indexes one while ignoring the rest. Likely the reason these pages underperform,
independent of anything in the server config. Fixing it means writing genuinely different
copy per country, which is content work rather than engineering.

---

## 7. `/blogs/<slug>.html` does not strip its extension

Returns `200` and serves the post, where every other page 301s to the clean URL. Cosmetic
inconsistency; the canonical tag already points at the clean form.
