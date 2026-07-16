// 드라이브를 "영구 저장소"로 쓰는 오케스트레이션.
//
// 무료 Render 는 재시작하면 로컬 디스크(drafts/·state/)가 사라진다. 그래서
// 생성/편집/검수할 때마다 초안 폴더와 검수함 목록(_index.json)을 드라이브에 올리고,
// 서버가 켜질 때·초안을 열 때 드라이브에서 되살린다. 편집용 원본(data.json)까지
// 함께 백업하므로, 재시작 후에도 편집·재검수·재렌더가 그대로 동작한다.
//
// GDRIVE 자격증명이 없으면 전부 무해하게 건너뛴다(로컬만 사용).

import fs from "node:fs";
import path from "node:path";
import * as gdrive from "./gdrive.mjs";
import { readUsed, overwriteUsed } from "./state.mjs";
import { DATA_DIR } from "./paths.mjs";

const INDEX = "_index.json"; // 검수함 목록(=state/used.json) 드라이브 사본

export function isOn() {
  return gdrive.isConfigured();
}

const absOf = (relDir) => path.resolve(DATA_DIR, relDir);
const folderNameOf = (relDir) => String(relDir).split("/").pop(); // 초안 dir basename

// 드라이브에 올리지 않을 파일(내부 미리보기용). index.html 은 data.json 으로 재생성되므로 제외.
const SKIP_UPLOAD = new Set(["index.html"]);

// 초안 폴더를 드라이브에 백업 — 카드 PNG·썸네일·caption·review + 편집복원용 data.json.
export async function archiveDraft(relDir) {
  if (!isOn()) return null;
  const abs = absOf(relDir);
  const files = fs.existsSync(abs)
    ? fs.readdirSync(abs).filter((f) => {
        if (SKIP_UPLOAD.has(f)) return false;
        try {
          return fs.statSync(path.join(abs, f)).isFile();
        } catch {
          return false;
        }
      })
    : [];
  const drive = gdrive.getDrive();
  return gdrive.uploadFolder(drive, abs, folderNameOf(relDir), files);
}

// 검수함 목록을 드라이브에 저장(상태 변경 때마다 호출).
export async function backupIndex() {
  if (!isOn()) return;
  const drive = gdrive.getDrive();
  await gdrive.putJson(drive, INDEX, readUsed());
}

// 초안 생성/편집 직후: 폴더 백업 + 목록 저장. 실패해도 throw 하지 않는다(요청을 막지 않음).
export async function backupDraft(relDir) {
  if (!isOn()) return null;
  try {
    const up = await archiveDraft(relDir);
    await backupIndex();
    return up;
  } catch (e) {
    console.error("[persist] 초안 백업 실패:", e.message);
    return null;
  }
}

// 서버 부팅 시: 로컬 검수함이 비어 있으면 드라이브에서 목록을 복원한다.
export async function restoreOnBoot() {
  if (!isOn()) return { restored: 0, skipped: "not-configured" };
  const local = readUsed();
  if (local.used && local.used.length) return { restored: 0, skipped: "local-not-empty" };
  const drive = gdrive.getDrive();
  const remote = await gdrive.getJson(drive, INDEX);
  if (!remote || !Array.isArray(remote.used)) return { restored: 0 };
  overwriteUsed(remote);
  return { restored: remote.used.length };
}

// 초안 열기/편집 전: 로컬에 편집원본·이미지가 없으면 드라이브에서 내려받는다.
// 반환: 새로 받아왔으면 true.
export async function ensureDraftLocal(relDir) {
  if (!isOn()) return false;
  const abs = absOf(relDir);
  const ready = fs.existsSync(path.join(abs, "data.json")) && fs.existsSync(path.join(abs, "card_01.png"));
  if (ready) return false;
  try {
    const n = await gdrive.downloadFolder(gdrive.getDrive(), folderNameOf(relDir), abs);
    return n > 0;
  } catch (e) {
    console.error("[persist] 초안 복원 실패:", e.message);
    return false;
  }
}
