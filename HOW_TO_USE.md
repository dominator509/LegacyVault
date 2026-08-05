# How to Use This Blueprint Pack

1. Materialize the pack by extracting the ZIP, or save the combined transcript as `BLUEPRINT_PACK.md` and use the included splitter.
2. Initialize git and commit: `git init && git add -A && git commit -m "[6LAYER] bootstrap blueprint pack"`.
3. Open PREFLIGHT.md, obtain every required credential and evidence file, copy `.env.example` to `.env`, and run `sh scripts/preflight.sh` until `preflight: ok`.
4. Launch any terminal agent with `.agent/prompts/run-graph.md`. Claude Code and Codex require their current non-interactive approval flags. Hermes and OpenClaw can receive the same prompt verbatim.
5. Observe with `tail -f .agent/state/LEDGER.md` and `git log --oneline`. Do not coordinate through chat memory.
6. If blocked, read the active ExecPlan report, make the one named decision, reset according to its recovery section, and relaunch.
7. Never implement from ROADMAP.md. Use single-node prompts for maintenance.
8. RUN_COMPLETE plus fresh verify and production-readiness sentinels is the ship decision. Production deployment remains manual.

## Splitter

#!/usr/bin/env sh
set -eu
pack="${1:-BLUEPRINT_PACK.md}"
[ -f "$pack" ] || { echo "unpack: missing $pack" >&2; exit 1; }
awk '
  /^=== FILE: /{
    path=substr($0, 11)
    sub(/ ===$/, "", path)
    cmd="mkdir -p \"$(dirname \"" path "\")\""
    system(cmd)
    printf "" > path
    out=1
    next
  }
  /^=== END FILE ===$/{ out=0; close(path); next }
  out { print >> path }
' "$pack"
echo "unpack: ok"
