// 사용 이력(URL/원고 중복 방지)과 발행 큐 상태.
// state/used.json 에 한번 생성한 소스를 기록한다. 같은 URL·원고는 재사용 불가.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, STATE_DIR } from "./paths.mjs";

const USED_FILE = path.join(STATE_DIR, "used.json");
const CALENDAR = path.join(ROOT, "calendar.json");

function ensure() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  if (!fs.existsSync(USED_FILE)) fs.writeFileSync(USED_FILE, JSON.stringify({ used: [] }, null, 2));
}

// URL 정규화: 뒤 슬래시·프로토콜·대소문자 차이를 흡수해 같은 글을 같은 키로.
export function normalizeUrl(url) {
  try {
    const u = new URL(String(url).trim());
    let key = (u.host + u.pathname).toLowerCase().replace(/\/+$/, "");
    return key;
  } catch {
    return String(url || "").trim().toLowerCase().replace(/\/+$/, "");
  }
}

export function manuscriptKey(text) {
  const norm = String(text || "").replace(/\s+/g, " ").trim();
  return "ms:" + crypto.createHash("sha256").update(norm).digest("hex").slice(0, 16);
}

export function readUsed() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(USED_FILE, "utf8"));
  } catch {
    return { used: [] };
  }
}

export function isUsed(key) {
  return readUsed().used.some((u) => u.key === key);
}

// 사용 이력 전체를 통째로 덮어쓴다(드라이브에서 검수함을 복원할 때 사용).
export function overwriteUsed(state) {
  ensure();
  const safe = state && Array.isArray(state.used) ? state : { used: [] };
  fs.writeFileSync(USED_FILE, JSON.stringify(safe, null, 2));
  return safe;
}

export function markUsed(entry) {
  ensure();
  const state = readUsed();
  if (!state.used.some((u) => u.key === entry.key)) {
    state.used.push({ ...entry, at: new Date().toISOString() });
    fs.writeFileSync(USED_FILE, JSON.stringify(state, null, 2));
  }
  return state;
}

export function readCalendar() {
  return JSON.parse(fs.readFileSync(CALENDAR, "utf8"));
}

// 아직 사용하지 않은 큐 항목 중 date 가 가장 이른 것.
export function nextQueueItem() {
  const cal = readCalendar();
  const usedKeys = new Set(readUsed().used.map((u) => u.key));
  const pending = (cal.queue || [])
    .filter((q) => !usedKeys.has(normalizeUrl(q.url)))
    .sort((a, b) => a.date.localeCompare(b.date));
  return pending[0] || null;
}

// 화면 상태: 큐에 남은 게 있으면 next, 없으면 소진 안내.
export function queueStatus() {
  const cal = readCalendar();
  const usedKeys = new Set(readUsed().used.map((u) => u.key));
  const total = (cal.queue || []).length;
  const remaining = (cal.queue || []).filter((q) => !usedKeys.has(normalizeUrl(q.url))).length;
  const next = nextQueueItem();
  return {
    brand: cal.brand,
    total,
    remaining,
    exhausted: remaining === 0,
    next: next ? { id: next.id, date: next.date, url: next.url } : null,
    message: remaining === 0 ? "예약된 18개 URL을 모두 사용했습니다. 새로운 URL 또는 원고를 첨부하세요." : null,
    used: readUsed().used.map((u) => ({
      key: u.key,
      url: u.url || null,
      title: u.title || null,
      lawyer: u.lawyer || null,
      dir: u.dir || null,
      at: u.at || null,
    })),
  };
}

// --- 검수함(리뷰) ---
// 각 초안의 검수 상태: pending(대기) | approved(승인) | rejected(반려)
// 계정이 없으므로 검수자 이름은 자유 입력으로 기록한다.

export function draftsList() {
  const used = readUsed().used.filter((u) => u.dir);
  // 최신 생성이 위로
  return used
    .slice()
    .reverse()
    .map((u) => ({
      dir: u.dir,
      id: String(u.dir || "").split("_").pop(),
      lawyer: u.lawyer || null,
      url: u.url || null,
      title: u.title || null,
      at: u.at || null,
      category: u.category || null,
      status: u.status || "pending",
      reviewer: u.reviewer || "",
      memo: u.memo || "",
      reviewedAt: u.reviewedAt || null,
      driveUrl: u.driveUrl || null,
      driveError: u.driveError || null,
      cards: Array.from({ length: 10 }, (_, i) => `${u.dir}/card_${String(i + 1).padStart(2, "0")}.png`),
    }));
}

// 초안 항목에 임의 필드 병합(드라이브 링크 등)
export function patchDraft(dir, patch) {
  ensure();
  const state = readUsed();
  const e = state.used.find((u) => u.dir === dir);
  if (!e) return null;
  Object.assign(e, patch);
  fs.writeFileSync(USED_FILE, JSON.stringify(state, null, 2));
  return e;
}

const VALID_STATUS = new Set(["pending", "approved", "rejected"]);

export function setReview({ dir, status, reviewer, memo }) {
  if (!VALID_STATUS.has(status)) throw new Error("알 수 없는 상태: " + status);
  ensure();
  const state = readUsed();
  const e = state.used.find((u) => u.dir === dir);
  if (!e) throw new Error("초안을 찾을 수 없습니다: " + dir);
  e.status = status;
  e.reviewer = (reviewer || "").slice(0, 40);
  e.memo = (memo || "").slice(0, 500);
  e.reviewedAt = new Date().toISOString();
  fs.writeFileSync(USED_FILE, JSON.stringify(state, null, 2));
  return e;
}
