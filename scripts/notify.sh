#!/usr/bin/env bash
# 검수 요청 알림. SLACK_WEBHOOK 또는 원하는 채널로 교체하세요.
set -euo pipefail
MSG="${1:?메시지 없음}"
if [[ -n "${SLACK_WEBHOOK:-}" ]]; then
  curl -sS -X POST -H 'Content-type: application/json' \
    --data "$(jq -n --arg t "$MSG" '{text:$t}')" "$SLACK_WEBHOOK" > /dev/null
else
  echo "[알림] $MSG"
fi
