# EC2 action list — everything outstanding on the server

Single reference for the work that can only be done on the EC2 instance. Every fix below
is already written, committed and tested; none of it is live.

**Measured against `airmedical24x7.com` on 18 Aug 2026.** Re-run the commands in
"Verification" to check any of it yourself.

**Nothing in the AWS console changes.** No security groups, no load balancer, no Route 53,
no new certificate. This is files and one config file on the instance.

---

## Status at a glance

| # | Issue | Live now | After | Fix |
|---|-------|----------|-------|-----|
| 1 | 33 country pages missing | `404` | `200` | upload files |
| 2 | `.html` opens instead of redirecting | `/about-us.html` → `200` | `301` | config |
| 3 | homepage on 6 URLs | `/index.html` → `200` | `301` → `/` | config |
| 4 | `www` does not redirect | `www/about-us` → `200` | `301` | config |
| 5 | 404 page never appears | 162-byte nginx page | your 26 KB page | config |
| 6 | `/blogs` unreachable | `301` → `/blogs/` → `403` | `200` | config |
| 7 | no compression | no `Content-Encoding` | gzip | config |
| 8 | no browser caching | no `Cache-Control` | 1y / 30d | config |
| 9 | no security headers | none present | 5 headers | config |
| 10 | HTTP/1.1 only | `HTTP/1.1` | `HTTP/2` | config |
| 11 | `.htaccess` publicly readable | `200`, 5702 bytes | `403` | config |

**Items 2–11 are one file and one reload. Item 1 is a file upload. Both fit in one SSH
session, about 30 minutes.**

---

## Raw evidence

```
/                      200  99213b
/index.html            200  99213b          <- should 301 to /
/about-us.html         200  49866b          <- should 301 to /about-us
/no-such-page          404    162b          <- nginx's default, not the site's page
/blogs                 301  ->/blogs/       <- then 403
www/about-us           200                  <- should 301 to non-www

HTTP/1.1 200 OK                             <- no HTTP/2
(no Content-Encoding)                       <- no gzip
(no Cache-Control)                          <- no browser caching
(no X-Frame-Options, no Strict-Transport-Security)

air-ambulance-{afghanistan,albania,dubai,india,qatar}   5 of 5 -> 404

/scratch/insert_uae_blog.py   404           <- already closed, good
/.htaccess                    200  5702b    <- readable by anyone
```

---

# Priority 1 — the 33 missing country pages

**The biggest item here.** Half the sitemap 404s, and it is unrelated to any config change.

## What is wrong

33 of the 68 URLs in `sitemap.xml` return 404. Every one is an `air-ambulance-*` country
page; every non-country page is live. Of the 35 country pages in the repo, only two
(`uae`, `seychelles`) are on the server.

They are missing at **both** paths:

```
/countries/air-ambulance-albania   404      <- old, pre-flatten
/air-ambulance-albania             404      <- new
```

So this is not the URL flattening being undeployed — **the files are not on the server at
all.** The live `/countries` page is current (it has the newest cards), so a deploy shipped
the listing page without the pages it links to. **30 of the 38 country links on that page
are dead today.**

## Why it is safe to fix

- purely additive — no existing file is touched
- all 43 assets those pages reference are **already on the server** (verified), so the HTML
  alone is enough
- rollback is deleting 33 files

## Solution

```bash
# from your laptop, in the repo
scp -i your-key.pem air-ambulance-*.html ubuntu@<EC2-IP>:/tmp/

# on the server
sudo cp /tmp/air-ambulance-*.html /var/www/html/      # use YOUR webroot
sudo chown www-data:www-data /var/www/html/air-ambulance-*.html
sudo chmod 644 /var/www/html/air-ambulance-*.html
```

## Verification

```bash
for p in afghanistan albania dubai india qatar oman kuwait charters; do
  printf "%s %s\n" "$(curl -s -o /dev/null -w '%{http_code}' \
    https://airmedical24x7.com/air-ambulance-$p)" "$p"; sleep 1
done
# expect 200 on every line
```

---

# Priority 2 — items 2 to 11, one config

All ten are in `nginx.conf`. One install, one reload.

## Root cause of all of them

The rules were written in **`.htaccess`**, which is an **Apache** file. The server is
**nginx**, and nginx never reads `.htaccess` — there is no module for it and no way to
enable it.

So the www redirect, the security headers and the caching rules have been sitting in the
repo doing nothing. Measured: of the seven things `.htaccess` declares, the live server
applies **zero**.

`nginx.conf` is the file that works, and it has never been applied.

## Recommended: use the script

```bash
ssh -i your-key.pem ubuntu@<EC2-IP>
cd /path/to/AIR-MEDICAL-24X7-Tushar && git pull origin main

sudo bash tools/apply-nginx-config.sh            # dry run, changes nothing
sudo bash tools/apply-nginx-config.sh --apply    # back up, install, test, reload, verify
```

The two values the repo cannot know are your **certificate paths** and your **real
webroot** — paste `/var/www/html` when the root is elsewhere and every page 404s. The
script reads all three out of `nginx -T` rather than asking anyone to type them, and
refuses to run unless the certificate files exist and the webroot actually contains
`index.html`.

It is a dry run by default. `nginx -t` gates the reload. A trap restores the original if
interrupted. After reloading it checks the homepage for a redirect loop and **rolls back
automatically** if it finds one.

Manual equivalent: `docs/AWS-APPLY-RUNBOOK.md`.

## What each item becomes

**2 & 3 — one URL per page**

```nginx
location = /           { try_files /index.html =404; }
location = /index      { return 301 /; }
location = /index.html { return 301 /; }
```
plus the existing rule that strips `.html` from every other page.

> ⚠️ `location = /` uses `try_files` deliberately. The `index` directive issues an
> **internal redirect** to `/index.html`, which re-enters location matching, hits the 301,
> and loops until the browser gives up — `ERR_TOO_MANY_REDIRECTS` on the homepage. Do not
> "simplify" this to `index index.html`.

**4 — www redirects**

```nginx
server {
    listen 443 ssl;
    server_name www.airmedical24x7.com;
    return 301 https://airmedical24x7.com$request_uri;
}
```

A www redirect existed before but only on **port 80**. Since http already forwards to
https, real traffic never reached it — which is why it looked configured and did nothing.
The certificate already covers both names, so no certificate work is needed.

**5 — the 404 page**

```nginx
error_page 404 /404.html;
location = /404.html { internal; }
location = /404      { internal; }
```

`404.html` is not broken; it was never invoked. `internal` also stops `/404` answering
`200`, which is a soft-404 and penalised.

**6 — `/blogs`**

```nginx
try_files $uri.html $uri $uri/ =404;   # was $uri $uri/ $uri.html
```

`blogs.html` and a `blogs/` directory both exist; with `$uri` first nginx matched the
directory, 301'd to add a slash, found no index and returned 403. Trying `.html` first
makes the file win while `/blogs/<slug>` still resolves.

**7–10 — gzip, caching, headers, HTTP/2.** All in the config. gzip alone takes
`style.css` from 53 KB to 11 KB; measured across a page load it is ~293 KB of avoidable
transfer per visit.

**11 — `.htaccess` readable**

```nginx
location ~ /\. { deny all; }
```

With an exception above it for `/.well-known/acme-challenge/`, **without which certbot
renewal breaks silently** and the certificate expires ~90 days later with no warning.

## Verification

```bash
curl -sIL --max-redirs 5 https://airmedical24x7.com/ | grep -c '^HTTP'   # 1 = no loop. CHECK FIRST.
sleep 1
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://airmedical24x7.com/index.html
sleep 1
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://airmedical24x7.com/about-us.html
sleep 1
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://www.airmedical24x7.com/about-us
sleep 1
curl -s -o /dev/null -w "%{http_code} %{size_download}b\n" https://airmedical24x7.com/no-such-page
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/blogs
sleep 1
curl -sI https://airmedical24x7.com/css/style.css | grep -iE 'content-encoding|cache-control'
```

Expect: `1`; three `301`s to the canonical URL; `404` at ~26000 bytes; `200`; `gzip` and a
cache header.

> The server rate-limits fast request loops and starts returning `000`, which looks like a
> total outage but is not. That is why every loop here has `sleep 1`.

## Rollback

```bash
sudo cp /etc/nginx/sites-available/default.bak.<timestamp> /etc/nginx/sites-available/default
sudo nginx -t && sudo systemctl reload nginx
```

About ten seconds. The script prints the exact path when it runs.

---

# Priority 3 — not EC2, but do not skip

## 🔴 Rotate the Supabase `service_role` key

**This is the only genuine secret in the project, and it is published.**

A `service_role` JWT for project `dtiirdimtbmkvryvqten` is in the git history of a **public**
repository. Confirmed by extracting and decoding it with `git cat-file`. It **bypasses Row
Level Security entirely** — it can read and write every table regardless of policy.

`/scratch/` already returns 404, so the live exposure is closed. **That does not help.** The
key is in git history and stays valid until rotated.

**Fix:** Supabase dashboard → Project Settings → API → roll the `service_role` key.

Nothing in the codebase uses it — `js/config.js` deliberately keeps it out of source and
expects it pasted into the admin panel at runtime — so rotating should break nothing.

For context, the anon key in `js/config.js` is **not** a problem: it is public by design and
verified to reach only `blogs` and `reviews`; the lead tables are unreachable with it.

---

# The whole thing, in order

```bash
ssh -i your-key.pem ubuntu@<EC2-IP>

# 1. the 33 pages
sudo cp /tmp/air-ambulance-*.html /var/www/html/
sudo chown www-data:www-data /var/www/html/air-ambulance-*.html

# 2. the config
cd /path/to/AIR-MEDICAL-24X7-Tushar && git pull origin main
sudo bash tools/apply-nginx-config.sh
sudo bash tools/apply-nginx-config.sh --apply

# 3. tidy up
sudo rm -rf /var/www/html/scratch/
```

Then, off the server:

- **Rotate the `service_role` key** in the Supabase dashboard
- **Google Search Console → Sitemaps → resubmit.** 33 URLs stop 404ing and the duplicate
  `.html` / `www` variants start collapsing into their canonical form over the next few
  crawls.

---

## How this was verified

The config was tested on **real nginx 1.28.0** with the actual site files before any of it
was written down — `nginx -t` clean, three server blocks, and every URL returning the
expected code, including the homepage serving with **zero** redirects.

Your server runs nginx 1.28.3.

The two things that **cannot** be verified from outside are your real certificate paths and
your real webroot. That is exactly what the script reads off the server rather than
guessing.

## Related documents

| File | Covers |
|---|---|
| `docs/AWS-APPLY-RUNBOOK.md` | the config apply, as manual commands |
| `docs/DEPLOY-FIX-PLAN.md` | the 33 pages, staged with rollback |
| `docs/SITE-URL-AUDIT.md` | how the 404s were found, plus orphans and duplicates |
| `docs/CANONICAL-URL-AND-404-PLAN.md` | why each routing rule is shaped as it is |
| `tools/apply-nginx-config.sh` | the guarded apply script |
