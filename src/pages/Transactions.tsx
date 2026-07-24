import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, type Kind } from "../db";
import { todayISO, won } from "../format";

export default function Transactions() {
  const members = useLiveQuery(() => db.members.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const txs = useLiveQuery(
    () => db.transactions.orderBy("date").reverse().toArray(),
    []
  );

  // 입력 폼 상태
  const [kind, setKind] = useState<Kind>("지출");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [memberId, setMemberId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [accountId, setAccountId] = useState<number | "">("");
  const [memo, setMemo] = useState("");

  // 리스트 필터
  const [fMember, setFMember] = useState<number | "all">("all");
  const [fKind, setFKind] = useState<Kind | "all">("all");
  const [fMonth, setFMonth] = useState<string>("all");

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
  const accMap = useMemo(() => {
    const m = new Map<number, string>();
    accounts?.forEach((x) => m.set(x.id!, x.name));
    return m;
  }, [accounts]);

  const months = useMemo(() => {
    const s = new Set<string>();
    txs?.forEach((t) => s.add(t.date.slice(0, 7)));
    return [...s].sort().reverse();
  }, [txs]);

  const filtered = useMemo(() => {
    return (txs ?? []).filter((t) => {
      if (fMember !== "all" && t.memberId !== fMember) return false;
      if (fKind !== "all" && t.kind !== fKind) return false;
      if (fMonth !== "all" && t.date.slice(0, 7) !== fMonth) return false;
      return true;
    });
  }, [txs, fMember, fKind, fMonth]);

  const filteredTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    filtered.forEach((t) =>
      t.kind === "수입" ? (income += t.amount) : (expense += t.amount)
    );
    return { income, expense };
  }, [filtered]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount.replace(/,/g, ""));
    if (!amt || amt <= 0) return alert("금액을 입력하세요.");
    if (memberId === "") return alert("구성원을 선택하세요.");
    if (categoryId === "") return alert("분류를 선택하세요.");

    await db.transactions.add({
      date,
      kind,
      amount: amt,
      memberId: Number(memberId),
      categoryId: Number(categoryId),
      accountId: accountId === "" ? undefined : Number(accountId),
      memo: memo.trim() || undefined,
    });
    setAmount("");
    setMemo("");
    setCategoryId("");
  }

  async function remove(id: number) {
    if (confirm("이 내역을 삭제할까요?")) await db.transactions.delete(id);
  }

  return (
    <div>
      <header className="page-head">
        <h1>거래 입력</h1>
      </header>

      <form className="card entry-form" onSubmit={handleSubmit}>
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
            날짜
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
                    ? Number(
                        e.target.value.replace(/[^\d]/g, "")
                      ).toLocaleString()
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
                setCategoryId(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
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
            계좌 (선택)
            <select
              value={accountId}
              onChange={(e) =>
                setAccountId(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
            >
              <option value="">선택 안 함</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            메모 (선택)
            <input
              type="text"
              placeholder="예: 마트 장보기"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </label>
        </div>

        <button type="submit" className="btn-primary">
          + 내역 추가
        </button>
      </form>

      <div className="list-filters">
        <select
          value={fMember}
          onChange={(e) =>
            setFMember(e.target.value === "all" ? "all" : Number(e.target.value))
          }
        >
          <option value="all">전체 구성원</option>
          {members?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select value={fKind} onChange={(e) => setFKind(e.target.value as any)}>
          <option value="all">수입+지출</option>
          <option value="수입">수입만</option>
          <option value="지출">지출만</option>
        </select>
        <select value={fMonth} onChange={(e) => setFMonth(e.target.value)}>
          <option value="all">전체 기간</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div className="filter-totals">
          <span className="income">수입 {won(filteredTotals.income)}</span>
          <span className="expense">지출 {won(filteredTotals.expense)}</span>
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty">내역이 없습니다.</div>
        ) : (
          <table className="tx-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>구성원</th>
                <th>분류</th>
                <th>메모</th>
                <th className="right">금액</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const mem = memberMap.get(t.memberId);
                const cat = catMap.get(t.categoryId);
                return (
                  <tr key={t.id}>
                    <td className="muted">{t.date}</td>
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
                    <td className="muted">{t.memo ?? ""}</td>
                    <td
                      className={"right " + (t.kind === "수입" ? "income" : "expense")}
                    >
                      {t.kind === "수입" ? "+" : "-"}
                      {won(t.amount)}
                    </td>
                    <td className="right">
                      <button className="del" onClick={() => remove(t.id!)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
