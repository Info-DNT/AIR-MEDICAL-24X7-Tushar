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
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://airmedical24x7.com"
OUT_DIR = os.path.join(ROOT, "blogs")
TEMPLATE = os.path.join(ROOT, "blogs-detail.html")


def anon_key():
    """Prefer .env; fall back to js/config.js so this keeps working without one."""
    env = os.path.join(ROOT, ".env")
    if os.path.isfile(env):
        for line in open(env, encoding="utf-8"):
            line = line.strip()
            if line.startswith("SUPABASE_ANON_KEY=") and not line.startswith("#"):
                v = line.split("=", 1)[1].strip().strip("\"'")
                if v:
                    return v
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


def author_schema(raw):
    """schema.org author for the post.

    blogs.author is a plain name on older posts and a JSON string {name, role, ...}
    on posts saved with the admin author section. Dropping the raw column into the
    schema put the whole JSON blob in as the author's name.
    """
    data = None
    if isinstance(raw, dict):
        data = raw
    elif isinstance(raw, str) and raw.strip().startswith("{"):
        try:
            data = json.loads(raw)
        except ValueError:
            data = None
    if data and (data.get("name") or "").strip():
        person = {"@type": "Person", "name": brand(data["name"].strip())}
        if (data.get("role") or "").strip():
            person["jobTitle"] = brand(data["role"].strip())
        if str(data.get("linkedin") or "").startswith("https://"):
            person["sameAs"] = data["linkedin"]
        return person
    name = raw.strip() if isinstance(raw, str) and raw.strip() and not raw.strip().startswith("{") else "Air Medical 24X7"
    return {"@type": "Organization", "name": brand(name)}


def brand(text):
    """Mirror sanitize24X7() so pre-rendered copy matches what the client would render."""
    if not text:
        return text
    return re.sub(r"(?<!airmedical)(24/7|24[xX]7)", "24X7", text, flags=re.I)


# alt and title for a post's featured image, by slug. There is no column for these in
# the blogs table, so they live here; posts not listed get the post title as alt text.
FEATURED_IMAGE_TAGS = {
    "air-ambulance-in-manila-international-medical-evacuation-and-repatriation-guide": {
        "title": "Air ambulance in Manila",
        "alt": "International Medical Evacuation and Repatriation Guide",
    },
    "medical-repatriation-for-ofws-how-to-bring-a-sick-or-injured-worker-home-safely": {
        "title": "Medical repatriation in Philippines",
        "alt": "how to bring a sick or injured worker home safely",
    },
}

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


def blog_date(created_at):
    """("2026-10-10", "October 10, 2026") from blogs.created_at; ("", "") when missing.

    Mirrors window.formatBlogDate() in js/config.js: the UTC date is read straight from
    the string, never shifted into a local time zone.
    """
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", str(created_at or ""))
    if not m:
        return "", ""
    return m.group(0), f"{MONTHS[int(m.group(2)) - 1]} {int(m.group(3))}, {m.group(1)}"


def esc(t):
    return html.escape(t or "", quote=True)


FAQ_HEADING = re.compile(r"^(\d+[.)]\s*)?(faqs?|frequently asked questions)\b", re.I)


def fix_headings(body, title):
    """Keep the page to one H1, the post title. Mirrors fixHeadings() in js/blogs-detail.js.

    Writers sometimes open the article with the title again as Heading 1, or use Heading 1
    for sections. A leading H1 that repeats the title is dropped; any other H1 becomes H2.
    """
    norm = lambda t: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", t))).strip().lower()
    lead = re.match(r"\s*<h1\b[^>]*>(.*?)</h1>", body, re.S)
    if lead and norm(lead.group(1)) == norm(title):
        body = body[lead.end():]
    return re.sub(r"<(/?)h1\b", r"<\1h2", body)
VOID_TAGS = {"br", "img", "hr", "input", "meta", "link", "source", "wbr", "col"}


class _Blocks(HTMLParser):
    """Splits Quill's flat post HTML into top-level blocks: (tag, text, bold_text, lead_bold).

    lead_bold is the bold text a block opens with, for "<strong>Question?</strong> Answer"
    paragraphs that keep a FAQ question and its answer on one line.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.depth, self.bold = [], 0, 0
        self.tag, self.text, self.bold_text = None, [], []
        self.lead, self.lead_open = [], False

    def handle_starttag(self, tag, attrs):
        if tag in ("strong", "b"):
            self.bold += 1
        if tag in VOID_TAGS:
            if self.tag and tag == "br":
                self.text.append(" ")
            return
        if self.depth == 0:
            self.tag, self.text, self.bold_text = tag, [], []
            self.lead, self.lead_open = [], True
        elif tag == "li":
            self.text.append(" ")
        self.depth += 1

    def handle_endtag(self, tag):
        if tag in ("strong", "b"):
            self.bold = max(0, self.bold - 1)
        if tag in VOID_TAGS or self.depth == 0:
            return
        self.depth -= 1
        if self.depth == 0 and self.tag:
            self.blocks.append((self.tag, _squash("".join(self.text)), _squash("".join(self.bold_text)),
                                _squash("".join(self.lead))))
            self.tag = None

    def handle_data(self, data):
        if self.tag:
            self.text.append(data)
            if self.bold:
                self.bold_text.append(data)
            if self.lead_open:
                if self.bold:
                    self.lead.append(data)
                elif data.strip():
                    self.lead_open = False


def _squash(text):
    return re.sub(r"\s+", " ", text).strip()


def extract_faq(body):
    """Question/answer pairs from the post's FAQ section, for FAQPage schema.

    Mirrors faqFromContent() in js/blogs-detail.js. The section starts at an H2/H3 titled
    "FAQ", "FAQs" or "Frequently Asked Questions" and ends at the next H1/H2. Inside it,
    a question is a paragraph that is entirely bold and ends in "?" (or an H3/H4 ending in
    "?"), and everything up to the next question is its answer; or a paragraph that opens
    with a bold question followed by its answer on the same line. Text is taken verbatim, since
    Google requires FAQ schema to match what is visible on the page.
    """
    parser = _Blocks()
    parser.feed(body or "")
    parser.close()

    pairs, in_faq, question, answer = [], False, None, []

    def flush():
        if question and answer:
            pairs.append((question, " ".join(answer)))

    for tag, text, bold, lead in parser.blocks:
        heading = re.fullmatch(r"h([1-6])", tag)
        level = int(heading.group(1)) if heading else 0
        if not in_faq:
            in_faq = level in (2, 3) and bool(FAQ_HEADING.match(text))
            continue
        if level and level <= 2:
            break
        is_question = text.endswith("?") and (level in (3, 4) or (tag == "p" and bold == text))
        inline = (tag == "p" and lead.endswith("?") and len(text) > len(lead)
                  and text.startswith(lead))
        if is_question:
            flush()
            question, answer = text, []
        elif inline:
            flush()
            question, answer = lead, [text[len(lead):].strip()]
        elif question and text:
            answer.append(text)
    flush()
    return pairs if len(pairs) >= 2 else []


def build_page(template, post):
    slug = post["slug"]
    title = brand(post.get("meta_title") or post.get("title") or "")
    desc = brand(post.get("meta_description") or post.get("excerpt") or "")
    body = fix_headings(brand(post.get("content") or ""), brand(post.get("title") or ""))
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
    # blogs-detail.html writes this tag content-first (<meta content="..." name="description">),
    # which a name-first pattern never matched — every post shipped the template's generic
    # description. Replace the whole tag, whatever its attribute order.
    s = re.sub(r'<meta\b(?=[^>]*\bname="description")[^>]*>',
               lambda m: f'<meta name="description" content="{esc(desc)}">', s, count=1)
    # blogs-detail.html carries no Open Graph tags, so shares of a post render as a bare
    # URL. Inject a full set — this is the main reason to pre-render social metadata:
    # crawlers for Facebook, LinkedIn and WhatsApp do not execute JavaScript.
    image_tags = FEATURED_IMAGE_TAGS.get(slug, {})
    image_alt = image_tags.get("alt") or brand(post.get("title") or "")
    og_tags = [
        ('property', 'og:type', 'article'),
        ('property', 'og:title', title),
        ('property', 'og:description', desc),
        ('property', 'og:url', url),
        ('property', 'og:image', image),
        ('property', 'og:image:alt', image_alt),
        ('name', 'twitter:card', 'summary_large_image'),
        ('name', 'twitter:title', title),
        ('name', 'twitter:description', desc),
        ('name', 'twitter:image', image),
        ('name', 'twitter:image:alt', image_alt),
    ]
    og = "".join('  <meta %s="%s" content="%s">\n' % (kind, key, esc(val))
                 for kind, key, val in og_tags)
    s = s.replace("</head>", og + "</head>", 1)
    s = re.sub(r'(<link[^>]*rel="canonical"[^>]*href=")[^"]*(")',
               lambda m: m.group(1) + esc(url) + m.group(2), s)

    # the real content, so a crawler sees the post without running JavaScript
    s = re.sub(r'(<h1[^>]*id="blog-title"[^>]*>).*?(</h1>)',
               lambda m: m.group(1) + esc(brand(post.get("title") or "")) + m.group(2), s, flags=re.S)
    iso_date, shown_date = blog_date(post.get("created_at"))
    if shown_date:
        s = re.sub(r'(<p[^>]*id="blog-date"[^>]*?)\s+hidden(>.*?<time id="blog-date-time")[^>]*>[^<]*(</time>)',
                   lambda m: m.group(1) + m.group(2) + f' datetime="{iso_date}">{shown_date}' + m.group(3),
                   s, count=1, flags=re.S)
    s = re.sub(r'(<img[^>]*id="blog-image"[^>]*)src="[^"]*"',
               lambda m: m.group(1) + f'src="{esc(image)}"', s)
    img_attrs = f'alt="{esc(image_alt)}"' + (f' title="{esc(image_tags["title"])}"' if image_tags.get("title") else "")
    s = re.sub(r'(<img[^>]*id="blog-image"[^>]*?)\balt="[^"]*"',
               lambda m: m.group(1) + img_attrs, s, count=1)
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
        "author": author_schema(post.get("author")),
        "publisher": {"@id": SITE + "/#organization"},
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
    }
    s = s.replace("</head>",
                  '  <script type="application/ld+json">\n'
                  + json.dumps(article, indent=2, ensure_ascii=False)
                  + "\n</script>\n</head>")

    faq = extract_faq(body)
    if faq:
        faq_schema = {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "@id": url + "#faq",
            "mainEntity": [
                {"@type": "Question", "name": q,
                 "acceptedAnswer": {"@type": "Answer", "text": a}}
                for q, a in faq
            ],
        }
        # The id tells js/blogs-detail.js the schema is already here, so it adds no copy.
        # "</" is escaped so answer text can never close the script tag early.
        s = s.replace("</head>",
                      '  <script type="application/ld+json" id="faq-schema">\n'
                      + json.dumps(faq_schema, indent=2, ensure_ascii=False).replace("</", "<\\/")
                      + "\n</script>\n</head>")
    return s


def check_seo(page, post, template):
    """Problems with a built page's title, meta description or H1; empty when it is fine.

    Guards the two regressions this script has shipped: the meta description pattern
    silently not matching (every post kept the template's generic text), and a second,
    hidden H1 in the template appearing on every post.
    """
    problems = []
    titles = re.findall(r"<title>(.*?)</title>", page, re.S)
    descs = re.findall(r'<meta\b[^>]*\bname="description"[^>]*>', page)
    h1s = re.findall(r"<h1\b[^>]*>(.*?)</h1>", page, re.S)
    template_desc = re.search(r'<meta\b[^>]*\bname="description"[^>]*\bcontent="([^"]*)"'
                              r'|<meta\b[^>]*\bcontent="([^"]*)"[^>]*\bname="description"', template)
    template_desc = template_desc and (template_desc.group(1) or template_desc.group(2))

    if len(titles) != 1 or not titles[0].strip():
        problems.append(f"expected 1 non-empty <title>, found {len(titles)}")
    if len(descs) != 1:
        problems.append(f"expected 1 meta description, found {len(descs)}")
    else:
        content = re.search(r'\bcontent="([^"]*)"', descs[0])
        content = content.group(1).strip() if content else ""
        if not content:
            problems.append("meta description is empty (fill SEO Description or Excerpt in admin)")
        elif content == template_desc:
            problems.append("meta description is still the template's generic text")
    if len(h1s) != 1:
        problems.append(f"expected 1 <h1>, found {len(h1s)}")
    elif html.unescape(re.sub(r"<[^>]+>", "", h1s[0])).strip() != brand(post.get("title") or "").strip():
        problems.append("<h1> is not the post title")
    return problems


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

    pages = {p["slug"]: build_page(template, p) for p in posts}
    problems = [f"blogs/{p['slug']}.html: {msg}"
                for p in posts for msg in check_seo(pages[p["slug"]], p, template)]
    if problems:
        # Nothing is written, so a bad build can never replace good pages.
        sys.exit("SEO check failed, no pages written:\n  " + "\n  ".join(problems))

    for p in posts:
        out = os.path.join(OUT_DIR, p["slug"] + ".html")
        open(out, "w", encoding="utf-8", errors="surrogateescape").write(pages[p["slug"]])
        print("     %-64s %6.1f KB" % ("blogs/" + p["slug"] + ".html",
                                       os.path.getsize(out) / 1024))
    print("  done — re-run after publishing or editing a post")


if __name__ == "__main__":
    main()
