import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import {
  db,
  exportData,
  importData,
  seedDefaultRules,
  type AccountType,
} from "../db";
import {
  downloadFromDrive,
  isSignedIn,
  signIn,
  uploadToDrive,
} from "../drive";
import { groupCategories } from "../categoryTree";
import CategorySelectOptions from "../components/CategorySelectOptions";

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
  const catRules = useLiveQuery(() => db.catRules.toArray(), []);
  const fileRef = useRef<HTMLInputElement>(null);

  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState<AccountType>("예금");
  const [newAccOwner, setNewAccOwner] = useState("공동");
  const [newCatName, setNewCatName] = useState("");
  const [newCatKind, setNewCatKind] = useState<"수입" | "지출">("지출");
  const [newCatParentId, setNewCatParentId] = useState<number | "">("");
  const [newRuleKeyword, setNewRuleKeyword] = useState("");
  const [newRuleCat, setNewRuleCat] = useState<number | "">("");
  const [driveConnected, setDriveConnected] = useState(isSignedIn());
  const [driveBusy, setDriveBusy] = useState(false);

  const catNameMap = new Map(categories?.map((c) => [c.id!, c]) ?? []);

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

  async function doDriveConnect() {
    setDriveBusy(true);
    try {
      await signIn();
      setDriveConnected(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "구글 로그인에 실패했습니다.");
    }
    setDriveBusy(false);
  }

  async function doDriveUpload() {
    setDriveBusy(true);
    try {
      const json = await exportData();
      await uploadToDrive(json);
      alert("구글 드라이브에 저장했습니다.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "드라이브 저장에 실패했습니다.");
    }
    setDriveBusy(false);
  }

  async function doDriveDownload() {
    if (
      !confirm(
        "드라이브에서 불러오면 현재 이 브라우저의 데이터가 모두 드라이브 백업 내용으로 교체됩니다. 계속할까요?"
      )
    )
      return;
    setDriveBusy(true);
    try {
      const json = await downloadFromDrive();
      await importData(json);
      alert("드라이브에서 불러오기 완료!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "드라이브 불러오기에 실패했습니다.");
    }
    setDriveBusy(false);
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
        <h3>☁️ 구글 드라이브 동기화</h3>
        <p className="muted">
          기기마다 데이터가 따로 저장되므로, 다른 기기에서 이어보려면 구글
          드라이브에 저장한 뒤 그 기기에서 불러오세요. 실시간 동기화가
          아니므로, 여러 기기에서 동시에 수정하면 나중에 저장한 내용이
          이전 내용을 덮어씁니다.
        </p>
        <div className="row-btns">
          {!driveConnected ? (
            <button
              className="btn-secondary"
              disabled={driveBusy}
              onClick={doDriveConnect}
            >
              구글 계정 연결
            </button>
          ) : (
            <>
              <button
                className="btn-primary"
                disabled={driveBusy}
                onClick={doDriveUpload}
              >
                드라이브에 저장
              </button>
              <button
                className="btn-secondary"
                disabled={driveBusy}
                onClick={doDriveDownload}
              >
                드라이브에서 불러오기
              </button>
            </>
          )}
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
        <p className="muted">
          카테고리 아래에 하위 카테고리를 만들 수 있어요. 예: 「급여」 아래
          「월급」·「상여/보너스」. 하위 카테고리가 없는 항목은 옆의 선택창으로
          다른 카테고리 아래로 옮길 수 있습니다.
        </p>
        {groupCategories(categories ?? []).map((g) => {
          const topLevelSameKind = (categories ?? []).filter(
            (c) => !c.parentId && c.kind === g.parent.kind
          );
          return (
            <details key={g.parent.id} className="cat-tree" open>
              <summary className="cat-tree-head">
                <span className="dot" style={{ background: g.parent.color }} />
                <b>{g.parent.name}</b>
                <span className="muted">({g.parent.kind})</span>
                {g.children.length === 0 && (
                  <select
                    className="parent-select"
                    value=""
                    onChange={(e) => {
                      if (e.target.value === "") return;
                      db.categories.update(g.parent.id!, {
                        parentId: Number(e.target.value),
                      });
                    }}
                  >
                    <option value="">하위로 옮기기...</option>
                    {topLevelSameKind
                      .filter((p) => p.id !== g.parent.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          「{p.name}」 하위로
                        </option>
                      ))}
                  </select>
                )}
                <button
                  className="del sm"
                  onClick={() => {
                    if (g.children.length > 0) {
                      alert(
                        "하위 카테고리가 있는 카테고리는 삭제할 수 없습니다. 하위 카테고리를 먼저 삭제하거나 옮기세요."
                      );
                      return;
                    }
                    if (confirm(`「${g.parent.name}」 분류를 삭제할까요?`))
                      db.categories.delete(g.parent.id!);
                  }}
                >
                  ✕
                </button>
              </summary>
              {g.children.length > 0 && (
                <div className="cat-tree-body">
                  {g.children.map((c) => (
                    <span key={c.id} className="cat-tag child-row">
                      <span className="dot" style={{ background: c.color }} />
                      {c.name}
                      <select
                        className="parent-select"
                        value={c.parentId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          db.categories.update(c.id!, {
                            parentId: v === "" ? undefined : Number(v),
                          });
                        }}
                      >
                        <option value="">최상위로</option>
                        {topLevelSameKind
                          .filter((p) => p.id !== c.id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              「{p.name}」 하위로
                            </option>
                          ))}
                      </select>
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
              )}
            </details>
          );
        })}
        <div className="add-row">
          <input
            placeholder="분류 이름"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
          />
          <select
            value={newCatParentId}
            onChange={(e) => {
              const v = e.target.value;
              setNewCatParentId(v === "" ? "" : Number(v));
              if (v !== "") {
                const p = categories?.find((c) => c.id === Number(v));
                if (p) setNewCatKind(p.kind);
              }
            }}
          >
            <option value="">최상위 카테고리로 추가</option>
            {(categories ?? [])
              .filter((c) => !c.parentId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  「{p.name}」 하위로 추가
                </option>
              ))}
          </select>
          <select
            value={newCatKind}
            disabled={newCatParentId !== ""}
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
                parentId: newCatParentId === "" ? undefined : newCatParentId,
              });
              setNewCatName("");
              setNewCatParentId("");
            }}
          >
            추가
          </button>
        </div>
      </div>

      <div className="card">
        <div className="asset-head">
          <h3>🔎 적요 자동 분류 규칙</h3>
          <button
            className="btn-secondary"
            onClick={async () => {
              const n = await seedDefaultRules();
              alert(
                n > 0
                  ? `기본 규칙 ${n}개를 추가했습니다.`
                  : "추가할 새 기본 규칙이 없습니다."
              );
            }}
          >
            기본 규칙 채우기
          </button>
        </div>
        <p className="muted">
          CSV 가져오기 시 거래 내용(적요)에 아래 키워드가 포함되면 지정한 분류로
          자동 배정됩니다. 예: 「스타벅스」 → 식비.
        </p>
        <div className="tag-list" style={{ marginTop: 12 }}>
          {catRules?.length === 0 && (
            <span className="muted">
              규칙이 없습니다. 「기본 규칙 채우기」를 눌러 보세요.
            </span>
          )}
          {catRules?.map((r) => {
            const cat = catNameMap.get(r.categoryId);
            return (
              <span key={r.id} className="cat-tag">
                <b>{r.keyword}</b>
                <span className="muted">→</span>
                <span className="dot" style={{ background: cat?.color ?? "#94a3b8" }} />
                {cat?.name ?? "삭제된 분류"}
                <button
                  className="del sm"
                  onClick={() => db.catRules.delete(r.id!)}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
        <div className="add-row">
          <input
            placeholder="키워드 (예: 스타벅스)"
            value={newRuleKeyword}
            onChange={(e) => setNewRuleKeyword(e.target.value)}
          />
          <select
            value={newRuleCat}
            onChange={(e) =>
              setNewRuleCat(e.target.value === "" ? "" : Number(e.target.value))
            }
          >
            <option value="">분류 선택</option>
            <CategorySelectOptions categories={categories ?? []} />
          </select>
          <button
            className="btn-secondary"
            onClick={async () => {
              if (!newRuleKeyword.trim() || newRuleCat === "") return;
              await db.catRules.add({
                keyword: newRuleKeyword.trim(),
                categoryId: Number(newRuleCat),
              });
              setNewRuleKeyword("");
              setNewRuleCat("");
            }}
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
