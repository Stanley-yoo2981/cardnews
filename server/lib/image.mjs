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

// 단일 이미지 생성 → base64 data URI. (OpenAI)
export async function generateImage(prompt) {
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
