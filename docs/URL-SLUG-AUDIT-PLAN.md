# Plan — URL and slug inconsistencies

**Reported:** hovering "Our Services" shows `airmedical24x7.com/#`; blog links show
`blogs-detail.html?slug=…` instead of a clean path.

**Status:** audit complete, plan only. Nothing executed.

---

## The two reports are different kinds of problem

| | Reported issue | Actually |
|---|---|---|
| 1 | "Our Services" → `/#` | **Already fixed in the repo. Not deployed.** |
| 2 | `blogs-detail.html?slug=…` | **Genuinely unfixed.** Three inconsistent forms in the code |

### 1. The `#` link — fixed, waiting on a deploy

```
repo:        <button type="button" class="nav-link dropdown-toggle" …>
production:  <a href="#" class="nav-link dropdown-toggle" …>
```

Fixed in commit `98ab21a`, which converted the toggle to a `<button>` — it has no `href`,
so nothing appears in the status bar. Production still serves the old anchor because it
has not been redeployed. **No code change needed; this resolves itself on deploy.**

### 2. Blog URLs — three different forms for the same link

```
js/blogs.js:54      blogs-detail.html?slug=${blog.slug}     <- with .html
js/blogs.js:61      blogs-detail.html?slug=${blog.slug}     <- with .html
index.html:1083     blogs-detail?slug=${b.slug}             <- without
js/blogs-detail.js  blogs-detail?slug=${post.slug}          <- without
```

The same destination is written three ways. The `.html` variants are what you saw in the
status bar. Everywhere else on the site uses extensionless URLs, so these are the only
links still exposing a file extension.

---

## The deeper problem behind #2

Fixing the extension alone would leave blog URLs still broken. The full picture:

**a. The address bar is rewritten to a URL that does not exist.**

```js
// js/blogs-detail.js:62
history.replaceState({ slug }, sanitizedTitle, `/blogs/${slug}`);
```

After a post loads, the URL becomes `/blogs/{slug}` — which 404s:

```
/blogs                                    200
/blogs-detail.html?slug=pediatric-…       200
/blogs/pediatric-…                        404   <- what the address bar shows
```

So every shared, bookmarked or refreshed blog URL is dead. Users copy that URL *because it
looks clean* — that is the point of the rewrite — and it is broken for everyone they send
it to. This is INF-03 from the original audit.

**b. Category and tag links go nowhere useful.**

```js
js/blogs-detail.js:207   blogs?category=${category}
js/blogs-detail.js:253   blogs?tag=${tag}
```

`js/blogs.js` never reads `location.search` — zero occurrences. So clicking a category or
tag loads the unfiltered blog list. The sidebar looks functional and is not.

**c. Blog content is invisible to search engines.** Posts are client-rendered from
Supabase into an empty div, and the canonical is hardcoded to `/blogs` before JavaScript
rewrites it. Combined with (a), the blog has effectively no organic presence. This is
INF-04.

---

## Everything else checked — and it is clean

| Check | Result |
|---|---|
| Internal links carrying `.html` | **1** (see below) |
| Placeholder `#` / `#!` links | **0** |
| Country / service slugs | consistent, all resolve |
| Canonicals | 61, all non-www, all resolve |
| Sitemap URLs | all backed by a file or a live page |

The single remaining `.html` link is inside a JS string in `countries.html:584` — the
"BACK TO HOMEPAGE" button in the quote-success modal, `href="index.html"`. Cosmetic, but
it is the only inconsistency left outside the blog.

---

## Fix plan

### Step 1 — unify the blog link form *(15 min, safe)*
Make all four call sites emit the same extensionless URL:

```
blogs-detail.html?slug=X   ->   blogs-detail?slug=X
```

Files: `js/blogs.js` (2), `index.html` (1), `js/blogs-detail.js` (1 — already correct).
This alone fixes what you saw in the status bar.

### Step 2 — make `/blogs/{slug}` actually work *(1 h)*
Two halves, both required:

- **Server:** route `/blogs/*` to `blogs-detail.html`. In nginx:
  ```nginx
  location ~ ^/blogs/(.+)$ { try_files /blogs-detail.html =404; }
  ```
- **Client:** `blogs-detail.js` reads the slug from `location.pathname` as well as
  `?slug=`, so both entry forms work.

Then change the links from `blogs-detail?slug=X` to `/blogs/X` and the `replaceState`
becomes truthful rather than aspirational.

> Cannot be done on GitHub Pages — it issues no rewrites. The preview would 404 on
> `/blogs/{slug}` even after this; production is what matters here.

### Step 3 — make category and tag filters work, or remove them *(30 min)*
Either have `blogs.js` read `?category=` / `?tag=` and filter, or drop the links. Shipping
controls that silently do nothing is worse than not having them.

### Step 4 — fix the last `.html` link *(2 min)*
`countries.html:584`, `href="index.html"` → `href="./"`.

### Step 5 — blog SEO *(separate piece of work)*
Server-render or pre-render post content, and set a real per-post canonical rather than
hardcoding `/blogs` and patching it in JS. Larger than this plan; noted so it is not lost.

---

## Sequence and dependencies

```
Step 1  ──> independent, ship anytime
Step 4  ──> independent, ship anytime
Step 2  ──> needs the nginx change; do WITH the deploy
Step 3  ──> independent
Step 5  ──> its own project
```

Steps 1 and 4 are safe now. Step 2 only makes sense as part of a deploy, since it needs
server config.

---

## The recurring theme

Report #1 was already fixed, three commits ago. It looks broken because **production has
never been redeployed this session.** The same cause explains the missing favicon, the
stale markup, and the 293 KB per page of uncompressed transfer.

Deploying is now worth more than any further code change. Steps in
`docs/AWS-SERVER-CONFIG.md`; the 301s in `docs/URL-RESTRUCTURE-PLAN.md` §5 are mandatory
at deploy time or the old `/countries/*` URLs become 404s.
