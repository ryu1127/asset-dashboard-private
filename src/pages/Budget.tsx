import { useLiveQuery } from "dexie-react-hooks";
import { Fragment, useMemo, useState } from "react";
import { db } from "../db";
import { currentMonth, monthOf, won } from "../format";
import { groupCategories } from "../categoryTree";

export default function Budget() {
  const [month, setMonth] = useState(currentMonth());
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const budgets = useLiveQuery(() => db.budgets.toArray(), []);
  const txs = useLiveQuery(() => db.transactions.toArray(), []);

  const expenseCats = useMemo(
    () => (categories ?? []).filter((c) => c.kind === "지출"),
    [categories]
  );

  // 카테고리별 예산 맵
  const budgetMap = useMemo(() => {
    const m = new Map<number, number>();
    budgets?.forEach((b) => m.set(b.categoryId, b.amount));
    return m;
  }, [budgets]);

  // 선택 월의 카테고리별 지출액
  const spentMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of txs ?? []) {
      if (t.kind !== "지출" || monthOf(t.date) !== month) continue;
      m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount);
    }
    return m;
  }, [txs, month]);

  async function setBudget(categoryId: number, raw: string) {
    const amount = Number(raw.replace(/[^\d]/g, ""));
    const existing = budgets?.find((b) => b.categoryId === categoryId);
    if (existing) {
      if (amount <= 0) await db.budgets.delete(existing.id!);
      else await db.budgets.update(existing.id!, { amount });
    } else if (amount > 0) {
      await db.budgets.add({ categoryId, amount });
    }
  }

  // 예산이 설정된 카테고리만 요약에 포함
  const totals = useMemo(() => {
    let budget = 0;
    let spent = 0;
    for (const c of expenseCats) {
      const b = budgetMap.get(c.id!) ?? 0;
      if (b <= 0) continue;
      budget += b;
      spent += spentMap.get(c.id!) ?? 0;
    }
    return { budget, spent, remaining: budget - spent };
  }, [expenseCats, budgetMap, spentMap]);

  const overallPct =
    totals.budget > 0 ? Math.min((totals.spent / totals.budget) * 100, 100) : 0;
  const isOver = totals.spent > totals.budget && totals.budget > 0;

  function budgetRow(c: { id?: number; name: string; color: string }, indent = false) {
    const budget = budgetMap.get(c.id!) ?? 0;
    const spent = spentMap.get(c.id!) ?? 0;
    const pct = budget > 0 ? (spent / budget) * 100 : 0;
    const over = budget > 0 && spent > budget;
    const remaining = budget - spent;
    return (
      <tr key={c.id} className={indent ? "budget-child-row" : ""}>
        <td>
          <span className="dot" style={{ background: c.color }} />
          {c.name}
        </td>
        <td>
          <input
            className="bal-input budget-input"
            type="text"
            inputMode="numeric"
            placeholder="미설정"
            defaultValue={budget > 0 ? budget.toLocaleString() : ""}
            onBlur={(e) => {
              setBudget(c.id!, e.target.value);
              const n = Number(e.target.value.replace(/[^\d]/g, ""));
              e.target.value = n > 0 ? n.toLocaleString() : "";
            }}
          />
        </td>
        <td className="right">{spent > 0 ? won(spent) : "—"}</td>
        <td>
          {budget > 0 ? (
            <div className="progress">
              <div
                className={"progress-fill " + (over ? "over" : "")}
                style={{ width: Math.min(pct, 100) + "%" }}
              />
            </div>
          ) : (
            <span className="muted">예산 미설정</span>
          )}
        </td>
        <td className={"right " + (over ? "expense" : "")}>
          {budget > 0 ? (over ? "-" : "") + won(Math.abs(remaining)) : "—"}
        </td>
      </tr>
    );
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>예산</h1>
          <p className="muted">카테고리별 월 예산을 정하고 소비를 관리하세요.</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{ width: "auto" }}
        />
      </header>

      <section className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">총 예산</div>
          <div className="kpi-value">{won(totals.budget)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">총 지출</div>
          <div className="kpi-value expense">{won(totals.spent)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{isOver ? "예산 초과" : "남은 예산"}</div>
          <div className={"kpi-value " + (isOver ? "expense" : "income")}>
            {won(Math.abs(totals.remaining))}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">예산 소진율</div>
          <div className={"kpi-value " + (isOver ? "expense" : "")}>
            {totals.budget > 0
              ? Math.round((totals.spent / totals.budget) * 100) + "%"
              : "—"}
          </div>
        </div>
      </section>

      {totals.budget > 0 && (
        <div className="card">
          <div className="budget-bar-head">
            <span>전체 예산 현황</span>
            <span className={isOver ? "expense" : "muted"}>
              {won(totals.spent)} / {won(totals.budget)}
            </span>
          </div>
          <div className="progress lg">
            <div
              className={"progress-fill " + (isOver ? "over" : "")}
              style={{ width: overallPct + "%" }}
            />
          </div>
        </div>
      )}

      <div className="card">
        <h3>카테고리별 예산</h3>
        <table className="tx-table budget-table">
          <thead>
            <tr>
              <th>카테고리</th>
              <th style={{ width: 160 }}>월 예산</th>
              <th className="right">지출</th>
              <th style={{ width: "34%" }}>진행률</th>
              <th className="right">남음</th>
            </tr>
          </thead>
          <tbody>
            {groupCategories(expenseCats).map((g) => (
              <Fragment key={g.parent.id}>
                {budgetRow(g.parent)}
                {g.children.map((c) => budgetRow(c, true))}
              </Fragment>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 12 }}>
          금액을 입력하고 칸 밖을 클릭하면 저장됩니다. 예산은 매월 동일하게
          적용되고, 0으로 지우면 예산이 해제됩니다.
        </p>
      </div>
    </div>
  );
}
