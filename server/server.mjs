// 카드뉴스 생성기 웹 서버.
// 어떤 기기(폰/PC)에서든 접속해 "생성" 버튼을 누르면 초안 1건을 만든다.
// 발행은 하지 않는다 — 산출물은 검수용이고, 인스타 업로드는 사람이 한다.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "node:fs";
import { runPipeline } from "./lib/pipeline.mjs";
import { queueStatus, draftsList, setReview, patchDraft } from "./lib/state.mjs";
import { DATA_DIR, DRAFTS_DIR } from "./lib/paths.mjs";
import * as gdrive from "./lib/gdrive.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "2mb" }));

// 정적: UI, 생성된 PNG(초안)
app.use(express.static(path.join(HERE, "public")));
app.use("/drafts", express.static(DRAFTS_DIR));

// drafts/ 하위 경로만 허용(경로 이탈 방지). dir 는 DATA_DIR 기준 상대경로.
function safeDraftDir(rel) {
  const p = path.resolve(DATA_DIR, rel);
  if (p !== DRAFTS_DIR && !p.startsWith(DRAFTS_DIR + path.sep)) return null;
  return p;
}

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
app.get("/api/draft", (req, res) => {
  try {
    const dir = String(req.query.dir || "");
    const abs = safeDraftDir(dir);
    if (!abs || !fs.existsSync(abs)) return res.status(404).json({ ok: false, error: "초안 없음" });
    const read = (f) => (fs.existsSync(path.join(abs, f)) ? fs.readFileSync(path.join(abs, f), "utf8") : "");
    const meta = draftsList().find((d) => d.dir === dir) || {};
    res.json({ ok: true, ...meta, caption: read("caption.txt"), review: read("review.md") });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
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

    let drive = null;
    if (status === "approved" && gdrive.isConfigured()) {
      try {
        const meta = draftsList().find((d) => d.dir === dir) || {};
        const title = meta.category || meta.title || meta.id || "무제";
        const dateStr = String(dir).split("/").pop().split("_")[0]; // drafts/YYYY-MM-DD_id
        const up = await gdrive.uploadDraft({ dirAbs: abs, title, dateStr });
        patchDraft(dir, { driveUrl: up.folderUrl, driveError: null });
        drive = { url: up.folderUrl, uploaded: up.uploaded };
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
// 한 번에 하나만 처리(간단한 잠금)
let busy = false;
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
});
