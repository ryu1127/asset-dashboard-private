// 가계부(Ledger)/자산(Assets) 페이지가 공유하는 시트 로딩·동기화 로직.
// 마운트 시 로컬 캐시를 먼저 그려주고, 로그인돼 있으면 백그라운드로 최신
// 시트를 다시 읽어온다. 연결된 시트가 아직 없으면 기본 시트로 자동 연결한다.

import { create } from "zustand";
import { getCachedSheetData, getSheetSettings, type SheetSettings } from "./db";
import { isLegacySpreadsheet } from "./config";
import { isSignedIn, signIn } from "./drive";
import { ensureSheetConnected, syncSheet } from "./sheetSync";
import type { SheetData } from "./sheets";

export interface UseSheetData {
  settings: SheetSettings | null;
  data: SheetData | null;
  loading: boolean;
  error: string | null;
  signedIn: boolean;
  refresh: () => void;
  connectAndSync: () => void;
}

interface SheetState extends UseSheetData {
  initialized: boolean;
  refreshById: (spreadsheetId: string) => Promise<void>;
  init: () => Promise<void>;
}

export const useSheetData = create<SheetState>((set, get) => {
  const refreshById = async (spreadsheetId: string) => {
    set({ loading: true, error: null });
    try {
      const fresh = await syncSheet(spreadsheetId);
      set({ data: fresh, signedIn: true, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "시트를 불러오지 못했습니다.", loading: false });
    }
  };

  const connectAndSync = async () => {
    set({ loading: true, error: null });
    try {
      await signIn();
      set({ signedIn: true });
      const s = await ensureSheetConnected();
      set({ settings: s });
      await refreshById(s.spreadsheetId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "연결에 실패했습니다.", loading: false });
    }
  };

  const init = async () => {
    const { initialized } = get();
    if (initialized) return;
    set({ initialized: true });

    const cached = await getCachedSheetData();
    if (cached) set({ data: cached });

    let s = await getSheetSettings();
    if ((!s || isLegacySpreadsheet(s.spreadsheetId)) && isSignedIn()) {
      try {
        s = await ensureSheetConnected();
      } catch {
        // 자동 연결 실패는 무시하고 "연결하기" 화면으로 넘어간다.
      }
    }
    set({ settings: s ?? null });
    if (s && isSignedIn()) {
      refreshById(s.spreadsheetId);
    }
  };

  return {
    settings: null,
    data: null,
    loading: false,
    error: null,
    signedIn: isSignedIn(),
    initialized: false,
    refreshById,
    refresh: () => {
      const { settings } = get();
      if (settings) refreshById(settings.spreadsheetId);
    },
    connectAndSync,
    init,
  };
});

// 모듈 로드 시 최초 1회 초기화
useSheetData.getState().init();

// 다른 탭/앱에 갔다가 이 탭으로 돌아오면 그 사이 시트가 바뀌었을 수 있으니 자동으로 한 번 다시 읽어온다.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const { settings, refreshById } = useSheetData.getState();
    if (document.visibilityState === "visible" && isSignedIn() && settings) {
      refreshById(settings.spreadsheetId);
    }
  });
}
