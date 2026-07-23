// 소스(큐/URL/원고) → 카드뉴스 초안 1건.
// 흐름: 소스 해석 → (URL이면) 본문 수집 → 생성 → 빌드 → compliance → render → 산출물 기록.
// 발행은 하지 않는다. compliance 를 통과하지 못하면 렌더로 넘어가지 않는다.

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { generateSlides, extractLawyer, LAWYERS } from "./generate.mjs";
import { buildHtml, cardCountOf } from "./build.mjs";
import * as image from "./image.mjs";
import { backgroundsFromSource } from "./srcimg.mjs";
import * as persist from "./persist.mjs";
import { ROOT, DATA_DIR, DRAFTS_DIR } from "./paths.mjs";
import {
  normalizeUrl,
  manuscriptKey,
  isUsed,
  markUsed,
  nextQueueItem,
  readCalendar,
} from "./state.mjs";

const execFileP = promisify(execFile);
const TODAY = () => new Date().toISOString().slice(0, 10);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// URL 본문 수집 → 사람이 읽는 텍스트만 추출
async function fetchArticle(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      redirect: "follow",
    });
  } catch (e) {
    throw new Error(`URL을 가져오지 못했습니다(${e.message}). 원고를 붙여넣어 주세요.`);
  }
  if (!res.ok) {
    throw new Error(
      `URL 응답 오류(HTTP ${res.status}). 사이트가 자동 수집을 차단할 수 있습니다. 원고를 붙여넣어 주세요.`
    );
  }
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 200) {
    throw new Error("본문을 충분히 추출하지 못했습니다. 원고를 붙여넣어 주세요.");
  }
  // 원문 HTML 도 함께 돌려준다(배경으로 쓸 삽입 이미지 추출용).
  return { text, html };
}

function draftDir(dateStr, id) {
  const dir = path.join(DRAFTS_DIR, `${dateStr}_${id}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeCaption(dir, data) {
  const tags = Array.isArray(data.hashtags) ? data.hashtags.slice(0, 8) : [];
  const body =
    `${(data.caption || "").trim()}\n\n` +
    `상담 문의 02-318-2981 · 법무법인 여온\n` +
    `본 내용은 실제 사건을 바탕으로 한 일반적인 법률 정보이며, 특정 사건의 결과가 동일하게 보장되는 것은 아닙니다.\n\n` +
    tags.map((t) => (t.startsWith("#") ? t : "#" + t)).join(" ") +
    "\n";
  fs.writeFileSync(path.join(dir, "caption.txt"), body);
}

// 편집 가능한 필드만 추려 data 에 반영한다(서버가 받은 patch 를 신뢰하지 않는다).
// 배경(bg)·변호사(lawyer) 등 안전에 민감한 값은 편집 대상이 아니다.
const EDIT_TEXT = ["category", "cover_h1", "cover_h1_em", "cover_quote", "cover_sub", "cta_h1", "cta_h1_em", "caption"];
const EDIT_SLIDES = ["s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"];
const EDIT_SLIDE_TEXT = ["kicker", "h1", "h1_em", "sub", "vs_a_title", "vs_a_desc", "vs_b_title", "vs_b_desc"];

// 카드에 고정 노출되던 라벨류 문구(뱃지·하단 태그 등) 편집 화이트리스트.
// 상담번호·광고책임변호사 표기·면책 문구는 광고 규정상 절대 편집 대상이 아니므로 제외.
const CHROME_KEYS = [
  "coverBadge", "coverTag", "tagS2", "tagS3", "tagS4", "tagS5", "tagS6", "tagS7", "tagS8", "tagS9",
  "statsBadge", "checklistBadge", "ctaLabel", "ctaCaseTag", "ctaPhoneLabel", "ctaPhoneSub",
];

export function applyEditablePatch(data, patch) {
  if (!patch || typeof patch !== "object") return data;
  const str = (v) => String(v ?? "");
  for (const k of EDIT_TEXT) if (k in patch) data[k] = str(patch[k]);
  if (Array.isArray(patch.hashtags)) data.hashtags = patch.hashtags.map(str).slice(0, 8);
  // 검토 변호사 변경(4인 중에서만). 사람이 확정하면 '자동 기본값' 표시를 해제한다.
  if (LAWYERS.includes(patch.lawyer)) {
    data.lawyer = patch.lawyer;
    data.lawyerAuto = false;
  }

  // 카드 공통 문구(뱃지·하단 태그 등). 빈 값이면 기본값으로 되돌린다(60자 제한).
  if (patch.chrome && typeof patch.chrome === "object") {
    data.chrome = data.chrome || {};
    for (const k of CHROME_KEYS) {
      if (!(k in patch.chrome)) continue;
      const v = str(patch.chrome[k]).slice(0, 60).trim();
      if (v) data.chrome[k] = v;
      else delete data.chrome[k];
    }
  }

  // 스타일(현재는 로고 크기). "" 이면 기본값으로 되돌린다.
  if (patch.style && typeof patch.style === "object") {
    data.style = data.style || {};
    if ("logo" in patch.style) {
      const lg = Number(patch.style.logo);
      if (Number.isFinite(lg) && lg >= 30 && lg <= 160) data.style.logo = Math.round(lg);
      else delete data.style.logo;
    }
    if ("textScale" in patch.style) {
      const ts = Number(patch.style.textScale);
      if (Number.isFinite(ts) && ts >= 0.8 && ts <= 1.4) data.style.textScale = ts;
      else delete data.style.textScale;
    }
    // 카드별 글자 크기(cover, s2..s9, sec0..sec7, verdict, cta). 0.6~1.8 배, "" 이면 해제.
    if (patch.style.slideScale && typeof patch.style.slideScale === "object") {
      data.style.slideScale = data.style.slideScale || {};
      const SCALE_KEY = /^(cover|cta|verdict|s[2-9]|sec[0-7])$/;
      for (const [k, raw] of Object.entries(patch.style.slideScale)) {
        if (!SCALE_KEY.test(k)) continue;
        const v = Number(raw);
        if (Number.isFinite(v) && v >= 0.6 && v <= 1.8) data.style.slideScale[k] = v;
        else delete data.style.slideScale[k];
      }
    }
    // 카드별 상하 위치(top|center|bottom). "" 이면 해제(기본 배치).
    if (patch.style.align && typeof patch.style.align === "object") {
      data.style.align = data.style.align || {};
      const ALIGN_KEY = /^(cover|cta|verdict|s[2-9]|sec[0-7])$/;
      for (const [k, v] of Object.entries(patch.style.align)) {
        if (!ALIGN_KEY.test(k)) continue;
        if (["top", "center", "bottom"].includes(v)) data.style.align[k] = v;
        else delete data.style.align[k];
      }
    }
    // 필드별 글자 크기(px). 키는 data-f 와 동일(category, cover_h1, cover_h1_em, s2.h1, s6.stats.0.value ...).
    // 10~240px 범위만 허용. "" 이거나 범위 밖이면 해당 키 해제(기본 크기로 복귀).
    if (patch.style.fontPx && typeof patch.style.fontPx === "object") {
      data.style.fontPx = data.style.fontPx || {};
      const KEY_OK = /^[a-z0-9_.]+$/i;
      for (const [k, raw] of Object.entries(patch.style.fontPx)) {
        if (!KEY_OK.test(k)) continue;
        const v = Number(raw);
        if (Number.isFinite(v) && v >= 10 && v <= 240) data.style.fontPx[k] = Math.round(v);
        else delete data.style.fontPx[k];
      }
    }
  }

  for (const s of EDIT_SLIDES) {
    const p = patch[s];
    if (!p || typeof p !== "object") continue;
    data[s] = data[s] || {};
    for (const f of EDIT_SLIDE_TEXT) if (f in p) data[s][f] = str(p[f]);
    if (Array.isArray(p.stats))
      data[s].stats = p.stats
        .map((x) => ({ label: str(x && x.label), value: str(x && x.value) }))
        .filter((x) => x.label || x.value)
        .slice(0, 3);
    if (Array.isArray(p.cards))
      data[s].cards = p.cards
        .map((x) => ({ title: str(x && x.title), desc: str(x && x.desc) }))
        .filter((x) => x.title || x.desc)
        .slice(0, 3);
    if (Array.isArray(p.checks)) data[s].checks = p.checks.map(str).filter(Boolean).slice(0, 4);
  }

  // 상세 버전: 표지 부제(cover_sub)는 위 EDIT_TEXT 에서 처리됨. 본문 카드(sections) 편집.
  if (data.mode === "detail" && Array.isArray(patch.sections)) {
    data.sections = Array.isArray(data.sections) ? data.sections : [];
    patch.sections.forEach((ps, i) => {
      if (!ps || typeof ps !== "object") return;
      data.sections[i] = data.sections[i] || {};
      for (const f of ["h1", "h1_em", "lead", "body"]) if (f in ps) data.sections[i][f] = str(ps[f]);
    });
  }

  // 카드별 이미지 빼기/넣기. key: cover,s2..s9,sec0..sec7,cta.
  //  "none"=이미지 제거(메쉬), data:URI=그 이미지 사용, ""=기본으로 복귀.
  if (patch.cardImg && typeof patch.cardImg === "object") {
    data.cardImg = data.cardImg || {};
    const KEY = /^(cover|cta|s[2-9]|sec[0-7])$/;
    for (const [k, v] of Object.entries(patch.cardImg)) {
      if (!KEY.test(k)) continue;
      if (v === "none") data.cardImg[k] = "none";
      else if (typeof v === "string" && /^data:image\/(png|jpe?g|webp);base64,/i.test(v)) data.cardImg[k] = v;
      else delete data.cardImg[k];
    }
  }
  return data;
}

// index.html 을 쓰고 compliance 만 검사한다(렌더 없이). 재생성 판단용.
async function buildAndCheck(dir, data) {
  const indexPath = path.join(dir, "index.html");
  fs.writeFileSync(indexPath, buildHtml(data));
  try {
    await execFileP("node", ["scripts/compliance.mjs", indexPath], { cwd: ROOT });
    return { ok: true, out: "" };
  } catch (e) {
    return { ok: false, out: ((e.stdout || "") + (e.stderr || "")).trim() };
  }
}

// 슬라이드 데이터 → index.html + compliance 게이트 + PNG 10장 + caption.txt + data.json.
// 최초 생성과 편집(재렌더)에서 공통으로 쓴다. compliance 실패 시 렌더로 넘어가지 않는다.
export async function renderDraft(dir, data) {
  const indexPath = path.join(dir, "index.html");
  fs.writeFileSync(indexPath, buildHtml(data));

  try {
    await execFileP("node", ["scripts/compliance.mjs", indexPath], { cwd: ROOT });
  } catch (e) {
    const out = (e.stdout || "") + (e.stderr || "");
    const err = new Error("컴플라이언스 검사 실패로 초안을 폐기했습니다.\n" + out.trim());
    err.code = "COMPLIANCE_FAILED";
    throw err;
  }

  await execFileP("node", ["scripts/render.mjs", dir], { cwd: ROOT, env: process.env });

  writeCaption(dir, data);
  // 편집용 원본 데이터(배경 포함) 저장 — 나중에 편집 시 같은 배경으로 재빌드한다.
  fs.writeFileSync(path.join(dir, "data.json"), JSON.stringify(data));
}

function writeReview(dir, data, meta) {
  const rows = Array.isArray(data.review) ? data.review : [];
  let md = `# 검수 체크리스트 — ${meta.label}\n\n`;
  md += `- 검토 변호사: **${data.lawyer} 변호사**\n`;
  md += `- 소스: ${meta.source}\n`;
  md += `- 생성 시각: ${new Date().toISOString()}\n\n`;
  md += `> 발행 전 각 문구의 "원문 근거"를 확인하세요. 근거가 비어 있으면 그 문장은 빼야 합니다.\n\n`;
  md += `| 장 | 카드뉴스 문구 | 원문 근거 |\n|---|---|---|\n`;
  for (const r of rows) {
    const text = String(r.text || "").replace(/\n/g, " ").replace(/\|/g, "\\|");
    const src = String(r.source || "").replace(/\n/g, " ").replace(/\|/g, "\\|");
    md += `| ${r.slide ?? ""} | ${text} | ${src} |\n`;
  }
  md += `\n## 고정 요소 확인\n`;
  md += `- [ ] 상담 번호 02-318-2981\n- [ ] 광고책임변호사 유영규 표기\n- [ ] 면책 문구\n`;
  md += `- [ ] 검토 변호사 실명 + 실사진\n- [ ] 금칙어 없음(compliance 통과)\n`;
  md += `- [ ] 발행은 담당/광고책임 변호사 승인 후 사람이 직접\n`;
  fs.writeFileSync(path.join(dir, "review.md"), md);
}

/**
 * 초안 1건 생성.
 * @param {object} input
 * @param {"queue"|"url"|"manuscript"} input.type
 * @param {string} [input.url]
 * @param {string} [input.manuscript]
 * @returns {Promise<object>} { dir, relDir, id, date, lawyer, cards, caption, review, source }
 */
export async function runPipeline(input) {
  let articleText;
  let articleHtml = null; // 원문 HTML(있으면 배경 이미지 추출에 사용)
  let key;
  let id;
  let dateStr = TODAY();
  let source;
  let urlForRecord = null;
  let title = null;
  // 버전(SNS/상세)을 중복키·초안 id 에 반영 → 같은 URL 을 두 버전으로 각각 만들 수 있다.
  const mode = input.mode === "detail" ? "detail" : "sns";

  if (input.type === "queue") {
    const item = nextQueueItem();
    if (!item) {
      const err = new Error("예약된 18개 URL을 모두 사용했습니다. 새로운 URL 또는 원고를 첨부하세요.");
      err.code = "QUEUE_EXHAUSTED";
      throw err;
    }
    key = normalizeUrl(item.url) + "_" + mode;
    id = String(item.id) + "-" + mode;
    dateStr = item.date || dateStr;
    urlForRecord = item.url;
    source = `큐 #${item.id} · ${item.url}`;
    title = `성공사례 ${item.id}`;
    ({ text: articleText, html: articleHtml } = await fetchArticle(item.url));
  } else if (input.type === "url") {
    const url = String(input.url || "").trim();
    if (!url) throw new Error("URL이 비어 있습니다.");
    key = normalizeUrl(url) + "_" + mode;
    if (isUsed(key)) {
      const err = new Error("이미 이 버전으로 만든 URL입니다. (같은 URL이라도 SNS·보험용은 각각 한 번씩 가능)");
      err.code = "ALREADY_USED";
      throw err;
    }
    urlForRecord = url;
    const tail = (url.match(/(\d+)\/?$/) || [])[1];
    id = (tail || "url" + Date.now().toString().slice(-6)) + "-" + mode;
    source = url;
    title = tail ? `성공사례 ${tail}` : "직접 첨부 URL";
    ({ text: articleText, html: articleHtml } = await fetchArticle(url));
  } else if (input.type === "manuscript") {
    articleText = String(input.manuscript || "").trim();
    if (!articleText) throw new Error("원고가 비어 있습니다.");
    const base = manuscriptKey(articleText);
    key = base + "_" + mode;
    if (isUsed(key)) {
      const err = new Error("이미 이 버전으로 만든 원고입니다. (같은 글이라도 SNS·보험용은 각각 한 번씩 가능)");
      err.code = "ALREADY_USED";
      throw err;
    }
    id = "ms" + base.slice(3, 9) + "-" + mode;
    source = "직접 첨부 원고";
    title = "직접 첨부 원고";
  } else {
    throw new Error("알 수 없는 소스 유형입니다.");
  }

  // 생성 + 컴플라이언스(금칙어 등). 실패하면 사유를 피드백해 최대 1회 자동 재생성한다.
  const lawyerHint = extractLawyer(articleText);
  const dir = draftDir(dateStr, id);
  let data;
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    data = await generateSlides(articleText, { lawyerHint, retryReason: lastErr, lawyerOverride: input.lawyer, mode });
    const chk = await buildAndCheck(dir, data); // 배경 없이 문안만 검사(배경은 검사에 영향 없음)
    if (chk.ok) {
      lastErr = null;
      break;
    }
    lastErr = chk.out;
    console.error(`[compliance] ${attempt}차 실패, 재생성 시도:`, chk.out.replace(/\s+/g, " ").slice(0, 160));
    if (attempt === 2) {
      const err = new Error("컴플라이언스 검사 실패로 초안을 폐기했습니다.\n" + chk.out);
      err.code = "COMPLIANCE_FAILED";
      throw err;
    }
  }

  // 배경(텍스트 확정 후): 카드마다 서로 다른 이미지 1장씩.
  //  1) 원문 사진(문서=판결문 제외, 내용중복 없음)  2) 빈 칸은 AI 이미지  3) 그래도 없으면 카드별 CSS 메쉬
  // 배경이 필요한 '슬롯 번호' 목록을 모드에 맞게 계산(판결문 카드는 자체 배경이라 제외).
  const secN = data.mode === "detail" && Array.isArray(data.sections) ? Math.min(8, data.sections.length) : 0;
  let slots;
  let themeFor;
  if (data.mode === "detail") {
    const ctaN = 1 + secN + (data.verdict && data.verdict.uri ? 1 : 0) + 1;
    slots = [];
    for (let k = 1; k <= 1 + secN; k++) slots.push(k); // 표지 + 본문 카드
    slots.push(ctaN); // 상담 카드
    themeFor = (s) => {
      if (s === 1 || s === ctaN) return data.category || "법률";
      const sec = data.sections[s - 2];
      return (sec && (sec.h1 || sec.lead)) || data.category || "법률";
    };
  } else {
    slots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // SNS: 상담 카드는 B[10] 고정
    const kick = { 2: data.s2, 3: data.s3, 4: data.s4, 5: data.s5, 6: data.s6, 7: data.s7, 8: data.s8, 9: data.s9 };
    themeFor = (n) => (n === 1 || n === 10 ? data.category : (kick[n] && kick[n].kicker) || data.category) || "법률";
  }

  const bg = {};
  // 슬롯별 출처(src=원문 실사진 | ai=AI 생성). AI 이미지는 텍스트를 요청하지 않아도
  // 모델이 알아볼 수 없는 글자 비슷한 낙서(할루시네이션)를 그려 넣는 경우가 있어,
  // 원문 사진과 달리 항상 흐리게 처리해 그런 글자가 또렷이 보이는 일을 막는다(build.mjs 참고).
  const bgOrigin = {};
  if (articleHtml && urlForRecord) {
    try {
      const map = await backgroundsFromSource(articleHtml, urlForRecord, { cap: slots.length });
      const uris = Object.keys(map).map((k) => Number(k)).sort((a, b) => a - b).map((k) => map[k]);
      slots.forEach((s, idx) => { if (uris[idx]) { bg[s] = uris[idx]; bgOrigin[s] = "src"; } }); // 원문 사진을 슬롯에 유일 배정
    } catch (e) {
      console.error("[srcimg] 원문 이미지 배경 건너뜀:", e.message);
    }
  }
  // 빈 칸을 AI 이미지로 채운다(제공자 설정 시, CARDNEWS_FILL=off 로 끌 수 있음).
  if (image.canGenerate() && process.env.CARDNEWS_FILL !== "off") {
    const need = slots.filter((s) => !bg[s]);
    if (need.length) {
      try {
        let logged = false;
        const gen = await Promise.all(
          need.map((s) =>
            image.generateImage(image.backgroundPrompt(themeFor(s))).catch((e) => {
              if (!logged) {
                console.error("[image] 배경 생성 실패(사유):", e.message);
                logged = true;
              }
              return null;
            })
          )
        );
        need.forEach((s, i) => { if (gen[i]) { bg[s] = gen[i]; bgOrigin[s] = "ai"; } });
      } catch (e) {
        console.error("[image] AI 빈칸 채움 실패:", e.message);
      }
    }
  }
  if (Object.keys(bg).length) {
    data.bg = bg;
    data.bgOrigin = bgOrigin; // 슬롯별 출처 — build.mjs 가 AI 이미지만 골라 흐리게 처리한다.
  }

  // 최종 빌드 → compliance(재확인) → 렌더 → caption/data.json
  await renderDraft(dir, data);

  // review.md (근거 매핑) — 최초 생성 때만 만든다.
  writeReview(dir, data, { label: `${dateStr}_${id}`, source });

  // 사용 이력 기록 (중복 방지). category 는 드라이브 하위폴더 '제목'으로 쓰인다.
  // relDir 는 DATA_DIR 기준 상대경로("drafts/<name>") → URL(/drafts/...)과 일치.
  const relDir = path.relative(DATA_DIR, dir).split(path.sep).join("/");

  const cardCount = cardCountOf(data);
  markUsed({
    key,
    url: urlForRecord,
    title,
    category: data.category || title,
    lawyer: data.lawyer,
    lawyerAuto: Boolean(data.lawyerAuto),
    dir: relDir,
    cardCount,
  });

  // 드라이브 영구 백업(설정된 경우). 실패해도 초안은 이미 만들어졌으므로 계속 진행.
  await persist.backupDraft(relDir);

  const cards = Array.from({ length: cardCount }, (_, i) => `${relDir}/card_${String(i + 1).padStart(2, "0")}.png`);
  return {
    dir,
    relDir,
    id,
    date: dateStr,
    lawyer: data.lawyer,
    cards,
    caption: fs.readFileSync(path.join(dir, "caption.txt"), "utf8"),
    review: fs.readFileSync(path.join(dir, "review.md"), "utf8"),
    source,
  };
}
