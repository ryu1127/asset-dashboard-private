import { useEffect, useRef, useState } from "react";
import {
  clearLegacyBackup,
  disconnectSheet,
  exportData,
  getLegacyBackup,
  getSheetSettings,
  importData,
  saveSheetSettings,
  type SheetSettings,
} from "../db";
import { DEFAULT_SPREADSHEET_URL } from "../config";
import { isSignedIn, signIn, signOut } from "../drive";
import {
  getNetWorthGoal,
  getTossStockConfig,
  setNetWorthGoal,
  setTossStockConfig,
  type TossStockConfig,
} from "../prefs";
import { extractSpreadsheetId, fetchSpreadsheetTitle } from "../sheets";
import { syncSheet } from "../sheetSync";
import { fetchTossPortfolio } from "../tossStock";

export default function Settings() {
  const [settings, setSettings] = useState<SheetSettings | null>(null);
  const [signedIn, setSignedIn] = useState(isSignedIn());
  const [urlInput, setUrlInput] = useState(DEFAULT_SPREADSHEET_URL);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [legacy, setLegacy] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState(() => getNetWorthGoal()?.toLocaleString() ?? "");
  const [tossConfig, setTossConfigState] = useState<TossStockConfig | null>(() =>
    getTossStockConfig()
  );
  const [tossBaseUrl, setTossBaseUrl] = useState("");
  const [tossApiKey, setTossApiKey] = useState("");
  const [tossTesting, setTossTesting] = useState(false);
  const [tossError, setTossError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSheetSettings().then((s) => setSettings(s ?? null));
    setLegacy(getLegacyBackup());
  }, []);

  async function connect() {
    const id = extractSpreadsheetId(urlInput);
    if (!id) {
      setConnectError("올바른 구글 시트 링크나 ID가 아니에요.");
      return;
    }
    setConnecting(true);
    setConnectError(null);
    try {
      if (!isSignedIn()) await signIn();
      setSignedIn(true);
      const title = await fetchSpreadsheetTitle(id);
      await saveSheetSettings(id, title);
      await syncSheet(id); // 바로 한 번 읽어서 접근 가능한지 확인하고 캐시를 채움
      setSettings(await getSheetSettings());
      setUrlInput("");
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "연결에 실패했습니다.");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (
      !confirm(
        "시트 연결을 해제할까요? 로컬에 캐시된 대시보드 데이터도 함께 지워집니다 (시트 자체는 그대로예요)."
      )
    )
      return;
    await disconnectSheet();
    setSettings(null);
  }

  function connectGoogle() {
    signIn()
      .then(() => setSignedIn(true))
      .catch((err) => alert(err instanceof Error ? err.message : "구글 로그인에 실패했습니다."));
  }

  function disconnectGoogle() {
    signOut();
    setSignedIn(false);
  }

  async function doExport() {
    const json = await exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asset-dashboard-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("가져오기를 하면 현재 시트 연결 정보가 백업 파일 내용으로 교체됩니다. 계속할까요?")) {
      e.target.value = "";
      return;
    }
    const text = await file.text();
    try {
      await importData(text);
      setSettings(await getSheetSettings());
      alert("가져오기 완료!");
    } catch {
      alert("가져오기 실패: 올바른 백업 파일이 아닙니다.");
    }
    e.target.value = "";
  }

  function saveGoal(raw: string) {
    const n = Number(raw.replace(/[^\d]/g, ""));
    setNetWorthGoal(n > 0 ? n : null);
    setGoalInput(n > 0 ? n.toLocaleString() : "");
  }

  async function saveTossConfig() {
    if (!tossBaseUrl.trim() || !tossApiKey.trim()) {
      setTossError("주소와 API 키를 모두 입력하세요.");
      return;
    }
    setTossTesting(true);
    setTossError(null);
    try {
      const baseUrl = tossBaseUrl.trim();
      const apiKey = tossApiKey.trim();
      await fetchTossPortfolio(baseUrl, apiKey); // 접근 가능한지 바로 확인
      setTossStockConfig({ baseUrl, apiKey });
      setTossConfigState({ baseUrl, apiKey });
      setTossBaseUrl("");
      setTossApiKey("");
    } catch (err) {
      setTossError(err instanceof Error ? err.message : "연결 테스트에 실패했습니다.");
    } finally {
      setTossTesting(false);
    }
  }

  function disconnectToss() {
    setTossStockConfig(null);
    setTossConfigState(null);
  }

  function downloadLegacyBackup() {
    if (!legacy) return;
    const blob = new Blob([legacy], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `legacy-local-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <header className="page-head">
        <h1>설정</h1>
      </header>

      {legacy && (
        <div className="card">
          <h3>📦 이전 로컬 입력 데이터</h3>
          <p className="muted">
            구글 시트 연동으로 바뀌기 전, 이 브라우저에 직접 입력했던 거래·카테고리·예산
            데이터가 남아있어요. 더 이상 앱에서 쓰이진 않지만, 원하면 한 번 내보내둘 수
            있습니다.
          </p>
          <div className="row-btns">
            <button className="btn-secondary" onClick={downloadLegacyBackup}>
              내보내기 (JSON)
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                clearLegacyBackup();
                setLegacy(null);
              }}
            >
              그냥 지우기
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>🔑 구글 계정</h3>
        {signedIn ? (
          <div className="row-btns">
            <span className="muted">연결됨</span>
            <button className="btn-secondary sm" onClick={disconnectGoogle}>
              연결 해제
            </button>
          </div>
        ) : (
          <button className="btn-primary" onClick={connectGoogle}>
            구글 계정 연결
          </button>
        )}
      </div>

      <div className="card">
        <h3>📊 구글 시트 연결</h3>
        <p className="muted">
          거래내역·예산설정·자산현황을 관리하는 개인 가계부 구글 시트의 링크를
          붙여넣으세요. 대시보드는 이 시트를 읽기 전용으로 불러와 보여줍니다.
        </p>
        {settings ? (
          <div className="sheet-connected">
            <div>
              <b>{settings.spreadsheetTitle}</b>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                연결일 {settings.connectedAt.slice(0, 10)}
              </p>
            </div>
            <button className="btn-secondary sm" onClick={disconnect}>
              연결 해제
            </button>
          </div>
        ) : (
          <div className="add-row">
            <input
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn-primary" disabled={connecting} onClick={connect}>
              {connecting ? "연결 중…" : "연결"}
            </button>
          </div>
        )}
        {connectError && <p className="error-text">{connectError}</p>}
      </div>

      <div className="card">
        <h3>🎯 순자산 목표</h3>
        <p className="muted">
          자산 페이지에서 목표 대비 진행률을 보여줍니다. 시트는 건드리지 않고 이
          브라우저에만 저장돼요.
        </p>
        <div className="add-row">
          <input
            className="bal-input"
            type="text"
            inputMode="numeric"
            placeholder="예: 1,000,000,000"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={(e) => saveGoal(e.target.value)}
            style={{ flex: 1 }}
          />
          <span className="muted">원</span>
        </div>
      </div>

      <div className="card">
        <h3>🔌 TossStock 연동</h3>
        <p className="muted">
          집에 항상 켜져있는 TossStock 포트폴리오 API 서버 주소와 API 키예요. secret은 그
          서버 안에만 있고, 여기서는 요약 결과만 받아옵니다. 집 밖에서는 서버에 닿지 않아
          자산 페이지의 이 카드만 비어보일 수 있어요.
        </p>
        {tossConfig ? (
          <div className="sheet-connected">
            <div>
              <b>{tossConfig.baseUrl}</b>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                연결됨
              </p>
            </div>
            <button className="btn-secondary sm" onClick={disconnectToss}>
              연결 해제
            </button>
          </div>
        ) : (
          <>
            <div className="add-row">
              <input
                placeholder="http://192.168.0.10:8787"
                value={tossBaseUrl}
                onChange={(e) => setTossBaseUrl(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div className="add-row" style={{ marginTop: 8 }}>
              <input
                placeholder="API 키"
                type="password"
                value={tossApiKey}
                onChange={(e) => setTossApiKey(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn-primary" disabled={tossTesting} onClick={saveTossConfig}>
                {tossTesting ? "확인 중…" : "연결"}
              </button>
            </div>
          </>
        )}
        {tossError && <p className="error-text">{tossError}</p>}
      </div>

      <div className="card">
        <h3>💾 설정 백업</h3>
        <p className="muted">
          가계부 데이터 자체는 구글 시트에 있으니 백업할 게 없어요. 여기서는 "어떤
          시트에 연결돼 있었는지"만 내보내고 가져올 수 있습니다 — 다른 브라우저에서
          같은 시트를 빠르게 다시 연결하고 싶을 때 씁니다.
        </p>
        <div className="row-btns">
          <button className="btn-secondary" onClick={doExport}>
            내보내기 (JSON)
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            가져오기 (JSON)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={doImport}
          />
        </div>
      </div>
    </div>
  );
}
