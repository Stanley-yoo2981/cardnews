// 슬라이드 데이터(JSON) → index.html
// template.html 의 <style> 을 그대로 재사용한다(디자인 원본, 읽기 전용).
// 고정 요소(상담번호·면책 문구·광고책임변호사 표기·검토 변호사 실사진)는
// 여기서 하드코딩한다. 그래야 compliance.mjs 필수 항목이 항상 채워진다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// 고정 상수 (calendar.json / CLAUDE.md 기준)
const BRAND = "법무법인 여온";
const PHONE = "02-318-2981";
const AD_OFFICER = "유영규";
const DISCLAIMER =
  "본 내용은 실제 사건을 바탕으로 한 일반적인 법률 정보이며, 특정 사건의 결과가 " +
  "동일하게 보장되는 것은 아닙니다. 개별 사안은 사실관계에 따라 결론이 달라질 수 있습니다.";

const LAWYER_FILES = {
  유영규: "유영규_대표_변호사.png",
  김환섭: "김환섭_변호사.png",
  홍기웅: "홍기웅_변호사.png",
  김선호: "김선호_변호사.png",
};

// --- 유틸 ---
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// 줄바꿈(\n) → <br>, 그리고 강조어(em)를 금색으로. 강조는 esc 이후에 처리.
function headline(text, emphasis) {
  let html = esc(text).replace(/\n/g, "<br>");
  const em = (emphasis || "").trim();
  if (em) {
    const emEsc = esc(em);
    if (html.includes(emEsc)) {
      html = html.replace(emEsc, `<em>${emEsc}</em>`);
    }
  }
  return html;
}
const ml = (s) => esc(s).replace(/\n/g, "<br>");

function styleBlock() {
  const tpl = fs.readFileSync(path.join(ROOT, "template.html"), "utf8");
  const m = tpl.match(/<style>([\s\S]*?)<\/style>/i);
  if (!m) throw new Error("template.html 에서 <style> 을 찾지 못했습니다.");
  return m[1];
}

function lawyerImageDataUri(name) {
  const file = LAWYER_FILES[name];
  if (!file) throw new Error(`알 수 없는 변호사: ${name}`);
  const p = path.join(ROOT, "assets", "lawyers", file);
  const b64 = fs.readFileSync(p).toString("base64");
  return `data:image/png;base64,${b64}`;
}

// 공통 배경. AI 배경 이미지(uri)가 있으면 .bg 에 깔고(블러·어둡게 처리 내장),
// 없으면 기존 CSS 메쉬로 폴백한다. scrim/grain 은 항상 얹어 가독성 확보.
function bg(seed = 0, uri = null) {
  if (uri) {
    const safe = String(uri).replace(/"/g, "&quot;");
    return `<div class="bg" style="background-image:url(&quot;${safe}&quot;)"></div><div class="grain"></div><div class="scrim"></div>`;
  }
  const sets = [
    [
      "width:60%;height:50%;left:-8%;top:2%;background:radial-gradient(circle at 50% 50%, #1D3A63 0%, rgba(29,58,99,0.55) 42%, rgba(29,58,99,0) 72%)",
      "width:52%;height:44%;right:-10%;top:26%;background:radial-gradient(circle at 50% 50%, #3A2E1C 0%, rgba(58,46,28,0.55) 42%, rgba(58,46,28,0) 72%)",
      "width:70%;height:46%;left:10%;bottom:-12%;background:radial-gradient(circle at 50% 50%, #0C1728 0%, rgba(12,23,40,0.55) 42%, rgba(12,23,40,0) 72%)",
    ],
    [
      "width:64%;height:48%;right:-12%;top:-6%;background:radial-gradient(circle at 50% 50%, #20406C 0%, rgba(32,64,108,0.55) 42%, rgba(32,64,108,0) 72%)",
      "width:46%;height:40%;left:-6%;bottom:6%;background:radial-gradient(circle at 50% 50%, #2E2A20 0%, rgba(46,42,32,0.55) 42%, rgba(46,42,32,0) 72%)",
    ],
    [
      "width:58%;height:52%;left:-10%;top:8%;background:radial-gradient(circle at 50% 50%, #14263F 0%, rgba(20,38,63,0.55) 42%, rgba(20,38,63,0) 72%)",
      "width:50%;height:44%;right:-8%;bottom:-8%;background:radial-gradient(circle at 50% 50%, #3B3120 0%, rgba(59,49,32,0.55) 42%, rgba(59,49,32,0) 72%)",
    ],
  ];
  const set = sets[seed % sets.length];
  const mesh = set.map((s) => `<i style="${s}"></i>`).join("");
  return `<div class="bg"></div><div class="mesh">${mesh}</div><div class="grain"></div><div class="scrim"></div>`;
}

function top(n) {
  const pg = String(n).padStart(2, "0");
  return `<div class="top"><div class="brand"><div class="dot"></div><span>${BRAND}</span></div><div class="pg">${pg} / 10</div></div>`;
}

// h1 크기 클래스: 가장 긴 줄 기준으로 자동 축소해 넘침을 막는다(PRO 일관성).
function h1Class(text) {
  const lines = String(text || "").split("\n");
  const longest = Math.max(0, ...lines.map((l) => l.replace(/<[^>]+>/g, "").length));
  const total = String(text || "").replace(/\n/g, "").length;
  if (longest >= 13 || total >= 28) return "xxs";
  if (longest >= 11 || total >= 20) return "xs";
  if (longest >= 8 || total >= 13) return "sm";
  return "";
}
// 커버는 기본이 더 크므로 한 단계 낮춰 잡는다
function coverClass(text) {
  const c = h1Class(text);
  return c === "" ? "" : c; // 커버 오버라이드 CSS 가 처리
}

// template CSS 위에 얹는 정제 스타일: 더 작은 폴백 크기 + 가독성/디테일.
const REFINE = `
/* --- PRO 정제 --- */
h1{text-shadow:0 2px 34px rgba(6,10,18,.35);text-wrap:balance}
h1.xxs{font-size:60px;line-height:1.16;letter-spacing:-.035em}
.cover h1.sm{font-size:96px}
.cover h1.xs{font-size:82px}
.cover h1.xxs{font-size:70px;line-height:1.16}
.sub{text-wrap:pretty}
.sub.tight{font-size:33px;line-height:1.55}
.kicker{backdrop-filter:blur(2px)}
.card p small{color:rgba(246,243,237,.66)}
.stats strong{line-height:1.2}
/* 배경 그라데이션 살짝 더 깊게 — 텍스트 대비 확보 */
.slide .scrim{background:
  linear-gradient(180deg,rgba(10,16,28,.78) 0%,rgba(10,16,28,.42) 32%,rgba(10,16,28,.66) 66%,rgba(10,16,28,.95) 100%),
  radial-gradient(120% 80% at 50% 112%,rgba(10,16,28,.9),transparent 60%)}
`;

function subClass(text) {
  const len = String(text || "").replace(/\n/g, "").length;
  return len >= 78 ? "sub tight" : "sub";
}

// --- 각 슬라이드 ---
function slideCover(d, bgUri) {
  return `
  <section class="slide cover" data-n="01">
    ${bg(0, bgUri)}
    <div class="inner">
      ${top(1)}
      <div class="body-area">
        <div class="kicker">${esc(d.category)}</div>
        <h1 class="${coverClass(d.cover_h1)}">${headline(d.cover_h1, d.cover_h1_em)}</h1>
        ${d.cover_quote ? `<p class="quote">${ml(d.cover_quote)}</p>` : ""}
      </div>
      <div class="foot"><div class="tag">실제 판결로 확인된 대응 전략</div><div class="swipe">넘겨서 보기 →</div></div>
    </div>
  </section>`;
}

function slideText(n, d, tag, bgUri) {
  return `
  <section class="slide" data-n="${String(n).padStart(2, "0")}">
    ${bg(n, bgUri)}
    <div class="inner">
      ${top(n)}
      <div class="body-area">
        <div class="num">${String(n).padStart(2, "0")}</div>
        <div class="kicker">${esc(d.kicker)}</div>
        <h1 class="${h1Class(d.h1)}">${headline(d.h1, d.h1_em)}</h1>
        ${d.sub ? `<p class="${subClass(d.sub)}">${ml(d.sub)}</p>` : ""}
        <div class="bar"></div>
      </div>
      <div class="foot"><div class="tag">${esc(tag || "")}</div><div class="swipe">→</div></div>
    </div>
  </section>`;
}

function slideVs(d, bgUri) {
  return `
  <section class="slide" data-n="05">
    ${bg(5, bgUri)}
    <div class="inner">
      ${top(5)}
      <div class="body-area">
        <div class="kicker">${esc(d.kicker)}</div>
        <h1 class="xs">${headline(d.h1, d.h1_em)}</h1>
        <div class="vs">
          <div class="a">${esc(d.vs_a_title)}<br><span style="font-size:26px;font-weight:400">${esc(d.vs_a_desc)}</span></div>
          <div class="arrow">▼</div>
          <div class="b">${esc(d.vs_b_title)}<br><span style="font-size:26px;font-weight:400">${esc(d.vs_b_desc)}</span></div>
        </div>
      </div>
      <div class="foot"><div class="tag">조문은 하나가 아닙니다</div><div class="swipe">→</div></div>
    </div>
  </section>`;
}

function slideStats(d, bgUri) {
  const stats = Array.isArray(d.stats) ? d.stats.slice(0, 3) : [];
  const statsHtml = stats.length
    ? `<div class="stats">${stats
        .map((s) => `<div><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`)
        .join("")}</div>`
    : "";
  return `
  <section class="slide" data-n="06">
    ${bg(6, bgUri)}
    <div class="save">저장 포인트</div>
    <div class="inner">
      ${top(6)}
      <div class="body-area">
        <div class="kicker">${esc(d.kicker)}</div>
        <h1 class="xs">${headline(d.h1, d.h1_em)}</h1>
        ${d.sub ? `<p class="sub small">${ml(d.sub)}</p>` : ""}
        ${statsHtml}
      </div>
      <div class="foot"><div class="tag">해당 사건의 법원 판단 결과</div><div class="swipe">→</div></div>
    </div>
  </section>`;
}

function slideCards(d, bgUri) {
  const cards = (Array.isArray(d.cards) ? d.cards.slice(0, 3) : [])
    .map(
      (c, i) =>
        `<div class="card"><b>${i + 1}</b><p>${esc(c.title)}${
          c.desc ? `<small>${esc(c.desc)}</small>` : ""
        }</p></div>`
    )
    .join("");
  return `
  <section class="slide" data-n="07">
    ${bg(7, bgUri)}
    <div class="inner">
      ${top(7)}
      <div class="body-area">
        <div class="kicker">${esc(d.kicker)}</div>
        <h1 class="xs">${headline(d.h1, d.h1_em)}</h1>
        <div class="cards">${cards}</div>
      </div>
      <div class="foot"><div class="tag">실무에서 자주 쓰이는 자료</div><div class="swipe">→</div></div>
    </div>
  </section>`;
}

function slideChecklist(d, bgUri) {
  const checks = (Array.isArray(d.checks) ? d.checks.slice(0, 4) : [])
    .map((c, i) => `<div class="card"><b>${i + 1}</b><p>${esc(c)}</p></div>`)
    .join("");
  return `
  <section class="slide" data-n="09">
    ${bg(9, bgUri)}
    <div class="save">저장해두기</div>
    <div class="inner">
      ${top(9)}
      <div class="body-area">
        <div class="kicker">${esc(d.kicker)}</div>
        <h1 class="xs">${headline(d.h1, d.h1_em)}</h1>
        <div class="cards">${checks}</div>
      </div>
      <div class="foot"><div class="tag">캡처해서 보관하세요</div><div class="swipe">→</div></div>
    </div>
  </section>`;
}

// 10장: 상담 안내 — 고정. 검토 변호사 이름/사진만 주입.
function slideCta(lawyer, ctaH1, ctaH1Em, bgUri) {
  const img = lawyerImageDataUri(lawyer);
  const h1 = ctaH1 || "혼자 판단하지 마세요.\n기한은 기다려주지\n않습니다.";
  const em = ctaH1Em || "기다려주지";
  return `
  <section class="slide cta" data-n="10">
    ${bg(10, bgUri)}
    <div class="inner">
      ${top(10)}
      <div class="lawyer">
        <img alt="${esc(lawyer)} 변호사" src="${img}" />
        <div class="meta">
          <em>이 사례를 검토한 변호사</em>
          <strong>${esc(lawyer)} 변호사</strong>
          <small>${BRAND}<br>가사 · 이혼 사건</small>
        </div>
      </div>
      <div class="body-area">
        <h1 class="xs">${headline(h1, em)}</h1>
        <a class="phone" href="tel:0${PHONE.replace(/-/g, "")}" style="text-decoration:none">
          <span>법률 상담 문의</span>
          <strong>${PHONE}</strong>
          <small>서울 주사무소 · 카카오톡 1:1 상담 가능</small>
        </a>
        <p class="disc">${esc(DISCLAIMER)} · ${BRAND} · 광고책임변호사 ${AD_OFFICER}</p>
      </div>
    </div>
  </section>`;
}

/**
 * 슬라이드 데이터 → 완성 HTML 문자열
 * @param {object} d 생성 엔진이 만든 슬라이드 데이터
 * @returns {string} index.html 내용
 */
export function buildHtml(d) {
  const B = d.bg || {}; // { 1: dataUri, ... } — AI 배경(선택). 없으면 CSS 메쉬.
  const slides = [
    slideCover(d, B[1]),
    slideText(2, d.s2, "여온의 이야기 · 성공사례", B[2]),
    slideText(3, d.s3, "문제 정의", B[3]),
    slideText(4, d.s4, "정황 증거의 힘", B[4]),
    slideVs(d.s5, B[5]),
    slideStats(d.s6, B[6]),
    slideCards(d.s7, B[7]),
    slideText(8, d.s8, "가장 중요한 문장", B[8]),
    slideChecklist(d.s9, B[9]),
    slideCta(d.lawyer, d.cta_h1, d.cta_h1_em, B[10]),
  ].join("\n");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${BRAND} 카드뉴스 — ${esc(d.category || "")}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
<style>${styleBlock()}
${REFINE}</style>
</head>
<body>
<div class="stage" id="stage">
${slides}
</div>
</body>
</html>
`;
}

export const FIXED = { BRAND, PHONE, AD_OFFICER, DISCLAIMER, LAWYERS: Object.keys(LAWYER_FILES) };
