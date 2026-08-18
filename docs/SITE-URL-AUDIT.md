# Site-wide URL audit

**Question asked:** is the `/blogs` 403 an isolated case, or does the same class of bug
affect other pages?

**Short answer:** `/blogs` is the only file/directory collision on the site. But the audit
turned up something considerably worse that was not being looked for — **33 of the 68 URLs
in the sitemap return 404 on production right now.**

Method: static analysis of all 66 pages in the repo, plus live HTTP checks of every page,
every sitemap URL, and every country link on the live listing page.

---

## Summary

| | Finding | Where | Severity |
|---|---|---|---|
| 1 | 33 of 68 sitemap URLs are 404 | live | 🔴 critical |
| 2 | 30 of 38 country links on `/countries` are broken | live | 🔴 critical |
| 3 | `/blogs` 403 | live, fixed in config | 🟠 needs deploy |
| 4 | `/ECMO-transfer` is the only uppercase URL; `/ecmo-transfer` 404s | live + repo | 🟡 |
| 5 | 6 sitemap URLs use `www`, but those pages canonical to non-`www` | repo | 🟡 |
| 6 | `ecmo-air-transfer` looks like a duplicate of `ECMO-transfer` | repo | 🟡 |
| 7 | 14 orphan pages, 7 of them worth review | repo | 🔵 |

---

## 1. 🔴 A third of the sitemap is 404

```
sitemap URLs: 68
  200 ->  34
  301 ->   1   (/blogs, see §3)
  404 ->  33
```

**Every one of the 33 is an `air-ambulance-*` country page. Every non-country page is
live.** That is the whole pattern — it is not random.

```
LIVE (27):  / about-us air-ambulance air-ambulance-uae air-ambulance-seychelles
            career contact-us countries ECMO-transfer ecmo-air-transfer
            commercial-flight-stretcher medical-tourism ... (all service pages)

404 (33):   air-ambulance-afghanistan  air-ambulance-albania  air-ambulance-algeria
            air-ambulance-andorra      air-ambulance-angola   ... through bosnia
            air-ambulance-bahrain      air-ambulance-bangladesh
            air-ambulance-charters     air-ambulance-cost-dubai
            air-ambulance-dubai        air-ambulance-ethiopia
            air-ambulance-india        air-ambulance-indonesia
            air-ambulance-kuwait       air-ambulance-oman
            air-ambulance-qatar        air-ambulance-saudi-arabia
            air-ambulance-to-india
```

Of the 35 country pages in the repo, only **two** (`uae`, `seychelles`) are on the server.

### They are missing at *both* URLs

```
/countries/air-ambulance-albania   404      <- the old, pre-flatten path
/air-ambulance-albania             404      <- the new, post-flatten path
```

So this is **not** the URL flattening being undeployed. The files are simply not on the
server under any path.

### It is a partial deploy, not a stale one

The live `/countries` page is **current** — it contains the UK, Philippines, Port Blair and
Jammu & Kashmir cards added recently, and the `www` links, and the WebP images. So a deploy
did happen after that work.

That deploy shipped `countries.html` **but not the country pages it links to.** The listing
page went up; its targets did not.

### Impact

- Google is being handed 33 dead URLs in the sitemap on every crawl.
- Any of those pages previously indexed will be dropped.
- Visitors clicking country cards land on nginx's default 404 (unstyled, no navigation).

### Fix

Deploy the country pages. Nothing in the repo needs changing — all 35 files are present and
correct locally. This is purely a deployment gap.

Verify afterwards:

```bash
for p in afghanistan albania dubai india qatar; do
  curl -s -o /dev/null -w "%{http_code} $p\n" https://airmedical24x7.com/air-ambulance-$p
done
```

---

## 2. 🔴 The live countries page has 30 broken links

Direct consequence of §1, but worth stating separately because it is what a visitor hits:

```
country links on the live /countries page:  38
  working:   8
  BROKEN :  30
```

Every card from Afghanistan through Bosnia, plus Dubai, Qatar, Oman, Kuwait, Bahrain,
Saudi Arabia, Indonesia, Ethiopia and Charters, is a dead link **today**.

Fixed by the same deploy.

---

## 3. 🟠 `/blogs` 403 — the original question

Confirmed as **the only file/directory collision on the site.** Tracked directories are
`.vscode`, `blogs`, `css`, `docs`, `img`, `js`, `lib`, `tools`; `blogs` is the only one with
a matching `.html` file.

```
/countries   200      /countries/   404    <- correct
/about-us    200      /about-us/    404    <- correct
/blogs       301      /blogs/       403    <- the bug
```

Already fixed in `nginx.conf` (`try_files $uri.html $uri $uri/`). Ships with the deploy.

**This is our config, not AWS.** AWS supplies the EC2 instance; it has no part in URL
routing. The proof it is config and not content: the same files return 200 on GitHub Pages,
which resolves the collision file-first, and 403 on nginx, which resolves it directory-first.

---

## 4. 🟡 One uppercase URL

`ECMO-transfer.html` is the only file on the site with a capital letter in its name.
nginx is case-sensitive; Windows is not, so this cannot fail locally.

```
/ECMO-transfer    200
/ecmo-transfer    404     <- anyone typing it lowercase, or any external link, breaks
```

All 131 internal links use the correct case, so nothing is broken internally today. The
risk is external links, manual typing, and mixed-case URLs being poor practice generally.

**Options:** rename to `ecmo-transfer` with a 301 from the old form, or leave it and accept
that the lowercase spelling 404s. Not urgent either way — flagging it because it is the
same "works locally, fails on nginx" shape as the `/blogs` bug.

---

## 5. 🟡 `www` vs non-`www` conflict

Six sitemap entries and seven `countries.html` links use `www`:

```
https://www.airmedical24x7.com/air-ambulance-uk
https://www.airmedical24x7.com/air-ambulance-philippines
https://www.airmedical24x7.com/air-ambulance-jammu-kashmir
https://www.airmedical24x7.com/air-ambulance-northeast-india
https://www.airmedical24x7.com/air-ambulance-portblair
https://www.airmedical24x7.com/air-ambulance-india-to-international
( + air-ambulance-uae in countries.html )
```

Two problems, neither breaking anything today:

**a) Those pages declare non-`www` as their own canonical.**

```
https://www.airmedical24x7.com/air-ambulance-uk
  -> <link rel="canonical" href="https://airmedical24x7.com/air-ambulance-uk">
```

The pages themselves say the non-`www` URL is authoritative, while our sitemap and links
point at the `www` one. Google follows the canonical, so the `www` URLs we are publishing
are the ones the pages are telling it to ignore.

**b) `nginx.conf` contains a blanket `www` → non-`www` 301.** Once deployed, all six
sitemap entries become redirects. Nothing breaks — both hostnames serve these pages with a
200 today — but a sitemap of redirecting URLs is a crawl-budget waste.

**Both resolve by dropping the `www`.** All six work on non-`www` right now (verified), and
non-`www` is what they declare as canonical. That contradicts the earlier instruction to use
`www` for these, which is why this is recorded as a finding rather than changed — **your
call.**

---

## 6. 🟡 Two ECMO pages

| | `ECMO-transfer.html` | `ecmo-air-transfer.html` |
|---|---|---|
| size | 40.6 KB | 37.1 KB |
| title | ECMO Medical Transfer Services | ECMO Air Transport |
| inbound links | 131 | **0** |
| live | 200 | 200 |

`ecmo-air-transfer` has no inbound links and a near-identical topic. Same shape as
`commercial-stretcher-service`, which was consolidated in `9cf2079`. Worth deciding whether
to consolidate or differentiate — not touched here.

---

## 7. 🔵 Orphan pages

No inbound internal links. Reachable only via sitemap or direct URL:

```
intentional:   404.html  admin.html  blogs-detail.html  blogs/*.html (3, linked by JS)
               commercial-stretcher-service.html (canonical'd away in 9cf2079)

worth review:  air-ambulance-cost-dubai      medical-escort-dubai
               air-ambulance-india           medical-tourism-india
               air-ambulance-to-india        repatriation-services-dubai
               ecmo-air-transfer
```

The seven under "worth review" are indexable, in the sitemap, and have zero internal links —
so they get no internal link equity. Adding contextual links from related pages would help
them; not a bug.

---

## What is clean

Checked and found no problems:

- ✅ **No broken internal links** — every same-site `href`/`src` across 66 pages resolves
- ✅ **No case-mismatched links** — zero links whose case differs from the real filename
- ✅ **No `.html` extensions in links** — clean URLs used consistently
- ✅ **No other file/directory collisions** — `blogs` is the only one
- ✅ **No case-only duplicate filenames**
- ✅ **No spaces or unusual characters** in any filename
- ✅ **Canonicals self-consistent** on all 64 indexable pages; the 2 exceptions
  (`blogs-detail`, `commercial-stretcher-service`) are deliberate
- ✅ **No two pages claiming the same canonical** except those 2 deliberate cases
- ✅ **`robots.txt`** identical between repo and live, sitemap correctly referenced
- ✅ **404.html / admin.html** correctly `noindex` and correctly absent from the sitemap

---

## Actions, in order

| # | Action | Owner | Severity |
|---|--------|-------|----------|
| 1 | **Deploy the 33 missing country pages** | server | 🔴 |
| 2 | Apply `nginx.conf` (fixes `/blogs`, plus gzip, cache, `error_page 404`) | server | 🟠 |
| 3 | Decide on the `www` six — recommend dropping to non-`www` | you | 🟡 |
| 4 | Decide on `ECMO-transfer` casing and the duplicate ECMO page | you | 🟡 |
| 5 | Add internal links to the 7 orphans | repo | 🔵 |

Items 1 and 2 are both deployment. Nothing in items 1–2 requires a repo change — the files
and config are already correct locally.

### Post-deploy verification

```bash
# every sitemap URL should be 200
while read u; do
  printf "%s %s\n" "$(curl -s -o /dev/null -w '%{http_code}' "$u")" "$u"
done < <(grep -oP '(?<=<loc>)[^<]+' sitemap.xml) | grep -v '^200'
# expect: no output

curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/blogs   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://airmedical24x7.com/blogs/  # 404
```
