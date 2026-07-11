# 카드뉴스 생성/검수 서버 — Chromium(렌더) + 한글 폰트 포함.
FROM node:22-bookworm-slim

# 렌더는 시스템 Chromium 을 쓴다(puppeteer 번들 다운로드 생략).
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    DATA_DIR=/data

# Chromium + 한글/이모지 폰트(카드 렌더에 필수). CDN 폰트가 안 붙어도 tofu 방지.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-noto-cjk fonts-noto-color-emoji ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 먼저(캐시 활용). puppeteer 는 위 SKIP 으로 크로미움을 받지 않는다.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 앱 소스
COPY . .

# 영구 디스크 마운트 지점(재시작해도 초안·검수 상태 보존)
RUN mkdir -p /data/drafts /data/state

# Render 등은 PORT 를 주입한다. 서버는 process.env.PORT || 3000 사용.
EXPOSE 3000
CMD ["node", "server/server.mjs"]
