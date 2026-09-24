// 가계부(Ledger)/자산(Assets) 페이지가 공유하는 시트 로딩·동기화 로직.
// 마운트 시 로컬 캐시를 먼저 그려주고, 로그인돼 있으면 백그라운드로 최신
// 시트를 다시 읽어온다. 연결된 시트가 아직 없으면 기본 시트로 자동 연결한다.

import { useCallback, useEffect, useState } from "react";
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

export function useSheetData(): UseSheetData {
  const [settings, setSettings] = useState<SheetSettings | null>(null);
  const [data, setData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(isSignedIn());

  const refreshById = useCallback(async (spreadsheetId: string) => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await syncSheet(spreadsheetId);
      setData(fresh);
      setSignedIn(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "시트를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const cached = await getCachedSheetData();
      if (cached) setData(cached);

      let s = await getSheetSettings();
      if ((!s || isLegacySpreadsheet(s.spreadsheetId)) && isSignedIn()) {
        try {
          s = await ensureSheetConnected();
        } catch {
          // 자동 연결 실패는 무시하고 "연결하기" 화면으로 넘어간다.
        }
      }
      setSettings(s ?? null);
      if (s && isSignedIn()) refreshById(s.spreadsheetId);
    })();
  }, [refreshById]);

  // 다른 탭/앱에 갔다가 이 탭으로 돌아오면 그 사이 시트가 바뀌었을 수 있으니
  // 자동으로 한 번 다시 읽어온다.
  useEffect(() => {
    if (!settings) return;
    function onVisible() {
      if (document.visibilityState === "visible" && isSignedIn()) {
        refreshById(settings!.spreadsheetId);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [settings, refreshById]);

  async function connectAndSync() {
    setLoading(true);
    setError(null);
    try {
      await signIn();
      setSignedIn(true);
      const s = await ensureSheetConnected();
      setSettings(s);
      await refreshById(s.spreadsheetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "연결에 실패했습니다.");
      setLoading(false);
    }
  }

  return {
    settings,
    data,
    loading,
    error,
    signedIn,
    refresh: () => {
      if (settings) refreshById(settings.spreadsheetId);
    },
    connectAndSync,
  };
}
