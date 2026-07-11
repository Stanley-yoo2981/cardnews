# 배포 가이드 (밖에서 폰으로 접속하기)

이 앱을 인터넷에 올리면 `https://<이름>.onrender.com` 같은 **고정 주소**가 생겨, 변호사들이 외근 중에도 폰으로 검수할 수 있습니다. 아래는 **Render** 기준입니다(Docker 라 Chromium·한글폰트가 이미지에 포함되어 별도 설정이 필요 없습니다).

> 먼저 필요한 것: 이 저장소가 **GitHub 에 올라가 있어야** 합니다. (지금까지 patch/bundle 로 받으셨다면, 브랜치를 GitHub 로 push 해 두세요.)

---

## A. Render 로 배포 (권장, 10~15분)

1. **https://render.com** 가입 → GitHub 계정 연결.
2. 대시보드 **New + → Blueprint** 클릭 → 이 저장소 선택.
   - 저장소에 있는 `render.yaml` 을 Render 가 읽어 서비스를 자동 구성합니다.
3. **환경변수 입력** (Blueprint 가 물어봅니다):
   | 변수 | 필수 | 설명 |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | ✅ | 문안 생성 (console.anthropic.com) |
   | `OPENAI_API_KEY` | 선택 | AI 배경 (platform.openai.com) |
   | `CARDNEWS_IMAGES` | 선택 | AI 배경 켜려면 `on` |
   | `GENERATE_PIN` | 선택 | "생성"만 잠그는 PIN |
   | `GDRIVE_SA_JSON` / `GDRIVE_PARENT_ID` | 선택 | 구글 드라이브 저장 (README 참고) |
4. **Apply / Create** → 빌드가 끝나면 상단에 `https://yeoon-cardnews-xxxx.onrender.com` 주소가 나옵니다. **이 주소를 폰 즐겨찾기**에 넣으면 끝.

### 요금·주의
- `render.yaml` 은 **starter 플랜 + 1GB 영구 디스크**로 설정돼 있습니다(월 몇 달러). 영구 디스크가 있어야 **재시작·재배포 후에도 검수함/이미지가 보존**됩니다.
- **무료 플랜**을 쓰면: 영구 디스크가 없어 재배포 시 초안이 사라지고, 15분 미사용 시 서버가 잠들어 첫 접속이 느립니다. 승인본을 **구글 드라이브에 저장**해두면 초안이 사라져도 최종본은 안전합니다.
- 리전은 `singapore`(한국과 가까움)로 뒀습니다. 바꾸려면 `render.yaml` 의 `region` 수정.

---

## B. 자체 서버(VM)에 배포 — Docker 있는 경우

```bash
docker build -t yeoon-cardnews .
docker run -d --name cardnews -p 80:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e OPENAI_API_KEY=sk-... -e CARDNEWS_IMAGES=on \
  -e DATA_DIR=/data -v /srv/cardnews-data:/data \
  yeoon-cardnews
```
- `-v /srv/cardnews-data:/data` 로 초안·검수 상태를 호스트에 영구 저장.
- 공개 도메인 + HTTPS 는 앞단에 Nginx/Caddy 등 리버스 프록시로 붙이세요(외부 공개 시 HTTPS 권장).

---

## 배포 후 첫 점검
1. `https://<주소>/` 접속 → **검수함** 화면이 뜨는지.
2. **생성** 탭 → "이번 회차 생성" → 초안이 검수함에 뜨는지(= Anthropic 키 정상).
3. 초안 열어 카드 10장 스와이프 → **승인** → (드라이브 설정 시) ☁ 링크 확인.
4. AI 배경을 켰다면 배경이 입혀졌는지. 403 이 나면 `IMAGE_MODEL=dall-e-3` 로 변경.
