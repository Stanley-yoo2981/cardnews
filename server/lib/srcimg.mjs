// 원문 URL 안에 삽입된 이미지를 배경 후보로 수집한다.
//
// 카드뉴스 배경은 강하게 블러(build.mjs 의 .bg.src) 처리되므로, 원문 사진의
// 세부(인물 얼굴·글자 등)는 사실상 식별되지 않는 추상 질감으로만 남는다.
// 그래도 로고·아이콘·프로필·배너 같은 것은 배경으로 부적절하므로 걸러낸다.
//
// 실패/미발견 시: 빈 배열/빈 맵을 돌려 파이프라인이 CSS 메쉬로 폴백하게 한다(무해).

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// 배경으로 부적절한 이미지(로고·아이콘·프로필·배너·추적픽셀 등) 키워드
const BAD = /logo|icon|sprite|favicon|blank|spacer|pixel|avatar|profile|thumb_s|badge|emoji|button|btn|share|sns|kakao|naver|banner|footer|header_|watermark|loading|dummy/i;

// 문서 이미지(판결문·약식명령·결정문 등)는 배경으로 쓰지 않는다.
// 판결문은 검수화면의 '판결문' 버튼으로 전용 카드에만 들어가야 한다.
const DOC = /판결|판결문|약식|명령|결정문|선고|등본|정본|조서|공소장|소장|verdict|judg?ment|_doc|document/i;

// 배경으로 쓸 만한 래스터 이미지 확장자만(svg/gif 제외 — 아이콘·애니 비중이 큼)
const OKEXT = /\.(jpe?g|png|webp)(\?|#|$)/i;

const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * HTML 에서 배경 후보 이미지 URL 을 문서 순서대로 추출한다(절대경로로 변환).
 * @param {string} html 원문 HTML
 * @param {string} baseUrl 상대경로 해석 기준 URL
 * @returns {string[]} 후보 이미지 절대 URL(중복 제거)
 */
export function extractImages(html, baseUrl) {
  const src = String(html || "");
  const out = [];
  const seen = new Set();

  const push = (raw, ctx) => {
    if (!raw) return;
    let u = String(raw).trim().replace(/&amp;/g, "&");
    if (!u || u.startsWith("data:")) return;
    let abs;
    try {
      abs = new URL(u, baseUrl).href;
    } catch {
      return;
    }
    if (!/^https?:/i.test(abs)) return;
    if (!OKEXT.test(abs)) return;
    if (BAD.test(abs)) return;
    // 판결문 등 문서 이미지는 배경에서 제외(파일명·alt 를 디코드해 검사)
    const hay = safeDecode(abs) + " " + (ctx || "");
    if (DOC.test(hay)) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  };

  // <img src>, data-src, data-original (지연로딩), 그리고 srcset 의 첫 후보
  const imgTags = src.match(/<img\b[^>]*>/gi) || [];
  for (const tag of imgTags) {
    const alt = (tag.match(/\balt\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
    const lazy =
      (tag.match(/\bdata-(?:src|original|lazy-src)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const plain = (tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
    const srcset = (tag.match(/\bsrcset\s*=\s*["']([^"']+)["']/i) || [])[1];
    push(lazy, alt);
    push(plain, alt);
    if (srcset) push(srcset.split(",").pop().trim().split(/\s+/)[0], alt);
  }

  // og:image (대표 이미지) — 있으면 앞쪽 우선순위로
  const og = (src.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || [])[1];
  if (og) {
    try {
      const abs = new URL(og.replace(/&amp;/g, "&"), baseUrl).href;
      if (OKEXT.test(abs) && !BAD.test(abs) && !seen.has(abs)) {
        seen.add(abs);
        out.unshift(abs);
      }
    } catch {
      /* 무시 */
    }
  }

  return out;
}

// 단일 이미지 다운로드 → base64 data URI. 너무 작거나(아이콘) 이미지가 아니면 null.
async function fetchOne(url, referer) {
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8", Referer: referer || url },
      redirect: "follow",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/") || ct.includes("svg")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  // 15KB 미만은 아이콘/썸네일일 가능성이 큼 / 6MB 초과는 과대(스킵)
  if (buf.length < 15 * 1024 || buf.length > 6 * 1024 * 1024) return null;
  const mime = ct.split(";")[0].trim();
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * 후보 URL 목록에서 유효 이미지를 최대 cap 개 받아 data URI 배열로 돌려준다.
 * @param {string[]} urls 후보 이미지 URL
 * @param {object} [opts]
 * @param {number} [opts.cap=4] 최대 개수
 * @param {string} [opts.referer] Referer 헤더(핫링크 차단 완화)
 * @returns {Promise<string[]>} data URI 배열
 */
export async function fetchImages(urls, opts = {}) {
  const cap = Math.max(1, Math.min(12, opts.cap || 10));
  // 실패에 대비해 여유분까지 '병렬'로 받는다(순차보다 훨씬 빠름). 순서는 유지.
  const tryList = urls.slice(0, cap + 6);
  const results = await Promise.all(tryList.map((u) => fetchOne(u, opts.referer)));
  const out = [];
  for (const uri of results) {
    if (uri) out.push(uri);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * 원문 HTML → 슬라이드별 배경 맵 { 1: dataUri, ... }.
 * 소수 이미지를 받아 슬라이드에 순환 배치한다. 없으면 빈 맵.
 * @param {string} html 원문 HTML
 * @param {string} baseUrl 기준 URL
 * @param {object} [opts] { cap }
 * @returns {Promise<Record<number,string>>}
 */
export async function backgroundsFromSource(html, baseUrl, opts = {}) {
  const urls = extractImages(html, baseUrl);
  if (!urls.length) return {};
  const imgs = await fetchImages(urls, { cap: opts.cap || 10, referer: baseUrl });
  if (!imgs.length) return {};
  // 슬라이드마다 '서로 다른' 이미지 1장씩(중복 금지). 이미지가 모자란 칸은
  // 배정하지 않아 build.mjs 가 CSS 배경으로 채운다(같은 이미지 반복 방지).
  const map = {};
  for (let n = 1; n <= 10 && n <= imgs.length; n++) map[n] = imgs[n - 1];
  return map;
}
