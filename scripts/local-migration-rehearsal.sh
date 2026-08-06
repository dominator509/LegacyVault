#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
pnpm db:migrate
pnpm db:migrate
sh scripts/local-backup.sh
sh scripts/local-restore-drill.sh
echo "local migration rehearsal: ok"
