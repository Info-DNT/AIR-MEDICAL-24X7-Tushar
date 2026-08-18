#!/usr/bin/env bash
# Apply nginx.conf on the server, reusing the TLS paths already in use.
#
# The two values that cannot be known from the repository are the certificate
# paths and the real webroot. Hand-editing them is where this goes wrong: paste
# /var/www/html when the root is somewhere else and every page 404s. So this
# reads them out of the running config instead of asking you to type them.
#
#   ./apply-nginx-config.sh              dry run: show what would change
#   ./apply-nginx-config.sh --apply      back up, install, test, reload
#
# Nothing is reloaded unless `nginx -t` passes. The backup path is printed.

set -euo pipefail

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nginx.conf"
STAMP=$(date +%F-%H%M%S)

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$SRC" ] || die "nginx.conf not found at $SRC"
command -v nginx >/dev/null || die "nginx not found. Run this on the server, not your laptop."
[ "$(id -u)" -eq 0 ] || die "run with sudo"

say "== 1. locating the active config =="
TARGET=""
for c in /etc/nginx/sites-available/default /etc/nginx/conf.d/default.conf /etc/nginx/nginx.conf; do
    [ -f "$c" ] && grep -qE 'server_name.*airmedical24x7|listen\s+443' "$c" 2>/dev/null && { TARGET="$c"; break; }
done
[ -n "$TARGET" ] || die "could not find the site config. Run: nginx -T | grep -n 'configuration file'"
say "   target: $TARGET"

say ""
say "== 2. reading the values already in use =="
DUMP=$(nginx -T 2>/dev/null)
CERT=$(printf '%s' "$DUMP" | grep -oP '(?<=^\s{0,40}ssl_certificate\s{1,20})[^;]+' | head -1 || true)
KEY=$(printf  '%s' "$DUMP" | grep -oP '(?<=^\s{0,40}ssl_certificate_key\s{1,20})[^;]+' | head -1 || true)
ROOT=$(printf '%s' "$DUMP" | grep -oP '(?<=^\s{0,40}root\s{1,20})[^;]+' | head -1 || true)
OPTS=$(printf '%s' "$DUMP" | grep -oE '/etc/letsencrypt/options-ssl-nginx\.conf' | head -1 || true)
DHP=$(printf  '%s' "$DUMP" | grep -oE '/etc/letsencrypt/ssl-dhparams\.pem'      | head -1 || true)

[ -n "$CERT" ] || die "no ssl_certificate found in the running config. Is HTTPS configured here?"
[ -n "$KEY"  ] || die "no ssl_certificate_key found in the running config."
[ -n "$ROOT" ] || die "no root found in the running config."

say "   certificate : $CERT"
say "   private key : $KEY"
say "   webroot     : $ROOT"
say "   certbot ssl options : ${OPTS:-(none - those lines will be removed)}"

for f in "$CERT" "$KEY"; do
    [ -f "$f" ] || die "$f does not exist. Refusing to write a config that would break TLS."
done
[ -d "$ROOT" ] || die "webroot $ROOT is not a directory."
[ -f "$ROOT/index.html" ] || die "no index.html in $ROOT - wrong webroot, every page would 404."

say ""
say "== 3. building the new config =="
NEW=$(mktemp)
cp "$SRC" "$NEW"
sed -i \
  -e "s#^\(\s*\)ssl_certificate\s\+.*#\1ssl_certificate     $CERT;#" \
  -e "s#^\(\s*\)ssl_certificate_key\s\+.*#\1ssl_certificate_key $KEY;#" \
  -e "s#^\(\s*\)root\s\+/var/www/html;.*#\1root $ROOT;#" \
  "$NEW"
[ -n "$OPTS" ] || sed -i '/options-ssl-nginx\.conf/d' "$NEW"
[ -n "$DHP"  ] || sed -i '/ssl-dhparams\.pem/d'       "$NEW"

grep -q '/var/www/html' "$NEW" && die "a /var/www/html placeholder survived - aborting"
say "   substituted, no placeholders left"

say ""
say "== 4. syntax check =="
# nginx -t validates whatever is installed, so the candidate has to go into place
# first. nginx does not read it until a reload, so the running server is unaffected
# either way -- but a Ctrl-C in this window would leave the untested file on disk
# and the NEXT reload, whenever that happened, would pick it up. The trap restores
# the original on any abnormal exit.
TMPDIR_CHK=$(mktemp -d)
cp "$TARGET" "$TMPDIR_CHK/original"
RESTORE_ON_EXIT=1
cleanup() {
    if [ "${RESTORE_ON_EXIT:-0}" = "1" ] && [ -f "$TMPDIR_CHK/original" ]; then
        cp "$TMPDIR_CHK/original" "$TARGET"
        printf 'interrupted - original config restored\n' >&2
    fi
    rm -rf "$TMPDIR_CHK" "$NEW" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
cp "$NEW" "$TARGET"
if nginx -t 2>&1 | sed 's/^/   /'; then
    OK=1
else
    OK=0
fi
if [ "$OK" -eq 0 ] || [ "$APPLY" -eq 0 ]; then
    cp "$TMPDIR_CHK/original" "$TARGET"          # always restore on dry run or failure
    RESTORE_ON_EXIT=0
    [ "$OK" -eq 0 ] && die "nginx -t failed. Nothing changed."
    say ""
    say "   DRY RUN - config is valid but was NOT installed."
    say "   Re-run with --apply to back up, install and reload."
    exit 0
fi

BACKUP="$TARGET.bak.$STAMP"
cp "$TMPDIR_CHK/original" "$BACKUP"
RESTORE_ON_EXIT=0          # past this point the new config is intended to stay
say ""
say "== 5. reloading =="
say "   backup saved: $BACKUP"
systemctl reload nginx
say "   reloaded"

say ""
say "== 6. verifying =="
sleep 2
# `grep -c` prints 0 AND exits 1 when it matches nothing, so `|| echo 0` would
# produce two lines and break the numeric test below. `|| true` keeps the count.
H=$(curl -sIL --max-redirs 5 https://airmedical24x7.com/ 2>/dev/null | grep -c '^HTTP' || true)
H=${H:-0}
if [ "$H" -eq 0 ]; then
    say "   could not reach the site to verify (network or rate limiting)."
    say "   check by hand:  curl -sIL https://airmedical24x7.com/ | grep '^HTTP'"
    say "   rollback if needed: cp $BACKUP $TARGET && nginx -t && systemctl reload nginx"
    exit 0
fi
if [ "$H" -ne 1 ]; then
    say "   !! homepage returned $H HTTP responses - REDIRECT LOOP"
    say "   !! rolling back"
    cp "$BACKUP" "$TARGET"; nginx -t >/dev/null 2>&1 && systemctl reload nginx
    die "rolled back. The homepage was looping."
fi
say "   homepage: 1 response, no loop"

check() {  # url  expected-code  label
    sleep 1
    c=$(curl -s -o /dev/null -w '%{http_code}' "https://airmedical24x7.com$1" 2>/dev/null || true)
    [ "$c" = "$2" ] && say "   OK   $3 ($1 -> $c)" || say "   FAIL $3 ($1 -> $c, wanted $2)"
}
check /               200 "homepage"
check /index.html     301 "index.html redirects"
check /about-us       200 "a normal page"
check /about-us.html  301 ".html redirects"
check /no-such-page   404 "unknown URL is a 404"
check /blogs          200 "blog listing"

sleep 1
SZ=$(curl -s -o /dev/null -w '%{size_download}' https://airmedical24x7.com/no-such-page 2>/dev/null || true)
[ "${SZ:-0}" -gt 5000 ] && say "   OK   404 page is the branded one ($SZ bytes)" \
                   || say "   FAIL 404 page is only $SZ bytes - still nginx's default"

sleep 1
W=$(curl -s -o /dev/null -w '%{http_code}' https://www.airmedical24x7.com/about-us 2>/dev/null || true)
[ "$W" = "301" ] && say "   OK   www redirects ($W)" || say "   FAIL www returned $W, wanted 301"

say ""
say "Done. To roll back:"
say "   sudo cp $BACKUP $TARGET && sudo nginx -t && sudo systemctl reload nginx"
