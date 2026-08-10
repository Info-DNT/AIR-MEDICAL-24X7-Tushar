# Plan — remove `/countries/` and `/services/` from public URLs

**Goal:** `…/countries/air-ambulance-afghanistan` → `…/air-ambulance-afghanistan`, for every page.

**Status:** plan only. Nothing in this document has been executed.

---

## 1. This is not cosmetic — the site already claims the short URLs, and they 404

While reviewing the request I checked what the pages declare versus what actually
resolves. The short URLs are already the *declared* canonical form everywhere — they just
don't exist.

```
countries/air-ambulance-afghanistan.html declares:
    <link rel="canonical" href="https://airmedical24x7.com/air-ambulance-afghanistan">

sitemap.xml lists:
    https://airmedical24x7.com/air-ambulance-afghanistan

countries.html links to:
    href="/air-ambulance-afghanistan"   (and 31 more like it)

that URL actually returns:
    HTTP 404   ← on production AND on the GitHub Pages preview
```

So today:

| What | Count | State |
|---|---:|---|
| Country pages whose canonical points at a 404 | 35 | 🔴 |
| Sitemap entries that 404 | 35 | 🔴 |
| Links on the countries hub that 404 | 32 | 🔴 |
| Country pages reachable only at the long URL | 35 | 🔴 |

A canonical tag pointing at a 404 is worse than having none — Google is being told the
real address of every country page is a dead URL. **This is the highest-value SEO fix
outstanding**, and it happens to be exactly what you asked for.

Service pages are half-fixed already: `/air-ambulance` returns 200 on production (a
partial rewrite exists) but 404s on the preview, and `/services/air-ambulance` *also*
returns 200 — so those pages currently serve on two URLs at once.

---

## 2. Two ways to fix it

### Option A — server rewrite only

Add to the nginx `location /` block:

```nginx
try_files $uri $uri/ $uri.html /countries$uri.html /services$uri.html =404;
```

- ✅ No file changes at all
- ❌ Does **not** work on GitHub Pages — the preview stays broken
- ❌ Depends on server config being applied, which has a poor track record here: gzip,
  cache headers and the www redirect are all in the repo's `nginx.conf` and none are live
- ❌ Physical layout keeps disagreeing with the public URLs

### Option B — move the files to the root ✅ **recommended**

- ✅ Works on every host with zero server configuration
- ✅ Makes the existing canonicals, sitemap and hub links correct instead of aspirational
- ✅ Preview and production behave identically — no more "works on one, not the other"
- ✅ Removes an entire class of config dependency
- ⚠️ Touches many files, so it needs the verification in §6

**Recommendation: Option B**, with the redirects in §5 so nothing already indexed is lost.

---

## 3. Scope — measured, not estimated

```
root pages                16
countries/                35   (34 to move + index.html, a duplicate → delete)
services/                 13   (all move)

filename collisions       only index.html  (countries/index.html vs root)
case-insensitive clashes  none
relative "../" refs to fix          2,452
"countries/" links to update           32
"services/" links to update             9
```

`countries/index.html` is a near-duplicate of `countries.html` — same title, and its
canonical points at the **homepage**. It should be deleted, not moved (flagged in the
original audit as SEO-02).

---

## 4. Execution steps

Each step is independently verifiable. Do not batch them.

**Step 1 — move the files**
```
git mv countries/air-ambulance-*.html .
git mv services/*.html .
git rm countries/index.html          # duplicate of countries.html
```
`countries.html` stays at the root and keeps serving `/countries` as the hub.

**Step 2 — fix paths inside the moved files**
They are now one level shallower, so every `../` prefix is wrong:

| Before | After |
|---|---|
| `../css/style.css` | `css/style.css` |
| `../js/main.js` | `js/main.js` |
| `../img/…` | `img/…` |
| `../lib/…` | `lib/…` |
| `../index.html`, `../about-us` | `index.html`, `about-us` |

Scripted as a single pass over the 47 moved files: strip a leading `../` from every
`href`/`src`/`url()`. 2,452 references — mechanical, but must be verified (§6).

**Step 3 — update links in the other 16 pages**
32 `countries/…` and 9 `services/…` references drop their directory segment.

**Step 3b — convert root-absolute links to relative** ⚠️ *added after testing*

`countries.html` links to countries as `href="/air-ambulance-afghanistan"` — 32 of them.
A leading `/` means "domain root", which is correct on `airmedical24x7.com` but wrong on
any deployment served from a subdirectory:

```
page:      info-dnt.github.io/AIR-MEDICAL-24X7-Tushar/countries.html
href:      "/air-ambulance-afghanistan"
resolves:  info-dnt.github.io/air-ambulance-afghanistan     ← repo prefix dropped → 404
```

That is why the short URL 404s on the preview even for pages that exist. Once every page
sits at the root, the fix is simply to drop the leading slash:

```
href="/air-ambulance-afghanistan"   →   href="air-ambulance-afghanistan"
```

Relative links then work identically at a domain root and under any subpath, so the
preview and production stop disagreeing. Apply the same to the 9 `services/` links.

**Step 4 — verify canonicals and sitemap**
Both already use the short form, so they should need **no change**. Confirm rather than
assume — this is the whole point of the exercise.

**Step 5 — add the redirects (§5)**

**Step 6 — run the verification suite (§6)**

---

## 5. Redirects — required, do not skip

`/countries/air-ambulance-afghanistan` currently returns 200 and is what Google has
actually been able to crawl. Removing it without a redirect discards that history.

```nginx
# old country URLs -> root, permanently
location ~ ^/countries/(air-ambulance-[^/]+)(?:\.html)?$ {
    return 301 /$1;
}
# old service URLs -> root, permanently
location ~ ^/services/([^/]+?)(?:\.html)?$ {
    return 301 /$1;
}
# the countries hub keeps working at /countries
location = /countries/       { return 301 /countries; }
location = /countries/index  { return 301 /countries; }
```

> **GitHub Pages cannot issue 301s.** If the preview must keep the old URLs alive, the
> only option there is small HTML stubs with `<meta http-equiv="refresh">` plus
> `<link rel="canonical">`. For the preview I would simply let them 404 — it is not the
> indexed host. Production must have the real 301s.

After deploying, resubmit `sitemap.xml` in Google Search Console and watch Coverage for
the old paths dropping out and the new ones being indexed.

---

## 6. Verification

```bash
# 1. every short URL resolves
while read -r u; do
  printf "%s " "$u"; curl -s -o /dev/null -w "%{http_code}\n" "https://airmedical24x7.com$u"
done < <(grep -oP '(?<=<loc>)[^<]+' sitemap.xml | sed 's|https://airmedical24x7.com||')
# expect: 200 for all 60

# 2. every old URL 301s to the short one
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
  https://airmedical24x7.com/countries/air-ambulance-afghanistan
# expect: 301 -> /air-ambulance-afghanistan

# 3. no page references a stale directory path
grep -rn 'countries/\|services/\|\.\./' --include=*.html . | grep -v docs/
# expect: no output

# 4. canonical == the URL that serves it, on a sample of each page type
```

Also re-run the repo's own link checker, and confirm every asset on a moved page still
resolves — the `../` rewrite is where this change would most plausibly break.

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A `../` rewrite misses an edge case (inline `style="url(…)"`, JS-built paths) | Medium | §6 step 3 + the link checker; scan inline `<script>` and `<style>` too |
| Old URLs lose ranking | Low | 301s in §5; canonicals already point to the new form |
| Root directory becomes 63 files | Certain | Cosmetic. This is what the site already claims publicly, and it is how the site was originally laid out before the folder restructure |
| Root-absolute links keep the preview broken | Certain if step 3b is skipped | Step 3b — convert all 32 to relative |
| Something depends on the folder path | Low | `sw.js` hardcodes `/services/` and `/countries/` rewrites — must be updated in the same change |

**`sw.js` needs updating in this change.** It contains a hardcoded service-slug list and
maps `/slug` → `/services/slug.html`. After the move it must map to `/slug.html`, or it
will 404 for local development.

---

## 8. Estimate

| Step | Effort |
|---|---|
| 1–3 — move, rewrite paths, update links | 2 h |
| 4 — canonical/sitemap confirmation | 20 min |
| 5 — redirects | 30 min |
| 6 — verification | 1 h |
| **Total** | **~4 h** |

Worth doing as one atomic commit so it can be reverted in one step if verification fails.
