# Security remediation plan

Response to the vulnerability report dated **17 Aug 2026**. Every finding was re-verified
against the current code and the live site on **20 Aug 2026** before planning anything —
the report is three days old and part of it has already been fixed.

**Status:** plan only. Nothing executed.

---

## Verification summary

| # | Report finding | Verified? | Notes |
|---|---|---|---|
| 1 | Stored/DOM XSS via `innerHTML` + `sanitize24X7` | ✅ **confirmed** | proven with a live payload test |
| 2 | Service-role JWT in browser `sessionStorage` | ✅ **confirmed** | and worse than reported — see below |
| 3 | Missing security headers | ⚠️ **partly outdated** | 4 of 6 now present |
| — | `/ads/` landing pages | ⛔ **out of scope** | live, but not in this repository |

### Finding 1 is real. Proven, not assumed.

`sanitize24X7` is a brand-casing normaliser — it rewrites `24/7` and `24x7` to `24X7` and
nothing else. Run against a payload:

```
in :  <img src=x onerror=alert(1)>
out:  <img src=x onerror=alert(1)>      UNCHANGED
```

The name is the whole problem. It reads like a sanitizer at every call site, and there are
**49 of them**. Database-backed values reach `innerHTML` in:

| File | Fields |
|---|---|
| `js/blogs-detail.js` | `content` (rich HTML), `name`, `message`, `admin_reply`, `category`, `title`, `slug` |
| `js/blogs.js` | `title`, `excerpt`, `author`, `featured_image` (into `src`), `slug` (into `href`) |
| `js/admin.js` | 21 `innerHTML` sites over `blogs`, `reviews`, `comments` |

### Finding 2 is real, and the report understates it

Confirmed at `js/admin.js:151`:

```js
sessionStorage.setItem("blogs_supabase_service_key", key);
window.rebindBlogsSupabaseClient(key);
```

`/admin` returns **200** publicly. `robots.txt` disallows it, which stops indexing, not
access.

> **The report missed this:** a `service_role` JWT for project `dtiirdimtbmkvryvqten` is
> **already in the git history of a public repository.** It was committed under
> `scratch/` and is recoverable with `git cat-file`. The file is gone from disk and
> `/scratch/` returns 404, but a published key stays valid until it is rotated.
>
> So the exposure is not hypothetical-pending-an-XSS. It is live now, and rotation is
> **P0 regardless of every other item on this page.**

### Finding 3 has largely been fixed since the report

Measured on the live site today:

```
X-Frame-Options: SAMEORIGIN                    PRESENT
X-Content-Type-Options: nosniff                PRESENT
Referrer-Policy: strict-origin-when-cross-origin  PRESENT
Strict-Transport-Security: max-age=31536000    PRESENT
Content-Security-Policy                        MISSING
Permissions-Policy                             MISSING
Server: nginx/1.28.3 (Ubuntu)                  version disclosed
```

`Permissions-Policy` is already in `nginx.conf` and simply has not been deployed. Only
**CSP** and `server_tokens off` are genuinely new work.

### `/ads/` is not ours to fix

The seven landing pages the report reviewed load `/ads/script.js` and
`/ads/supabase-config.js`. Both are live; **neither is in this repository** (0 tracked
files under `ads/`). Its config exposes an `anon` key only, which is correct.

Those pages cannot be fixed from this codebase. Whoever owns that deployment needs the same
review.

---

# The fixes, ordered so nothing breaks

The constraint is that the site keeps working at every step. That rules out the report's
suggested order — removing the service-role key first would break all nine admin write
operations immediately.

---

## Stage 0 — Rotate the service-role key (P0, do first, ~10 min)

Independent of all code. Supabase dashboard → Project Settings → API → roll `service_role`.

**Breaks nothing.** Verified: no committed code uses that key. `js/config.js` deliberately
keeps it out of source and expects it pasted at runtime, so rotating only invalidates the
published one. Whoever administers the blog re-pastes the new key until Stage 3 removes
that step entirely.

---

## Stage 1 — Plain-text fields → `textContent` (P1, ~2 h, zero risk)

The large majority of the XSS surface is plain-text values rendered through HTML templates:
`name`, `message`, `admin_reply`, `title`, `excerpt`, `author`, `category`.

None of these should ever contain markup. Building them with `textContent` removes the
injection path entirely, with no sanitizer and no dependency.

```js
// before
div.innerHTML = `<strong>${name}</strong><div>${message}</div>`;

// after
const strong = document.createElement("strong");
strong.textContent = name;
const body = document.createElement("div");
body.textContent = message;
div.replaceChildren(strong, body);
```

**Why this cannot break anything:** for legitimate content — text with no angle brackets —
`textContent` and `innerHTML` render identically. The only behaviour that changes is markup
inside a field, which is precisely the bug. If a comment currently contains `<b>` and
renders bold, it will start showing the literal characters; that is the correct outcome for
a plain-text field.

**Ordering note:** do this before Stage 2. It shrinks the attack surface immediately and
needs no new library, so the risky part gets smaller before it is touched.

---

## Stage 2 — Rich blog HTML → DOMPurify (P1, ~3 h, needs care)

Only one field is genuinely rich HTML: `data.content`, produced by the **Quill 2.0.2**
editor in the admin panel.

```js
contentEl.innerHTML = window.sanitize24X7(data.content);   // today
```

This one cannot use `textContent` — it would destroy every blog post's formatting. It needs
a real sanitizer.

**Self-host DOMPurify rather than loading it from a CDN.** The site already pulls Bootstrap
and Quill from jsDelivr, but a security control that fails to load is a security control
that is not there, and a CDN is one more origin to allow in the CSP that Stage 4 adds.

The allowlist must cover everything Quill emits, or posts lose formatting:

```js
const safe = DOMPurify.sanitize(raw, {
  ALLOWED_TAGS: ["p","br","strong","em","u","s","blockquote","pre","code",
                 "h1","h2","h3","h4","h5","h6","ul","ol","li",
                 "a","img","span","div","sub","sup","hr","table","thead","tbody","tr","td","th"],
  ALLOWED_ATTR: ["href","title","target","rel","src","alt","width","height","class","style"],
  FORBID_TAGS:  ["script","style","iframe","object","embed","form","input"],
  FORBID_ATTR:  ["onerror","onload","onclick","onmouseover","formaction"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/|#)/i
});
contentEl.innerHTML = normalizeBrandText(safe);
```

**Verification before shipping** — this is the step that protects the existing posts:

1. Run all three published posts through the sanitizer offline
2. Diff sanitized against original
3. Any difference is either a genuine threat removed, or a tag missing from the allowlist

If the diff is empty, the change is provably invisible to real content.

`class` and `style` are allowed because Quill uses them for alignment and indentation.
DOMPurify still strips `expression()` and `javascript:` inside `style`.

---

## Stage 3 — Remove the service-role key from the browser (P1, sequence matters)

**This is the one that breaks things if done in the report's order.**

`js/admin.js` performs **9 write operations** across four tables — `blogs` (5),
`reviews` (5), `comments` (1), `blog_audit_logs` (2) — all through
`window.blogsSupabaseClient`, which is the client rebound with the service key. Delete the
key input today and every one of those writes starts failing.

The admin panel already authenticates properly with `signInWithPassword`, so a logged-in
admin has a real Supabase session. The service key is only there because **RLS has no
policy granting writes to the `authenticated` role.**

Correct sequence:

| Step | Where | Breaks anything? |
|---|---|---|
| 3a. Add RLS policies allowing `authenticated` to write those four tables | Supabase | no — purely additive |
| 3b. Confirm admin works with the anon client while logged in, key input untouched | browser | no — key still available as fallback |
| 3c. Only once 3b passes: remove the key input, `sessionStorage` write, and `rebindBlogsSupabaseClient` | `js/admin.js`, `js/config.js` | no — the path is already proven |
| 3d. Tighten anon RLS: read published only, comments insert as pending, no anon updates | Supabase | verify the public blog still renders |

Steps 3a and 3d are Supabase dashboard work and **cannot be done from this repository.**

---

## Stage 4 — CSP and `server_tokens off` (P2, server-side)

`Permissions-Policy` needs no work — it is already in `nginx.conf` and lands with the next
deploy.

**CSP is the single most likely thing here to break the site.** This site runs inline
scripts, GTM, Google Ads, Turnstile, Supabase, jsDelivr and inline styles. A strict policy
blocks all of them.

Ship it in **two phases**:

```nginx
# Phase 1 — report only. Blocks nothing; logs what a real policy would break.
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://challenges.cloudflare.com https://cdn.jsdelivr.net; connect-src 'self' https://*.supabase.co https://ipapi.co https://ipwho.is; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" always;
```

Run that for a week, read the violation reports, then switch the header name to
`Content-Security-Policy`.

Two safe additions that can go immediately:

```nginx
server_tokens off;                        # stops advertising nginx/1.28.3 (Ubuntu)
add_header Permissions-Policy "..." always;   # already in nginx.conf
```

> The report suggests `X-Frame-Options: DENY`. The current value is `SAMEORIGIN` and should
> **stay** — `DENY` would break any same-origin iframe the site relies on. `frame-ancestors
> 'self'` in the CSP covers the clickjacking concern.

---

## The naming problem

`sanitize24X7` is called **49 times** across `js/admin.js`, `js/blogs-detail.js`,
`js/blogs.js`, `js/config.js` and `tools/build-blog-pages.py`. The name is why this bug
exists: every call site reads as though the value has been made safe.

Rename to `normalizeBrandText`, keeping a deprecated alias so nothing breaks mid-migration:

```js
window.normalizeBrandText = function (text) { /* unchanged body */ };
// Deprecated: this never sanitized HTML. Kept so no call site breaks during migration.
window.sanitize24X7 = window.normalizeBrandText;
```

`tools/build-blog-pages.py` has its own Python copy named `brand()`, which is already
honestly named and needs no change.

---

## Order and effort

| Stage | Work | Effort | Risk | Blocked by |
|---|---|---|---|---|
| 0 | **Rotate service-role key** | 10 min | none | — |
| 1 | Plain-text → `textContent` | 2 h | **none** | — |
| 2 | DOMPurify for blog body | 3 h | low, with the diff check | — |
| 3a | RLS policies for `authenticated` | 1 h | none, additive | Supabase access |
| 3b–c | Remove key from browser | 1 h | none if 3b passes | 3a |
| 3d | Tighten anon RLS | 1 h | needs public-blog check | Supabase access |
| 4 | CSP report-only, `server_tokens off` | 1 h | none in report-only | deploy |
| — | Rename `sanitize24X7` | 1 h | none, aliased | after 1 and 2 |

**Stages 0 and 1 together remove most of the real risk and cannot break anything.** They
are the right first commit.

---

## What this plan does not cover

- **`/ads/`** — live, not in this repository, same missing headers. Needs its own owner.
- **The `submit-lead` Edge Function** — the report is right that server-side Turnstile
  verification, field validation and rate limiting must be confirmed. That is Supabase
  code, not visible from here.
- **RLS policy contents** — only visible in the Supabase dashboard. The anon key was
  verified to read `blogs` and `reviews` only; the lead tables are unreachable with it,
  which is correct.
