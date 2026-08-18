# Plan — one canonical URL per page, and a working 404

**Reported:** the site opens on `index.html`; `www` does not redirect to non-`www`; the
404 page never appears.

**Status:** plan only. Nothing executed. Nothing pushed.

---

## The measurements

```
https://airmedical24x7.com/               200
https://airmedical24x7.com/index          200
https://airmedical24x7.com/index.html     200
https://www.airmedical24x7.com/           200
https://www.airmedical24x7.com/index      200
https://www.airmedical24x7.com/index.html 200      <- 6 URLs, one homepage

/about-us  200    /about-us.html  200
/countries 200    /countries.html 200               <- every page doubles, then
                                                       doubles again on www

/this-page-does-not-exist  ->  404, 162 bytes, nginx's default page
/404.html                  ->  200                  <- backwards on both counts
```

27 live pages are reachable at **108 URLs**. Google treats each as a separate page and
splits ranking signals between them.

---

## Root cause

### The main one: your routing rules are in a file nginx cannot read

`.htaccess` contains the www redirect, the security headers and the caching rules:

```apache
RewriteCond %{HTTP_HOST} ^www\.airmedical24x7\.com$ [NC]
RewriteRule ^(.*)$ https://airmedical24x7.com/$1 [R=301,L]
```

**`.htaccess` is an Apache file. The server is nginx** (`Server: nginx/1.28.3`), and
**nginx never reads `.htaccess` — there is no module for it and no way to enable it.**

So the rules look present in the repo and do nothing at all. That is almost certainly why
these three issues persisted: they *were* configured, just for the wrong web server.

`nginx.conf` — the file that would work — has never been applied. All three issues share
this single cause.

### Two additional gaps in `nginx.conf` itself

Applying the current `nginx.conf` **would not fully fix issues 1 and 2.** Both need config
changes, not just a deploy:

**Gap 1 — the www redirect only listens on port 80.**

```nginx
server {
    listen 80;                      # <-- http only
    server_name www.airmedical24x7.com;
    return 301 https://airmedical24x7.com$request_uri;
}
```

Verified: the Let's Encrypt certificate covers **both** hostnames
(`DNS:airmedical24x7.com, DNS:www.airmedical24x7.com`) and TLS terminates on the server,
not a CDN. So `https://www...` never reaches this block — it falls through to the default
443 server and returns 200. Since `http://` already 301s to `https://`, essentially all
real traffic misses the redirect.

**Gap 2 — nothing maps `/index` or `/index.html` to `/`.**

The generic `.html` rule turns `/index.html` into a 301 to `/index`, and `/index` then
serves 200 through `try_files $uri.html`. The homepage keeps two URLs.

### Issue 3 is not a broken page

`404.html` is fine. Its router (lines 4–69) handles legacy paths and otherwise renders in
place, exactly as intended. It is simply **never invoked**, because `error_page 404
/404.html;` is not in the deployed config. nginx answers with its own 162-byte page.

---

## ⚠️ The trap: a naive fix takes the homepage down

The obvious implementation causes an **infinite redirect loop on `/`**:

```nginx
index index.html;
location = /index.html { return 301 /; }     # DO NOT do this alone
```

The `index` directive does not serve the file quietly — it issues an **internal redirect**
to `/index.html`, which re-enters location matching, hits the 301, goes back to `/`, and
loops until the browser gives up. The homepage would return `ERR_TOO_MANY_REDIRECTS`.

The fix is to serve the homepage with `try_files`, which serves a file **without** re-running
location matching:

```nginx
location = / {
    try_files /index.html =404;
}
```

This must go in together with the 301s, not after them.

---

## The changes

All in `nginx.conf`. No HTML changes — canonicals and the sitemap already declare non-`www`
and `/`, so they are already correct and stay untouched.

### 1. Redirect `www` on HTTPS as well as HTTP

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name www.airmedical24x7.com;

    # Same certificate as the main block -- it already covers both names.
    # Confirm the real paths on the server with: sudo certbot certificates
    ssl_certificate     /etc/letsencrypt/live/airmedical24x7.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/airmedical24x7.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://airmedical24x7.com$request_uri;
}
```

Keep the existing port-80 www block as well — it catches plain-http requests.

### 2. Collapse the homepage to a single URL

```nginx
# Serve / directly. Using the `index` directive here would internally redirect
# to /index.html, re-enter location matching, and loop against the 301 below.
location = / {
    try_files /index.html =404;
}
location = /index      { return 301 /; }
location = /index.html { return 301 /; }
```

Exact-match (`=`) locations take priority over regex, so these win over the generic
`.html` rule.

### 3. Make the 404 page actually serve

Already in `nginx.conf` and correct:

```nginx
error_page 404 /404.html;
location = /404.html { internal; }
```

Add one line so the extensionless form does not answer 200:

```nginx
location = /404 { internal; }
```

### 4. Delete `.htaccess`

It cannot execute, it duplicates rules that now live in `nginx.conf`, and leaving it
invites someone to edit it and assume the change took effect. Removing it is safe — nginx
has never read it.

---

## Steps

| # | Step | Where | Effort |
|---|------|-------|--------|
| 1 | Add the three config blocks above to `nginx.conf` | repo | 15 min |
| 2 | Confirm certificate paths (`sudo certbot certificates`) | server | 5 min |
| 3 | Apply config, `sudo nginx -t`, reload | server | 10 min |
| 4 | Verify (below) | — | 10 min |
| 5 | Delete `.htaccess` | repo | 1 min |
| 6 | Resubmit sitemap in Search Console | — | 5 min |

`nginx -t` is the safety gate — a bad config fails there and the running server is
untouched. Keep the Stage 0 backup from `docs/DEPLOY-FIX-PLAN.md`.

> This is the **same deploy** as `docs/DEPLOY-FIX-PLAN.md`. Do them together — both are
> "apply nginx.conf", and there is no reason to reload twice.

---

## Verification

```bash
# 1. homepage answers on exactly one URL
for u in / /index /index.html; do
  curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}  $u\n" \
    https://airmedical24x7.com$u; sleep 1
done
# expect: 200 for /, and 301 -> https://airmedical24x7.com/ for the other two

# 2. www redirects on https
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://www.airmedical24x7.com/about-us
# expect: 301 -> https://airmedical24x7.com/about-us

# 3. the branded 404 appears, with a 404 status
curl -s -o /dev/null -w "%{http_code} %{size_download} bytes\n" \
  https://airmedical24x7.com/this-page-does-not-exist
# expect: 404 and ~26000 bytes (not 162)

# 4. NO redirect loop on the homepage -- the one thing that could break the site
curl -sIL --max-redirs 5 https://airmedical24x7.com/ | grep -c '^HTTP'
# expect: 1
```

**Check #4 first after reloading.** If it reports more than 1, the loop described above is
live: roll back immediately with the Stage 0 nginx backup.

---

## Note on HSTS

`nginx.conf` sets `Strict-Transport-Security` with `includeSubDomains; preload`. That is
sound here — the certificate covers `www`, so the subdomain keeps working after the
redirect.

Be aware `preload` is a **long-term commitment**: once the domain is submitted to the
browser preload list, removal takes months to propagate. The header alone does nothing
until you submit at hstspreload.org, so nothing happens by accident. Flagging it because
it is the one directive in that file that is genuinely hard to undo.
