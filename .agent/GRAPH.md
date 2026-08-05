# Execution Graph

One node is one bounded ExecPlan. The ledger determines state. At most one LEASE may be live. Commit every milestone and create `green/EP-XXX` only after the node verify sentinel and expected-files audit pass.

GRAPH-TABLE-BEGIN
NODE EP-000 DEPS -
NODE EP-001 DEPS EP-000
NODE EP-002 DEPS EP-001
NODE EP-003 DEPS EP-002
NODE EP-004 DEPS EP-003
NODE EP-005 DEPS EP-004
NODE EP-006 DEPS EP-004
NODE EP-007 DEPS EP-005,EP-006
NODE EP-008 DEPS EP-007
NODE EP-009 DEPS EP-008
NODE EP-010 DEPS EP-009
GRAPH-TABLE-END

Dispatch: NEXT leases and executes. RESUME continues an open lease or takes over only after 90 minutes of inactivity. BLOCKED halts. STALL becomes GRAPH_STALL and halts. ALL_DONE runs the ship gate.

The arc moves from evidence and toolchain through foundation, domain, persistence, service, client and security branches, hardening, operations, deployment, and final ship proof.
