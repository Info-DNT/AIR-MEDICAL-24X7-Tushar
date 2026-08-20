# Plan — remove the dead stylesheet comments

**Reported:** three HTML comments in the `<head>` that label nothing.

**Status:** plan only. Nothing executed.

---

## What they are

```html
  <!-- Google Web Fonts -->
<!-- Icon Font Stylesheet -->
  <!-- Libraries Stylesheet -->
```

Three consecutive comments with **no markup between them**. They are leftovers: the
`<link>` tags they used to label were removed during the performance work — the Google
Fonts request was replaced by a self-hosted subset, and the Font Awesome and library
stylesheets were consolidated into `lib/site-fonts.css`. The labels stayed behind.

Beyond being noise, they are actively misleading: a comment saying "Google Web Fonts" in
every page implies a Google Fonts request that has not existed for weeks.

---

## Audit

Every `<head>` comment on the site, checked against whether a real tag follows it:

| Comment | Orphaned | Labels a real tag | Action |
|---|---|---|---|
| `<!-- Google Web Fonts -->` | **65** | 0 | delete everywhere |
| `<!-- Icon Font Stylesheet -->` | **65** | 0 | delete everywhere |
| `<!-- Libraries Stylesheet -->` | **63** | **1** | delete 63, keep 1 |
| `<!-- Template Stylesheet -->` | 0 | 65 | **keep** |
| `<!-- Customized Bootstrap Stylesheet -->` | 0 | 65 | **keep** |
| `<!-- Favicon -->` | 0 | 65 | **keep** |

The last three still do their job and are not in scope.

**193 comment lines to remove** across 65 files.

---

## Two edge cases

**1. `about-us.html` line 166 — do not delete.**

```html
<!-- Libraries Stylesheet -->
<link href="lib/owlcarousel/assets/owl.carousel.min.css" rel="stylesheet">
```

This is the one place the comment still labels a real stylesheet. A blind
find-and-replace across all files would strip a comment that is doing its job. The removal
must be conditional on nothing following it.

**2. `admin.html` has no `Libraries Stylesheet` comment.** It carries
`<!-- Quill Rich Text Editor Stylesheet -->` instead, which labels a real Quill stylesheet
and stays.

---

## Also worth knowing

`blogs-detail.html` is the template for the three pre-rendered posts under `blogs/`. It has
to be included, or the next `tools/build-blog-pages.py` run reintroduces the comments into
the generated pages. The three generated files should be edited too, so the repository is
consistent without waiting for a rebuild.

---

## Method

Not a plain string replace. Each comment is removed **only when the next non-blank line is
not a tag** — which is what protects `about-us.html`.

```
for each html file:
    for each of the three comments:
        find the line
        look ahead to the next non-blank line
        if it is another comment, or nothing:  delete the line
        otherwise:                             leave it alone
```

Indentation varies (`  <!-- Google Web Fonts -->` vs `<!-- Icon Font Stylesheet -->` with
no indent), so matching is on the stripped line, and the whole line including its
whitespace is removed.

---

## Steps

| # | Step | Effort |
|---|------|--------|
| 1 | Remove the orphaned comments, skipping any that label a tag | 10 min |
| 2 | Confirm exactly 193 lines gone and nothing else changed | 5 min |
| 3 | Re-check the three kept comments still have their tags | 2 min |
| 4 | Render check + JSON-LD revalidation | 5 min |

**Risk: very low.** HTML comments are inert — removing them cannot change rendering,
behaviour or SEO. The only real risk is deleting the wrong line, which step 2 catches by
requiring the diff to contain nothing but comment removals.

---

## Verification

```bash
# none of the three orphans survive
git grep -c '<!-- Google Web Fonts -->' -- '*.html' | wc -l      # expect 0
git grep -c '<!-- Icon Font Stylesheet -->' -- '*.html' | wc -l  # expect 0

# the one legitimate Libraries comment is still there
grep -A1 'Libraries Stylesheet' about-us.html    # expect the owlcarousel link

# the three kept comments are untouched
git grep -c '<!-- Favicon -->' -- '*.html' | wc -l               # expect 65

# and the diff contains nothing but deletions of those comment lines
git diff -U0 | grep -E '^[+-]' | grep -v '^[+-][+-]' | grep -vc '<!--'   # expect 0
```
