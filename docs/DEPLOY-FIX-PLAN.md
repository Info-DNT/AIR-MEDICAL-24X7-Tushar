# Implementation plan — restore the 33 missing pages and fix `/blogs`

**Fixes:** 33 country pages returning 404 in production (half the sitemap), and the
`/blogs` 403.

**Constraint:** break nothing that currently works.

**Status:** plan only. Nothing executed. Nothing pushed.

---

## The one rule that matters

> ### ⛔ Do NOT use a delete-style sync.
>
> `rsync --delete`, "empty the webroot and re-upload", `git clean -fd` on the server, or
> any deploy that removes what is not in the repo **will break 7 pages that are live
> today.**

Seven URLs are serving 200 in production and have **no file in `main`**:

```
/air-ambulance-uk                       200   not in main
/air-ambulance-philippines              200   not in main
/air-ambulance-portblair                200   not in main
/air-ambulance-jammu-kashmir            200   not in main
/air-ambulance-northeast-india          200   not in main
/air-ambulance-india-to-international   200   not in main
/thank-you                              200   not in main
```

Six of them are **linked from `countries.html`** — the cards added earlier. Deleting them
turns 6 working cards into 6 new 404s, on top of the 30 already broken.

Every step below is **additive or overwrite-in-place only.** Nothing is deleted.

---

## Verified pre-flight facts

Established against the live server before writing this plan:

| Fact | Detail |
|---|---|
| Production matches commit `3555573` | live `countries.html` is byte-identical to it |
| **No manual edits on the server** | so overwriting with `main` loses nothing |
| The 33 files are sound locally | valid title, canonical, closing `</html>`, 33–48 KB |
| **Their images are already live** | all 43 referenced assets return 200 |
| Files absent at both paths | `/countries/air-ambulance-X` and `/air-ambulance-X` both 404 |
| Last deploy | 14 Aug 2026 09:42 |
| No CI/CD | deploys are manual |

The consequence of the third and fourth rows together: **deploying the 33 HTML files alone
produces fully working pages.** No images, CSS or JS need to ship with them.

> ⚠️ The server rate-limits rapid requests — a fast `curl` loop starts returning `000`
> (connection refused), which looks like a total outage but is not. Put `sleep 1` between
> checks in any verification loop.

---

## Stage 0 — Back up (5 min)

Before touching anything. On the server:

```bash
sudo tar czf /root/webroot-$(date +%F-%H%M).tar.gz -C /var/www/html .
sudo cp /etc/nginx/sites-available/default /root/nginx-default-$(date +%F-%H%M).bak
ls -lh /root/*.tar.gz /root/*.bak
```

This is the rollback for every stage. Do not skip it — it is the only copy of the 7
files that exist nowhere else.

---

## Stage 1 — Deploy the 33 country pages (15 min) 🔴

**The whole 404 problem, fixed by itself. Do this first and independently.**

Purely additive: 33 new files, no existing file touched. If anything goes wrong, delete
the 33 files and you are exactly where you started.

```bash
# from the repo, on your machine
scp air-ambulance-*.html user@server:/tmp/countrypages/

# on the server
sudo cp /tmp/countrypages/*.html /var/www/html/
sudo chown www-data:www-data /var/www/html/air-ambulance-*.html
sudo chmod 644 /var/www/html/air-ambulance-*.html
```

`air-ambulance-uae.html` and `air-ambulance-seychelles.html` are already live and will be
overwritten with the same-or-newer version from `main`. That is fine and intended.

### Verify

```bash
for p in afghanistan albania algeria dubai india qatar oman kuwait charters; do
  printf "%s %s\n" "$(curl -s -o /dev/null -w '%{http_code}' \
    https://airmedical24x7.com/air-ambulance-$p)" "$p"
  sleep 1
done
# expect: 200 on every line
```

Then open `https://airmedical24x7.com/air-ambulance-albania` in a browser and confirm the
images, header and footer render — proving the already-live assets resolve correctly.

**Rollback:** `sudo rm /var/www/html/air-ambulance-{afghanistan,albania,...}.html`

---

## Stage 2 — Deploy the rest of `main` (20 min) 🟠

Brings across everything since `3555573`: the restored keywords meta, the `/blogs` 403
markup fixes, the stretcher rename, the meta-tag work.

Safe because production is a clean copy of `3555573` — there are no server-side edits to
lose.

```bash
# NOTE: no --delete. That flag is what would remove the 7 files.
rsync -av --exclude='.git' --exclude='docs' --exclude='tools' --exclude='scratch' \
      ./ user@server:/var/www/html/
```

If rsync is not available, upload the changed files over SFTP — same rule, **overwrite
only, never delete.**

### Also remove the leaked key (do this while you are on the server)

```bash
sudo rm -rf /var/www/html/scratch/
curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/scratch/insert_uae_blog.py
# expect 404
```

> This does **not** make the key safe. It is in public git history. **Rotate the Supabase
> `service_role` key** — that is a separate, independent action and still outstanding.

### Verify

```bash
for u in / /about-us /countries /contact-us /medical-tourism /ECMO-transfer; do
  printf "%s %s\n" "$(curl -s -o /dev/null -w '%{http_code}' https://airmedical24x7.com$u)" "$u"
  sleep 1
done
# the 7 files that are not in main must STILL be 200:
for p in air-ambulance-uk air-ambulance-philippines air-ambulance-portblair \
         air-ambulance-jammu-kashmir air-ambulance-northeast-india \
         air-ambulance-india-to-international thank-you; do
  printf "%s %s\n" "$(curl -s -o /dev/null -w '%{http_code}' https://airmedical24x7.com/$p)" "$p"
  sleep 1
done
# expect: 200 on all 7 — if any is 404, a delete-sync happened; restore from Stage 0
```

**Rollback:** restore the Stage 0 tarball.

---

## Stage 3 — Apply the nginx config (15 min) 🟠

Fixes `/blogs`, and delivers gzip, cache headers, the custom 404 and the security headers —
none of which have ever been applied.

```bash
# nginx.conf is a template, not a drop-in: it declares its own server blocks and its
# root path is a placeholder. Merge its directives into the existing server block, or
# copy it and set `root` to the real webroot before testing.
scp nginx.conf user@server:/tmp/
sudo cp /tmp/nginx.conf /etc/nginx/sites-available/default   # then edit `root`
sudo nginx -t          # MUST pass before reloading
sudo systemctl reload nginx
```

`nginx -t` is the safety gate — a bad config fails there and the running server is
untouched.

### What changes, and why each is safe

| Change | Risk |
|---|---|
| `try_files $uri.html $uri $uri/` | one extra stat per request; fixes `/blogs` |
| `location ~ ^/[^.]+/$ { return 404; }` | matches after the `/blogs/<slug>` regex, which is declared earlier, so posts still resolve; `/` itself does not match the pattern |
| gzip on | text assets only; images and woff2 are skipped |
| `expires` headers | static assets only |
| `error_page 404 /404.html` | replaces nginx's unstyled default |
| www → non-www 301 | ⚠️ see the note below |

> ### ⚠️ The www redirect interacts with the 6 www links
>
> `nginx.conf` contains a blanket `www` → non-`www` 301. The six cards in `countries.html`
> point at `www` URLs. After this stage those links still work — they 301 to non-`www`,
> which serves 200 — but each costs a redirect hop, and the six sitemap entries become
> redirects rather than final URLs.
>
> Nothing breaks either way. Resolving it properly is Decision A below.

### Verify

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/blogs      # 200, no redirect
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/blogs/     # 404
sleep 1
curl -sI https://airmedical24x7.com/css/style.css | grep -iE 'content-encoding|cache-control'
# expect: gzip, and a cache-control header
```

**Rollback:** `sudo cp /root/nginx-default-*.bak /etc/nginx/sites-available/default && sudo nginx -t && sudo systemctl reload nginx`

---

## Stage 4 — Full sitemap sweep (5 min)

The acceptance test for the whole job:

```bash
grep -oP '(?<=<loc>)[^<]+' sitemap.xml | while read u; do
  printf "%s %s\n" "$(curl -s -o /dev/null -w '%{http_code}' "$u")" "$u"
  sleep 1
done | grep -v '^200' 
```

**Target: no output** (or only the six `www` 301s, if Decision A is deferred).

Currently this prints 33 × 404 and 1 × 301.

Then in Google Search Console: **Sitemaps → resubmit**, and **URL Inspection → Request
indexing** on two or three of the restored country pages to prompt a recrawl.

---

## Decisions — not part of the fix, no deadline

These are the audit's 🟡 items. **None of them is broken; all are deferred deliberately**
so the deploy stays as small as possible.

**A. The six `www` URLs.** Those pages declare *non-`www`* as their own canonical, so the
`www` URLs we publish are the ones the pages tell Google to ignore. All six serve 200 on
non-`www` today. Dropping `www` from `countries.html` and `sitemap.xml` fixes it — a
two-file change, no server work. This contradicts the earlier "use www for these"
instruction, so it needs your word. **Recommend: drop the www.**

**B. `/ECMO-transfer` casing.** The only uppercase URL on the site. `/ecmo-transfer` 404s.
Nothing is broken internally — all 131 links use the correct case. Renaming needs a 301 and
touches 131 links; leaving it costs nothing today. **Recommend: leave it.**

**C. The duplicate ECMO page.** `ecmo-air-transfer` has zero inbound links and near-identical
content to `ECMO-transfer`. Same shape as the page consolidated in `9cf2079`. **Recommend:
canonical it to `ECMO-transfer` and drop it from the sitemap** — one-file change.

**D. Seven orphans.** Indexable, in the sitemap, zero internal links. Adding contextual
links would give them internal link equity. Content work, not a bug.

---

## Order and effort

| Stage | What | Effort | Risk |
|---|---|---|---|
| 0 | Back up | 5 min | none |
| 1 | **33 country pages** | 15 min | none — additive only |
| 2 | Rest of `main` + delete `/scratch/` | 20 min | low — no server-side edits exist |
| 3 | nginx config | 15 min | low — `nginx -t` gates it |
| 4 | Sitemap sweep + GSC resubmit | 5 min | none |

Stage 1 alone fixes the headline problem. Stages 2 and 3 can follow later if you want to
verify Stage 1 in isolation first — they are independent.

**Nothing in Stages 1–3 requires a repo change. The files and config are already correct
locally.**
