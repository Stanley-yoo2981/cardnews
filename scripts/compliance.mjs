#!/usr/bin/env node
// 사용법: node scripts/compliance.mjs drafts/2026-07-11_111/index.html
// 하나라도 걸리면 exit 1 → 파이프라인 정지. 렌더링·발행으로 넘어가지 않는다.

import fs from "node:fs";

const file = process.argv[2];
if (!file) { console.error("파일 경로를 넘겨주세요."); process.exit(1); }
const html = fs.readFileSync(file, "utf8");

// 화면에 실제로 보이는 텍스트만 추출한다.
// <style>/<script> 안의 CSS 값(width:100% 등)까지 검사하면 오탐이 난다.
const text = html
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ");

// 1) 반드시 있어야 하는 것
const MUST = [
  ["상담 번호", "02-318-2981"],
  ["광고책임변호사 표기", "광고책임변호사 유영규"],
  ["면책 문구", "보장되는 것은 아닙니다"],
];

// 2) 절대 있으면 안 되는 것 (변호사 광고에 관한 규정 리스크)
const BAN = [
  "승소율", "성공률", "100%", "전승", "무조건", "반드시 이깁", "반드시 승소",
  "보장합니다", "확실하게 승소", "무죄 보장", "불기소 확정", "감옥 안 갑니다",
  "걱정 마세요", "최고의 로펌", "최고의 변호사", "유일한 로펌", "업계 1위", "수임료 최저",
  "쾌거", "기적",
];

// 3) 검토 변호사 실명 + 실사진
const LAWYERS = ["유영규", "김환섭", "홍기웅", "김선호"];

let fail = [];

for (const [label, needle] of MUST)
  if (!text.includes(needle)) fail.push(`필수 요소 누락 → ${label}: "${needle}"`);

for (const w of BAN)
  if (text.includes(w)) fail.push(`금칙어 검출 → "${w}"`);

const named = LAWYERS.filter((n) => text.includes(`${n} 변호사`));
if (named.length === 0) fail.push("검토 변호사 실명 없음");
if (named.length > 1) fail.push(`검토 변호사가 ${named.length}명 표기됨: ${named.join(", ")}`);
if (!/<img[^>]+src=["']data:image\/(jpeg|png);base64,/.test(html))
  fail.push("변호사 실사진(base64 인라인) 없음");

// 4) 슬라이드 수: SNS 10~11장 / 상세(보험) 표지+본문(4~8)+상담(+판결문). 공통 안전범위 6~12장.
const slides = (html.match(/class="slide/g) || []).length;
if (slides < 6 || slides > 12) fail.push(`슬라이드 수 오류: ${slides}장 (6~12장이어야 함)`);

// 5) 영어 라벨 혼입 (한국어 잠금)
const ENGLISH_UI = /\b(Slide|Hook|CTA|Insight|Key Point|Summary|Before|After|Lorem ipsum)\b/;
if (ENGLISH_UI.test(text)) fail.push("화면에 영어 라벨이 노출됨");

if (fail.length) {
  console.error("\n❌ 컴플라이언스 검사 실패\n");
  fail.forEach((f) => console.error("  · " + f));
  console.error("\n초안을 폐기하고 문구를 수정하세요. 발행 단계로 넘어가지 마세요.\n");
  process.exit(1);
}

console.log(`✅ 통과 · 검토 변호사: ${named[0]} · 슬라이드 ${slides}장`);
