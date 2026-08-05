#!/usr/bin/env sh
# 6LAYER reality gate: lexical layer of the no-mock law.
set -eu
PAT=".agent/reality-patterns"
ALLOW=".agent/reality-allow"
[ -f "$PAT" ] || { echo "reality gate: missing $PAT" >&2; exit 1; }
[ -f "$ALLOW" ] || { echo "reality gate: missing $ALLOW" >&2; exit 1; }
SRC_DIRS="apps packages"
hits=0
for d in $SRC_DIRS; do
  [ -d "$d" ] || continue
  out=$(
    find "$d" -type d \( -name node_modules -o -name dist -o -name .next \) -prune -o \
      -type f -exec grep -HnE -f "$PAT" {} + 2>/dev/null |
      grep -vE -f "$ALLOW" || true
  )
  if [ -n "$out" ]; then printf '%s
' "$out"; hits=1; fi
done
[ "$hits" -eq 0 ] || { echo "reality gate: FAIL (forbidden implementation markers listed above)" >&2; exit 1; }
echo "reality gate: ok"
