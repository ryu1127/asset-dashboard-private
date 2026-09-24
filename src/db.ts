import Dexie, { type Table } from "dexie";
import type { SheetData } from "./sheets";

// ---- 로컬에 남기는 것: 구글 시트 연결 정보 + 동기화 캐시/이력뿐.
// 거래/예산/카테고리 등 실제 가계부 데이터는 전부 연결된 구글 시트가
// 원천이고, 이 앱은 읽기 전용으로 보여주기만 한다.

export interface SheetSettings {
  id: 1;
  spreadsheetId: string;
  spreadsheetTitle: string;
  connectedAt: string;
}

// 마지막으로 시트에서 읽어온 원본 데이터. 대시보드는 항상 이 캐시를 먼저
// 그려서 오프라인이거나 재조회 전에도 최근 상태를 바로 보여주고, 백그라운드
// 동기화가 끝나면 이 값을 갱신한다.
export interface SheetCacheRow {
  id: 1;
  data: SheetData;
}

// 동기화할 때마다 남기는 가벼운 이력 한 줄. 시트를 못 읽는 상황에서도 "최근에
// 확인했을 때 상태가 어땠는지" 추이를 로컬에서 볼 수 있게 한다.
export interface SyncSnapshot {
  id?: number;
  syncedAt: string;
  monthKey: string;
  monthIncome: number;
  monthExpense: number;
  netWorth: number;
}

export class AssetDB extends Dexie {
  sheetSettings!: Table<SheetSettings, number>;
  sheetCache!: Table<SheetCacheRow, number>;
  syncSnapshots!: Table<SyncSnapshot, number>;

  constructor() {
    super("assetDashboard");
    // v1~5: 로컬 직접입력 시절(거래/카테고리/예산/반복거래) 스키마 — 이번
    // 개편으로 더 이상 쓰지 않는다. v6에서 제거하되, upgrade 콜백이 지우기
    // 전에 로컬스토리지로 한 번 백업해 둔다(설정 화면에서 내보내기 가능).
    this.version(1).stores({
      members: "++id, name",
      categories: "++id, name, kind",
      accounts: "++id, name, type, owner",
      transactions: "++id, date, kind, memberId, categoryId, accountId",
      snapshots: "++id, month, accountId",
    });
    this.version(2).stores({ budgets: "++id, categoryId" });
    this.version(3).stores({ recurring: "++id, active" });
    this.version(4).stores({ catRules: "++id, keyword, categoryId" });
    this.version(5).stores({ categories: "++id, name, kind, parentId" });
    this.version(6)
      .stores({
        members: null,
        categories: null,
        accounts: null,
        transactions: null,
        snapshots: null,
        budgets: null,
        recurring: null,
        catRules: null,
        sheetSettings: "id",
        sheetCache: "id",
        syncSnapshots: "++id, syncedAt",
      })
      .upgrade(async (tx) => {
        try {
          const legacy = {
            exportedAt: new Date().toISOString(),
            members: await tx.table("members").toArray(),
            categories: await tx.table("categories").toArray(),
            accounts: await tx.table("accounts").toArray(),
            transactions: await tx.table("transactions").toArray(),
            snapshots: await tx.table("snapshots").toArray(),
            budgets: await tx.table("budgets").toArray(),
            recurring: await tx.table("recurring").toArray(),
            catRules: await tx.table("catRules").toArray(),
          };
          const hasData = Object.values(legacy).some(
            (v) => Array.isArray(v) && v.length > 0
          );
          if (hasData) {
            localStorage.setItem("legacyLocalBackup", JSON.stringify(legacy));
          }
        } catch {
          // 백업이 실패해도 마이그레이션 자체는 계속 진행한다.
        }
      });
  }
}

export const db = new AssetDB();

// ---- 구글 시트 연결 ----
export async function getSheetSettings(): Promise<SheetSettings | undefined> {
  return db.sheetSettings.get(1);
}

export async function saveSheetSettings(
  spreadsheetId: string,
  spreadsheetTitle: string
): Promise<void> {
  await db.sheetSettings.put({
    id: 1,
    spreadsheetId,
    spreadsheetTitle,
    connectedAt: new Date().toISOString(),
  });
}

export async function disconnectSheet(): Promise<void> {
  await db.transaction(
    "rw",
    db.sheetSettings,
    db.sheetCache,
    db.syncSnapshots,
    async () => {
      await db.sheetSettings.clear();
      await db.sheetCache.clear();
      await db.syncSnapshots.clear();
    }
  );
}

export async function getCachedSheetData(): Promise<SheetData | undefined> {
  return (await db.sheetCache.get(1))?.data;
}

export async function setCachedSheetData(data: SheetData): Promise<void> {
  await db.sheetCache.put({ id: 1, data });
}

export async function addSyncSnapshot(
  snap: Omit<SyncSnapshot, "id">
): Promise<void> {
  await db.syncSnapshots.add(snap);
}

// ---- 이전 로컬 데이터(v5 이하) 백업 ----
export function getLegacyBackup(): string | null {
  return localStorage.getItem("legacyLocalBackup");
}

export function clearLegacyBackup(): void {
  localStorage.removeItem("legacyLocalBackup");
}

// ---- 설정 화면의 "데이터 백업" 기능이 다루는 대상: 시트 연결 정보 + 동기화
// 이력. 실제 가계부 데이터(거래/예산 등)는 구글 시트 자체가 원본이므로 여기
// 백업 대상이 아니다.
export async function exportData(): Promise<string> {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    sheetSettings: await db.sheetSettings.toArray(),
    syncSnapshots: await db.syncSnapshots.toArray(),
  };
  return JSON.stringify(data, null, 2);
}

export async function importData(json: string): Promise<void> {
  const data = JSON.parse(json);
  await db.transaction("rw", db.sheetSettings, db.syncSnapshots, async () => {
    await db.sheetSettings.clear();
    await db.syncSnapshots.clear();
    if (data.sheetSettings) await db.sheetSettings.bulkAdd(data.sheetSettings);
    if (data.syncSnapshots) await db.syncSnapshots.bulkAdd(data.syncSnapshots);
  });
}
