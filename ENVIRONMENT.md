# Environment

Node.js 24.4.1, pnpm 10.13.1, Docker 28.3.2, PostgreSQL client 17, git 2.45 or newer, curl, jq, openssl, awk, sed, grep, and POSIX sh. `.env` is validated at startup. Local, test, staging, and production use the same behavior with different credentials. Production refuses insecure cookies, missing encryption keys, AI without vendor approval evidence, public buckets, and wildcard CORS.
