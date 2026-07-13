// 구글 드라이브 연동 (선택적).
// 승인(완성)된 카드뉴스를 'SNS 카드뉴스' 폴더 아래
// '작업날짜(KST)_제목' 하위 폴더로 업로드한다.
//
// 자격증명이 없으면 조용히 건너뛴다(앱은 정상 동작). 설정 방법:
//  - 서비스 계정 JSON 을 GDRIVE_SA_JSON(내용) 또는
//    GOOGLE_APPLICATION_CREDENTIALS(파일 경로) 로 제공
//  - GDRIVE_PARENT_ID: 'SNS 카드뉴스' 를 만들 상위 폴더 ID.
//    (내 드라이브 폴더를 서비스계정 이메일과 공유하거나 공유 드라이브 사용)

import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";

// 최상위 폴더명(기본 "카드뉴스"). 그 아래에 '날짜(KST)_사건명' 하위폴더가 쌓인다.
const ROOT_FOLDER = process.env.GDRIVE_ROOT_FOLDER || "카드뉴스";

export function isConfigured() {
  return Boolean(process.env.GDRIVE_SA_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

// 한국 기준 날짜 YYYY-MM-DD
export function kstDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// 폴더/파일명에 부적절한 문자 정리
export function sanitizeName(s) {
  return String(s || "")
    .replace(/[\/\\\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "무제";
}

function authClient() {
  const scopes = ["https://www.googleapis.com/auth/drive"];
  if (process.env.GDRIVE_SA_JSON) {
    const creds = JSON.parse(process.env.GDRIVE_SA_JSON);
    return new google.auth.GoogleAuth({ credentials: creds, scopes });
  }
  // GOOGLE_APPLICATION_CREDENTIALS(파일 경로) 자동 인식
  return new google.auth.GoogleAuth({ scopes });
}

const DRIVE_OPTS = { supportsAllDrives: true, includeItemsFromAllDrives: true };

async function findOrCreateFolder(drive, name, parentId) {
  const safe = name.replace(/'/g, "\\'");
  const q =
    `name = '${safe}' and mimeType = 'application/vnd.google-apps.folder' ` +
    `and '${parentId}' in parents and trashed = false`;
  const list = await drive.files.list({
    q,
    fields: "files(id, name)",
    ...DRIVE_OPTS,
    corpora: "allDrives",
  });
  if (list.data.files && list.data.files.length) return list.data.files[0].id;

  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    ...DRIVE_OPTS,
  });
  return created.data.id;
}

async function uploadFile(drive, absPath, parentId, mimeType) {
  const name = path.basename(absPath);
  const res = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType, body: fs.createReadStream(absPath) },
    fields: "id, webViewLink",
    ...DRIVE_OPTS,
  });
  return res.data;
}

// 하위 폴더 안의 기존 파일을 비운다(폴더는 유지). 편집 후 재승인 시 중복 업로드를 막는다.
async function clearFolderFiles(drive, folderId) {
  const list = await drive.files.list({
    q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    ...DRIVE_OPTS,
    corpora: "allDrives",
  });
  for (const f of list.data.files || []) {
    try {
      await drive.files.delete({ fileId: f.id, ...DRIVE_OPTS });
    } catch {
      /* 권한/이미 삭제됨 — 무시하고 진행 */
    }
  }
}

/**
 * 승인된 초안 폴더를 드라이브에 업로드.
 * @param {object} p
 * @param {string} p.dirAbs 초안 폴더 절대경로 (card_01~10.png, caption.txt, review.md 포함)
 * @param {string} p.title  하위 폴더 제목(예: 카테고리)
 * @param {string} [p.dateStr] 작업 날짜(YYYY-MM-DD, KST). 없으면 오늘(KST).
 * @returns {Promise<{folderUrl:string, folderId:string, uploaded:number}>}
 */
export async function uploadDraft({ dirAbs, title, dateStr }) {
  if (!isConfigured()) throw new Error("구글 드라이브 자격증명이 설정되지 않았습니다.");
  const auth = authClient();
  const drive = google.drive({ version: "v3", auth });

  const parent = process.env.GDRIVE_PARENT_ID || "root";
  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER, parent);
  const subName = `${dateStr || kstDate()}_${sanitizeName(title)}`;
  const subId = await findOrCreateFolder(drive, subName, rootId);

  // 편집 후 재승인일 수 있으니, 기존 파일을 비우고 최신본으로 다시 채운다(중복 방지).
  await clearFolderFiles(drive, subId);

  // 이미지 10장 + 캡션/검수/원본 업로드
  let uploaded = 0;
  for (let i = 1; i <= 10; i++) {
    const f = path.join(dirAbs, `card_${String(i).padStart(2, "0")}.png`);
    if (fs.existsSync(f)) {
      await uploadFile(drive, f, subId, "image/png");
      uploaded++;
    }
  }
  for (const [f, mime] of [
    ["caption.txt", "text/plain"],
    ["review.md", "text/markdown"],
    ["index.html", "text/html"],
  ]) {
    const p = path.join(dirAbs, f);
    if (fs.existsSync(p)) await uploadFile(drive, p, subId, mime);
  }

  const meta = await drive.files.get({ fileId: subId, fields: "id, webViewLink", ...DRIVE_OPTS });
  return { folderId: subId, folderUrl: meta.data.webViewLink, uploaded };
}
