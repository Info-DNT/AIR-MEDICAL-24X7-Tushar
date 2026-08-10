# AWS / EC2 server configuration — required changes

**Server:** `nginx/1.28.3 (Ubuntu)` on EC2
**Domain:** `airmedical24x7.com`
**Measured:** 10 Aug 2026, directly against production

> These are changes that **cannot be made in this repository**. nginx reads
> `/etc/nginx/nginx.conf` and `/etc/nginx/sites-enabled/*`. The `nginx.conf` file in the
> repo root is a *template* — it has never been copied onto the server. Proof: it has
> contained the cache rules and the www redirect for some time, and production serves
> neither.

---

## Summary

| # | Item | Impact | Effort |
|---|---|---|---|
| 1 | **Redeploy from `main`** | All repo-side optimisation is inert until this happens | 5 min |
| 2 | **Enable gzip** | ~293 KB removed from every page load | 2 min |
| 3 | **Enable HTTP/2** | Removes head-of-line blocking on 6 parallel connections | 1 min |
| 4 | **Cache-Control headers** | 268 KiB on repeat visits; currently *no* cache header is sent | 2 min |
| 5 | **www → non-www 301** | Duplicate content; both hosts currently return 200 | 1 min |
| 6 | **Rotate the Supabase key** | `service_role` key is publicly downloadable right now | 5 min |

---

## 1. Redeploy from `main` — do this first

Production is still serving the pre-optimisation build. Every optimised asset 404s:

```
$ curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/img/faa-logo.webp
404
$ curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/img/faa-logo.png
200      # the 637 KB original, still live
```

Nothing below will show up in PageSpeed until the new build is on the box.

---

## 2. gzip — the single biggest item

Production serves all text assets uncompressed:

| File | Served | With gzip | Wasted |
|---|---:|---:|---:|
| `css/bootstrap.min.css` | 199.9 KB | 23.8 KB | 88% |
| `css/style.css` | 44.6 KB | 9.0 KB | 80% |
| `index.html` | 83.7 KB | 16.1 KB | 81% |
| `js/config.js` | 13.4 KB | 4.6 KB | 66% |
| `js/main.js` | 7.7 KB | 2.7 KB | 65% |
| **Total** | **349.3 KB** | **56.2 KB** | **293 KB per page load** |

This is worth more than every image optimisation in the repo combined.

```nginx
# in the http { } block, or inside the server { } block
gzip              on;
gzip_vary         on;          # so intermediaries cache per Accept-Encoding
gzip_comp_level   6;           # cost/benefit knee; 9 costs CPU for ~1% more
gzip_min_length   256;
gzip_proxied      any;
gzip_types
    text/plain
    text/css
    text/javascript
    application/javascript
    application/json
    application/xml
    image/svg+xml
    application/manifest+json;
```

`text/html` is always gzipped by nginx and must **not** be listed. Images and `woff2`
are already compressed — listing them wastes CPU for nothing.

---

## 3. HTTP/2

Production negotiates HTTP/1.1 only:

```
$ echo | openssl s_client -alpn h2,http/1.1 -connect airmedical24x7.com:443 2>/dev/null | grep ALPN
ALPN protocol: http/1.1
```

Without multiplexing, each render-blocking stylesheet occupies one of six connections
and costs a full round trip. On nginx 1.25.1+ (you are on 1.28):

```nginx
server {
    listen 443 ssl;
    http2 on;                  # modern syntax; `listen 443 ssl http2` is deprecated
    ...
}
```

---

## 4. Cache-Control

Production currently sends **no cache header at all** on static assets, so every visit
re-downloads everything.

```nginx
location ~* \.(jpe?g|png|gif|webp|svg|ico|woff2?)$ {
    expires 1y;
    add_header Cache-Control "public, immutable" always;
    # add_header does NOT inherit into a location that declares its own — repeat these
    # or every static asset ships with no security headers:
    add_header X-Frame-Options        "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
}

location ~* \.(css|js)$ {
    expires 30d;
    add_header Cache-Control "public" always;
    add_header X-Frame-Options        "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
}

location ~* \.html$ {
    add_header Cache-Control "no-cache" always;   # always revalidate markup
}
```

> **Before setting a one-year lifetime**, note the site has no content-hashed filenames.
> `style.css?v=1.9` is versioned by hand. Either keep bumping that query string on every
> CSS change, or add hashed filenames — otherwise a one-year cache will serve stale CSS.

---

## 5. www → non-www

Both hostnames currently return `200`, which is a duplicate-content split:

```
$ curl -s -o /dev/null -w "%{http_code}\n" https://www.airmedical24x7.com/
200        # should be 301
```

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name www.airmedical24x7.com;
    # TLS cert must cover BOTH names or this block cannot terminate the handshake
    return 301 https://airmedical24x7.com$request_uri;
}
```

---

## 6. Rotate the Supabase `service_role` key — security, not performance

```
$ curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/scratch/insert_uae_blog.py
200
```

That file contains a Supabase `service_role` JWT for project `dtiirdimtbmkvryvqten`,
valid until 2036. `service_role` bypasses Row Level Security entirely — full read, write
and delete on every table, plus storage.

- The redeploy in step 1 removes the file (`scratch/` is deleted in `main`).
- **That is not sufficient.** The key is in git history and the repo is public. Assume it
  is compromised and rotate it in the Supabase dashboard.
- Add a belt-and-braces block so nothing like it is ever served again:

```nginx
location ~ /\.(?!well-known) { deny all; }        # dotfiles
location ^~ /scratch/        { deny all; }
location ^~ /docs/           { deny all; }        # these operational notes
location ~* \.(ps1|py|md|sql|log|bak|conf)$ { deny all; }
```

---

## Apply and verify

```bash
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak
sudo nano /etc/nginx/sites-available/default     # apply the blocks above
sudo nginx -t                                     # MUST print "syntax is ok" + "test is successful"
sudo systemctl reload nginx                       # reload, not restart — no dropped connections
```

Verify each item independently — do not assume a reload means it worked:

```bash
# 2. gzip  -> expect: content-encoding: gzip
curl -sI -H 'Accept-Encoding: gzip' https://airmedical24x7.com/css/bootstrap.min.css | grep -i content-encoding

# 3. http/2 -> expect: ALPN protocol: h2
echo | openssl s_client -alpn h2,http/1.1 -connect airmedical24x7.com:443 2>/dev/null | grep ALPN

# 4. cache  -> expect: cache-control: public, immutable
curl -sI https://airmedical24x7.com/img/hero-800.webp | grep -i cache-control

# 5. www    -> expect: 301
curl -s -o /dev/null -w "%{http_code}\n" https://www.airmedical24x7.com/

# 6. scratch -> expect: 403 or 404
curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/scratch/insert_uae_blog.py

# 1. new build -> expect: 200
curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/img/hero-800.webp
```

**Rollback:** `sudo cp /etc/nginx/sites-available/default.bak /etc/nginx/sites-available/default && sudo nginx -t && sudo systemctl reload nginx`

---

## Re-measure against the right URL

All PageSpeed runs so far have targeted `info-dnt.github.io/AIR-MEDICAL-24X7-Tushar/`,
which is a preview that **does** gzip and **does** serve HTTP/2. It flatters production on
both counts. Once steps 1–4 are done, measure the real thing:

```
https://pagespeed.web.dev/analyze?url=https://airmedical24x7.com/
```

That is your first honest baseline.
