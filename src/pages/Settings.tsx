import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useRef, useState } from "react";
import {
  db,
  exportData,
  importData,
  seedDefaultRules,
  type AccountType,
  type CatRule,
  type Category,
  type Kind,
} from "../db";
import {
  downloadFromDrive,
  getLastSavedAt,
  isSignedIn,
  signIn,
  uploadToDrive,
} from "../drive";
import { groupCategories } from "../categoryTree";
import { datetimeLabel, relativeTime } from "../format";

const PALETTE = ["#ef4444", "#f97316", "#22c55e", "#06b6d4", "#8b5cf6", "#ec4899"];

// 하위 카테고리를 그 자리에서 바로 추가하는 작은 인라인 입력
function AddChildCategory({ parentId, kind }: { parentId: number; kind: Kind }) {
  const [val, setVal] = useState("");
  async function submit() {
    if (!val.trim()) return;
    await db.categories.add({
      name: val.trim(),
      kind,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      parentId,
    });
    setVal("");
  }
  return (
    <span className="inline-add">
      <input
        placeholder="+ 하위 카테고리"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          // 한글 등 IME로 조합 중일 때 Enter를 누르면 "조합 확정"과 "제출"
          // 두 번의 keydown이 잡혀 두 번 추가되는 버그가 있어, 조합 중에는
          // 무시한다.
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button className="btn-secondary sm" onClick={submit}>
        추가
      </button>
    </span>
  );
}

// 평소엔 작은 "이동" 링크만 보이다가, 클릭하면 그 자리에서 상위 카테고리
// 선택창이 나타나는 방식. 데이터(거래 내역)를 잃지 않고 재배치할 때만 사용.
function MoveCategory({
  cat,
  options,
}: {
  cat: Category;
  options: Category[];
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="link-btn" onClick={() => setOpen(true)}>
        이동
      </button>
    );
  }
  return (
    <select
      autoFocus
      className="parent-select"
      value={cat.parentId ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        db.categories.update(cat.id!, {
          parentId: v === "" ? undefined : Number(v),
        });
        setOpen(false);
      }}
      onBlur={() => setOpen(false)}
    >
      <option value="">최상위로</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          「{p.name}」 하위로
        </option>
      ))}
    </select>
  );
}

// 카테고리 하나에 연결된 적요 키워드 목록 + 그 자리에서 바로 추가하는 입력
function RuleChips({ categoryId, rules }: { categoryId: number; rules: CatRule[] }) {
  const [val, setVal] = useState("");
  async function submit() {
    if (!val.trim()) return;
    await db.catRules.add({ keyword: val.trim(), categoryId });
    setVal("");
  }
  return (
    <div className="tag-list" style={{ marginTop: 8 }}>
      {rules.map((r) => (
        <span key={r.id} className="cat-tag">
          {r.keyword}
          <button className="del sm" onClick={() => db.catRules.delete(r.id!)}>
            ✕
          </button>
        </span>
      ))}
      <span className="inline-add">
        <input
          placeholder="+ 키워드"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="btn-secondary sm" onClick={submit}>
          추가
        </button>
      </span>
    </div>
  );
}

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
  const [driveConnected, setDriveConnected] = useState(isSignedIn());
  const [driveBusy, setDriveBusy] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(getLastSavedAt());
  const [draggingCatId, setDraggingCatId] = useState<number | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<number | null>(null);

  // 같은 부모(형제)끼리만 순서를 바꿀 수 있다. 다른 그룹 위에 놓으면 무시.
  async function reorderCategory(draggedId: number, targetId: number) {
    if (draggedId === targetId) return;
    const dragged = categories?.find((c) => c.id === draggedId);
    const target = categories?.find((c) => c.id === targetId);
    if (!dragged || !target) return;
    if ((dragged.parentId ?? null) !== (target.parentId ?? null)) return;
    const siblings = (categories ?? [])
      .filter((c) => (c.parentId ?? null) === (dragged.parentId ?? null))
      .sort((a, b) => (a.order ?? a.id!) - (b.order ?? b.id!));
    const ids = siblings.map((c) => c.id!);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, draggedId);
    await db.transaction("rw", db.categories, async () => {
      for (let i = 0; i < next.length; i++) {
        await db.categories.update(next[i], { order: i });
      }
    });
  }

  const rulesByCategory = useMemo(() => {
    const m = new Map<number, CatRule[]>();
    catRules?.forEach((r) => {
      const arr = m.get(r.categoryId) ?? [];
      arr.push(r);
      m.set(r.categoryId, arr);
    });
    return m;
  }, [catRules]);

  const orphanRules = useMemo(
    () =>
      (catRules ?? []).filter(
        (r) => !categories?.some((c) => c.id === r.categoryId)
      ),
    [catRules, categories]
  );

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
      setLastSavedAt(getLastSavedAt());
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
        <p
          className={
            "muted drive-status" +
            (!lastSavedAt ||
            Date.now() - lastSavedAt.getTime() > 3 * 24 * 60 * 60 * 1000
              ? " stale"
              : "")
          }
        >
          {lastSavedAt
            ? `마지막 저장: ${datetimeLabel(lastSavedAt)} (${relativeTime(lastSavedAt)})`
            : "아직 드라이브에 저장한 적이 없어요."}
        </p>
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
          각 카테고리 아래에서 하위 카테고리를 바로 추가·삭제하세요. 예: 「급여」
          아래 「월급」·「상여/보너스」. ⠿를 끌어서 같은 레벨끼리 순서를 바꿀 수
          있어요.
        </p>
        {groupCategories(categories ?? []).map((g) => {
          const topLevelSameKind = (categories ?? []).filter(
            (c) => !c.parentId && c.kind === g.parent.kind && c.id !== g.parent.id
          );
          return (
            <div
              key={g.parent.id}
              className={
                "cat-block cat-row" +
                (dragOverCatId === g.parent.id ? " drag-over" : "")
              }
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCatId(g.parent.id!);
              }}
              onDragLeave={() =>
                setDragOverCatId((id) => (id === g.parent.id ? null : id))
              }
              onDrop={(e) => {
                e.preventDefault();
                if (draggingCatId != null) reorderCategory(draggingCatId, g.parent.id!);
                setDragOverCatId(null);
              }}
            >
              <div className="cat-block-head">
                <span
                  className="drag-handle"
                  draggable
                  title="끌어서 순서 변경"
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingCatId(g.parent.id!);
                  }}
                  onDragEnd={() => {
                    setDraggingCatId(null);
                    setDragOverCatId(null);
                  }}
                >
                  ⠿
                </span>
                <span className="dot" style={{ background: g.parent.color }} />
                <b>{g.parent.name}</b>
                <span className="muted">({g.parent.kind})</span>
                {g.children.length === 0 && (
                  <MoveCategory cat={g.parent} options={topLevelSameKind} />
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
              </div>
              <div className="cat-block-body">
                {g.children.map((c) => (
                  <span
                    key={c.id}
                    className={
                      "cat-tag child-row" +
                      (dragOverCatId === c.id ? " drag-over" : "")
                    }
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverCatId(c.id!);
                    }}
                    onDragLeave={() =>
                      setDragOverCatId((id) => (id === c.id ? null : id))
                    }
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingCatId != null) reorderCategory(draggingCatId, c.id!);
                      setDragOverCatId(null);
                    }}
                  >
                    <span
                      className="drag-handle"
                      draggable
                      title="끌어서 순서 변경"
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingCatId(c.id!);
                      }}
                      onDragEnd={() => {
                        setDraggingCatId(null);
                        setDragOverCatId(null);
                      }}
                    >
                      ⠿
                    </span>
                    <span className="dot" style={{ background: c.color }} />
                    {c.name}
                    <MoveCategory cat={c} options={topLevelSameKind} />
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
                <AddChildCategory parentId={g.parent.id!} kind={g.parent.kind} />
              </div>
            </div>
          );
        })}
        <div className="add-row">
          <input
            placeholder="새 최상위 카테고리 이름"
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
              await db.categories.add({
                name: newCatName.trim(),
                kind: newCatKind,
                color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
              });
              setNewCatName("");
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
          CSV 가져오기 시 거래 내용(적요)에 아래 키워드가 포함되면 그 카테고리로
          자동 배정됩니다. 카테고리별로 어떤 키워드가 연결되어 있는지 아래에서
          바로 보고 추가·삭제하세요.
        </p>
        {(catRules ?? []).length === 0 && (
          <p className="muted">규칙이 없습니다. 「기본 규칙 채우기」를 눌러 보세요.</p>
        )}
        {groupCategories(categories ?? []).map((g) => (
          <div key={g.parent.id} className="cat-block">
            <div className="cat-block-head">
              <span className="dot" style={{ background: g.parent.color }} />
              <b>{g.parent.name}</b>
            </div>
            <RuleChips
              categoryId={g.parent.id!}
              rules={rulesByCategory.get(g.parent.id!) ?? []}
            />
            {g.children.map((c) => (
              <div key={c.id} className="cat-block-sub">
                <div className="cat-block-head sub">
                  <span className="dot" style={{ background: c.color }} />
                  {c.name}
                </div>
                <RuleChips
                  categoryId={c.id!}
                  rules={rulesByCategory.get(c.id!) ?? []}
                />
              </div>
            ))}
          </div>
        ))}
        {orphanRules.length > 0 && (
          <div className="cat-block">
            <div className="cat-block-head">
              <span className="muted">삭제된 분류에 남은 규칙</span>
            </div>
            <div className="tag-list" style={{ marginTop: 8 }}>
              {orphanRules.map((r) => (
                <span key={r.id} className="cat-tag">
                  {r.keyword}
                  <button
                    className="del sm"
                    onClick={() => db.catRules.delete(r.id!)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
