#!/usr/bin/env bash
# Stop-hook wrapper: audit only when front-end files actually changed.
#
# Exit codes are chosen for the hook runner, not for humans:
#   0 = nothing to do, or the audit passed, or the audit could not run
#   2 = a real regression; asyncRewake uses this to wake Claude to fix it
#
# "Could not run" (lighthouse missing, no budget yet) must stay 0. A tool that
# blocks the session when its own dependency is absent gets disabled, and then
# it protects nothing.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 0

# Front-end files only: a change to a doc or a python tool cannot move the score.
PATHSPEC=('*.html' '*.css' '*.js')
if git diff --quiet HEAD -- "${PATHSPEC[@]}" 2>/dev/null &&
   git diff --cached --quiet HEAD -- "${PATHSPEC[@]}" 2>/dev/null &&
   [ -z "$(git ls-files --others --exclude-standard -- "${PATHSPEC[@]}" 2>/dev/null)" ]; then
  exit 0
fi

OUT=$(python tools/perf-audit.py 2>&1)
RC=$?
if [ "$RC" -eq 1 ]; then
  echo "$OUT"
  echo
  echo "Front-end files changed and the Lighthouse budget is now exceeded."
  echo "Fix the regression, or if the change is intentional and justified,"
  echo "recalibrate deliberately: python tools/perf-audit.py --calibrate"
  exit 2
fi
exit 0
