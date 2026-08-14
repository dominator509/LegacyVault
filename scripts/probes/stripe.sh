#!/usr/bin/env sh
set -eu
: "${STRIPE_SECRET_KEY:?Stripe secret key is required}"
: "${STRIPE_PRICE_ESSENTIAL:?Stripe Essential Price ID is required}"
printf '%s' "$STRIPE_PRICE_ESSENTIAL" | grep -Eq '^price_[A-Za-z0-9]+$'
curl -fsS --max-time 20 -u "$STRIPE_SECRET_KEY:" https://api.stripe.com/v1/balance >/dev/null
price_response=$(mktemp)
trap 'rm -f "$price_response"' EXIT
curl -fsS --max-time 20 -u "$STRIPE_SECRET_KEY:" \
  "https://api.stripe.com/v1/prices/$STRIPE_PRICE_ESSENTIAL" >"$price_response"
jq -e --arg expected "$STRIPE_PRICE_ESSENTIAL" \
  '.id == $expected and .active == true and .type == "recurring"' \
  "$price_response" >/dev/null
