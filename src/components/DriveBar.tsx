import { useState } from "react";
import { exportData, importData } from "../db";
import {
  downloadFromDrive,
  getLastSavedAt,
  isSignedIn,
  signIn,
  uploadToDrive,
} from "../drive";
import { datetimeLabel, relativeTime } from "../format";

// 화면 어디서나 바로 쓸 수 있는 구글 드라이브 저장/불러오기 상단 바.
export default function DriveBar() {
  const [connected, setConnected] = useState(isSignedIn());
  const [busy, setBusy] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(getLastSavedAt());

  async function connect() {
    setBusy(true);
    try {
      await signIn();
      setConnected(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "구글 로그인에 실패했습니다.");
    }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    try {
      const json = await exportData();
      await uploadToDrive(json);
      setLastSavedAt(getLastSavedAt());
    } catch (err) {
      alert(err instanceof Error ? err.message : "드라이브 저장에 실패했습니다.");
    }
    setBusy(false);
  }

  async function load() {
    if (
      !confirm(
        "드라이브에서 불러오면 현재 이 브라우저의 데이터가 모두 드라이브 백업 내용으로 교체됩니다. 계속할까요?"
      )
    )
      return;
    setBusy(true);
    try {
      const json = await downloadFromDrive();
      await importData(json);
      alert("드라이브에서 불러오기 완료!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "드라이브 불러오기에 실패했습니다.");
    }
    setBusy(false);
  }

  const stale =
    !lastSavedAt || Date.now() - lastSavedAt.getTime() > 3 * 24 * 60 * 60 * 1000;

  return (
    <div className="drive-bar">
      <span className="drive-bar-icon">☁️</span>
      {!connected ? (
        <button className="btn-secondary sm" disabled={busy} onClick={connect}>
          구글 계정 연결
        </button>
      ) : (
        <>
          <button className="btn-secondary sm" disabled={busy} onClick={save}>
            드라이브에 저장
          </button>
          <button className="btn-secondary sm" disabled={busy} onClick={load}>
            드라이브에서 불러오기
          </button>
          <span
            className={"drive-bar-status" + (stale ? " stale" : "")}
            title={lastSavedAt ? datetimeLabel(lastSavedAt) : undefined}
          >
            {lastSavedAt
              ? `마지막 저장 ${relativeTime(lastSavedAt)}`
              : "아직 저장한 적 없음"}
          </span>
        </>
      )}
    </div>
  );
}
