# Data Protection Impact Assessment

## Processing
Legacy Vault centralizes sensitive household, financial-category, medical-summary, relationship, property, and end-of-life preference information. It processes documents and may transmit minimized content to an external AI provider after opt-in.

## Necessity and proportionality
Each collected field maps to a named continuity outcome. Prohibited secrets are blocked. External AI is optional. Deterministic extraction and manual entry reduce external disclosure. Category-level permissions and compartmentalized packets limit access.

## High risks
Account takeover; family coercion; insider access; cross-tenant failure; mistaken emergency release; model-vendor retention or transfer; prompt injection; inaccurate extraction; legal-advice confusion; deletion gaps; breach aggregation harm.

## Controls
Passkeys and MFA; JIT support access; per-household encryption; RLS; immutable audit; delayed and limited emergency release; evidence-linked confirmation; AI DLP gateway; vendor gate; no raw prompt logging; export signatures; tested deletion; annual stale-data review; plain-language disclaimers; incident response.

## Residual risk decisions
Production requires counsel, security, and executive sign-off. DeepSeek remains disabled if contract and transfer risk are not acceptable. Secret storage remains excluded. Emergency release requires a staged pilot and fraud review.
