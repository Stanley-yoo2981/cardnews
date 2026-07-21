#!/usr/bin/env node
// 사용법: node scripts/render.mjs drafts/2026-07-11_111
// index.html → card_01.png ... card_10.png (기본 1080×1350, 인스타 권장 규격)
//
// 메모리 절약: 기본 배율(deviceScaleFactor)은 1(=1080×1350, 인스타 원본 규격).
// 무료 플랜(512MB)에서 고배율 렌더는 메모리 초과로 프로세스가 죽어 502(HTML)가 난다.
// 사양 좋은 유료 플랜에서 더 선명하게 뽑고 싶으면 RENDER_SCALE=2 로 올리면 된다.

import puppeteer from "puppeteer";
import path from "node:path";
import fs from "node:fs";

const dir = process.argv[2];
if (!dir) { console.error("초안 폴더 경로를 넘겨주세요."); process.exit(1); }
const file = path.resolve(dir, "index.html");
if (!fs.existsSync(file)) { console.error("index.html 없음: " + file); process.exit(1); }

const SCALE = Math.max(1, Math.min(3, Number(process.env.RENDER_SCALE || 1)));

const browser = await puppeteer.launch({
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage", // 컨테이너의 작은 /dev/shm 로 인한 크래시 방지
    "--disable-gpu",
    "--font-render-hinting=none",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: SCALE });
// 문서만 뜨면 진행한다. networkidle0 은 외부 폰트 CDN(jsdelivr)이 느리거나 막히면
// '네트워크 유휴'가 오지 않아 30초 타임아웃이 난다 → domcontentloaded 로 바꾼다.
await page.goto("file://" + file, { waitUntil: "domcontentloaded", timeout: 60000 });

// 폰트 로딩 대기 — 단, 최대 5초. CDN 이 느리거나 막혀도 무한 대기하지 않고 시스템 폰트로 진행.
await Promise.race([
  page.evaluate(async () => { await document.fonts.ready; }),
  new Promise((r) => setTimeout(r, 5000)),
]);

// 미리보기 UI와 축소 transform 제거 — 캡처는 항상 1:1
await page.evaluate(() => {
  document.querySelector(".ui")?.remove();
  const stage = document.getElementById("stage");
  if (stage) { stage.style.transform = "none"; stage.style.height = "auto"; }
});

const slides = await page.$$(".slide");
// SNS 10~11장 / 상세(보험) 6~12장. compliance.mjs 와 동일 범위.
if (slides.length < 6 || slides.length > 12) {
  console.error(`슬라이드 수 오류: ${slides.length}장 (6~12장이어야 함)`);
  await browser.close();
  process.exit(1);
}

for (const [i, s] of slides.entries()) {
  const n = String(i + 1).padStart(2, "0");
  await s.screenshot({ path: path.join(dir, `card_${n}.png`) });
  process.stdout.write(`  card_${n}.png\n`);
}

await browser.close();
console.log(`✅ PNG ${slides.length}장 렌더링 완료 → ${dir}`);
