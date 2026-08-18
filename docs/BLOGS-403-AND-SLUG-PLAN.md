# Plan — the /blogs/ 403, and the nav label that does not match its slug

**Reported:** `airmedical24x7.com/blogs/` shows *403 Forbidden*, and the trailing slash
should not be there; hovering "Airline Stretcher Services" shows a different slug.

**Status:** plan only. Nothing executed.

---

## Issue 1 — `/blogs` is currently unreachable on production 🔴

Not a cosmetic slash. The blog listing cannot be reached at its own canonical URL.

```
airmedical24x7.com/blogs      301  ->  /blogs/
airmedical24x7.com/blogs/     403      (nginx default page)
airmedical24x7.com/blogs.html 200      the page itself is fine

/countries   200      /countries/   404      <- every other page behaves normally
/about-us    200      /about-us/    404
```

### Root cause

A **`blogs` directory exists on the server** alongside `blogs.html`, and nginx resolves
the collision in favour of the directory:

```nginx
try_files $uri $uri/ $uri.html =404;
          ^^^^ matches the "blogs" DIRECTORY first
```

nginx's standard behaviour for a directory requested without a trailing slash is a 301
adding one. The directory has no index file and `autoindex` is off, so `/blogs/` is 403.
`blogs.html` is never reached, because `try_files` stopped at the first match.

**You did not type the slash — nginx added it.** Removing the redirect is what removes the
slash.

### The two hosts disagree, which is why this only shows on production

The preview already has the same collision — the pre-rendered `blogs/` directory shipped
there — but resolves it the other way:

| | `/blogs` | `/blogs/` | `/blogs/<slug>` |
|---|---|---|---|
| GitHub Pages | **200** (file wins) | 404 | 200 |
| nginx production | **301 → /blogs/** | **403** | 200 |

So this is purely an nginx resolution-order problem, not a content problem.

### Why it will not fix itself on deploy

`tools/build-blog-pages.py` creates `blogs/<slug>.html`, so **after deploying, the
directory exists by design**. Without the fix below, `/blogs` stays broken.

### Fix — one line

```nginx
# from
try_files $uri $uri/ $uri.html =404;
# to
try_files $uri.html $uri $uri/ =404;
```

Trying `<path>.html` before the directory makes `blogs.html` win for `/blogs`, while
`/blogs/<slug>` still resolves through `blogs/<slug>.html`. No URL changes, no redirect
hop, and the canonical and sitemap entry (`/blogs`, already declared) stay correct.

Considered and rejected:

- **Move `blogs.html` to `blogs/index.html`.** Works, but `/blogs` then 301s to `/blogs/`
  on every visit, and the canonical and sitemap entry both have to change to `/blogs/` —
  altering an indexed URL to fix a config bug.
- **Rename the pre-rendered directory** to `/blog/<slug>`. Leaves listing and posts on
  inconsistent paths.

### Also worth doing: stop nginx serving a 403 for any directory

```nginx
autoindex off;                 # already the default, but be explicit
location ~ ^/[^.]+/$ { return 404; }   # a directory URL is a 404, not a 403
```

A 403 tells a crawler "this exists but you may not see it"; a 404 says it is not a page.
Right now `/blogs/` returns 403 with nginx branding rather than the site's 404.

---

## Issue 2 — one nav label does not match its slug

Checked all 13 service links. Exactly one differs:

```
commercial-flight-stretcher     labelled "Airline Stretcher Services"
```

The other twelve match. The page itself is also internally inconsistent:

| | |
|---|---|
| file / URL | `commercial-flight-stretcher` |
| nav label | Airline Stretcher Services |
| `<title>` | **Airline Stretcher Services** \| Air Medical 24X7 |
| `<h1>` | **Commercial Flight Stretcher Service** |

So the page presents one name to search results and a different one on the page, and the
URL agrees with the `<h1>` rather than the `<title>`.

### This is a decision, not a bug

Nothing is broken — the link works. Which name is authoritative is a business and SEO
question I cannot answer from the code:

**Option A — align to "Airline Stretcher Services"** (nav label and `<title>` already say
this)
- rename to `airline-stretcher-services`, 301 the old slug, update the `<h1>`
- the `<title>` is what appears in search results and already targets this phrasing
- ⚠️ `/airline-stretcher-services` was a real URL before; a redirect for it already exists
  in `.htaccess` and the 404 router, so this reverses an earlier rename — worth knowing
  why it was renamed away before repeating it

**Option B — align to "Commercial Flight Stretcher"** (URL and `<h1>` already say this)
- change the nav label and the `<title>`
- no URL change, so no redirect and no ranking risk
- cheapest and safest

**Option C — leave it.** Purely cosmetic; the page ranks on whatever its content supports.

**Recommendation: B**, unless keyword data shows "airline stretcher" is the stronger term.
It removes the inconsistency without touching an indexed URL, and the `<h1>`/URL pair is
already self-consistent.

Whichever is chosen, the `<title>` and `<h1>` should stop disagreeing.

---

## Steps

| # | Step | Where | Effort |
|---|---|---|---|
| 1 | Reorder `try_files` to put `$uri.html` first | `nginx.conf` + the live server | 5 min |
| 2 | Return 404 rather than 403 for directory URLs | `nginx.conf` | 5 min |
| 3 | Decide A / B / C for the stretcher naming | — | your call |
| 4 | Apply the chosen option | 1–2 files, or 63 if the label changes | 15 min |

Step 1 is the only urgent one — it is a live, unreachable page.

> Step 1 **cannot be verified from this repository**: it is server config, and the current
> `nginx.conf` has never been applied to the live server. It ships with the same deploy as
> gzip, cache headers and `error_page 404`. See `docs/AWS-SERVER-CONFIG.md`.

---

## Verification

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/blogs      # expect 200, no redirect
curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/blogs/     # expect 404
curl -s -o /dev/null -w "%{http_code}\n" \
  https://airmedical24x7.com/blogs/medical-evacuation-bringing-your-loved-ones-home-safely  # 200
```
