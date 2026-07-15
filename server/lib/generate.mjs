// 원문/원고 텍스트 → 카드뉴스 10장 슬라이드 문안(JSON)
// claude-opus-4-8 사용. CLAUDE.md 의 절대 규칙을 시스템 프롬프트에 임베드한다.
// 새로운 법적 판단을 만들지 않는다. 요약과 재배치만 한다.

import Anthropic from "@anthropic-ai/sdk";

export const LAWYERS = ["유영규", "김환섭", "홍기웅", "김선호"];

// 원문 상단에서 검토 변호사 이름을 뽑는다. (정규식 우선, LLM 은 보조)
export function extractLawyer(text) {
  const m = String(text || "").match(/(유영규|김환섭|홍기웅|김선호)\s*변호사/);
  return m ? m[1] : null;
}

const SYSTEM = `너는 법무법인 여온의 성공사례 원문 1건을 인스타그램 카드뉴스 10장 초안으로 재구성하는 편집자다.
원문은 이미 소속 변호사의 법률 검토를 마친 글이다. 너의 역할은 요약과 재배치뿐이다. 새로운 법적 판단을 만들지 마라.

절대 규칙(하나라도 어기면 실패):
1. 원문에 없는 사실·수치·법리·판례·통계를 절대 생성하지 마라. 근거를 못 대는 문장은 빼라.
2. 결과를 보장하거나 승소를 단정하는 표현 금지.
3. 다음 단어는 결과물에 하나도 넣지 마라: 승소율, 성공률, 100%, 전승, 무조건, 반드시 이깁, 보장, 확실하게 승소, 최고, 최대, 유일, 1위, 최다, 무죄 보장, 걱정 마세요, 쾌거, 기적.
4. 사건 당사자를 특정할 수 있는 정보(국적·질병·임신 시기·직장·지역 조합)는 최대한 추상화하라. 법리와 전략만 남겨라.
5. 원문의 감정적 수사(쾌거·기적·극적인)는 걷어내라.
6. 모든 문구는 한국어. 영어 라벨(Slide, Hook, CTA, Before, After, Summary, Insight 등) 금지.
7. 검토 변호사 이름은 원문에서 찾은 이름만 사용한다. 넷 중 하나가 아니면 lawyer 를 빈 문자열로 둔다.

10장 구성:
1 도입: 멈추게 하는 한 문장 + 인용 1줄
2 왜 지금 중요한가
3 문제 정의 — 사람들이 멈추는 지점
4 관점 전환 — 당연한 가정을 깬다
5 법리 대비 — 막힌 조문 vs 열린 조문 (원문에 근거한 대비만)
6 핵심 + 사건 결과. 결과 스탯은 원문에 명시된 법원 판단만. 없으면 stats 를 빈 배열로.
7 실무 자료/방법 3가지
8 결정적 관점 — 가장 강한 통찰
9 실행 체크리스트 4개
10 상담 안내(고정, 네가 만들지 않는다)

톤(매우 중요):
- 비법률가(일반인)가 한 번에 이해되는 쉬운 말로 쓴다. 어려운 법률용어는 짧게 풀어준다.
- 딱딱한 문어체(~하다 / ~한다 / ~됐다 / ~이다 / ~된다)를 쓰지 말고, 친근한 구어체(~해요 / ~예요 / ~하죠 / ~할 수 있어요 / ~하셨나요 / ~거든요)로 말 걸듯 쓴다.
- 헤드라인도 가능하면 부드럽게(예: "포기할까" → "포기하기엔 일러요", "정황도 증거가 된다" → "정황도 증거가 돼요").
- 단, 친근하다고 과장·단정·클릭베이트·느낌표 남발을 하면 안 된다(신뢰감이 먼저다).
- 특히 "무조건 · 반드시 · 확실히 · 꼭 이겨요 · 100% · 보장" 같은 단정/과장 표현은 친근한 말투에서도 절대 쓰지 마라(위 3번 금칙어를 다시 확인하라). 대신 "도움이 될 수 있어요 · 방법이 있어요 · 함께 살펴봐요" 처럼 부드럽게.
- 짧고 간결하게, 한 장에 하나의 생각.

★가장 중요: 독자(비법률가)가 이 카드뉴스만 보고도 "무슨 사건이고, 무슨 일이 있었고, 어떻게 해결됐는지"를 이해해야 한다. 글자 수를 줄이려고 내용을 뭉뚱그리거나 추상적으로 흐리지 마라. 간결함보다 "이해됨"이 우선이다. 특히 sub 에는 구체적인 상황·쟁점·결과를 담아라(누가·무엇이 문제였고·어떻게 풀렸는지).

분량(넘치면 디자인이 무너지니 지키되, 위 '이해됨' 원칙을 최우선):
- 헤드라인(h1, cover_h1, cta_h1): 2~3줄, 한 줄당 12자 이내, 줄바꿈은 \\n.
- 강조어(_em): 헤드라인 줄 안에 실제로 들어있는 짧은 단어 하나(2~6자). 없으면 빈 문자열.
- sub: 3~4줄, 한 줄 26자 이내. 사건의 맥락과 결과가 구체적으로 드러나게 충분히 설명(핵심을 빼먹지 말 것).
- kicker: 12자 이내 라벨.
- vs_a/b_title: 22자 이내, desc: 22자 이내.
- stats: label 10자 이내 / value 12자 이내. 원문에 결과가 없으면 stats 는 빈 배열 [].
- cards.title: 18자 이내 / desc: 30자 이내.
- checks: 각 24자 이내의 짧은 명령형 구.
줄바꿈 위치는 의미 단위로 자연스럽게 끊어라(어색한 조사 끊김 금지).

반드시 아래 JSON 스키마 그대로, 그리고 JSON만 출력하라(설명·코드펜스 금지):
{
  "lawyer": "유영규|김환섭|홍기웅|김선호|",
  "category": "예: 가정폭력 · 이혼소송",
  "cover_h1": "헤드라인(줄바꿈 \\n 허용)",
  "cover_h1_em": "강조어 또는 빈 문자열",
  "cover_quote": "인용 1~2줄",
  "s2": {"kicker":"", "h1":"", "h1_em":"", "sub":""},
  "s3": {"kicker":"", "h1":"", "h1_em":"", "sub":""},
  "s4": {"kicker":"", "h1":"", "h1_em":"", "sub":""},
  "s5": {"kicker":"", "h1":"", "h1_em":"", "vs_a_title":"", "vs_a_desc":"", "vs_b_title":"", "vs_b_desc":""},
  "s6": {"kicker":"", "h1":"", "h1_em":"", "sub":"", "stats":[{"label":"","value":""}]},
  "s7": {"kicker":"", "h1":"", "cards":[{"title":"","desc":""},{"title":"","desc":""},{"title":"","desc":""}]},
  "s8": {"kicker":"", "h1":"", "h1_em":"", "sub":""},
  "s9": {"kicker":"", "h1":"", "checks":["","","",""]},
  "cta_h1": "마무리 헤드라인(줄바꿈 \\n)",
  "cta_h1_em": "강조어",
  "caption": "인스타 본문 3~4줄. 친근한 구어체(~해요체)로 말 걸듯. 상담번호 02-318-2981 포함. 과장 금지.",
  "hashtags": ["#해시태그", "8개 이내"],
  "review": [{"slide":1, "text":"슬라이드 문구", "source":"원문에서 근거가 된 문장"}]
}
review 에는 각 슬라이드(1~9)의 핵심 문구가 원문의 어느 문장에서 나왔는지 매핑을 남겨라. 근거 없는 문장은 애초에 쓰지 마라.`;

function stripToJson(text) {
  let t = String(text || "").trim();
  // 코드펜스 제거
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("모델 응답에서 JSON 을 찾지 못했습니다.");
  return JSON.parse(t.slice(start, end + 1));
}

/**
 * 원문/원고 텍스트 → 슬라이드 데이터
 * @param {string} articleText 원문 또는 붙여넣은 원고 전문
 * @param {object} [opts]
 * @param {string} [opts.model] 기본 claude-opus-4-8
 * @param {string} [opts.lawyerHint] 정규식으로 뽑은 변호사 이름(있으면 우선)
 * @returns {Promise<object>} 슬라이드 데이터
 */
export async function generateSlides(articleText, opts = {}) {
  const article = String(articleText || "").trim();
  if (article.length < 120) {
    throw new Error("원문이 너무 짧습니다. 성공사례 본문 전체를 확인하세요.");
  }

  const client = new Anthropic(); // ANTHROPIC_API_KEY 등 환경에서 자격증명 해석
  const model = opts.model || "claude-opus-4-8";
  const lawyerHint = opts.lawyerHint || extractLawyer(article);

  // 재시도(직전 컴플라이언스 실패)면 사유를 강하게 피드백해 같은 실수를 막는다.
  const retryNote = opts.retryReason
    ? `⚠️ 직전 시도가 컴플라이언스(금칙어 등) 검사에서 실패했습니다. 아래 사유에 나온 표현·금칙어를 반드시 빼고, 뜻이 통하는 다른 말로 바꿔 다시 작성하세요:\n${String(opts.retryReason).slice(0, 800)}\n\n`
    : "";
  const userMsg =
    retryNote +
    (lawyerHint ? `검토 변호사(원문에서 확인됨): ${lawyerHint}\n\n` : "") +
    `아래는 여온 홈페이지 성공사례 원문이다. 규칙을 지켜 10장 카드뉴스 문안 JSON 을 만들어라.\n\n---원문---\n${article}\n---원문 끝---`;

  const res = await client.messages.create({
    model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });

  const textOut = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const data = stripToJson(textOut);

  // 변호사 확정: 원문 정규식 우선, 없으면 모델이 뽑은 값, 넷 중 하나여야 함
  // 우선순위: 원문에서 찾은 이름 > 사람이 고른 담당 변호사 > 모델 추출값 > 기본값(김선호).
  // 기본값으로 넣은 경우(lawyerAuto=true)는 검수화면에서 표시하고 편집으로 바꿀 수 있게 한다.
  const DEFAULT_LAWYER = LAWYERS.includes(process.env.DEFAULT_LAWYER) ? process.env.DEFAULT_LAWYER : "김선호";
  const override = LAWYERS.includes(opts.lawyerOverride) ? opts.lawyerOverride : null;
  const found = lawyerHint || override || (LAWYERS.includes(data.lawyer) ? data.lawyer : null);
  data.lawyer = found || DEFAULT_LAWYER;
  data.lawyerAuto = !found;
  return data;
}
