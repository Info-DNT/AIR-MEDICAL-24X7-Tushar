#!/usr/bin/env python3
"""Pre-render one static HTML page per published blog post.

Why this exists
---------------
Blog posts were rendered entirely in the browser: blogs-detail.html shipped an empty
<div>, JavaScript fetched the post from Supabase, and the canonical was hardcoded to
/blogs then patched in afterwards. A crawler fetching the URL saw no title, no body and a
canonical pointing at the listing page, so the posts had effectively no organic presence.

This writes a real file per post at blogs/<slug>.html, which serves at /blogs/<slug> on
any host with no rewrite rule at all — nginx resolves it through $uri.html and GitHub
Pages serves it natively. The content is in the markup, the canonical is per-post, and the
Article schema matches what is on the page.

Re-run this after publishing or editing a post
----------------------------------------------
    python tools/build-blog-pages.py

Posts published since the last run are NOT stale-broken: /blogs/<slug> falls through to
the dynamic blogs-detail page via the 404 router, so a new post is reachable immediately.
It just is not crawlable until this is re-run.

Reads published posts with the public anon key — the same request every visitor's browser
already makes. It writes nothing to the database.
"""
import html
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://airmedical24x7.com"
OUT_DIR = os.path.join(ROOT, "blogs")
TEMPLATE = os.path.join(ROOT, "blogs-detail.html")


def anon_key():
    cfg = open(os.path.join(ROOT, "js", "config.js"), encoding="utf-8").read()
    return re.search(r'const supabaseKey = "([^"]+)"', cfg).group(1)


def fetch_posts():
    key = anon_key()
    url = (f"https://dtiirdimtbmkvryvqten.supabase.co/rest/v1/blogs"
           f"?status=eq.published"
           f"&select=slug,title,excerpt,content,featured_image,author,category,"
           f"created_at,meta_title,meta_description"
           f"&order=created_at.desc")
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": "Bearer " + key})
    return json.load(urllib.request.urlopen(req, timeout=60))


def brand(text):
    """Mirror sanitize24X7() so pre-rendered copy matches what the client would render."""
    if not text:
        return text
    return re.sub(r"(?<!airmedical)(24/7|24[xX]7)", "24X7", text, flags=re.I)


def esc(t):
    return html.escape(t or "", quote=True)


def build_page(template, post):
    slug = post["slug"]
    title = brand(post.get("meta_title") or post.get("title") or "")
    desc = brand(post.get("meta_description") or post.get("excerpt") or "")
    body = brand(post.get("content") or "")
    image = post.get("featured_image") or f"{SITE}/img/flight-medical.webp"
    if image.startswith("/"):
        image = SITE + image
    url = f"{SITE}/blogs/{slug}"

    s = template

    # The page now sits one level deeper, so every same-site relative path gains a ../
    # Absolute URLs, protocol-relative, fragments and tel:/mailto: are left alone.
    def deepen(m):
        attr, val = m.group(1), m.group(2)
        if val.startswith(("http://", "https://", "//", "#", "mailto:", "tel:", "sms:",
                           "data:", "javascript:", "../", "/")):
            return m.group(0)
        if val in ("./", "."):            # the site root, from one level deeper
            return f'{attr}="../"'
        if val.startswith("./"):
            val = val[2:]
        return f'{attr}="../{val}"'

    s = re.sub(r'\b(href|src)="([^"]*)"', deepen, s)

    s = re.sub(r"<title>.*?</title>", f"<title>{esc(title)}</title>", s, flags=re.S)
    s = re.sub(r'(<meta name="description" content=")[^"]*(")',
               lambda m: m.group(1) + esc(desc) + m.group(2), s)
    # blogs-detail.html carries no Open Graph tags, so shares of a post render as a bare
    # URL. Inject a full set — this is the main reason to pre-render social metadata:
    # crawlers for Facebook, LinkedIn and WhatsApp do not execute JavaScript.
    og_tags = [
        ('property', 'og:type', 'article'),
        ('property', 'og:title', title),
        ('property', 'og:description', desc),
        ('property', 'og:url', url),
        ('property', 'og:image', image),
        ('name', 'twitter:card', 'summary_large_image'),
        ('name', 'twitter:title', title),
        ('name', 'twitter:description', desc),
        ('name', 'twitter:image', image),
    ]
    og = "".join('  <meta %s="%s" content="%s">\n' % (kind, key, esc(val))
                 for kind, key, val in og_tags)
    s = s.replace("</head>", og + "</head>", 1)
    s = re.sub(r'(<link[^>]*rel="canonical"[^>]*href=")[^"]*(")',
               lambda m: m.group(1) + esc(url) + m.group(2), s)

    # the real content, so a crawler sees the post without running JavaScript
    s = re.sub(r'(<h1[^>]*id="blog-title"[^>]*>).*?(</h1>)',
               lambda m: m.group(1) + esc(brand(post.get("title") or "")) + m.group(2), s, flags=re.S)
    s = re.sub(r'(<img[^>]*id="blog-image"[^>]*)src="[^"]*"',
               lambda m: m.group(1) + f'src="{esc(image)}"', s)
    s = re.sub(r'(<div[^>]*id="blog-content"[^>]*>).*?(</div>)',
               lambda m: m.group(1) + body + m.group(2), s, count=1, flags=re.S)

    article = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "@id": url + "#article",
        "headline": brand(post.get("title") or "")[:110],
        "description": desc,
        "image": image,
        "datePublished": post.get("created_at"),
        "author": {"@type": "Organization", "name": brand(post.get("author") or "Air Medical 24X7")},
        "publisher": {"@id": SITE + "/#organization"},
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
    }
    s = s.replace("</head>",
                  '  <script type="application/ld+json">\n'
                  + json.dumps(article, indent=2, ensure_ascii=False)
                  + "\n</script>\n</head>")
    return s


def main():
    if not os.path.isfile(TEMPLATE):
        sys.exit("template not found: " + TEMPLATE)
    template = open(TEMPLATE, encoding="utf-8", errors="surrogateescape").read()

    posts = fetch_posts()
    print("  %d published posts" % len(posts))
    os.makedirs(OUT_DIR, exist_ok=True)

    # drop pages for posts that no longer exist or were unpublished
    live = {p["slug"] + ".html" for p in posts}
    for f in os.listdir(OUT_DIR):
        if f.endswith(".html") and f not in live:
            os.remove(os.path.join(OUT_DIR, f))
            print("     removed stale %s" % f)

    for p in posts:
        out = os.path.join(OUT_DIR, p["slug"] + ".html")
        open(out, "w", encoding="utf-8", errors="surrogateescape").write(build_page(template, p))
        print("     %-64s %6.1f KB" % ("blogs/" + p["slug"] + ".html",
                                       os.path.getsize(out) / 1024))
    print("  done — re-run after publishing or editing a post")


if __name__ == "__main__":
    main()
