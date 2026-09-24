// Dashboard와 Settings가 공유하는 "시트 재조회" 동작: 시트를 읽어 로컬
// 캐시에 저장하고, 그 순간의 요약값을 동기화 이력에 한 줄 남긴다.

import { DEFAULT_SPREADSHEET_ID, isLegacySpreadsheet } from "./config";
import { addSyncSnapshot, getSheetSettings, saveSheetSettings, setCachedSheetData, type SheetSettings } from "./db";
import { currentMonth } from "./format";
import { discoverMembers, latestNetWorth, summarizeMonth } from "./sheetCompute";
import { fetchSheetData, fetchSpreadsheetTitle, type SheetData } from "./sheets";

// 아직 연결된 시트가 없으면 기본 시트(config.ts)로 자동 연결한다. 이미
// 연결돼 있으면 그 설정을 그대로 돌려준다 — 링크를 다시 물어보지 않는다.
// 단, 예전 기본 시트에 연결돼 있던 경우엔 새 기본 시트로 옮긴다.
export async function ensureSheetConnected(): Promise<SheetSettings> {
  const existing = await getSheetSettings();
  if (existing && !isLegacySpreadsheet(existing.spreadsheetId)) return existing;
  const title = await fetchSpreadsheetTitle(DEFAULT_SPREADSHEET_ID);
  await saveSheetSettings(DEFAULT_SPREADSHEET_ID, title);
  return (await getSheetSettings())!;
}

export async function syncSheet(spreadsheetId: string): Promise<SheetData> {
  const data = await fetchSheetData(spreadsheetId);
  await setCachedSheetData(data);

  const members = discoverMembers(data);
  const ym = currentMonth();
  const summary = summarizeMonth(data.transactions, ym, "all", members);
  const netWorth = latestNetWorth(data.assetSnapshots).total;
  await addSyncSnapshot({
    syncedAt: new Date().toISOString(),
    monthKey: ym,
    monthIncome: summary.income,
    monthExpense: summary.expense,
    netWorth,
  });

  return data;
}
