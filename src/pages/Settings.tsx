import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import {
  db,
  exportData,
  importData,
  type AccountType,
} from "../db";

const ACCOUNT_TYPES: AccountType[] = [
  "현금",
  "예금",
  "적금",
  "투자",
  "부동산",
  "부채",
];

export default function Settings() {
  const members = useLiveQuery(() => db.members.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const fileRef = useRef<HTMLInputElement>(null);

  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState<AccountType>("예금");
  const [newAccOwner, setNewAccOwner] = useState("공동");
  const [newCatName, setNewCatName] = useState("");
  const [newCatKind, setNewCatKind] = useState<"수입" | "지출">("지출");

  async function doExport() {
    const json = await exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asset-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      !confirm(
        "가져오기를 하면 현재 데이터가 모두 백업 파일 내용으로 교체됩니다. 계속할까요?"
      )
    ) {
      e.target.value = "";
      return;
    }
    const text = await file.text();
    try {
      await importData(text);
      alert("가져오기 완료!");
    } catch (err) {
      alert("가져오기 실패: 올바른 백업 파일이 아닙니다.");
    }
    e.target.value = "";
  }

  return (
    <div>
      <header className="page-head">
        <h1>설정 · 백업</h1>
      </header>

      <div className="card">
        <h3>💾 데이터 백업</h3>
        <p className="muted">
          데이터는 이 브라우저에만 저장됩니다. 정기적으로 JSON으로 내보내 백업하세요.
          다른 PC로 옮길 때도 이 파일을 가져오기 하면 됩니다.
        </p>
        <div className="row-btns">
          <button className="btn-primary" onClick={doExport}>
            내보내기 (JSON 저장)
          </button>
          <button
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            가져오기 (JSON 불러오기)
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

      <div className="card">
        <h3>👫 구성원</h3>
        <div className="tag-list">
          {members?.map((m) => (
            <span
              key={m.id}
              className="chip lg"
              style={{ background: m.color }}
            >
              {m.name}
            </span>
          ))}
        </div>
        <p className="muted">
          기본값은 「남편」·「아내」입니다. 이름을 바꾸려면 아래에서 수정하세요.
        </p>
        {members?.map((m) => (
          <div key={m.id} className="inline-edit">
            <input
              defaultValue={m.name}
              onBlur={(e) =>
                db.members.update(m.id!, { name: e.target.value.trim() || m.name })
              }
            />
            <input
              type="color"
              defaultValue={m.color}
              onChange={(e) => db.members.update(m.id!, { color: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="card">
        <h3>🏦 계좌 / 자산 계정</h3>
        <table className="tx-table">
          <tbody>
            {accounts?.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td className="muted">{a.type}</td>
                <td className="muted">{a.owner}</td>
                <td className="right">
                  <button
                    className="del"
                    onClick={() =>
                      confirm(`「${a.name}」 계좌를 삭제할까요?`) &&
                      db.accounts.delete(a.id!)
                    }
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="add-row">
          <input
            placeholder="계좌 이름"
            value={newAccName}
            onChange={(e) => setNewAccName(e.target.value)}
          />
          <select
            value={newAccType}
            onChange={(e) => setNewAccType(e.target.value as AccountType)}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            value={newAccOwner}
            onChange={(e) => setNewAccOwner(e.target.value)}
          >
            <option value="공동">공동</option>
            {members?.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            className="btn-secondary"
            onClick={async () => {
              if (!newAccName.trim()) return;
              await db.accounts.add({
                name: newAccName.trim(),
                type: newAccType,
                owner: newAccOwner,
              });
              setNewAccName("");
            }}
          >
            추가
          </button>
        </div>
      </div>

      <div className="card">
        <h3>🏷️ 분류 카테고리</h3>
        <div className="tag-list">
          {categories?.map((c) => (
            <span key={c.id} className="cat-tag">
              <span className="dot" style={{ background: c.color }} />
              {c.name}
              <span className="muted">({c.kind})</span>
              <button
                className="del sm"
                onClick={() =>
                  confirm(`「${c.name}」 분류를 삭제할까요?`) &&
                  db.categories.delete(c.id!)
                }
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <div className="add-row">
          <input
            placeholder="분류 이름"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
          />
          <select
            value={newCatKind}
            onChange={(e) => setNewCatKind(e.target.value as "수입" | "지출")}
          >
            <option value="지출">지출</option>
            <option value="수입">수입</option>
          </select>
          <button
            className="btn-secondary"
            onClick={async () => {
              if (!newCatName.trim()) return;
              const palette = ["#ef4444", "#f97316", "#22c55e", "#06b6d4", "#8b5cf6", "#ec4899"];
              await db.categories.add({
                name: newCatName.trim(),
                kind: newCatKind,
                color: palette[Math.floor(Math.random() * palette.length)],
              });
              setNewCatName("");
            }}
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
