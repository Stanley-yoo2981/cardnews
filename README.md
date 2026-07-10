# 여온 카드뉴스 · 클로드 코드 자동화

매일 오전 9시(KST), 성공사례 1건 → 카드뉴스 10장 **초안** 자동 생성.
**발행은 자동화하지 않습니다.** 사람이 승인합니다. 이유는 아래 "왜 완전 자동이 아닌가"를 보세요.

```
yeoon-cardnews/
├── CLAUDE.md                  ← 컴플라이언스 헌법. 클로드 코드가 매 실행마다 읽는다.
├── calendar.json              ← 18일치 발행 큐
├── template.html              ← 디자인 템플릿 (읽기 전용)
├── .claude/
│   ├── settings.json          ← 권한 게이트. 게시 도구는 아예 없다.
│   └── commands/cardnews.md   ← /cardnews 슬래시 커맨드
├── scripts/
│   ├── daily.sh               ← cron 진입점 (claude -p 헤드리스)
│   ├── compliance.mjs         ← 금칙어·필수요소 검사, 실패 시 exit 1
│   ├── render.mjs             ← Puppeteer → PNG 10장 (2160×2700)
│   └── notify.sh              ← 슬랙/카톡 검수 알림 (직접 작성)
├── assets/lawyers/            ← 변호사 실사진 4장
└── drafts/                    ← 산출물. 검수 대기함.
```

---

## 1. 설치

```bash
npm install -g @anthropic-ai/claude-code
npm i puppeteer
cp ~/Downloads/{유영규_대표_변호사,김환섭_변호사,홍기웅_변호사,김선호_변호사}.png assets/lawyers/
chmod +x scripts/*.sh
```

## 2. 수동으로 한 번 돌려본다 (필수)

```bash
cd yeoon-cardnews
claude
> /cardnews
```

`drafts/2026-07-11_111/` 에 PNG 10장과 `review.md` 가 나오는지 확인하세요.
`review.md` 의 "원문 근거" 열이 비어 있는 문장이 있다면 프롬프트가 잘못된 겁니다.

## 3. 컴플라이언스 게이트가 실제로 막는지 검증

```bash
# 일부러 금칙어를 넣어본다
sed -i 's/전부 기각/승소율 100%/' drafts/2026-07-11_111/index.html
node scripts/compliance.mjs drafts/2026-07-11_111/index.html
# → ❌ 금칙어 검출 → "승소율" / exit 1
```

**이 테스트가 실패(=통과해버림)하면 자동화를 켜지 마세요.**

## 4. 매일 09:00 KST 스케줄링

### 서버(Linux) — 권장

```bash
crontab -e
```

```cron
CRON_TZ=Asia/Seoul
PATH=/usr/local/bin:/usr/bin:/bin
0 9 * * * /srv/yeoon-cardnews/scripts/daily.sh
```

`CRON_TZ` 를 지원하지 않는 cron이라면 서버 타임존을 UTC로 두고 `0 0 * * *` 를 쓰세요
(09:00 KST = 00:00 UTC).

### GitHub Actions — 서버가 없을 때

```yaml
name: yeoon-cardnews
on:
  schedule:
    - cron: "0 0 * * *"      # UTC. = 09:00 Asia/Seoul
  workflow_dispatch:
jobs:
  draft:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm i -g @anthropic-ai/claude-code && npm i puppeteer
      - run: ./scripts/daily.sh
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
      - uses: actions/upload-artifact@v4
        with: { name: cardnews-draft, path: drafts/ }
```

GitHub Actions의 `schedule` 은 **항상 UTC**입니다. 여기서 `0 9 * * *` 라고 쓰면 오후 6시에 돕니다.

### 클로드 코드 자체 스케줄링은?

- CLI의 `/loop` 와 cron 도구는 **세션이 살아 있는 동안만** 발화합니다. 터미널을 닫으면 멈춥니다.
  일회성 폴링용이지, 매일 발행용이 아닙니다.
- Desktop 예약 작업은 앱이 열려 있을 때 매번 새 세션을 띄워 실행합니다. macOS·Windows 전용이고,
  컴퓨터가 자면 그 회차는 건너뜁니다. Linux에서는 쓸 수 없습니다.
- 항상 켜져 있어야 하는 발행 파이프라인은 **OS cron 또는 CI 크론 + `claude -p`** 가 맞습니다.
  (Anthropic의 클라우드 실행 옵션은 계속 바뀌므로 https://code.claude.com/docs 에서 최신 상태를 확인하세요.)

---

## 5. 발행 (사람의 손)

```
Slack 알림 도착
  → drafts/<날짜>_<ID>/review.md 열기
  → 각 문장의 "원문 근거" 확인
  → 담당 변호사 / 광고책임변호사(유영규) 승인
  → card_01~10.png 인스타 업로드
  → calendar.json 의 published 를 true 로 변경 (사람이 직접)
```

---

## 왜 완전 자동이 아닌가

변호사 광고물은 사후에 고쳐도 이미 게시된 시점의 표현으로 판단됩니다.
LLM이 원문을 "요약"하다가 만들어내는 한 문장 — 예컨대 "이런 경우 무죄가 나옵니다" —
은 문법적으로 자연스럽고, 사실처럼 보이고, **원문에는 없습니다.**

`compliance.mjs` 는 알려진 금칙어만 잡습니다. 새로운 단정 표현은 못 잡습니다.
그래서 마지막 관문은 사람이어야 합니다.

`.claude/settings.json` 에 인스타그램 API가 없는 것은 실수가 아니라 설계입니다.
클로드 코드는 게시할 **능력 자체가** 없습니다. 그게 이 구조의 핵심입니다.

> 자동화하는 것은 **디자인과 조립**이고,
> 자동화하지 않는 것은 **법적 판단과 승인**입니다.
