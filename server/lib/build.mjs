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

// 헤드라인: 각 줄(\n 기준)을 '한 줄 = 안 깨지는 블록'(.ln)으로 만든다.
// 이렇게 하면 작성자가 의도한 위치에서만 줄이 바뀌고, 한 줄이 중간에서
// 어색하게 접히지 않는다("혼자 감당하지 말고" 가 "말고" 로 넘어가던 문제 해결).
// 강조어(em)는 해당 줄 안에서 한 번만 금색 처리한다.
function headline(text, emphasis) {
  const em = (emphasis || "").trim();
  const emEsc = em ? esc(em) : "";
  let emDone = false;
  return String(text ?? "")
    .split("\n")
    .map((line) => {
      let h = esc(line);
      if (emEsc && !emDone && h.includes(emEsc)) {
        h = h.replace(emEsc, `<em>${emEsc}</em>`);
        emDone = true;
      }
      return `<span class="ln">${h}</span>`;
    })
    .join("");
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

// 법무법인 여온 로고(가로·화이트). assets/lawyers/ 에 있으면 카드 우측 상단에 넣는다.
// 파일이 아직 없으면 null → top() 이 텍스트 브랜드로 폴백한다.
const LOGO_FILE = "법무법인여온logo-w_가로.png";
let _logoUri; // 캐시(undefined=미확인, null=없음, string=데이터URI)
function logoDataUri() {
  if (_logoUri !== undefined) return _logoUri;
  try {
    const p = path.join(ROOT, "assets", "lawyers", LOGO_FILE);
    _logoUri = `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  } catch {
    _logoUri = null;
  }
  return _logoUri;
}

// 공통 배경.
//  - uri 가 있으면 .bg 에 깔고 강하게 블러/어둡게 처리한다(CSS 에 내장).
//    kind="src"(원문 사진)면 .bg.src 로 더 강한 블러를 줘 세부를 지운다.
//  - 없으면 CSS 메쉬로 폴백한다(더 선명한 브랜드 색).
// scrim/grain 은 항상 얹어 가독성을 확보한다.
function bg(seed = 0, uri = null, kind = "ai") {
  if (uri) {
    const safe = String(uri).replace(/"/g, "&quot;");
    const cls = kind === "src" ? "bg src" : "bg";
    return `<div class="${cls}" style="background-image:url(&quot;${safe}&quot;)"></div><div class="grain"></div><div class="scrim"></div>`;
  }
  // 더 선명하고 채도 높은 브랜드 배경(네이비 + 골드 글로우 + 청록 포인트).
  const sets = [
    [
      "width:66%;height:54%;left:-8%;top:0%;background:radial-gradient(circle at 50% 50%, #245089 0%, rgba(36,80,137,0.5) 44%, rgba(36,80,137,0) 72%)",
      "width:54%;height:46%;right:-10%;top:22%;background:radial-gradient(circle at 50% 50%, #C8A560 0%, rgba(200,165,96,0.34) 40%, rgba(200,165,96,0) 70%)",
      "width:72%;height:48%;left:8%;bottom:-14%;background:radial-gradient(circle at 50% 50%, #0B1A30 0%, rgba(11,26,48,0.6) 44%, rgba(11,26,48,0) 74%)",
    ],
    [
      "width:68%;height:52%;right:-12%;top:-6%;background:radial-gradient(circle at 50% 50%, #285A97 0%, rgba(40,90,151,0.5) 44%, rgba(40,90,151,0) 72%)",
      "width:50%;height:44%;left:-6%;bottom:4%;background:radial-gradient(circle at 50% 50%, #D4B36C 0%, rgba(212,179,108,0.3) 40%, rgba(212,179,108,0) 70%)",
      "width:44%;height:40%;left:26%;top:8%;background:radial-gradient(circle at 50% 50%, #17708A 0%, rgba(23,112,138,0.28) 42%, rgba(23,112,138,0) 70%)",
    ],
    [
      "width:62%;height:56%;left:-10%;top:6%;background:radial-gradient(circle at 50% 50%, #1E4576 0%, rgba(30,69,118,0.5) 44%, rgba(30,69,118,0) 72%)",
      "width:52%;height:46%;right:-8%;bottom:-8%;background:radial-gradient(circle at 50% 50%, #C8A560 0%, rgba(200,165,96,0.32) 40%, rgba(200,165,96,0) 70%)",
      "width:40%;height:38%;right:20%;top:0%;background:radial-gradient(circle at 50% 50%, #123A5E 0%, rgba(18,58,94,0.4) 44%, rgba(18,58,94,0) 72%)",
    ],
  ];
  const set = sets[seed % sets.length];
  const mesh = set.map((s) => `<i style="${s}"></i>`).join("");
  return `<div class="bg"></div><div class="mesh">${mesh}</div><div class="grain"></div><div class="scrim"></div>`;
}

function top(n) {
  const pg = String(n).padStart(2, "0");
  const logo = logoDataUri();
  // 로고가 있으면: 좌측 페이지번호 · 우측 상단 로고. 없으면 기존 텍스트 브랜드.
  if (logo) {
    return `<div class="top"><div class="pg">${pg} / 10</div><img class="logo" alt="${BRAND}" src="${logo}" /></div>`;
  }
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

// template CSS 위에 얹는 정제 스타일: 더 작은 폴백 크기 + 가독성/디테일 + 색감 강화.
const REFINE = `
/* --- PRO 정제 --- */
:root{--gold-hot:#F2CD73}

/* 헤드라인: 각 줄을 '안 깨지는 블록'으로 — 의도한 위치에서만 개행된다. */
h1 .ln{display:block;white-space:nowrap}
h1{text-shadow:0 2px 34px rgba(6,10,18,.42)}
h1.xxs{font-size:60px;line-height:1.16;letter-spacing:-.035em}
.cover h1.sm{font-size:96px}
.cover h1.xs{font-size:82px}
.cover h1.xxs{font-size:70px;line-height:1.16}

/* 강조어 — 더 밝은 금색 + 은은한 글로우로 시선을 잡는다. */
h1 em{color:var(--gold-hot);text-shadow:0 0 32px rgba(242,205,115,.35)}
h1 .u{background:linear-gradient(transparent 60%,rgba(242,205,115,.4) 60%)}

/* 키커 배지 — 금색 글자/테두리를 또렷하게. */
.kicker{backdrop-filter:blur(2px);color:var(--gold-hot);font-weight:700;
  border-color:rgba(200,165,96,.55);background:rgba(200,165,96,.12)}

/* 넘버 마커·페이지·스와이프 화살표를 금색으로 살려 브랜드감을 키운다. */
.num{color:rgba(200,165,96,.24)}
.pg,.foot .swipe{color:var(--gold-hot)}

/* 우측 상단 로고(가로·화이트) */
.top{align-items:flex-start}
.top .logo{height:50px;width:auto;max-width:340px;object-fit:contain;display:block;
  filter:drop-shadow(0 2px 10px rgba(0,0,0,.35))}

/* 하단 강조 바 — 더 굵고 선명하게. */
.bar{height:3px;border-radius:3px;
  background:linear-gradient(90deg,var(--gold-hot),var(--gold) 42%,rgba(200,165,96,0))}

/* 카드·스탯 포인트 색 강화. */
.card b{background:var(--gold-hot)}
.stats strong{line-height:1.2;color:var(--gold-hot)}
.vs .b{background:rgba(242,205,115,.16);border-color:rgba(242,205,115,.5)}

.sub{text-wrap:pretty}
.sub.tight{font-size:33px;line-height:1.55}
.card p small{color:rgba(246,243,237,.66)}

/* 원문 사진을 배경으로 쓸 때: 세부(인물·글자)가 안 보이도록 더 강한 블러 + 어둡게. */
.slide .bg.src{filter:blur(26px) saturate(.72) brightness(.34);inset:-14%;transform:scale(1.14)}

/* 배경 그라데이션을 더 깊게 — 텍스트 대비 확보. */
.slide .scrim{background:
  linear-gradient(180deg,rgba(9,14,25,.82) 0%,rgba(9,14,25,.46) 32%,rgba(9,14,25,.7) 66%,rgba(9,14,25,.96) 100%),
  radial-gradient(120% 80% at 50% 112%,rgba(9,14,25,.92),transparent 60%)}
`;

function subClass(text) {
  const len = String(text || "").replace(/\n/g, "").length;
  return len >= 78 ? "sub tight" : "sub";
}

// --- 각 슬라이드 ---
function slideCover(d, bgUri, kind) {
  return `
  <section class="slide cover" data-n="01">
    ${bg(0, bgUri, kind)}
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

function slideText(n, d, tag, bgUri, kind) {
  return `
  <section class="slide" data-n="${String(n).padStart(2, "0")}">
    ${bg(n, bgUri, kind)}
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

function slideVs(d, bgUri, kind) {
  return `
  <section class="slide" data-n="05">
    ${bg(5, bgUri, kind)}
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

function slideStats(d, bgUri, kind) {
  const stats = Array.isArray(d.stats) ? d.stats.slice(0, 3) : [];
  const statsHtml = stats.length
    ? `<div class="stats">${stats
        .map((s) => `<div><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`)
        .join("")}</div>`
    : "";
  return `
  <section class="slide" data-n="06">
    ${bg(6, bgUri, kind)}
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

function slideCards(d, bgUri, kind) {
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
    ${bg(7, bgUri, kind)}
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

function slideChecklist(d, bgUri, kind) {
  const checks = (Array.isArray(d.checks) ? d.checks.slice(0, 4) : [])
    .map((c, i) => `<div class="card"><b>${i + 1}</b><p>${esc(c)}</p></div>`)
    .join("");
  return `
  <section class="slide" data-n="09">
    ${bg(9, bgUri, kind)}
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
function slideCta(lawyer, ctaH1, ctaH1Em, bgUri, kind) {
  const img = lawyerImageDataUri(lawyer);
  const h1 = ctaH1 || "혼자 감당하지 말고\n먼저 물어보세요";
  const em = ctaH1Em || "먼저";
  return `
  <section class="slide cta" data-n="10">
    ${bg(10, bgUri, kind)}
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
        <h1 class="${h1Class(h1)}">${headline(h1, em)}</h1>
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
  const B = d.bg || {}; // { 1: dataUri, ... } — 배경 이미지(선택). 없으면 CSS 메쉬.
  const K = d.bgKind || "ai"; // "src"=원문 사진(강한 블러) | "ai"=AI 생성
  const slides = [
    slideCover(d, B[1], K),
    slideText(2, d.s2, "여온의 이야기 · 성공사례", B[2], K),
    slideText(3, d.s3, "문제 정의", B[3], K),
    slideText(4, d.s4, "정황 증거의 힘", B[4], K),
    slideVs(d.s5, B[5], K),
    slideStats(d.s6, B[6], K),
    slideCards(d.s7, B[7], K),
    slideText(8, d.s8, "가장 중요한 문장", B[8], K),
    slideChecklist(d.s9, B[9], K),
    slideCta(d.lawyer, d.cta_h1, d.cta_h1_em, B[10], K),
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
