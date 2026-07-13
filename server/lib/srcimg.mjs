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

// 배경으로 쓸 만한 래스터 이미지 확장자만(svg/gif 제외 — 아이콘·애니 비중이 큼)
const OKEXT = /\.(jpe?g|png|webp)(\?|#|$)/i;

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

  const push = (raw) => {
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
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  };

  // <img src>, data-src, data-original (지연로딩), 그리고 srcset 의 첫 후보
  const imgTags = src.match(/<img\b[^>]*>/gi) || [];
  for (const tag of imgTags) {
    const lazy =
      (tag.match(/\bdata-(?:src|original|lazy-src)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const plain = (tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
    const srcset = (tag.match(/\bsrcset\s*=\s*["']([^"']+)["']/i) || [])[1];
    push(lazy);
    push(plain);
    if (srcset) push(srcset.split(",").pop().trim().split(/\s+/)[0]);
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
  const cap = Math.max(1, Math.min(8, opts.cap || 4));
  const out = [];
  for (const u of urls) {
    if (out.length >= cap) break;
    const uri = await fetchOne(u, opts.referer);
    if (uri) out.push(uri);
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
  const imgs = await fetchImages(urls, { cap: opts.cap || 4, referer: baseUrl });
  if (!imgs.length) return {};
  const map = {};
  for (let n = 1; n <= 10; n++) map[n] = imgs[(n - 1) % imgs.length];
  return map;
}
