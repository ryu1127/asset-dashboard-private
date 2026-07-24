import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, postDueRecurring, type Kind } from "../db";
import { currentMonth, won } from "../format";

export default function Recurring() {
  const members = useLiveQuery(() => db.members.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const rules = useLiveQuery(() => db.recurring.toArray(), []);

  const [kind, setKind] = useState<Kind>("수입");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [memberId, setMemberId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [accountId, setAccountId] = useState<number | "">("");
  const [dayOfMonth, setDayOfMonth] = useState("25");
  const [startMonth, setStartMonth] = useState(currentMonth());

  const catOptions = useMemo(
    () => (categories ?? []).filter((c) => c.kind === kind),
    [categories, kind]
  );
  const memberMap = useMemo(() => {
    const m = new Map<number, { name: string; color: string }>();
    members?.forEach((x) => m.set(x.id!, x));
    return m;
  }, [members]);
  const catMap = useMemo(() => {
    const m = new Map<number, { name: string; color: string }>();
    categories?.forEach((x) => m.set(x.id!, x));
    return m;
  }, [categories]);

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount.replace(/,/g, ""));
    if (!memo.trim()) return alert("이름/메모를 입력하세요. (예: 월급)");
    if (!amt || amt <= 0) return alert("금액을 입력하세요.");
    if (memberId === "") return alert("구성원을 선택하세요.");
    if (categoryId === "") return alert("분류를 선택하세요.");
    const day = Math.max(1, Math.min(31, Number(dayOfMonth) || 1));

    await db.recurring.add({
      memo: memo.trim(),
      kind,
      amount: amt,
      memberId: Number(memberId),
      categoryId: Number(categoryId),
      accountId: accountId === "" ? undefined : Number(accountId),
      dayOfMonth: day,
      startMonth,
      active: true,
    });
    // 시작월이 이번 달 이하이면 즉시 반영
    const n = await postDueRecurring();
    setMemo("");
    setAmount("");
    setCategoryId("");
    if (n > 0) alert(`규칙을 등록하고 ${n}건의 거래를 자동 생성했습니다.`);
  }

  async function toggle(id: number, active: boolean) {
    await db.recurring.update(id, { active });
    if (active) await postDueRecurring();
  }

  async function remove(id: number) {
    if (
      confirm(
        "이 반복 규칙을 삭제할까요?\n(이미 생성된 과거 거래 내역은 그대로 남습니다)"
      )
    )
      await db.recurring.delete(id);
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>반복 거래</h1>
          <p className="muted">
            월급·구독료처럼 매월 반복되는 항목을 등록하면 자동으로 기록됩니다.
          </p>
        </div>
      </header>

      <form className="card entry-form" onSubmit={addRule}>
        <div className="kind-toggle">
          <button
            type="button"
            className={kind === "수입" ? "active income" : ""}
            onClick={() => {
              setKind("수입");
              setCategoryId("");
            }}
          >
            수입
          </button>
          <button
            type="button"
            className={kind === "지출" ? "active expense" : ""}
            onClick={() => {
              setKind("지출");
              setCategoryId("");
            }}
          >
            지출
          </button>
        </div>

        <div className="form-grid">
          <label>
            이름 / 메모
            <input
              type="text"
              placeholder="예: 월급, 넷플릭스"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </label>
          <label>
            금액
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={amount}
              onChange={(e) =>
                setAmount(
                  e.target.value.replace(/[^\d]/g, "")
                    ? Number(e.target.value.replace(/[^\d]/g, "")).toLocaleString()
                    : ""
                )
              }
            />
          </label>
          <label>
            구성원
            <select
              value={memberId}
              onChange={(e) =>
                setMemberId(e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">선택</option>
              {members?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            분류
            <select
              value={categoryId}
              onChange={(e) =>
                setCategoryId(e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">선택</option>
              {catOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            매월 며칠
            <input
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
            />
          </label>
          <label>
            시작 월
            <input
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
            />
          </label>
        </div>

        <button type="submit" className="btn-primary">
          + 반복 규칙 등록
        </button>
      </form>

      <div className="card">
        <h3>등록된 반복 규칙</h3>
        {(rules ?? []).length === 0 ? (
          <div className="empty">
            아직 등록된 반복 규칙이 없어요.
            <br />
            위에서 월급이나 구독료를 등록해 보세요.
          </div>
        ) : (
          <table className="tx-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>구성원</th>
                <th>분류</th>
                <th>주기</th>
                <th className="right">금액</th>
                <th className="right">상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules?.map((r) => {
                const mem = memberMap.get(r.memberId);
                const cat = catMap.get(r.categoryId);
                return (
                  <tr key={r.id} className={r.active ? "" : "row-off"}>
                    <td>{r.memo}</td>
                    <td>
                      <span
                        className="chip"
                        style={{ background: mem?.color ?? "#94a3b8" }}
                      >
                        {mem?.name ?? "?"}
                      </span>
                    </td>
                    <td>
                      <span
                        className="dot"
                        style={{ background: cat?.color ?? "#94a3b8" }}
                      />
                      {cat?.name ?? "?"}
                    </td>
                    <td className="muted">매월 {r.dayOfMonth}일</td>
                    <td
                      className={
                        "right " + (r.kind === "수입" ? "income" : "expense")
                      }
                    >
                      {r.kind === "수입" ? "+" : "-"}
                      {won(r.amount)}
                    </td>
                    <td className="right">
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={r.active}
                          onChange={(e) => toggle(r.id!, e.target.checked)}
                        />
                        <span>{r.active ? "켜짐" : "꺼짐"}</span>
                      </label>
                    </td>
                    <td className="right">
                      <button className="del" onClick={() => remove(r.id!)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ marginTop: 12 }}>
          앱을 열 때마다 밀린 달까지 자동으로 거래가 생성됩니다(중복 없음). 생성된
          거래는 「거래 입력」 목록에서 확인·수정·삭제할 수 있어요.
        </p>
      </div>
    </div>
  );
}
