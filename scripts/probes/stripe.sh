#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -u "$STRIPE_SECRET_KEY:" https://api.stripe.com/v1/balance >/dev/null
