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

// 카드에 고정 노출되던 라벨류 문구(뱃지·하단 태그 등) 기본값. data.chrome 로 편집 가능.
// 상담번호·광고책임변호사 표기·면책 문구는 광고 규정상 절대 고정이므로 여기 포함하지 않는다.
const CHROME_DEFAULTS = {
  coverBadge: "실제 성공사례",
  coverTag: "실제 판결로 확인된 대응 전략",
  tagS2: "여온의 이야기 · 성공사례",
  tagS3: "문제 정의",
  tagS4: "정황 증거의 힘",
  tagS5: "조문은 하나가 아닙니다",
  tagS6: "해당 사건의 법원 판단 결과",
  tagS7: "실무에서 자주 쓰이는 자료",
  tagS8: "가장 중요한 문장",
  tagS9: "캡처해서 보관하세요",
  statsBadge: "저장 포인트",
  checklistBadge: "저장해두기",
  ctaLabel: "이 사례를 검토한 변호사",
  ctaCaseTag: "가사 · 이혼 사건",
  ctaPhoneLabel: "법률 상담 문의",
  ctaPhoneSub: "서울 주사무소 · 카카오톡 1:1 상담 가능",
};
function chromeText(d, key) {
  const v = d && d.chrome && d.chrome[key];
  return typeof v === "string" && v.trim() ? v : CHROME_DEFAULTS[key];
}

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

// 상세 본문: 문단(\n\n)·줄바꿈(\n)·강조(**말**) 지원. 강조는 마커펜 스타일.
function richText(s) {
  return String(s ?? "")
    .split(/\n{2,}/)
    .map((p) => {
      const h = esc(p).replace(/\n/g, "<br>").replace(/\*\*(.+?)\*\*/g, '<b class="hl">$1</b>');
      return `<p>${h}</p>`;
    })
    .join("");
}

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
const LOGO_FILE = "logo-w.png";
let _logoUri; // 캐시(undefined=미확인, null=없음, string=데이터URI)
// 로고 파일 찾기 — 맥(NFD)·윈도(NFC) 한글 파일명 차이를 흡수하고, 'logo' 포함 파일로도 폴백.
function findLogoFile(dir) {
  if (fs.existsSync(path.join(dir, LOGO_FILE))) return LOGO_FILE;
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const target = LOGO_FILE.normalize("NFC");
  return (
    files.find((f) => f.normalize("NFC") === target) ||
    files.find((f) => /logo/i.test(f.normalize("NFC"))) ||
    null
  );
}
function logoDataUri() {
  if (_logoUri !== undefined) return _logoUri;
  _logoUri = null;
  try {
    const dir = path.join(ROOT, "assets", "lawyers");
    const file = findLogoFile(dir);
    if (file) _logoUri = `data:image/png;base64,${fs.readFileSync(path.join(dir, file)).toString("base64")}`;
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
  // 원문/AI 이미지가 없는 칸의 폴백 배경.
  // seed(=카드 번호)로 위치·색을 회전시켜 카드마다 '서로 다른' 화면을 만든다.
  // (예전엔 3종만 돌려써 3장마다 같은 배경이 반복됐다 → 이제 카드마다 유일.)
  const s = Number(seed) || 0;
  const navy = ["#245089", "#285A97", "#1E4576", "#123A5E", "#2C5E95"][s % 5];
  const gold = ["#C8A560", "#D4B36C", "#CBA968", "#BE9C57"][s % 4];
  const teal = ["#17708A", "#1C6E86", "#0F5F7A"][s % 3];
  const at = (deg, rad) =>
    `${(50 + rad * Math.cos((deg * Math.PI) / 180)).toFixed(1)}% ${(50 + rad * Math.sin((deg * Math.PI) / 180)).toFixed(1)}%`;
  const a1 = (s * 57) % 360, a2 = (s * 57 + 130) % 360, a3 = (s * 57 + 245) % 360;
  const wrap = (v, m, off) => ((s * m) % v) + off; // seed 기반 위치 변주
  const blobs = [
    `width:70%;height:56%;left:${wrap(22, 13, -10)}%;top:${wrap(18, 7, -6)}%;` +
      `background:radial-gradient(circle at ${at(a1, 8)}, ${navy} 0%, ${navy}66 44%, ${navy}00 72%)`,
    `width:54%;height:46%;right:${wrap(22, 11, -10)}%;top:${wrap(38, 17, 8)}%;` +
      `background:radial-gradient(circle at ${at(a2, 8)}, ${gold} 0%, ${gold}55 40%, ${gold}00 70%)`,
    `width:48%;height:42%;left:${wrap(30, 19, 4)}%;bottom:${wrap(24, 23, -8)}%;` +
      `background:radial-gradient(circle at ${at(a3, 8)}, ${teal} 0%, ${teal}4d 42%, ${teal}00 70%)`,
  ];
  const mesh = blobs.map((b) => `<i style="${b}"></i>`).join("");
  return `<div class="bg"></div><div class="mesh">${mesh}</div><div class="grain"></div><div class="scrim"></div>`;
}

let _total = 10; // 총 카드 수(판결문 카드가 있으면 11). buildHtml 이 매번 설정한다.
function top(n) {
  const pg = String(n).padStart(2, "0");
  const tot = String(_total).padStart(2, "0");
  const logo = logoDataUri();
  // 로고가 있으면: 좌측 상단 로고 · 우측 페이지번호. 없으면 기존 텍스트 브랜드.
  if (logo) {
    return `<div class="top"><img class="logo" alt="${BRAND}" src="${logo}" /><div class="pg">${pg} / ${tot}</div></div>`;
  }
  return `<div class="top"><div class="brand"><div class="dot"></div><span>${BRAND}</span></div><div class="pg">${pg} / ${tot}</div></div>`;
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

/* 좌측 상단 로고(가로·화이트). 기본 크게, 편집에서 조절 가능(아래 인라인 override). */
.top{align-items:flex-start}
.top .logo{height:64px;width:auto;max-width:440px;object-fit:contain;display:block;
  filter:drop-shadow(0 2px 12px rgba(0,0,0,.45))}

/* 표지 '실제 성공사례' 배지 — 시선을 끄는 솔리드 태그 */
.cover .realcase{align-self:flex-start;font-size:22px;font-weight:800;letter-spacing:.01em;
  color:#0A101C;background:var(--gold-hot);padding:9px 18px;border-radius:8px;margin-bottom:18px;
  box-shadow:0 6px 20px rgba(0,0,0,.35)}

/* 판결문 카드(첨부한 실제 판결문을 문서처럼 보여준다) */
.slide.verdict{background:#0b1220}
.slide.verdict .vbg{position:absolute;inset:0;z-index:0;background:radial-gradient(120% 90% at 50% 0%,#1a3556 0%,#0A101C 68%)}
.slide.verdict .inner{z-index:4}
.slide.verdict .realcase{align-self:flex-start;font-size:22px;font-weight:800;color:#0A101C;
  background:var(--gold-hot);padding:9px 18px;border-radius:8px;margin:6px 0 4px;box-shadow:0 6px 20px rgba(0,0,0,.35)}
.slide.verdict .vframe{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;
  margin:26px 0 20px;background:#fff;border-radius:14px;padding:20px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.55)}
.slide.verdict .vshot{max-width:100%;max-height:100%;object-fit:contain;border-radius:4px}
.slide.verdict .vcap{font-size:28px;color:rgba(246,243,237,.82);text-align:center;padding-bottom:6px}

/* 하단 강조 바 — 더 굵고 선명하게. */
.bar{height:3px;border-radius:3px;
  background:linear-gradient(90deg,var(--gold-hot),var(--gold) 42%,rgba(200,165,96,0))}

/* 카드·스탯 포인트 색 강화. */
.card b{background:var(--gold-hot)}
.stats strong{line-height:1.2;color:var(--gold-hot)}

/* 법리 대비 박스(.vs .a/.b): 원본은 흰색·금색을 살짝만 입힌 반투명이라, 뒤에 사진
   배경(특히 밝은 사진)이 있으면 박스가 하얗게 씻겨나가 글자가 안 보인다. 사진 유무와
   무관하게 항상 또렷하도록 어둡게 깔고 블러 처리한다(뒷 배경이 그대로 비치지 않게). */
.vs .a{background:rgba(6,10,18,.62);border-color:rgba(255,255,255,.16);
  color:rgba(246,243,237,.78);backdrop-filter:blur(5px)}
.vs .b{background:rgba(6,10,18,.5);border-color:rgba(242,205,115,.6);backdrop-filter:blur(5px)}

.sub{text-wrap:pretty}
.sub.tight{font-size:33px;line-height:1.55}
.card p small{color:rgba(246,243,237,.66)}

/* 원문 사진 배경: 블러 없이 선명하게. 가독성은 아래 하단 그라데이션이 확보한다. */
.slide .bg.src{filter:brightness(.92) contrast(1.02);inset:0;transform:none}

/* 하단부터 검정이 짙어지는 그라데이션(뉴스카드 스타일):
   위쪽은 이미지가 선명히 보이고, 아래로 갈수록 어두워져 흰 글자가 읽힌다. */
.slide .scrim{background:linear-gradient(to bottom,
  rgba(6,10,18,.5) 0%, rgba(6,10,18,.14) 11%, rgba(6,10,18,0) 32%,
  rgba(6,10,18,.34) 54%, rgba(6,10,18,.72) 74%, rgba(6,10,18,.9) 88%, rgba(6,10,18,.98) 100%)}

/* 선명한 이미지 위 가독성 — 텍스트 그림자 보강 + 표지 텍스트 하단 배치 */
h1{text-shadow:0 2px 20px rgba(0,0,0,.55),0 1px 2px rgba(0,0,0,.5)}
.sub{text-shadow:0 1px 12px rgba(0,0,0,.55)}
.foot .tag,.foot .swipe,.cover .quote{text-shadow:0 1px 8px rgba(0,0,0,.5)}
.cover .body-area{justify-content:flex-end}

/* 전체 글자 크기 배율(편집에서 조절). buildHtml 이 :root{--ts} 를 주입한다. */
:root{--ts:1}
h1{font-size:calc(100px*var(--ts))}
h1.sm{font-size:calc(82px*var(--ts))}
h1.xs{font-size:calc(70px*var(--ts))}
h1.xxs{font-size:calc(60px*var(--ts))}
.cover h1{font-size:calc(112px*var(--ts))}
.cover h1.sm{font-size:calc(96px*var(--ts))}
.cover h1.xs{font-size:calc(82px*var(--ts))}
.cover h1.xxs{font-size:calc(70px*var(--ts))}
.sub{font-size:calc(38px*var(--ts))}
.sub.small{font-size:calc(34px*var(--ts))}
.sub.tight{font-size:calc(33px*var(--ts))}
.kicker{font-size:calc(24px*var(--ts))}
.card p{font-size:calc(34px*var(--ts))}
.card p small{font-size:calc(26px*var(--ts))}
.stats span{font-size:calc(22px*var(--ts))}
.stats strong{font-size:calc(40px*var(--ts))}
.vs div{font-size:calc(34px*var(--ts))}
.cover .quote{font-size:calc(36px*var(--ts))}

/* 본문 카드는 세로 가운데 정렬(빈 여백을 위아래로 나눠 허전함을 줄인다).
   표지(cover)·상담(cta)은 원래 배치 유지. 카드별로 편집에서 위/가운데/아래로 옮길 수 있다. */
.slide:not(.cover):not(.cta):not(.detail) .body-area{justify-content:center}

/* ── 상세(보험 카톡방) 버전 ── */
.slide.detail .body-area{justify-content:center;gap:16px}
/* 상세 본문 카드: 배경 사진은 '분위기 질감'으로만(아주 어둡게+블러) → 사진 속 글자가
   본문 위로 겹쳐 보이지 않게 하고, 텍스트 패널만 또렷하게 읽히도록 한다.
   (표지 detail-cover 는 글자가 적으므로 밝게 유지) */
.slide.detail:not(.detail-cover) .bg.src{filter:brightness(.3) saturate(.85) blur(3px)}
.slide.detail:not(.detail-cover) .scrim{background:linear-gradient(to bottom,
  rgba(6,10,18,.74) 0%, rgba(6,10,18,.72) 50%, rgba(6,10,18,.84) 100%)}
.slide.detail h1{font-size:calc(58px*var(--ts));line-height:1.16}
.slide.detail h1.sm{font-size:calc(52px*var(--ts))}
.slide.detail h1.xs{font-size:calc(46px*var(--ts))}
.slide.detail h1.xxs{font-size:calc(42px*var(--ts))}
/* 리드문: 카드 핵심 한 문장(마커 박스) — 사진 위에서도 읽히게 프로스티드 패널 */
.dlead{font-size:calc(33px*var(--ts));font-weight:800;font-style:italic;color:var(--gold-hot);
  line-height:1.42;padding:15px 20px;background:rgba(11,18,32,.62);border-left:4px solid var(--gold-hot);
  border-radius:10px;text-shadow:none;backdrop-filter:blur(5px)}
/* 상세 본문: 읽기 위한 반투명 패널(프로스티드) + 문단 */
.dbody{font-size:calc(29px*var(--ts));line-height:1.6;color:var(--paper);
  background:rgba(9,15,26,.68);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:20px 22px;
  backdrop-filter:blur(6px);box-shadow:0 10px 40px rgba(0,0,0,.35)}
.dbody p{margin:0 0 14px}.dbody p:last-child{margin:0}
.dbody .hl{background:linear-gradient(transparent 56%,rgba(242,205,115,.45) 56%);
  font-weight:800;color:#fff;padding:0 2px;border-radius:2px}
/* 표지 부제(검색 pill) */
.searchpill{display:flex;align-items:center;gap:14px;background:rgba(246,243,237,.95);color:#0A101C;
  border-radius:999px;padding:15px 24px;font-size:calc(27px*var(--ts));font-weight:700;
  box-shadow:0 8px 24px rgba(0,0,0,.35);max-width:100%}
.searchpill span{flex:1;min-width:0}
.searchpill .mag{flex:none;width:44px;height:44px;border-radius:50%;background:#16304F;color:#fff;
  display:flex;align-items:center;justify-content:center;font-size:24px}
`;

function subClass(text) {
  const len = String(text || "").replace(/\n/g, "").length;
  return len >= 78 ? "sub tight" : "sub";
}

// ── 프리셋 스타일(편집기에서 고른 값) ─────────────────────────────────────
// 글꼴(전체) · 강조색(전체) · 헤드라인 크기(슬라이드별) · 상하 위치(슬라이드별)
const FONTS = {
  sans: { family: "'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif", link: "" },
  serif: {
    family: "'Noto Serif KR',serif",
    link: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;800;900&display=swap" />',
  },
  gothic: {
    family: "'Gothic A1','Pretendard',sans-serif",
    link: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@500;700;900&display=swap" />',
  },
};
const ACCENTS = { gold: "#F2CD73", teal: "#59D0C4", sky: "#7FB6EE", coral: "#F2937B", white: "#F6F3ED" };
const SIZE_PX = { small: 64, normal: 84, large: 104, xlarge: 124 };

function styleHead(S) {
  const font = FONTS[S.font] || FONTS.sans;
  const accent = ACCENTS[S.accent] || ACCENTS.gold;
  const css = `.stage{font-family:${font.family}}\n:root{--gold-hot:${accent}}`;
  return { link: font.link, css };
}

// 슬라이드별 인라인 스타일(헤드라인 크기 / 본문 상하 위치). 값이 없으면 빈 문자열.
function slideSty(S, key) {
  const s = (S && S.slides && S.slides[key]) || {};
  const px = SIZE_PX[s.size];
  const h1 = px ? ` style="font-size:${px}px;line-height:1.14"` : "";
  const area =
    s.align === "top"
      ? ` style="justify-content:flex-start"`
      : s.align === "center"
      ? ` style="justify-content:center"`
      : s.align === "bottom"
      ? ` style="justify-content:flex-end"`
      : "";
  return { h1, area };
}

// --- 각 슬라이드 ---
function slideCover(d, bgUri, kind) {
  return `
  <section class="slide cover" data-n="01">
    ${bg(0, bgUri, kind)}
    <div class="inner">
      ${top(1)}
      <div class="body-area">
        <div class="realcase" data-f="chrome.coverBadge">${esc(chromeText(d, "coverBadge"))}</div>
        <div class="kicker" data-f="category">${esc(d.category)}</div>
        <h1 class="${coverClass(d.cover_h1)}" data-f="cover_h1">${headline(d.cover_h1, d.cover_h1_em)}</h1>
        ${d.cover_quote ? `<p class="quote" data-f="cover_quote">${ml(d.cover_quote)}</p>` : ""}
      </div>
      <div class="foot"><div class="tag" data-f="chrome.coverTag">${esc(chromeText(d, "coverTag"))}</div><div class="swipe">넘겨서 보기 →</div></div>
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
        <div class="kicker" data-f="s${n}.kicker">${esc(d.kicker)}</div>
        <h1 class="${h1Class(d.h1)}" data-f="s${n}.h1">${headline(d.h1, d.h1_em)}</h1>
        ${d.sub ? `<p class="${subClass(d.sub)}" data-f="s${n}.sub">${ml(d.sub)}</p>` : ""}
        <div class="bar"></div>
      </div>
      <div class="foot"><div class="tag" data-f="chrome.tagS${n}">${esc(tag || "")}</div><div class="swipe">→</div></div>
    </div>
  </section>`;
}

function slideVs(d, bgUri, kind, tag) {
  return `
  <section class="slide" data-n="05">
    ${bg(5, bgUri, kind)}
    <div class="inner">
      ${top(5)}
      <div class="body-area">
        <div class="kicker" data-f="s5.kicker">${esc(d.kicker)}</div>
        <h1 class="xs" data-f="s5.h1">${headline(d.h1, d.h1_em)}</h1>
        <div class="vs">
          <div class="a" data-f="s5.vs_a_title">${esc(d.vs_a_title)}<br><span style="font-size:26px;font-weight:400" data-f="s5.vs_a_desc">${esc(d.vs_a_desc)}</span></div>
          <div class="arrow">▼</div>
          <div class="b" data-f="s5.vs_b_title">${esc(d.vs_b_title)}<br><span style="font-size:26px;font-weight:400" data-f="s5.vs_b_desc">${esc(d.vs_b_desc)}</span></div>
        </div>
      </div>
      <div class="foot"><div class="tag" data-f="chrome.tagS5">${esc(tag || "")}</div><div class="swipe">→</div></div>
    </div>
  </section>`;
}

function slideStats(d, bgUri, kind, saveLabel, tag) {
  const stats = Array.isArray(d.stats) ? d.stats.slice(0, 3) : [];
  const statsHtml = stats.length
    ? `<div class="stats">${stats
        .map((s, i) => `<div><span data-f="s6.stats.${i}.label">${esc(s.label)}</span><strong data-f="s6.stats.${i}.value">${esc(s.value)}</strong></div>`)
        .join("")}</div>`
    : "";
  return `
  <section class="slide" data-n="06">
    ${bg(6, bgUri, kind)}
    <div class="save" data-f="chrome.statsBadge">${esc(saveLabel)}</div>
    <div class="inner">
      ${top(6)}
      <div class="body-area">
        <div class="kicker" data-f="s6.kicker">${esc(d.kicker)}</div>
        <h1 class="xs" data-f="s6.h1">${headline(d.h1, d.h1_em)}</h1>
        ${d.sub ? `<p class="sub small" data-f="s6.sub">${ml(d.sub)}</p>` : ""}
        ${statsHtml}
      </div>
      <div class="foot"><div class="tag" data-f="chrome.tagS6">${esc(tag || "")}</div><div class="swipe">→</div></div>
    </div>
  </section>`;
}

function slideCards(d, bgUri, kind, tag) {
  const cards = (Array.isArray(d.cards) ? d.cards.slice(0, 3) : [])
    .map(
      (c, i) =>
        `<div class="card"><b>${i + 1}</b><p data-f="s7.cards.${i}.title">${esc(c.title)}${
          c.desc ? `<small data-f="s7.cards.${i}.desc">${esc(c.desc)}</small>` : ""
        }</p></div>`
    )
    .join("");
  return `
  <section class="slide" data-n="07">
    ${bg(7, bgUri, kind)}
    <div class="inner">
      ${top(7)}
      <div class="body-area">
        <div class="kicker" data-f="s7.kicker">${esc(d.kicker)}</div>
        <h1 class="xs" data-f="s7.h1">${headline(d.h1, d.h1_em)}</h1>
        <div class="cards">${cards}</div>
      </div>
      <div class="foot"><div class="tag" data-f="chrome.tagS7">${esc(tag || "")}</div><div class="swipe">→</div></div>
    </div>
  </section>`;
}

function slideChecklist(d, bgUri, kind, saveLabel, tag) {
  const checks = (Array.isArray(d.checks) ? d.checks.slice(0, 4) : [])
    .map((c, i) => `<div class="card"><b>${i + 1}</b><p data-f="s9.checks.${i}">${esc(c)}</p></div>`)
    .join("");
  return `
  <section class="slide" data-n="09">
    ${bg(9, bgUri, kind)}
    <div class="save" data-f="chrome.checklistBadge">${esc(saveLabel)}</div>
    <div class="inner">
      ${top(9)}
      <div class="body-area">
        <div class="kicker" data-f="s9.kicker">${esc(d.kicker)}</div>
        <h1 class="xs" data-f="s9.h1">${headline(d.h1, d.h1_em)}</h1>
        <div class="cards">${checks}</div>
      </div>
      <div class="foot"><div class="tag" data-f="chrome.tagS9">${esc(tag || "")}</div><div class="swipe">→</div></div>
    </div>
  </section>`;
}

// (선택) 판결문/증거 카드 — 연락처 카드 바로 앞. v={uri, kind:"doc"|"ai"}.
//  doc: 첨부한 실제 판결문을 문서처럼 액자에 담아 보여준다.
//  ai : 판결문이 없어 내용에 어울리는 이미지를 생성한 경우(선명한 이미지 + 하단 그라데이션).
function slideVerdict(v, pageNum) {
  const uri = String(v.uri || "").replace(/"/g, "&quot;");
  if (v.kind === "ai") {
    return `
  <section class="slide cover verdict-ai" data-n="${String(pageNum).padStart(2, "0")}">
    ${bg(10, v.uri, "src")}
    <div class="inner">
      ${top(pageNum)}
      <div class="body-area">
        <div class="realcase">실제 성공사례</div>
        <h1 class="sm">${headline("실제 판결로\n확인된 결과예요", "확인된")}</h1>
      </div>
    </div>
  </section>`;
  }
  return `
  <section class="slide verdict" data-n="${String(pageNum).padStart(2, "0")}">
    <div class="vbg"></div>
    <div class="inner">
      ${top(pageNum)}
      <div class="realcase">실제 판결문</div>
      <div class="vframe"><img class="vshot" alt="판결문" src="${uri}" /></div>
      <p class="vcap">본 사건의 실제 법원 판결문이에요.</p>
    </div>
  </section>`;
}

// 마지막: 상담 안내 — 상담번호·면책문구·광고책임변호사 표기·변호사 사진만 고정.
// 그 외 라벨(검토 변호사 안내문·사건유형 태그·상담 라벨 등)은 chrome 로 편집 가능.
function slideCta(lawyer, ctaH1, ctaH1Em, bgUri, kind, pageNum, d) {
  const img = lawyerImageDataUri(lawyer);
  const h1 = ctaH1 || "혼자 감당하지 말고\n먼저 물어보세요";
  const em = ctaH1Em || "먼저";
  const label = chromeText(d, "ctaLabel");
  const caseTag = chromeText(d, "ctaCaseTag");
  const phoneLabel = chromeText(d, "ctaPhoneLabel");
  const phoneSub = chromeText(d, "ctaPhoneSub");
  return `
  <section class="slide cta" data-n="${String(pageNum).padStart(2, "0")}">
    ${bg(10, bgUri, kind)}
    <div class="inner">
      ${top(pageNum)}
      <div class="lawyer">
        <img alt="${esc(lawyer)} 변호사" src="${img}" />
        <div class="meta">
          <em data-f="chrome.ctaLabel">${esc(label)}</em>
          <strong>${esc(lawyer)} 변호사</strong>
          <small data-f="chrome.ctaCaseTag">${esc(caseTag)}</small>
        </div>
      </div>
      <div class="body-area">
        <h1 class="${h1Class(h1)}" data-f="cta_h1">${headline(h1, em)}</h1>
        <a class="phone" href="tel:0${PHONE.replace(/-/g, "")}" style="text-decoration:none">
          <span data-f="chrome.ctaPhoneLabel">${esc(phoneLabel)}</span>
          <strong>${PHONE}</strong>
          <small data-f="chrome.ctaPhoneSub">${esc(phoneSub)}</small>
        </a>
        <p class="disc">${esc(DISCLAIMER)} · ${BRAND} · 광고책임변호사 ${AD_OFFICER}</p>
      </div>
    </div>
  </section>`;
}

// ── 상세(보험 카톡방) 버전 슬라이드 ──────────────────────────────────────
function slideCoverDetail(d, bgUri, kind) {
  return `
  <section class="slide cover detail-cover" data-n="01">
    ${bg(0, bgUri, kind)}
    <div class="inner">
      ${top(1)}
      <div class="body-area">
        <div class="realcase">보험 실무 자료</div>
        <div class="kicker" data-f="category">${esc(d.category)}</div>
        <h1 class="${coverClass(d.cover_h1)}" data-f="cover_h1">${headline(d.cover_h1, d.cover_h1_em)}</h1>
        ${d.cover_sub ? `<div class="searchpill" data-f="cover_sub"><span>${esc(d.cover_sub)}</span><i class="mag">⌕</i></div>` : ""}
      </div>
      <div class="foot"><div class="tag">여온 법률정보 · 실무 참고용</div><div class="swipe">넘겨서 보기 →</div></div>
    </div>
  </section>`;
}

function slideDetail(n, sec, bgUri, kind, i) {
  const lead = sec.lead ? `<p class="dlead" data-f="sections.${i}.lead">${esc(sec.lead)}</p>` : "";
  const body = sec.body ? `<div class="dbody" data-f="sections.${i}.body">${richText(sec.body)}</div>` : "";
  return `
  <section class="slide detail" data-n="${String(n).padStart(2, "0")}">
    ${bg(n, bgUri, kind)}
    <div class="inner">
      ${top(n)}
      <div class="body-area">
        <h1 class="${h1Class(sec.h1)}" data-f="sections.${i}.h1">${headline(sec.h1, sec.h1_em)}</h1>
        ${lead}
        ${body}
      </div>
      <div class="foot"><div class="tag">여온 법률정보</div><div class="swipe">→</div></div>
    </div>
  </section>`;
}

// 편집 스타일(로고·전체/카드별 배율·필드 px) → CSS. buildHtml/buildHtmlDetail 공용.
// dnMap: 논리키(cover,s2..,cta) → 실제 data-n. 카드별 배율(--ts)에 쓴다.
function styleOverrides(d, dnMap) {
  const St = d.style || {};
  let css = "";
  const logoH = Number(St.logo);
  if (Number.isFinite(logoH) && logoH >= 30 && logoH <= 160)
    css += `.top .logo{height:${Math.round(logoH)}px;max-width:${Math.round(logoH * 7)}px}`;
  const ts = Number(St.textScale);
  if (Number.isFinite(ts) && ts >= 0.8 && ts <= 1.4) css += `:root{--ts:${ts}}`;
  const scale = (St.slideScale && typeof St.slideScale === "object") ? St.slideScale : {};
  for (const [key, d2] of Object.entries(dnMap)) {
    const v = Number(scale[key]);
    if (Number.isFinite(v) && v >= 0.6 && v <= 1.8) css += `.stage .slide[data-n="${d2}"]{--ts:${v}}`;
  }
  const fpx = (St.fontPx && typeof St.fontPx === "object") ? St.fontPx : {};
  for (const [key, raw] of Object.entries(fpx)) {
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 10 || v > 240) continue;
    const safeKey = String(key).replace(/["\\]/g, "");
    const sel = /_em$/.test(safeKey)
      ? `.stage [data-f="${safeKey.replace(/_em$/, "")}"] em`
      : `.stage [data-f="${safeKey}"]`;
    css += `${sel}{font-size:${Math.round(v)}px !important}`;
  }
  // 카드별 상하 위치(위/가운데/아래). 편집에서 카드를 옮길 때 쓴다.
  const ALIGN_CSS = { top: "flex-start", center: "center", bottom: "flex-end" };
  const align = (St.align && typeof St.align === "object") ? St.align : {};
  for (const [key, d2] of Object.entries(dnMap)) {
    const a = ALIGN_CSS[align[key]];
    if (a) css += `.stage .slide[data-n="${d2}"] .body-area{justify-content:${a} !important}`;
  }
  return css;
}

function wrapDocument(d, slidesHtml, dnMap) {
  const styleCss = styleOverrides(d, dnMap);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${BRAND} 카드뉴스 — ${esc(d.category || "")}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
<style>${styleBlock()}
${REFINE}
${styleCss}</style>
</head>
<body>
<div class="stage" id="stage">
${slidesHtml}
</div>
</body>
</html>
`;
}

// 상세 버전: 표지 + 본문 카드(sections) + (선택)판결문 + 상담 안내.
function buildHtmlDetail(d) {
  const B = d.bg || {};
  const K = d.bgKind || "ai";
  const secs = Array.isArray(d.sections) ? d.sections.slice(0, 8) : [];
  const hasV = d.verdict && d.verdict.uri;
  _total = 1 + secs.length + (hasV ? 1 : 0) + 1;
  const dn = { cover: "01" };
  const list = [slideCoverDetail(d, ...imgOf(d, "cover", B[1], K))];
  let n = 2;
  secs.forEach((sec, i) => {
    dn[`sec${i}`] = String(n).padStart(2, "0");
    const [uri, kind] = imgOf(d, `sec${i}`, B[n], K);
    list.push(slideDetail(n, sec, uri, kind, i));
    n += 1;
  });
  if (hasV) {
    dn.verdict = String(n).padStart(2, "0");
    list.push(slideVerdict(d.verdict, n));
    n += 1;
  }
  dn.cta = String(n).padStart(2, "0");
  list.push(slideCta(d.lawyer, d.cta_h1, d.cta_h1_em, ...imgOf(d, "cta", B[n], K), n, d));
  return wrapDocument(d, list.join("\n"), dn);
}

/**
 * 슬라이드 데이터 → 완성 HTML 문자열
 * @param {object} d 생성 엔진이 만든 슬라이드 데이터
 * @returns {string} index.html 내용
 */
// 카드별 이미지 오버라이드(편집에서 빼기/넣기). key: cover,s2..s9,sec0..,cta.
//  - "none" → 이미지 없이 CSS 메쉬  - data:URI → 그 이미지(선명 처리)  - 없음 → 기본(def)
function imgOf(d, key, def, K) {
  const c = d.cardImg && d.cardImg[key];
  if (c === "none") return [null, K];
  if (typeof c === "string" && c.startsWith("data:")) return [c, "src"];
  return [def, K];
}

export function buildHtml(d) {
  if (d.mode === "detail") return buildHtmlDetail(d);
  const B = d.bg || {}; // { 1: dataUri, ... } — 배경 이미지(선택). 없으면 CSS 메쉬.
  const K = d.bgKind || "ai"; // "src"=원문 사진 | "ai"=AI 생성
  const hasV = d.verdict && d.verdict.uri; // 판결문/증거 카드(선택)
  _total = hasV ? 11 : 10; // 페이지 번호 분모(top)
  const list = [
    slideCover(d, ...imgOf(d, "cover", B[1], K)),
    slideText(2, d.s2, chromeText(d, "tagS2"), ...imgOf(d, "s2", B[2], K)),
    slideText(3, d.s3, chromeText(d, "tagS3"), ...imgOf(d, "s3", B[3], K)),
    slideText(4, d.s4, chromeText(d, "tagS4"), ...imgOf(d, "s4", B[4], K)),
    slideVs(d.s5, ...imgOf(d, "s5", B[5], K), chromeText(d, "tagS5")),
    slideStats(d.s6, ...imgOf(d, "s6", B[6], K), chromeText(d, "statsBadge"), chromeText(d, "tagS6")),
    slideCards(d.s7, ...imgOf(d, "s7", B[7], K), chromeText(d, "tagS7")),
    slideText(8, d.s8, chromeText(d, "tagS8"), ...imgOf(d, "s8", B[8], K)),
    slideChecklist(d.s9, ...imgOf(d, "s9", B[9], K), chromeText(d, "checklistBadge"), chromeText(d, "tagS9")),
  ];
  let pg = 10;
  let verdictN = null;
  if (hasV) {
    verdictN = 10;
    list.push(slideVerdict(d.verdict, 10));
    pg = 11;
  }
  list.push(slideCta(d.lawyer, d.cta_h1, d.cta_h1_em, ...imgOf(d, "cta", B[10], K), pg, d));

  const dn = { cover: "01", s2: "02", s3: "03", s4: "04", s5: "05", s6: "06", s7: "07", s8: "08", s9: "09" };
  if (verdictN) dn.verdict = String(verdictN).padStart(2, "0");
  dn.cta = String(pg).padStart(2, "0");
  return wrapDocument(d, list.join("\n"), dn);
}

// 총 카드 수(판결문 포함). SNS=10(+판결문 11) / 상세=표지+본문(5~8)+(판결문)+상담.
export function cardCountOf(d) {
  const hasV = d && d.verdict && d.verdict.uri;
  if (d && d.mode === "detail") {
    const secN = Array.isArray(d.sections) ? Math.min(8, d.sections.length) : 0;
    return 1 + secN + (hasV ? 1 : 0) + 1;
  }
  return hasV ? 11 : 10;
}

export const FIXED = { BRAND, PHONE, AD_OFFICER, DISCLAIMER, LAWYERS: Object.keys(LAWYER_FILES) };
