# 여온 카드뉴스 · 클로드 코드 자동화

매일 오전 9시(KST), 성공사례 1건 → 카드뉴스 10장 **초안** 자동 생성.
**발행은 자동화하지 않습니다.** 사람이 승인합니다. 이유는 아래 "왜 완전 자동이 아닌가"를 보세요.

두 가지 방식이 있습니다.
- **웹 생성기** — 폰/PC에서 사이트에 접속해 **"생성" 버튼**을 눌러 초안 1건을 만든다. (아래 "0. 웹 생성기")
- **매일 자동** — cron/GitHub Actions가 09:00 KST에 자동으로 1건을 만든다. (아래 4번)

---

## 0. 웹 생성기 (버튼으로 생성)

어떤 기기든 브라우저로 접속해 버튼 한 번으로 초안을 만듭니다. **발행은 하지 않습니다** — 만들어진 PNG는 검수용이고, 인스타 업로드는 사람이 합니다.

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...     # 필수: console.anthropic.com 에서 발급
npm start                               # http://<서버IP>:3000
```

- **이번 회차 생성**: `calendar.json` 큐에서 아직 안 쓴 가장 이른 URL을 자동으로 가져와 생성.
- **한번 쓴 URL/원고는 다시 못 씀**: 사용 이력을 `state/used.json`에 기록해 중복을 막습니다.
- **18개를 모두 쓰면**: "새로운 URL 또는 원고를 첨부하세요" 안내가 뜨고, **새 URL 입력** 또는 **원고 붙여넣기** 칸으로 생성할 수 있습니다. (사이트가 자동 수집을 차단(403)하면 원고 붙여넣기를 쓰세요.)
- 생성 흐름: 원문 수집 → `claude-opus-4-8` 로 문안 요약 → `template.html` 디자인으로 조립 → **`compliance.mjs` 게이트 통과** → PNG 10장 렌더 → 검수용 `caption.txt` / `review.md`.
- 컴플라이언스(금칙어·필수요소)를 통과하지 못하면 렌더로 넘어가지 않고 실패로 처리합니다.

> 폰에서 접속하려면 서버가 인터넷에 떠 있어야 합니다(사내 서버, 클라우드 VM 등). 같은 와이파이면 서버 PC의 IP로 접속하면 됩니다.

### 검수(모바일)

- **검수함** 화면에서 초안 목록(대기/승인/반려)을 보고, 초안을 탭하면 폰에서 카드 10장을 넘겨보며 **원문 근거**를 확인합니다.
- **승인 / 반려** + 검수자 성함·메모를 남깁니다. 로그인은 없습니다(누구나 열람). 비용이 드는 **생성만** `GENERATE_PIN` 환경변수로 잠글 수 있습니다(선택).

### 구글 드라이브 자동 저장

**승인(완성)된** 카드뉴스를 구글 드라이브 `SNS 카드뉴스` 폴더 아래 **`작업날짜(KST)_제목`** 하위 폴더로 자동 업로드합니다(이미지 10장 + `caption.txt` + `review.md`). 미설정 시 저장만 건너뛰고 앱은 정상 동작합니다.

설정(서비스 계정 방식):
1. Google Cloud 프로젝트 → **Drive API 사용 설정** → **서비스 계정** 생성 → JSON 키 발급.
2. 내 드라이브에 상위 폴더를 하나 만들고, 그 폴더를 **서비스 계정 이메일**(`...@....iam.gserviceaccount.com`)과 **편집자**로 공유. 그 폴더의 ID를 복사.
3. 서버 환경변수:
   ```bash
   export GDRIVE_SA_JSON="$(cat service-account.json)"   # 또는 GOOGLE_APPLICATION_CREDENTIALS=키파일경로
   export GDRIVE_PARENT_ID="<공유한 상위 폴더 ID>"          # 없으면 서비스계정 드라이브 루트에 생성됨
   ```
   승인 시 자동 업로드되고, 검수 화면에 **☁ 드라이브** 링크가 표시됩니다.

> 서비스 계정의 "내 드라이브"는 사람 눈에 안 보입니다. 반드시 **내가 만든 폴더를 공유**하고 `GDRIVE_PARENT_ID`로 지정하거나 **공유 드라이브**를 쓰세요.

### AI 배경 이미지 (선택)

각 슬라이드의 **내용(주제)에 맞는 AI 배경 이미지**를 생성해 카드 배경으로 깝니다(블러·어둡게 처리되어 텍스트 가독성 유지). 미설정 시 기존 CSS 추상 배경으로 나옵니다.

- **심의 가드**: 사건을 사실적으로 재현하지 않습니다. 인물·얼굴·글자·법정·폭력 묘사를 프롬프트에서 금지하고, 오직 네이비·골드 톤의 추상적 색·빛·질감만 생성합니다. **10장의 변호사 사진은 항상 진짜 실사진**입니다(AI 아님).
- **제공자**: Anthropic은 이미지 생성을 제공하지 않아 외부 제공자가 필요합니다. 기본은 OpenAI 이미지(`gpt-image-1`).
- **설정**:
  ```bash
  export CARDNEWS_IMAGES=on
  export OPENAI_API_KEY=sk-...        # platform.openai.com 발급
  export IMAGE_QUALITY=low            # low/medium/high (배경은 흐려지므로 low 로 비용 절감)
  export IMAGE_COUNT=10               # 10=슬라이드마다 개별, 낮추면 소수만 만들어 순환(비용↓)
  # export IMAGE_MODEL=dall-e-3       # gpt-image-1 이 조직 인증을 요구해 막히면 이걸로
  ```
- ⚠️ **gpt-image-1 은 OpenAI 조직 인증(verification)이 되어 있어야** 사용 가능합니다. 인증 전이라 403 이 나면 `IMAGE_MODEL=dall-e-3` 으로 바꾸면 인증 없이 됩니다(세로 규격·품질 파라미터는 코드가 자동 처리).
- **비용 주의**: 이미지 생성은 장당 과금됩니다. `IMAGE_COUNT`로 개수를 줄이거나 `IMAGE_QUALITY=low`로 조절하세요.

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

### GitHub Actions — 서버가 없을 때 (기본 제공)

이 워크플로우는 이미 **`.github/workflows/cardnews.yml`** 에 들어 있습니다. 별도로 붙일 필요가 없습니다.
매일 `00:00 UTC = 09:00 Asia/Seoul` 에 초안 1건을 만들어 `cardnews-draft` 아티팩트로 올립니다.
Actions 탭에서 `Run workflow` 로 수동 실행도 됩니다.

켜기 전에 저장소 시크릿 두 개만 넣으세요
(`Settings → Secrets and variables → Actions → New repository secret`):

| 시크릿 | 필수 | 용도 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 필수 | 클로드 코드 헤드리스 실행 |
| `SLACK_WEBHOOK` | 선택 | 검수 요청 알림. 없으면 로그에만 남습니다. |

GitHub Actions의 `schedule` 은 **항상 UTC**입니다. `0 9 * * *` 라고 쓰면 오후 6시(KST)에 돌기 때문에
워크플로우에는 `0 0 * * *` 로 고정해 두었습니다.

> 아티팩트는 발행이 아닙니다. `card_01~10.png` 와 `review.md` 는 검수용이며,
> 인스타 업로드와 `calendar.json` 갱신은 여전히 사람이 합니다. ("왜 완전 자동이 아닌가" 참고)

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
