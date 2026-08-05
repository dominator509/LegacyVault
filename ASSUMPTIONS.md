# Assumptions

| Assumption | Reason | Risk if wrong | Verification | Blocks implementation |
|---|---|---|---|---|
| Legal entity is a US LLC | Business details were not supplied | Terms and notices could identify the wrong controller | Open `.env` and counsel approval evidence | Yes for production |
| DeepSeek V4 Flash remains API-accessible | Requested model | Model name, terms, or features may change | Run API probe and archive current docs | Yes for AI production |
| DeepSeek contract does not provide an assumed zero-retention promise | No verified enterprise contract supplied | Sending vault data may create unacceptable transfer or retention risk | Review signed terms and vendor assessment | Yes for sensitive AI use |
| US hosting regions are available from selected vendors | Preferred architecture | Cross-border or regional mismatch | Provider console evidence | Yes for production |
| Product launches only in the United States | No international launch requested | International law may apply | Counsel-approved launch matrix | Yes for non-US launch |
| Users are at least 18 | Minors are a non-goal | COPPA and capacity risk | Age gate tests | No |
| Auto-deploy is not authorized | Input says no | Production side effects | DEPLOYMENT.md | No |
| Concierge staff may handle customer records only with approved JIT access | Business model needs assistance | Insider-risk exposure | Security tests and support-access audit | Yes |
| Local protocol-compatible PostgreSQL, Redis, S3, SMTP, malware scanning, and telemetry services may be provisioned for engineering | Explicit operator instruction permits real local infrastructure | A provider-specific behavior may still differ | Local integration tests plus later authenticated provider probes | No |
| Missing external credentials and approvals do not authorize placeholder values or fake passing probes | Explicit operator instruction requires fail-closed continuation | False readiness or data disclosure | `.agent/state/DEFERRED_EXTERNALS.md` and production readiness gate | No |
