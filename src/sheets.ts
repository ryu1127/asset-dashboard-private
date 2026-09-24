// 사용자의 개인 가계부 구글 시트(거래내역/예산설정/자산현황 탭)를 읽기 전용으로
// 가져와 파싱한다. 계산(예산 대비 실제, 추이 등)은 여기서 하지 않고
// sheetCompute.ts 에서 원본 데이터로부터 다시 계산한다 — 시트의 "월별대시보드"
// 탭처럼 노란 입력 셀(조회 연/월)에 의존하지 않고 앱에서 자유롭게 월을 고를 수
// 있게 하기 위함이다.

import { getAccessToken } from "./drive";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export type SheetKind = "수입" | "지출";

export interface SheetTransaction {
  date: string; // YYYY-MM-DD
  account: string;
  category: string; // 분류(대분류)
  subCategory: string; // 소분류
  memo: string;
  amountKRW: number;
  kind: SheetKind;
  // 거래내역의 선택 열 "명의". 수입을 동헌/혜신으로 나눠 보고 싶을 때 적는다.
  // 열이 없거나 비어있으면 "" (공동/미지정).
  member: string;
}

export interface SheetBudgetItem {
  category: string;
  subCategory: string;
  monthlyBudget: number;
}

export interface SheetIncomeTarget {
  item: string;
  member: string; // 수입 목표 표에 "명의" 열이 없으면 ""
  target: number;
}

export interface SheetAssetSnapshotRow {
  date: string; // YYYY-MM-DD
  member: string;
  name: string; // 계좌/자산명
  type: string; // 예금/투자/부동산/연금/보증금/대출/기타
  balance: number; // 대출은 시트 관례상 이미 음수로 입력됨
  memo: string;
}

export interface SheetData {
  transactions: SheetTransaction[];
  budgetItems: SheetBudgetItem[];
  incomeTargets: SheetIncomeTarget[];
  assetSnapshots: SheetAssetSnapshotRow[];
  // 날짜를 읽지 못해 건너뛴 거래내역 행 번호(시트 기준). 복붙하다 날짜가
  // 깨진 행을 눈치채지 못하고 합계에서 빠지는 일을 막기 위해 화면에 알려준다.
  skippedTransactionRows?: number[];
  fetchedAt: string;
}

// 구글 시트 URL이나 ID를 그대로 붙여넣어도 되게 ID만 뽑아낸다.
export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export async function fetchSpreadsheetTitle(
  spreadsheetId: string
): Promise<string> {
  const token = requireToken();
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(await sheetErrorMessage(res));
  const data = await res.json();
  return data.properties?.title ?? spreadsheetId;
}

export async function fetchSheetData(spreadsheetId: string): Promise<SheetData> {
  const tabs = await batchGetValues(spreadsheetId, [
    "거래내역!A1:M5000",
    "예산설정!A1:H200",
    "자산현황!A1:H3000",
  ]);
  const { transactions, skippedRows } = parseTransactions(tabs["거래내역"] ?? []);
  return {
    transactions,
    skippedTransactionRows: skippedRows,
    ...parseBudgetTab(tabs["예산설정"] ?? []),
    assetSnapshots: parseAssetSnapshots(tabs["자산현황"] ?? []),
    fetchedAt: new Date().toISOString(),
  };
}

// ---- 내부 구현 ----

function requireToken(): string {
  const token = getAccessToken();
  if (!token) throw new Error("구글 계정에 먼저 로그인하세요.");
  return token;
}

// 구글 API가 돌려주는 실제 에러 메시지를 그대로 보여준다 — "권한이 없다"와
// "Sheets API가 이 프로젝트에서 꺼져있다"는 겉으론 둘 다 403/404라 구분이
// 안 되는데, 원인 파악엔 이 문구가 핵심이라 뭉뚱그리지 않는다.
async function sheetErrorMessage(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message ?? "";
  } catch {
    // 본문이 JSON이 아니면 무시하고 상태 코드만 보여준다
  }
  const prefix =
    res.status === 403 || res.status === 404
      ? "시트에 접근할 수 없습니다. 링크와 공유 권한을 확인하세요."
      : "시트를 불러오지 못했습니다.";
  return detail ? `${prefix} (${res.status}: ${detail})` : `${prefix} (${res.status})`;
}

type Row = (string | number)[];

async function batchGetValues(
  spreadsheetId: string,
  ranges: string[]
): Promise<Record<string, Row[]>> {
  const token = requireToken();
  const params = new URLSearchParams();
  ranges.forEach((r) => params.append("ranges", r));
  params.set("valueRenderOption", "UNFORMATTED_VALUE");
  params.set("dateTimeRenderOption", "SERIAL_NUMBER");
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values:batchGet?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(await sheetErrorMessage(res));
  const data = await res.json();
  const out: Record<string, Row[]> = {};
  for (const vr of data.valueRanges ?? []) {
    const tab = String(vr.range ?? "")
      .split("!")[0]
      .replace(/^'|'$/g, "");
    out[tab] = vr.values ?? [];
  }
  return out;
}

function findHeaderRow(rows: Row[], mustInclude: string[], from = 0): number {
  for (let i = from; i < rows.length; i++) {
    const cells = (rows[i] ?? []).map((c) => String(c ?? ""));
    if (mustInclude.every((h) => cells.some((c) => c.includes(h)))) return i;
  }
  return -1;
}

function colIndex(header: Row, includes: string): number {
  return header.findIndex((c) => String(c ?? "").includes(includes));
}

function cellStr(row: Row, idx: number): string {
  if (idx < 0 || row[idx] == null) return "";
  return String(row[idx]).trim();
}

function cellNum(row: Row, idx: number): number {
  if (idx < 0 || row[idx] == null) return 0;
  const v = row[idx];
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// 셀 값을 YYYY-MM-DD 로 바꾼다. 못 읽으면 "" 를 돌려준다.
// - 날짜 셀: UNFORMATTED_VALUE + SERIAL_NUMBER 로 읽으면 "1899-12-30 기준
//   일련번호" 숫자(시각이 있으면 소수부)로 온다.
// - 텍스트로 붙어 들어온 날짜: "2026. 09. 24", "2026-9-24", "2026/09/24",
//   "2026.09.24 15:34", "2026년 9월 24일", "20260924", "9/24/2026"(월/일이
//   모호하지 않을 때만) 등을 받아준다. 연도가 앞에 오는 형식이 기본이다.
function cellDate(row: Row, idx: number): string {
  if (idx < 0 || row[idx] == null) return "";
  return parseDateValue(row[idx]);
}

function toISO(y: number, m: number, d: number): string {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) {
    return ""; // 13월, 2월 30일 같은 잘못된 날짜
  }
  return t.toISOString().slice(0, 10);
}

function serialToISO(serial: number): string {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return "";
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
}

export function parseDateValue(v: string | number): string {
  if (typeof v === "number") return serialToISO(v);
  const str = String(v).trim();
  if (!str) return "";

  // 숫자만 있는 경우: 일련번호("46289") 또는 yyyymmdd("20260924")
  if (/^\d+(\.\d+)?$/.test(str)) {
    if (/^\d{8}$/.test(str)) {
      return toISO(+str.slice(0, 4), +str.slice(4, 6), +str.slice(6, 8));
    }
    return serialToISO(Number(str));
  }

  // 연도가 앞: 2026. 09. 24 / 2026-9-24 / 2026/09/24 / 2026년 9월 24일
  const ymd = str.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (ymd) return toISO(+ymd[1], +ymd[2], +ymd[3]);

  // 연도가 뒤: 9/24/2026 (미국식) 또는 24/9/2026 — 앞뒤 숫자 중 하나가 12보다
  // 클 때만 확실하므로, 둘 다 12 이하로 모호하면 틀린 달로 넣느니 건너뛴다.
  const tail = str.match(/^(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{4})/);
  if (tail) {
    const a = +tail[1];
    const b = +tail[2];
    if (a > 12 && b <= 12) return toISO(+tail[3], b, a);
    if (b > 12 && a <= 12) return toISO(+tail[3], a, b);
  }
  return "";
}

function parseTransactions(rows: Row[]): {
  transactions: SheetTransaction[];
  skippedRows: number[];
} {
  const headerIdx = findHeaderRow(rows, ["날짜", "분류", "소분류", "수입/지출"]);
  if (headerIdx === -1) return { transactions: [], skippedRows: [] };
  const header = rows[headerIdx];
  const dateIdx = colIndex(header, "날짜");
  const accIdx = colIndex(header, "자산");
  const catIdx = colIndex(header, "분류");
  const subIdx = colIndex(header, "소분류");
  const memoIdx = colIndex(header, "내용");
  const krwIdx = colIndex(header, "KRW");
  const kindIdx = colIndex(header, "수입/지출");
  const memberIdx = colIndex(header, "명의");

  const out: SheetTransaction[] = [];
  const skippedRows: number[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const kindRaw = cellStr(rows[i], kindIdx);
    const amount = cellNum(rows[i], krwIdx);
    const date = cellDate(rows[i], dateIdx);
    if (!date) {
      // 날짜가 없거나 못 읽었다. 금액이나 수입/지출 표시가 있으면 진짜 거래인데
      // 날짜만 깨진 것이므로 기록해 두고, 안내 문구 같은 빈 행은 조용히 넘긴다.
      if (kindRaw === "수입" || kindRaw === "지출" || amount !== 0) {
        skippedRows.push(i + 1);
      }
      continue;
    }
    out.push({
      date,
      account: cellStr(rows[i], accIdx),
      category: cellStr(rows[i], catIdx),
      subCategory: cellStr(rows[i], subIdx),
      memo: cellStr(rows[i], memoIdx),
      amountKRW: amount,
      kind: kindRaw === "수입" ? "수입" : "지출",
      member: cellStr(rows[i], memberIdx),
    });
  }
  return { transactions: out, skippedRows };
}

function parseBudgetTab(rows: Row[]): {
  budgetItems: SheetBudgetItem[];
  incomeTargets: SheetIncomeTarget[];
} {
  const budgetItems: SheetBudgetItem[] = [];
  let cursor = 0;

  const budgetHeaderIdx = findHeaderRow(rows, ["대분류", "소분류", "월예산"]);
  if (budgetHeaderIdx !== -1) {
    const header = rows[budgetHeaderIdx];
    const catIdx = colIndex(header, "대분류");
    const subIdx = colIndex(header, "소분류");
    const amtIdx = colIndex(header, "월예산");
    let i = budgetHeaderIdx + 1;
    let lastCategory = ""; // 대분류 열은 시트에서 병합돼 있어 첫 행에만 값이 온다
    for (; i < rows.length; i++) {
      const sub = cellStr(rows[i], subIdx);
      const catRaw = cellStr(rows[i], catIdx);
      if (!sub && !catRaw) break; // 빈 줄 = 표 끝
      const cat = catRaw || lastCategory;
      lastCategory = cat;
      budgetItems.push({
        category: cat,
        subCategory: sub,
        monthlyBudget: cellNum(rows[i], amtIdx),
      });
    }
    cursor = i;
  }

  const incomeTargets: SheetIncomeTarget[] = [];
  // "명의" 열은 선택이다 — 새 시트의 수입 목표 표는 "항목 | 월 목표수입" 두 열뿐.
  const incomeHeaderIdx = findHeaderRow(rows, ["항목", "목표수입"], cursor);
  if (incomeHeaderIdx !== -1) {
    const header = rows[incomeHeaderIdx];
    const itemIdx = colIndex(header, "항목");
    const memberIdx = colIndex(header, "명의");
    const targetIdx = colIndex(header, "목표수입");
    let lastItem = ""; // 항목 열도 마찬가지로 병합돼 있다
    for (let i = incomeHeaderIdx + 1; i < rows.length; i++) {
      const itemRaw = cellStr(rows[i], itemIdx);
      const member = cellStr(rows[i], memberIdx);
      if (!itemRaw && !member) break;
      const item = itemRaw || lastItem;
      lastItem = item;
      incomeTargets.push({
        item,
        member,
        target: cellNum(rows[i], targetIdx),
      });
    }
  }

  return { budgetItems, incomeTargets };
}

function parseAssetSnapshots(rows: Row[]): SheetAssetSnapshotRow[] {
  const headerIdx = findHeaderRow(rows, ["스냅샷일자", "명의", "계좌", "잔액"]);
  if (headerIdx === -1) return [];
  const header = rows[headerIdx];
  const dateIdx = colIndex(header, "스냅샷일자");
  const memberIdx = colIndex(header, "명의");
  const nameIdx = colIndex(header, "계좌");
  const typeIdx = colIndex(header, "종류");
  const balanceIdx = colIndex(header, "잔액");
  const memoIdx = colIndex(header, "메모");

  const out: SheetAssetSnapshotRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const date = cellDate(rows[i], dateIdx);
    if (!date) continue; // 옆 요약 패널 등 데이터가 아닌 행은 건너뜀
    out.push({
      date,
      member: cellStr(rows[i], memberIdx),
      name: cellStr(rows[i], nameIdx),
      type: cellStr(rows[i], typeIdx),
      balance: cellNum(rows[i], balanceIdx),
      memo: cellStr(rows[i], memoIdx),
    });
  }
  return out;
}
