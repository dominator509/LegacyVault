# Data Retention Schedule

Status: counsel and security approval required. Configure periods centrally and publish the approved values.

| Category | Proposed active period | Proposed post-account period | Deletion mechanism |
|---|---:|---:|---|
| Confirmed household facts | Account lifetime | 30-day recovery, then delete | Workflow deletion |
| Original documents | User choice, account lifetime maximum | 30-day recovery | Object tombstone then hard delete |
| OCR and temporary page images | 24 hours after successful extraction | None | Worker purge |
| Candidate facts | 30 days after resolution | None | Database purge |
| AI request metadata without payload | 13 months | 30 days | Partition expiry |
| AI prompts and outputs in Legacy Vault | Do not persist by default; encrypted 24-hour troubleshooting opt-in only | None | TTL purge |
| Audit events | 7 years where justified | 7 years | Append archive then expiry |
| Consent and policy acceptance | 7 years after relationship | 7 years | Legal record expiry |
| Billing records | Tax and accounting period set by counsel | Same | Provider and internal deletion |
| Security logs | 90 days hot, 12 months archive | Same | Partition expiry |
| Backups | 35-day rolling | 35 days | Automatic expiry |
| Privacy request evidence | 5 years | 5 years | Legal record expiry |

Legal holds suspend only affected categories. Deletion completion must distinguish active systems, processors, and backup expiry dates.
