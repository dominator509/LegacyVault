# Security and Privacy Security Standard

## Goals
Preserve confidentiality, integrity, availability, tenant isolation, authenticity of audit history, purpose limitation, and user control for highly sensitive household information.

## Threat summary
Primary threats are account takeover, malicious family or support access, cross-tenant access, document malware, prompt injection, model-vendor disclosure, log leakage, insecure exports, emergency-access abuse, deletion failure, insider misuse, and misleading legal or privacy representations.

## Authentication and authorization
Passkeys are preferred. TOTP MFA is required for owners and staff. Password fallback uses Argon2id. Sessions are server-side, rotated after privilege changes, short-lived for staff, and revocable. Every API action evaluates organization, household, category, record, role, consent, and purpose. Database RLS is defense in depth, not the only control.

## AI data-loss prevention
The gateway blocks passwords, PINs, recovery codes, seed phrases, private keys, complete SSNs, full payment cards, authentication answers, exact safe combinations, and unapproved identity documents. It records only finding type, count, and action. Documents are untrusted instructions. Prompt injection is ignored and flagged.

## DeepSeek conditions
Production AI processing is blocked unless current DeepSeek terms, privacy policy, retention behavior, training/secondary-use status, subprocessors, security posture, transfer locations, deletion mechanism, incident terms, and contract priority have been reviewed and archived. Marketing and policy text must not promise zero retention or no training unless the signed contract supports it. The provider receives minimized content only after affirmative user consent.

## Upload security
Direct signed uploads, independent MIME detection, file-size and page limits, local ClamAV scan, decompression-bomb controls, image normalization, no executable rendering, random object keys, and quarantine before processing.

## Cryptography
TLS in transit. Per-household DEKs and KMS-wrapped KEKs. AES-256-GCM or an approved authenticated-encryption primitive. Ed25519 signatures for portable export manifests. Key versions are stored; keys are rotated without re-encrypting everything at once.

## Logging
Never log payloads, documents, extracted facts, credentials, tokens, cookies, complete identifiers, model prompts, model outputs, signed URLs, or encryption material. Structured logs include request ID, tenant pseudonym, actor pseudonym, action, result, duration, policy decision, and error class.

## Dependency policy
Critical and high exploitable vulnerabilities block shipment. Waivers require an ADR with affected version, exploitability, compensating control, owner, expiration, and replacement date.

## Migrations
Use expand, migrate, contract. Destructive operations require verified backup, restore proof, dual-read or compatibility period, and rollback plan.

## STOP conditions
Stop before destructive production data action, irreversible external side effect, or unanswered legal, financial, privacy, or security judgment.
