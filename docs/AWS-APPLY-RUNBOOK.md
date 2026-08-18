# Runbook — applying the config on EC2

Fixes, in one reload:

| | Issue | Currently |
|---|---|---|
| 1 | pages open at `.html`, homepage on 6 URLs | `/about-us.html` → 200 |
| 2 | `www` does not redirect | `https://www...` → 200 |
| 3 | wrong URL shows nginx's default page | 162-byte page, not yours |

**Nothing in the AWS console changes.** No security groups, no load balancer, no Route 53,
no new certificate. This is one file on the instance: the nginx site config.

Total time ~15 minutes. Rollback is ~10 seconds.

---

## Step 1 — connect and find the real config

```bash
ssh -i /path/to/your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

```bash
# which file is actually in use, and where the webroot really is
sudo nginx -T > ~/nginx-current.txt
grep -nE 'ssl_certificate|ssl_dhparam|include /etc/letsencrypt|^\s*root ' ~/nginx-current.txt
```

Write down what it prints. You need three things:

| Needed | Looks like |
|---|---|
| certificate | `/etc/letsencrypt/live/airmedical24x7.com/fullchain.pem` |
| private key | `/etc/letsencrypt/live/airmedical24x7.com/privkey.pem` |
| **webroot** | `/var/www/html` — **or something else. Check.** |

> The webroot is the one that silently breaks things. If the real root is
> `/var/www/airmedical` and you paste `/var/www/html`, every page 404s.

---

## Step 2 — back up

```bash
sudo cp /etc/nginx/sites-available/default ~/default.bak.$(date +%F-%H%M)
ls -l ~/default.bak.*
```

**Do not skip this.** It is the rollback.

---

## Step 3 — put the new config in place

Copy `nginx.conf` from the repo onto the server (or paste it with `sudo nano`):

```bash
# from your laptop, in the repo folder
scp -i /path/to/your-key.pem nginx.conf ubuntu@<EC2-PUBLIC-IP>:/tmp/nginx-new.conf
```

Then on the server, fill in the real paths found in Step 1:

```bash
CERT=/etc/letsencrypt/live/airmedical24x7.com/fullchain.pem   # <- from Step 1
KEY=/etc/letsencrypt/live/airmedical24x7.com/privkey.pem      # <- from Step 1
ROOT=/var/www/html                                            # <- from Step 1

sudo sed -i \
  -e "s#^\(\s*\)ssl_certificate\s\+.*#\1ssl_certificate     $CERT;#" \
  -e "s#^\(\s*\)ssl_certificate_key\s\+.*#\1ssl_certificate_key $KEY;#" \
  -e "s#^\(\s*\)root\s\+/var/www/html;.*#\1root $ROOT;#" \
  /tmp/nginx-new.conf

# confirm the substitution actually happened
grep -nE 'ssl_certificate|^\s*root ' /tmp/nginx-new.conf
```

If your server has no `options-ssl-nginx.conf` or `ssl-dhparams.pem` (Step 1 showed no
`include /etc/letsencrypt` line), delete those two lines from both 443 blocks — otherwise
`nginx -t` fails on a missing file:

```bash
sudo sed -i -e '/options-ssl-nginx.conf/d' -e '/ssl-dhparams.pem/d' /tmp/nginx-new.conf
```

Install it:

```bash
sudo cp /tmp/nginx-new.conf /etc/nginx/sites-available/default
```

---

## Step 4 — test BEFORE reloading

```bash
sudo nginx -t
```

**This is the safety gate.** If it fails, the running server is untouched — fix the error
and test again. Do not reload until this says `test is successful`.

```bash
sudo systemctl reload nginx
```

`reload` keeps existing connections alive. Never `restart` for this.

---

## Step 5 — verify, in this order

**5a. The redirect loop check — run this FIRST.**

```bash
curl -sIL --max-redirs 5 https://airmedical24x7.com/ | grep -c '^HTTP'
```

**Expect `1`.** Anything higher means the homepage is looping — go straight to Step 6.

**5b. Issue 1 — one URL per page**

```bash
for u in / /index /index.html /about-us /about-us.html /career.html; do
  printf "%s %s -> %s\n" "$(curl -s -o /dev/null -w '%{http_code}' https://airmedical24x7.com$u)" \
    "$u" "$(curl -s -o /dev/null -w '%{redirect_url}' https://airmedical24x7.com$u)"
  sleep 1
done
```

Expect `200` for `/` and `/about-us`; `301` to the clean URL for the rest.

**5c. Issue 2 — www redirects**

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://www.airmedical24x7.com/about-us
```

Expect `301 -> https://airmedical24x7.com/about-us`.

**5d. Issue 3 — the branded 404**

```bash
curl -s -o /dev/null -w "%{http_code}  %{size_download} bytes\n" https://airmedical24x7.com/no-such-page
```

Expect `404` and roughly **26000 bytes**. If it says 162 bytes, `error_page` did not take.

**5e. Nothing else broke**

```bash
for u in /countries /contact-us /blogs /medical-tourism /airline-stretcher-services; do
  printf "%s %s\n" "$(curl -s -o /dev/null -w '%{http_code}' https://airmedical24x7.com$u)" "$u"
  sleep 1
done
curl -sI https://airmedical24x7.com/css/style.css | grep -i 'content-encoding'   # gzip
```

> The server rate-limits fast request loops and starts returning `000`, which looks like an
> outage but is not. That is why every loop above has `sleep 1`.

---

## Step 6 — rollback, if anything looks wrong

```bash
sudo cp ~/default.bak.<timestamp> /etc/nginx/sites-available/default
sudo nginx -t && sudo systemctl reload nginx
```

Back to exactly the previous behaviour in about ten seconds.

---

## Step 7 — while you are on the box

Two things unrelated to the config, both worth doing in the same session:

**Upload the 33 missing country pages.** Half the sitemap 404s. Additive only — no existing
file is touched, and their images are already on the server, so the HTML alone is enough.
See `docs/DEPLOY-FIX-PLAN.md`. **This is the single biggest fix outstanding.**

**Remove the old scratch directory if it is still there:**

```bash
sudo rm -rf /var/www/html/scratch/
```

> Neither replaces rotating the Supabase `service_role` key. That key is in public git
> history and stays valid until rotated in the Supabase dashboard.

---

## Afterwards

In Google Search Console: **Sitemaps → resubmit**. The `.html` and `www` URLs will now 301
to their canonical form, so the duplicate variants drop out of the index over the following
few crawls.

## What this was verified against

The config was tested on nginx 1.28.0 with the real site files before being written down —
`nginx -t` clean, and every URL above returning the expected code. Your server runs
nginx 1.28.3.

The one thing that cannot be verified from outside is your actual certificate and webroot
paths, which is why Step 1 exists.
