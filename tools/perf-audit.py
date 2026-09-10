#!/usr/bin/env python3
"""Lighthouse budget check for the working tree.

Serves the repo on a local port and audits it with Lighthouse, so a regression is
caught before it is pushed. The live site is not used: it lags the working tree,
and its score also moves when the server config changes, which would make this
check report code regressions that are not code regressions.

The local server gzips CSS/JS/HTML the way nginx.conf and GitHub Pages do, and
is threaded, so a run is not transfer- or queue-bound. The absolute numbers still
sit below PageSpeed's (different CPU, no CDN), which does not matter: the
thresholds in perf-budget.json are calibrated against this same local setup, so
the comparison is like for like. Recalibrate with --calibrate after a genuine
improvement, never by loosening a threshold to make a red run go green.

    python tools/perf-audit.py              # audit, exit 1 on regression
    python tools/perf-audit.py --calibrate  # rewrite the budget from this run
    python tools/perf-audit.py --json       # machine-readable summary

Exit codes: 0 pass, 1 regression, 2 could not run (Lighthouse missing, etc).
"""
import argparse
import gzip
import http.server
import io
import json
import os
import re
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUDGET = ROOT / "perf-budget.json"
PAGE = "index.html"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


GZIP_TYPES = (".css", ".js", ".html", ".htm", ".json", ".xml", ".svg", ".txt")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Serves the repo the way the deployed site serves it.

    gzip matters: nginx.conf compresses CSS and JS in production and GitHub
    Pages does it automatically. Measuring against an uncompressed server would
    make every run transfer-bound, so the budget would track download size
    rather than the code, and mobile would fail on a page that is actually fine.
    """

    def log_message(self, *a):
        pass

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except ConnectionError:
            self.close_connection = True   # Chrome drops keep-alives; not an error

    def handle_error(self, *a):
        pass

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.isfile(path):
            return super().send_head()
        if not path.lower().endswith(GZIP_TYPES) or "gzip" not in self.headers.get("Accept-Encoding", ""):
            return super().send_head()
        with open(path, "rb") as f:
            body = gzip.compress(f.read(), 6)
        ctype = self.guess_type(path)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        return io.BytesIO(body)


class ThreadedServer(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, *a):
        pass


def serve(port):
    os.chdir(ROOT)
    # Threaded: a single-threaded server serialises every asset request, which
    # under Lighthouse's mobile CPU/network throttling collapses the score and
    # invents layout shifts that the real site does not have.
    httpd = ThreadedServer(("127.0.0.1", port), QuietHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def chrome_path():
    if os.environ.get("CHROME_PATH"):
        return os.environ["CHROME_PATH"]
    # playwright's chromium is what the rest of this repo's tooling uses
    for base in [Path.home() / "AppData/Local/ms-playwright", Path.home() / ".cache/ms-playwright"]:
        if base.is_dir():
            for d in sorted(base.glob("chromium-*"), reverse=True):
                for exe in ["chrome-win64/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]:
                    p = d / exe
                    if p.exists():
                        return str(p)
    return None


def run_lighthouse(url, preset, out):
    cmd = ["lighthouse", url, "--output=json", "--output-path=" + out, "--quiet",
           "--only-categories=performance,accessibility",
           '--chrome-flags=--headless=new --no-sandbox']
    if preset == "desktop":
        cmd.append("--preset=desktop")
    env = dict(os.environ)
    cp = chrome_path()
    if cp:
        env["CHROME_PATH"] = cp
    r = subprocess.run(cmd, capture_output=True, text=True, env=env,
                       shell=(os.name == "nt"))
    if not os.path.exists(out):
        return None, (r.stderr or r.stdout or "lighthouse produced no report")[-400:]
    with open(out, encoding="utf-8") as f:
        d = json.load(f)
    a = d["audits"]
    num = lambda k: a[k]["numericValue"] if k in a and a[k].get("numericValue") is not None else None
    return {
        "performance": round((d["categories"]["performance"]["score"] or 0) * 100),
        "accessibility": round((d["categories"]["accessibility"]["score"] or 0) * 100),
        "lcp_ms": num("largest-contentful-paint"),
        "tbt_ms": num("total-blocking-time"),
        "cls": num("cumulative-layout-shift"),
    }, None


def measure():
    port = free_port()
    httpd = serve(port)
    url = "http://127.0.0.1:%d/%s" % (port, PAGE)
    tmp = tempfile.mkdtemp()
    try:
        out = {}
        for preset in ("mobile", "desktop"):
            res, err = run_lighthouse(url, preset, os.path.join(tmp, preset + ".json"))
            if res is None:
                return None, "%s: %s" % (preset, err)
            out[preset] = res
        return out, None
    finally:
        httpd.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)


def check(results, budget):
    """Return a list of human-readable regressions."""
    bad = []
    for preset in ("mobile", "desktop"):
        b, r = budget.get(preset, {}), results[preset]
        for key, label in [("performance", "Performance"), ("accessibility", "Accessibility")]:
            floor = b.get("min_" + key)
            if floor is not None and r[key] < floor:
                bad.append("%s %s %d is below the floor of %d" % (preset, label, r[key], floor))
        for key, label, unit in [("lcp_ms", "LCP", "ms"), ("tbt_ms", "TBT", "ms"), ("cls", "CLS", "")]:
            cap = b.get("max_" + key)
            if cap is not None and r[key] is not None and r[key] > cap:
                bad.append("%s %s %s%s exceeds the cap of %s%s"
                           % (preset, label, round(r[key], 3), unit, round(cap, 3), unit))
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--calibrate", action="store_true")
    ap.add_argument("--runs", type=int, default=3,
                    help="calibration runs; the budget is built from the WORST of them")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if not shutil.which("lighthouse") and not shutil.which("lighthouse.cmd"):
        print("perf-audit: lighthouse not installed (npm i -g lighthouse) - skipping", file=sys.stderr)
        return 2

    if args.calibrate:
        # Lighthouse is noisy -- desktop TBT has been observed at 29 ms and
        # 410 ms on identical code, because third-party tag timing shifts run to
        # run. A budget built from one sample fires on that noise, and a guard
        # that cries wolf gets turned off. So sample several times and take the
        # worst of each metric before adding margin.
        samples = []
        for i in range(max(1, args.runs)):
            r, err = measure()
            if r is None:
                print("perf-audit: could not run - %s" % err, file=sys.stderr)
                return 2
            samples.append(r)
            for pre in ("mobile", "desktop"):
                x = r[pre]
                print("  run %d  %-8s perf %3d  a11y %3d  LCP %5dms  TBT %5dms  CLS %.3f"
                      % (i + 1, pre, x["performance"], x["accessibility"],
                         x["lcp_ms"] or 0, x["tbt_ms"] or 0, x["cls"] or 0))
        worst = {}
        for pre in ("mobile", "desktop"):
            worst[pre] = {
                "performance":   min(s[pre]["performance"] for s in samples),
                "accessibility": min(s[pre]["accessibility"] for s in samples),
                "lcp_ms":        max(s[pre]["lcp_ms"] or 0 for s in samples),
                "tbt_ms":        max(s[pre]["tbt_ms"] or 0 for s in samples),
                "cls":           max(s[pre]["cls"] or 0 for s in samples),
            }
        results = worst

    if not args.calibrate:
        results, err = measure()
        if results is None:
            print("perf-audit: could not run - %s" % err, file=sys.stderr)
            return 2

    if args.calibrate:
        budget = {
            "_comment": "Calibrated from the WORST of several local runs via tools/perf-audit.py --calibrate. "
                        "These are floors, not targets; PageSpeed on the compressed build scores higher. "
                        "Recalibrate with --calibrate after a genuine improvement, never to excuse a regression.",
        }
        for preset, r in results.items():
            # margins on top of the WORST sample, sized to each metric's observed
            # volatility: TBT swings hardest, the composite score least.
            budget[preset] = {
                "min_performance": max(0, r["performance"] - 8),
                "min_accessibility": max(0, r["accessibility"] - 3),
                "max_lcp_ms": round((r["lcp_ms"] or 0) * 1.35 + 200),
                "max_tbt_ms": round((r["tbt_ms"] or 0) * 1.60 + 300),
                "max_cls": round((r["cls"] or 0) * 2.0 + 0.05, 3),
            }
        BUDGET.write_text(json.dumps(budget, indent=2) + "\n", encoding="utf-8")
        print("perf-audit: budget written to %s" % BUDGET.name)
        for p, r in results.items():
            print("  %-8s perf %3d  a11y %3d  LCP %5dms  TBT %5dms  CLS %.3f"
                  % (p, r["performance"], r["accessibility"], r["lcp_ms"] or 0, r["tbt_ms"] or 0, r["cls"] or 0))
        return 0

    if not BUDGET.exists():
        print("perf-audit: no perf-budget.json - run: python tools/perf-audit.py --calibrate", file=sys.stderr)
        return 2
    budget = json.loads(BUDGET.read_text(encoding="utf-8"))
    bad = check(results, budget)

    if args.json:
        print(json.dumps({"results": results, "regressions": bad}, indent=2))
        return 1 if bad else 0

    for p, r in results.items():
        print("  %-8s perf %3d  a11y %3d  LCP %5dms  TBT %5dms  CLS %.3f"
              % (p, r["performance"], r["accessibility"], r["lcp_ms"] or 0, r["tbt_ms"] or 0, r["cls"] or 0))
    if bad:
        print("\nPERFORMANCE REGRESSION:")
        for b in bad:
            print("  - %s" % b)
        return 1
    print("\nperf-audit: within budget")
    return 0


if __name__ == "__main__":
    sys.exit(main())
