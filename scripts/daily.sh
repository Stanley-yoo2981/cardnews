#!/usr/bin/env bash
# 매일 09:00 KST에 cron이 이 파일을 실행한다.
# 클로드 코드는 "초안 생성"까지만 한다. 게시는 사람이 한다.
set -euo pipefail

PROJECT="/srv/yeoon-cardnews"
LOG="$PROJECT/logs/$(date +%F).log"
mkdir -p "$PROJECT/logs"

# cron은 PATH가 빈약하다. 절대경로 또는 명시적 PATH가 필요하다.
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY 미설정}"

cd "$PROJECT"

RESULT=$(claude -p "/cardnews" \
  --allowedTools "Read,Write,Edit,Glob,Grep,WebFetch,Bash(node scripts/compliance.mjs *),Bash(node scripts/render.mjs *)" \
  --permission-mode acceptEdits \
  --max-turns 40 \
  --output-format json \
  2>> "$LOG") || {
    ./scripts/notify.sh "🚨 카드뉴스 초안 생성 실패 · 로그: $LOG"
    exit 1
  }

echo "$RESULT" >> "$LOG"

# 초안 폴더 확인
DRAFT=$(ls -dt drafts/*/ 2>/dev/null | head -1 || true)
if [[ -z "$DRAFT" ]] || [[ ! -f "${DRAFT}card_10.png" ]]; then
  ./scripts/notify.sh "🚨 초안이 불완전합니다. 발행 보류. ($DRAFT)"
  exit 1
fi

# 컴플라이언스 재검사 (에이전트를 믿지 말고 한 번 더)
node scripts/compliance.mjs "${DRAFT}index.html" >> "$LOG" 2>&1 || {
  ./scripts/notify.sh "🚨 컴플라이언스 실패 · 초안 폐기 필요: $DRAFT"
  exit 1
}

COST=$(echo "$RESULT" | jq -r '.total_cost_usd // "n/a"')
./scripts/notify.sh "📩 오늘자 카드뉴스 초안 검수 요청 → ${DRAFT} (비용 \$${COST})
승인 전까지 발행하지 마세요."
