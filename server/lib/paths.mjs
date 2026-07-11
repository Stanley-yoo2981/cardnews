// 공용 경로. 배포 시 drafts/ 와 state/ 를 영구 디스크로 뺄 수 있게 DATA_DIR 로 분리한다.
// 로컬: DATA_DIR 미설정 → 저장소 루트(기존과 동일).
// 배포(Render 등): DATA_DIR=/data + 그 경로에 영구 디스크 마운트 → 재시작해도 보존.
//
// calendar.json / template.html / assets 등 "읽기 전용 설정·자산"은 항상 ROOT 에 둔다.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : ROOT;
export const DRAFTS_DIR = path.join(DATA_DIR, "drafts");
export const STATE_DIR = path.join(DATA_DIR, "state");
