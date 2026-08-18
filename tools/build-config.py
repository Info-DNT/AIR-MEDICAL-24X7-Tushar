#!/usr/bin/env python3
"""Push the values from .env into js/config.js.

Why config.js is still committed with the values in it
------------------------------------------------------
The browser has to receive the anon key to reach Supabase, and this site has no
build server -- deploys copy files as they are. If config.js were generated at
deploy time and left out of git, any deploy that forgot to run this script would
ship a site with no working forms, no blog listing and no admin panel.

So config.js keeps its values and stays committed. This script exists so there is
ONE place to edit them: change .env, run this, commit the result.

It rewrites only the five credential lines. The ~380 lines of form handling,
Turnstile wiring and submission logic in config.js are never touched.

    python tools/build-config.py            # apply .env to js/config.js
    python tools/build-config.py --check    # report drift, change nothing (exit 1 if drift)
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = os.path.join(ROOT, ".env")
CONFIG = os.path.join(ROOT, "js", "config.js")

# js/config.js constant  ->  .env variable
MAPPING = [
    ("supabaseUrl",       "SUPABASE_URL"),
    ("supabaseKey",       "SUPABASE_ANON_KEY"),
    ("blogsSupabaseUrl",  "BLOGS_SUPABASE_URL"),
    ("blogsSupabaseKey",  "BLOGS_SUPABASE_ANON_KEY"),
    ("turnstileSiteKey",  "TURNSTILE_SITE_KEY"),
]


def read_env(path):
    """Minimal .env reader: KEY=value, ignoring blanks and # comments."""
    if not os.path.isfile(path):
        sys.exit("no .env found at %s\n  cp .env.example .env, then fill it in" % path)
    out = {}
    for n, raw in enumerate(open(path, encoding="utf-8"), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            sys.exit(".env line %d is not KEY=value:\n  %s" % (n, line[:60]))
        k, v = line.split("=", 1)
        v = v.strip()
        # tolerate quoted values
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        out[k.strip()] = v
    return out


def main():
    check = "--check" in sys.argv
    env = read_env(ENV)

    missing = [e for _, e in MAPPING if not env.get(e)]
    if missing:
        sys.exit("these .env values are empty: %s" % ", ".join(missing))

    if any("service_role" in v for v in env.values()):
        sys.exit("refusing to run: a service_role key is in .env. It bypasses RLS "
                 "and must never reach client JavaScript.")

    src = open(CONFIG, encoding="utf-8").read()
    original = src
    drift = []

    for const, envkey in MAPPING:
        want = env[envkey]
        pat = re.compile(r'(const\s+%s\s*=\s*")([^"]*)(")' % re.escape(const))
        m = pat.search(src)
        if not m:
            sys.exit("could not find `const %s` in js/config.js" % const)
        if m.group(2) != want:
            drift.append(const)
        src = pat.sub(lambda mm: mm.group(1) + want.replace("\\", "\\\\") + mm.group(3), src, count=1)

    if check:
        if drift:
            print("  DRIFT: js/config.js differs from .env for: %s" % ", ".join(drift))
            return 1
        print("  js/config.js matches .env")
        return 0

    if src == original:
        print("  js/config.js already matches .env -- nothing to do")
        return 0

    open(CONFIG, "w", encoding="utf-8", newline="").write(src)
    print("  updated js/config.js: %s" % ", ".join(drift))
    print("  remember to commit js/config.js (.env stays local)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
