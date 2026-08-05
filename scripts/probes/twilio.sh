#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID.json" >/dev/null
