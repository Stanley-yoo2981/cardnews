// 카드뉴스 생성기 웹 서버.
// 어떤 기기(폰/PC)에서든 접속해 "생성" 버튼을 누르면 초안 1건을 만든다.
// 발행은 하지 않는다 — 산출물은 검수용이고, 인스타 업로드는 사람이 한다.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "node:fs";
import { runPipeline, renderDraft, applyEditablePatch } from "./lib/pipeline.mjs";
import { cardCountOf } from "./lib/build.mjs";
import { queueStatus, draftsList, setReview, patchDraft } from "./lib/state.mjs";
import { DATA_DIR, DRAFTS_DIR } from "./lib/paths.mjs";
import * as persist from "./lib/persist.mjs";
import * as imageGen from "./lib/image.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "24mb" })); // 판결문 이미지 업로드(base64) 여유

// 정적: UI, 생성된 PNG(초안)
app.use(express.static(path.join(HERE, "public")));
app.use("/drafts", express.static(DRAFTS_DIR));

// drafts/ 하위 경로만 허용(경로 이탈 방지). dir 는 DATA_DIR 기준 상대경로.
function safeDraftDir(rel) {
  const p = path.resolve(DATA_DIR, rel);
  if (p !== DRAFTS_DIR && !p.startsWith(DRAFTS_DIR + path.sep)) return null;
  return p;
}

// 생성/편집은 한 번에 하나만 처리(간단한 잠금). CPU·메모리를 크게 쓰는 렌더를 보호한다.
let busy = false;

// 현재 상태(다음 회차 / 소진 여부 / 사용 이력)
app.get("/api/status", (_req, res) => {
  try {
    res.json({ ok: true, ...queueStatus() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 검수함: 초안 목록(대기/승인/반려)
app.get("/api/drafts", (_req, res) => {
  try {
    res.json({ ok: true, drafts: draftsList() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 초안 상세: caption / review 본문
app.get("/api/draft", async (req, res) => {
  try {
    const dir = String(req.query.dir || "");
    const abs = safeDraftDir(dir);
    if (!abs) return res.status(400).json({ ok: false, error: "잘못된 경로" });
    // 재시작으로 로컬 파일이 사라졌으면 드라이브에서 복원(이미지·본문·편집원본).
    try { await persist.ensureDraftLocal(dir); } catch (e) { console.error("[persist]", e.message); }
    if (!fs.existsSync(abs)) return res.status(404).json({ ok: false, error: "초안 없음" });
    const read = (f) => (fs.existsSync(path.join(abs, f)) ? fs.readFileSync(path.join(abs, f), "utf8") : "");
    const meta = draftsList().find((d) => d.dir === dir) || {};
    res.json({ ok: true, ...meta, caption: read("caption.txt"), review: read("review.md") });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 편집용 슬라이드 데이터(대용량 배경 bg 는 제외하고 문안만) 조회
app.get("/api/draft-data", async (req, res) => {
  try {
    const dir = String(req.query.dir || "");
    const abs = safeDraftDir(dir);
    if (!abs) return res.status(400).json({ ok: false, error: "잘못된 경로" });
    try { await persist.ensureDraftLocal(dir); } catch (e) { console.error("[persist]", e.message); }
    const dataPath = path.join(abs, "data.json");
    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({ ok: false, error: "이 초안에는 편집 데이터가 없습니다(구버전). 다시 생성하면 편집할 수 있습니다." });
    }
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    const { bg, ...rest } = data;
    res.json({ ok: true, data: rest, hasBg: Boolean(bg) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 편집 저장 + 재렌더: { dir, patch }. 문안만 바꾸고 배경은 그대로 유지한다.
// 편집 후에는 재검수가 필요하므로 상태를 '검수 대기'로 되돌린다.
app.post("/api/edit", async (req, res) => {
  if (busy) {
    return res.status(409).json({ ok: false, error: "다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요." });
  }
  busy = true;
  try {
    const { dir, patch } = req.body || {};
    const abs = safeDraftDir(String(dir || ""));
    if (!abs) throw new Error("편집할 초안을 찾지 못했습니다.");
    // 재시작으로 편집원본이 사라졌으면 드라이브에서 복원.
    try { await persist.ensureDraftLocal(dir); } catch (e) { console.error("[persist]", e.message); }
    const dataPath = path.join(abs, "data.json");
    if (!fs.existsSync(dataPath)) throw new Error("편집할 초안을 찾지 못했습니다.");
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    applyEditablePatch(data, patch);
    await renderDraft(abs, data); // compliance 재검사 포함 — 통과 못 하면 여기서 실패
    patchDraft(dir, { status: "pending" }); // 편집했으니 다시 검수 대기로

    const cardCount = cardCountOf(data);
    patchDraft(dir, { cardCount, lawyer: data.lawyer, lawyerAuto: Boolean(data.lawyerAuto) });
    // 편집 결과를 드라이브에 다시 백업(이미지·편집원본·목록).
    await persist.backupDraft(dir);

    const relCards = Array.from({ length: cardCount }, (_, i) => `${dir}/card_${String(i + 1).padStart(2, "0")}.png`);
    res.json({ ok: true, cards: relCards, caption: fs.readFileSync(path.join(abs, "caption.txt"), "utf8") });
  } catch (e) {
    res.status(400).json({ ok: false, code: e.code || "ERROR", error: e.message });
  } finally {
    busy = false;
  }
});

// 판결문 카드: { dir, image(dataURI) } 첨부 | { dir, generate:true } 어울리는 이미지 생성 | { dir, remove:true } 제거
app.post("/api/verdict", async (req, res) => {
  if (busy) {
    return res.status(409).json({ ok: false, error: "다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요." });
  }
  busy = true;
  try {
    const { dir, image, generate, remove } = req.body || {};
    const abs = safeDraftDir(String(dir || ""));
    if (!abs) throw new Error("초안을 찾지 못했습니다.");
    try { await persist.ensureDraftLocal(dir); } catch (e) { console.error("[persist]", e.message); }
    const dataPath = path.join(abs, "data.json");
    if (!fs.existsSync(dataPath)) throw new Error("이 초안은 편집 데이터가 없습니다(구버전). 다시 생성해 주세요.");
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

    if (remove) {
      delete data.verdict;
    } else if (image) {
      if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(String(image))) {
        throw new Error("이미지 형식이 올바르지 않습니다(PNG·JPG·WEBP).");
      }
      data.verdict = { uri: String(image), kind: "doc" };
    } else if (generate) {
      if (!imageGen.canGenerate()) {
        throw new Error("이미지 생성 제공자가 없습니다. 무료: IMAGE_PROVIDER=cloudflare(+CF_ACCOUNT_ID/CF_API_TOKEN), 유료: OPENAI_API_KEY.");
      }
      const uri = await imageGen.generateImage(imageGen.backgroundPrompt(data.category || "법률 성공사례"));
      data.verdict = { uri, kind: "ai" };
    } else {
      throw new Error("요청 내용이 비어 있습니다.");
    }

    await renderDraft(abs, data); // 판결문 카드 포함해 재렌더 + compliance 재확인
    const cardCount = cardCountOf(data);
    patchDraft(dir, { status: "pending", cardCount });
    await persist.backupDraft(dir);

    const relCards = Array.from({ length: cardCount }, (_, i) => `${dir}/card_${String(i + 1).padStart(2, "0")}.png`);
    res.json({ ok: true, cards: relCards, kind: data.verdict ? data.verdict.kind : null });
  } catch (e) {
    res.status(400).json({ ok: false, code: e.code || "ERROR", error: e.message });
  } finally {
    busy = false;
  }
});

// 검수 결과 기록: { dir, status: approved|rejected|pending, reviewer, memo }
// 승인(=완성)되면 구글 드라이브에 업로드한다(설정된 경우에만).
app.post("/api/review", async (req, res) => {
  try {
    const { dir, status, reviewer, memo } = req.body || {};
    const abs = safeDraftDir(String(dir || ""));
    if (!abs) return res.status(400).json({ ok: false, error: "잘못된 경로" });
    const e = setReview({ dir, status, reviewer, memo });

    // 검수 결과를 드라이브에 반영. 승인 시 최신본 폴더를 다시 백업하고 링크를 얻는다.
    let drive = null;
    if (persist.isOn()) {
      try {
        try { await persist.ensureDraftLocal(dir); } catch (e2) { console.error("[persist]", e2.message); }
        if (status === "approved") {
          const up = await persist.archiveDraft(dir);
          if (up) {
            patchDraft(dir, { driveUrl: up.folderUrl, driveError: null });
            drive = { url: up.folderUrl, uploaded: up.uploaded };
          }
        }
        await persist.backupIndex(); // 상태 변경(대기/승인/반려)을 목록에 저장
      } catch (err) {
        patchDraft(dir, { driveError: err.message });
        drive = { error: err.message };
      }
    }
    res.json({ ok: true, status: e.status, reviewer: e.reviewer, memo: e.memo, reviewedAt: e.reviewedAt, drive });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// 생성: { type: "queue" } | { type:"url", url } | { type:"manuscript", manuscript }
app.post("/api/generate", async (req, res) => {
  if (busy) {
    return res.status(409).json({ ok: false, error: "다른 생성이 진행 중입니다. 잠시 후 다시 시도하세요." });
  }
  // 선택적 생성 잠금: GENERATE_PIN 이 설정돼 있으면 그 값을 요구한다(기본 꺼짐).
  // 열람·검수는 항상 공개, 비용이 드는 "생성"만 필요 시 잠글 수 있다.
  if (process.env.GENERATE_PIN && String((req.body || {}).pin || "") !== process.env.GENERATE_PIN) {
    return res.status(401).json({ ok: false, code: "PIN_REQUIRED", error: "생성 PIN이 필요합니다." });
  }
  busy = true;
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY 가 설정되지 않았습니다. 서버 환경변수에 키를 넣고 다시 시도하세요.");
    }
    const result = await runPipeline(req.body || {});
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ ok: false, code: e.code || "ERROR", error: e.message });
  } finally {
    busy = false;
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`카드뉴스 생성기: http://0.0.0.0:${PORT}  (같은 네트워크의 폰/PC에서 접속 가능)`);
  // 재시작으로 로컬이 비었으면 드라이브에서 검수함 목록을 복원(설정된 경우).
  persist
    .restoreOnBoot()
    .then((r) => {
      if (r.restored) console.log(`[persist] 드라이브에서 검수함 ${r.restored}건 복원 완료`);
    })
    .catch((e) => console.error("[persist] 부팅 복원 실패:", e.message));
});
