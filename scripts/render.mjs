#!/usr/bin/env node
// 사용법: node scripts/render.mjs drafts/2026-07-11_111
// index.html → card_01.png ... card_10.png (2160×2700, 인스타 고해상도)

import puppeteer from "puppeteer";
import path from "node:path";
import fs from "node:fs";

const dir = process.argv[2];
if (!dir) { console.error("초안 폴더 경로를 넘겨주세요."); process.exit(1); }
const file = path.resolve(dir, "index.html");
if (!fs.existsSync(file)) { console.error("index.html 없음: " + file); process.exit(1); }

const browser = await puppeteer.launch({ args: ["--no-sandbox", "--font-render-hinting=none"] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });
await page.goto("file://" + file, { waitUntil: "networkidle0" });

// 폰트 로딩 완료까지 대기 (한글 글꼴이 늦게 붙으면 자간이 깨진다)
await page.evaluateHandle("document.fonts.ready");

// 미리보기 UI와 축소 transform 제거 — 캡처는 항상 1:1
await page.evaluate(() => {
  document.querySelector(".ui")?.remove();
  const stage = document.getElementById("stage");
  if (stage) { stage.style.transform = "none"; stage.style.height = "auto"; }
});

const slides = await page.$$(".slide");
if (slides.length !== 10) {
  console.error(`슬라이드 수 오류: ${slides.length}장`);
  await browser.close();
  process.exit(1);
}

for (const [i, s] of slides.entries()) {
  const n = String(i + 1).padStart(2, "0");
  await s.screenshot({ path: path.join(dir, `card_${n}.png`) });
  process.stdout.write(`  card_${n}.png\n`);
}

await browser.close();
console.log(`✅ PNG 10장 렌더링 완료 → ${dir}`);
