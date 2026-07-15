// 슬라이드 배경용 AI 이미지 생성 (선택적).
//
// 광고 심의 원칙: 사건을 사실적으로 재현하지 않는다. 인물·얼굴·글자·법정·
// 폭력 묘사 금지. 오직 주제에 맞는 "추상적 분위기 배경"(색·빛·질감)만 만든다.
// 변호사 실사진(10장)은 이 모듈이 건드리지 않는다.
//
// 켜기: 환경변수 CARDNEWS_IMAGES=on  + 제공자 키.
// 기본 제공자: OpenAI 이미지(gpt-image-1). OPENAI_API_KEY 필요.
//   (다른 제공자는 generateImage() 만 교체하면 된다. Anthropic 은 이미지 생성을
//    제공하지 않으므로 외부 제공자가 필요하다.)
//
// 미설정/실패 시: 배경 이미지 없이 기존 CSS 추상 배경으로 폴백한다(무해).

const PROVIDER = process.env.IMAGE_PROVIDER || "openai";

export function isEnabled() {
  if (process.env.CARDNEWS_IMAGES !== "on") return false;
  return canGenerate();
}

// 이미지 생성이 가능한 제공자가 설정돼 있는가.
//  - pollinations: 무료·키 불필요(항상 가능)
//  - openai: OPENAI_API_KEY 필요(유료)
export function canGenerate() {
  if (PROVIDER === "pollinations") return true;
  if (PROVIDER === "cloudflare") return Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN);
  if (PROVIDER === "openai") return Boolean(process.env.OPENAI_API_KEY);
  return false;
}

// 슬라이드 주제 → 추상 배경 프롬프트(심의 안전 가드 포함)
export function backgroundPrompt(theme) {
  const t = String(theme || "법률").replace(/\s+/g, " ").trim().slice(0, 60);
  return (
    `Abstract atmospheric background for a premium Korean law firm card news. ` +
    `Mood/theme: ${t}. ` +
    `Deep navy (#0F1E35) base with subtle warm gold (#C8A560) light, soft gradients, ` +
    `blurred bokeh, elegant minimal texture, cinematic low-key lighting, refined and calm. ` +
    `STRICT: no people, no faces, no hands, no text, no letters, no numbers, no logos, ` +
    `no courtroom, no weapons, no violence, no literal or dramatic scene — purely abstract ` +
    `color, light and texture. Vertical composition, lots of empty dark space for overlaid text.`
  );
}

// OpenAI 이미지 요청 본문(모델별 규격 분기) — 네트워크 없이 테스트 가능한 순수 함수.
// gpt-image-1: 조직 인증 필요, size 1024x1536, quality low|medium|high, 항상 b64 반환.
// dall-e-3: 인증 불필요(폴백), size 1024x1792(세로), quality standard|hd, response_format 필요.
export function openaiImageBody(prompt, model, quality) {
  const m = model || "gpt-image-1";
  const q = quality || "low";
  if (m === "dall-e-3") {
    return {
      model: "dall-e-3",
      prompt,
      size: "1024x1792",
      quality: q === "high" || q === "hd" ? "hd" : "standard",
      style: "natural",
      response_format: "b64_json",
      n: 1,
    };
  }
  // gpt-image-1 (기본)
  return { model: m, prompt, size: "1024x1536", quality: ["low", "medium", "high"].includes(q) ? q : "low", n: 1 };
}

// 무료 이미지 생성(Pollinations.ai) → base64 data URI. 키·결제 불필요.
// 매번 다른 seed 로 서로 다른 이미지를 받는다(반복 방지). 느리거나 실패하면 예외.
async function pollinationsImage(prompt) {
  const p = encodeURIComponent(String(prompt).replace(/\s+/g, " ").trim().slice(0, 700));
  const seed = Math.floor(Math.random() * 1e7);
  const url = `https://image.pollinations.ai/prompt/${p}?width=1024&height=1536&nologo=true&model=flux&seed=${seed}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 50000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`pollinations HTTP ${res.status}`);
    const ct = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!ct.startsWith("image/")) throw new Error("pollinations 응답이 이미지가 아님");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1500) throw new Error("pollinations 이미지가 비어 있음");
    return `data:${ct};base64,${buf.toString("base64")}`;
  } finally {
    clearTimeout(timer);
  }
}

// 무료 이미지 생성(Cloudflare Workers AI) → base64 data URI.
// 무료 티어(하루 1만 뉴런)로 Flux 등 사용. CF_ACCOUNT_ID + CF_API_TOKEN 필요.
async function cloudflareImage(prompt) {
  const acct = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  const model = process.env.IMAGE_MODEL_CF || "@cf/black-forest-labs/flux-1-schnell";
  const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: String(prompt).slice(0, 2000), steps: 6 }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`cloudflare HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const b64 = json && json.result && json.result.image;
  if (!b64) throw new Error("cloudflare 응답에 이미지 없음");
  return `data:image/jpeg;base64,${b64}`;
}

// 단일 이미지 생성 → base64 data URI.
export async function generateImage(prompt) {
  if (PROVIDER === "pollinations") return pollinationsImage(prompt);
  if (PROVIDER === "cloudflare") return cloudflareImage(prompt);
  if (PROVIDER !== "openai") throw new Error(`지원하지 않는 이미지 제공자: ${PROVIDER}`);
  const model = process.env.IMAGE_MODEL || "gpt-image-1";
  const body = openaiImageBody(prompt, model, process.env.IMAGE_QUALITY);
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let hint = "";
    if (res.status === 403 && /verif/i.test(text)) {
      hint = " (gpt-image-1 은 OpenAI 조직 인증이 필요합니다. IMAGE_MODEL=dall-e-3 으로 바꾸면 인증 없이 사용 가능)";
    }
    throw new Error(`이미지 생성 실패 HTTP ${res.status}${hint} ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const b64 = json.data && json.data[0] && json.data[0].b64_json;
  if (!b64) throw new Error("이미지 응답에 b64_json 없음");
  return `data:image/png;base64,${b64}`;
}

// 슬라이드 데이터 → 슬라이드별 배경 이미지 맵 { 1: dataUri, ... }
// IMAGE_COUNT 로 생성 개수를 제한하고 순환 배치할 수 있다(비용 절감).
export async function generateBackgrounds(data) {
  const themes = {
    1: data.category,
    2: data.s2?.kicker,
    3: data.s3?.kicker,
    4: data.s4?.kicker,
    5: data.s5?.kicker,
    6: data.s6?.kicker,
    7: data.s7?.kicker,
    8: data.s8?.kicker,
    9: data.s9?.kicker,
    10: data.category,
  };
  const cap = Math.max(1, Math.min(10, parseInt(process.env.IMAGE_COUNT || "10", 10)));
  const out = {};
  if (cap >= 10) {
    // 슬라이드마다 개별 생성
    for (let n = 1; n <= 10; n++) {
      out[n] = await generateImage(backgroundPrompt(themes[n]));
    }
  } else {
    // 소수만 생성해 순환 배치
    const pool = [];
    const pick = [1, 5, 7, 9, 2, 3, 4, 6, 8, 10].slice(0, cap);
    for (const n of pick) pool.push(await generateImage(backgroundPrompt(themes[n])));
    for (let n = 1; n <= 10; n++) out[n] = pool[(n - 1) % pool.length];
  }
  return out;
}
