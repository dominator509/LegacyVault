# Testing

Unit tests cover domain rules. Integration tests use real PostgreSQL, Redis, object storage emulator only when protocol-compatible, and actual provider sandboxes. E2E uses the real web and API entry points. Test doubles are legal only in `tests/unit/doubles` and never in live-fire. Every core outcome maps to a named E2E and live-fire proof. Flaky tests are bugs and cannot be retried until green. Accessibility uses axe and keyboard flows. Performance uses k6. Security includes tenant isolation, IDOR, upload, prompt injection, DLP, consent, deletion, and emergency-access abuse.
