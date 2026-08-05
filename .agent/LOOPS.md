# Bounded Execution Loops

## Run loop
Run `sh scripts/graph-next.sh`, dispatch exactly, and repeat until BLOCKED or ALL_DONE. Node count is finite.

## Node loop
Lease one node, execute milestones in order, verify, audit expected files, append NODE_DONE, create the green tag, and release.

## Milestone ladder
Maximum six total attempts unless the plan declares another cap. Normalize the first error line as a signature and append SIG. First same-signature failure: one hypothesis and smallest fix. Second: isolate with a narrower diagnostic before editing. Third: take the declared real fallback. If fallback exhausts three attempts or total cap is reached: rollback to the last checkpoint and attempt fallback once from clean state. Final failure: append NODE_BLOCKED with command output, exit codes, signatures, hypotheses, diffs, smallest human decision, and recommended default.

The same fix may never be applied twice. A new signature resets the rung but not the total cap.

## Readiness
Probe background services at most 30 times with two-second sleeps, record PID or container ID, and define teardown. Exhaustion becomes READINESS_TIMEOUT_<service>.

## Watchdogs
Identical command and output three times forces a rung climb. Ten actions without a ledger append require HEARTBEAT. After every milestone inspect git status and changed paths; revert paths outside CHANGE unless a prior decision permits them. Exceeding a milestone budget becomes BUDGET_EXCEEDED and enters rung three.

## Re-grounding
At every milestone read its block, node non-goals, and `sh scripts/ledger.sh tail 15`.

## Non-interactive mandate
Export `CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive`. Editors, pagers, foreground watch modes, credential prompts, and destructive interactive commands are forbidden.
