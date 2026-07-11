// 소스(큐/URL/원고) → 카드뉴스 초안 1건.
// 흐름: 소스 해석 → (URL이면) 본문 수집 → 생성 → 빌드 → compliance → render → 산출물 기록.
// 발행은 하지 않는다. compliance 를 통과하지 못하면 렌더로 넘어가지 않는다.

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { generateSlides, extractLawyer } from "./generate.mjs";
import { buildHtml } from "./build.mjs";
import * as image from "./image.mjs";
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
  return text;
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
  let key;
  let id;
  let dateStr = TODAY();
  let source;
  let urlForRecord = null;
  let title = null;

  if (input.type === "queue") {
    const item = nextQueueItem();
    if (!item) {
      const err = new Error("예약된 18개 URL을 모두 사용했습니다. 새로운 URL 또는 원고를 첨부하세요.");
      err.code = "QUEUE_EXHAUSTED";
      throw err;
    }
    key = normalizeUrl(item.url);
    id = String(item.id);
    dateStr = item.date || dateStr;
    urlForRecord = item.url;
    source = `큐 #${item.id} · ${item.url}`;
    title = `성공사례 ${item.id}`;
    articleText = await fetchArticle(item.url);
  } else if (input.type === "url") {
    const url = String(input.url || "").trim();
    if (!url) throw new Error("URL이 비어 있습니다.");
    key = normalizeUrl(url);
    if (isUsed(key)) {
      const err = new Error("이미 사용한 URL입니다. 한번 사용한 주소는 다시 쓸 수 없습니다.");
      err.code = "ALREADY_USED";
      throw err;
    }
    urlForRecord = url;
    const tail = (url.match(/(\d+)\/?$/) || [])[1];
    id = tail || "url" + Date.now().toString().slice(-6);
    source = url;
    title = tail ? `성공사례 ${tail}` : "직접 첨부 URL";
    articleText = await fetchArticle(url);
  } else if (input.type === "manuscript") {
    articleText = String(input.manuscript || "").trim();
    if (!articleText) throw new Error("원고가 비어 있습니다.");
    key = manuscriptKey(articleText);
    if (isUsed(key)) {
      const err = new Error("이미 사용한 원고입니다. 같은 글은 다시 생성할 수 없습니다.");
      err.code = "ALREADY_USED";
      throw err;
    }
    id = "ms" + key.slice(3, 9);
    source = "직접 첨부 원고";
    title = "직접 첨부 원고";
  } else {
    throw new Error("알 수 없는 소스 유형입니다.");
  }

  // 생성
  const lawyerHint = extractLawyer(articleText);
  const data = await generateSlides(articleText, { lawyerHint });

  // AI 배경 이미지(선택). 실패해도 CSS 배경으로 폴백하고 계속 진행한다.
  if (image.isEnabled()) {
    try {
      data.bg = await image.generateBackgrounds(data);
    } catch (e) {
      console.error("[image] 배경 생성 건너뜀:", e.message);
    }
  }

  // 빌드
  const dir = draftDir(dateStr, id);
  const indexPath = path.join(dir, "index.html");
  fs.writeFileSync(indexPath, buildHtml(data));

  // 컴플라이언스 게이트 (에이전트를 믿지 않고 스크립트로 재검사)
  try {
    await execFileP("node", ["scripts/compliance.mjs", indexPath], { cwd: ROOT });
  } catch (e) {
    const out = (e.stdout || "") + (e.stderr || "");
    const err = new Error("컴플라이언스 검사 실패로 초안을 폐기했습니다.\n" + out.trim());
    err.code = "COMPLIANCE_FAILED";
    throw err;
  }

  // 렌더 (PNG 10장)
  await execFileP("node", ["scripts/render.mjs", dir], { cwd: ROOT, env: process.env });

  // caption / review
  writeCaption(dir, data);
  writeReview(dir, data, { label: `${dateStr}_${id}`, source });

  // 사용 이력 기록 (중복 방지). category 는 드라이브 하위폴더 '제목'으로 쓰인다.
  // relDir 는 DATA_DIR 기준 상대경로("drafts/<name>") → URL(/drafts/...)과 일치.
  const relDir = path.relative(DATA_DIR, dir).split(path.sep).join("/");
  markUsed({
    key,
    url: urlForRecord,
    title,
    category: data.category || title,
    lawyer: data.lawyer,
    dir: relDir,
  });

  const cards = Array.from({ length: 10 }, (_, i) => `${relDir}/card_${String(i + 1).padStart(2, "0")}.png`);
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
