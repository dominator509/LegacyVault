# Subprocessor Register

Status: verify contracts, legal entities, and locations before publication.

| Provider | Purpose | Data categories | Proposed region | Transfer risk | Required contract control |
|---|---|---|---|---|---|
| DeepSeek | Optional AI inference | Minimized redacted excerpts and safe capsules | Verify | High until verified | DPA, retention, secondary use, deletion, security, incident, transfer terms |
| Neon | PostgreSQL | Account, structured records, audit metadata | US | Medium | DPA, encryption, backup, deletion, incident |
| Cloudflare | Edge, Turnstile, R2 | Network metadata and encrypted objects | US preference | Medium | DPA, region controls, government request policy |
| Upstash | Queue and cache | Job metadata, no document content | US | Medium | DPA, TLS, retention |
| Stripe | Billing | Customer and transaction metadata | Provider controlled | Medium | Stripe DPA and consumer notice |
| Resend | Transactional email | Email address and message content | Verify | Medium | DPA, retention, suppression controls |
| Sentry | Errors | Redacted diagnostics only | US preference | Medium | Scrubbing and DPA |
| Fly.io | Compute | Transient application processing | US | Medium | DPA, region pinning, security |
| GitHub | CI and registry | Source and build artifacts, no production customer data | Provider controlled | Low | Private repo and secret controls |
| Twilio | Optional SMS | Phone and alert text | Verify | Medium | DPA and minimal messages |
