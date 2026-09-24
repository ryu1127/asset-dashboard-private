// 지금은 부부가 쓰는 가계부 구글 시트가 딱 하나라, 매번 링크를 붙여넣지
// 않아도 되게 기본값으로 박아둔다. 다른 시트로 바꾸고 싶으면 설정 화면에서
// 새 링크를 붙여넣으면 된다 — 이 값은 어디까지나 "처음엔 이걸로" 정도다.
import { extractSpreadsheetId } from "./sheets";

export const DEFAULT_SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/1mL80Z2RYaPZ5_u-OnRS08GPLQRi0qn9DhDvwPEBB-1M/edit";

export const DEFAULT_SPREADSHEET_ID = extractSpreadsheetId(DEFAULT_SPREADSHEET_URL)!;

// 예전에 기본값이던 시트들. 이 브라우저가 아직 예전 시트에 연결돼 있으면(연결
// 정보는 IndexedDB에 남아있다) 기본 시트가 바뀌었을 때 자동으로 새 기본
// 시트로 옮겨준다. 사용자가 설정 화면에서 직접 고른 다른 시트는 건드리지 않는다.
const LEGACY_SPREADSHEET_IDS = ["1wkwvD4khoI4rMZyiIWALr7Zhoa146jtFKUqhMIybqrc"];

export function isLegacySpreadsheet(spreadsheetId: string): boolean {
  return LEGACY_SPREADSHEET_IDS.includes(spreadsheetId);
}
