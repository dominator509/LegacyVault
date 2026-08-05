#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -I "$OTEL_EXPORTER_OTLP_ENDPOINT" >/dev/null || [ $? -eq 22 ]
