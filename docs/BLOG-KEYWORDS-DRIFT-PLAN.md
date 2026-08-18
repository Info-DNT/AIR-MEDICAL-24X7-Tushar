# Plan — the missing keywords tags, and why they were missed

**Reported:** some pages still have no `<meta name="keywords">` after the restore in
`b582768`.

**Status:** plan only. Nothing executed.

---

## What is actually missing

5 of 66 HTML files have no keywords tag. **Two of those are correct**, three are not:

```
404.html                              never had one   noindex, follow    <- correct
admin.html                            never had one   noindex, nofollow  <- correct
blogs/a-high-risk-air-medical-...     lost it         indexable          <- BUG
blogs/how-air-ambulance-services-...  lost it         indexable          <- BUG
blogs/medical-evacuation-...          lost it         indexable          <- BUG
```

`404.html` and `admin.html` carried no keywords tag at `b2214ce` either — the commit
*before* the removal. They never had one to restore, and both are `noindex`, so they are
correctly excluded rather than missed.

**The real answer is three files, all under `blogs/`.**

---

## Root cause

`blogs/*.html` are **build artifacts**, not hand-written pages. They are generated from the
`blogs-detail.html` template by `tools/build-blog-pages.py`, and committed to the repo so
crawlers get real HTML.

The restore in `b582768` did what it was asked: it put the tag back into every file that had
one at `b2214ce`. `blogs-detail.html` was in that set and **was** restored correctly.

But restoring the template does not touch the pages already generated from it. Those are
only rewritten when someone remembers to run the script.

```
319c969  13 Aug   blogs/*.html generated          <- the last actual generation
b582768  18 Aug   keywords restored in template   <- template only
f6734f6  18 Aug   blogs/*.html touched            <- text substitution for the
                                                     stretcher rename, NOT a rebuild
```

`f6734f6` makes this easy to misread: the files *were* modified on 18 Aug, so they look
current. That commit was a find-and-replace across all HTML, not a regeneration.

### Confirmed: keywords is the only thing that drifted

Comparing the template against a generated page:

```
in template but missing from generated page:   keywords
in generated page but not the template:        og:title, og:description, og:url,
                                               og:image, og:type, twitter:*   <- injected
                                                                                by the build,
                                                                                correct

canonical        template 1   generated 1   OK
article schema   template 0   generated 1   OK (injected)
open graph       template 0   generated 1   OK (injected)
```

So nothing else is stale. This is a single missed propagation, not a broken build.

### The underlying problem is wider than this tag

**Nothing detects the drift.** The script must be run by hand, and if it is not, the
generated pages silently keep serving whatever the template said last time it ran. Any
future edit to `blogs-detail.html` — a nav change, a script, a meta tag — fails to reach
the three live blog posts in exactly the same way, with no warning.

The keywords tag is the symptom that happened to be noticed. The cause will recur.

---

## Fix

### Step 1 — regenerate (5 min)

```bash
python tools/build-blog-pages.py
```

Verified safe to run now:

- Supabase is reachable with the public anon key
- it reports **3 published posts**, matching the 3 files on disk exactly — so nothing is
  added or deleted, only rewritten
- the script writes nothing to the database

Then confirm:

```bash
grep -L 'name="keywords"' blogs/*.html      # expect no output
```

### Step 2 — stop it drifting again (20 min)

Add a `--check` mode to `tools/build-blog-pages.py` that regenerates into memory, compares
against what is on disk, and exits non-zero on any difference — without writing.

```bash
python tools/build-blog-pages.py --check
#   blogs/<slug>.html is stale (template changed since it was generated)
```

This mirrors `tools/build-config.py --check`, which already does exactly this for
`js/config.js`, so the two build steps behave the same way.

Cheap and worth it: run `--check` before any deploy, and the answer to "did anyone re-run
the blog build?" stops being a matter of memory.

---

## One decision worth making first

The tag the blog pages would inherit is:

```html
<meta content="Air Medical 24X7" name="keywords">
```

A single brand name, identical on all three posts. That is what the template has always
carried, so restoring it is faithful — but it is not keywords in any useful sense, and it
would be the same string on every post the site ever publishes.

Google has ignored this tag since 2009, so **none of this affects ranking either way.** The
question is only what the markup should say.

| | |
|---|---|
| **A. Restore as-is** | run Step 1, all 66 files consistent, tag says the brand name |
| **B. Per-post keywords** | have the build derive them from the post's `category` and title, e.g. `medical evacuation, air ambulance, Air Medical 24X7` |
| **C. Leave blog posts without it** | they are the only generated pages; the other 61 keep theirs |

**Recommendation: A now, B later if wanted.** A closes the inconsistency you reported in one
command. B is a small change to `build_page()` but is a content decision, not a bug fix, and
should not hold up Step 1.

---

## Steps

| # | Step | Effort | Risk |
|---|------|--------|------|
| 1 | `python tools/build-blog-pages.py` | 5 min | none — 3 posts in, 3 files out, no DB writes |
| 2 | Add `--check` drift detection | 20 min | none — new flag, no behaviour change |
| 3 | Decide A / B / C on the tag content | — | your call |

Step 1 alone resolves what was reported.

---

## Verification

```bash
# every indexable page has the tag
for f in $(git ls-files '*.html'); do
  grep -q 'name="keywords"' "$f" || echo "MISSING: $f"
done
# expect only: 404.html, admin.html   (both noindex, both correct)

# and the generated pages are no longer stale
python tools/build-blog-pages.py --check   # after step 2
```
