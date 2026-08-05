# Spec 003 Api Contracts

Routes use `/v1`. Canonical groups: auth, households, members, facts, documents, extractions, reports, exports, privacy-requests, emergency-access, consents, billing, audit-events, health, and ai-settings. All writes require idempotency key and optimistic version. Errors use RFC 9457 problem details.
