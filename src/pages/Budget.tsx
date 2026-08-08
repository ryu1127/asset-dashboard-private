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

  const expenseGroups = useMemo(
    () => groupCategories(expenseCats),
    [expenseCats]
  );

  // 하위 카테고리가 있는 카테고리는 기본적으로 하위 예산의 합으로 계산되지만,
  // 상위 카테고리에 직접 금액을 입력하면 그 값이 우선한다(대략적으로만
  // 관리하고 싶은 "식비" 같은 경우). 이때는 하위 각각의 예산은 총계에서
  // 무시하고, 상위 하나로만 집계해 이중 계산을 막는다.
  const totals = useMemo(() => {
    let budget = 0;
    let spent = 0;
    for (const g of expenseGroups) {
      if (g.children.length === 0) {
        const b = budgetMap.get(g.parent.id!) ?? 0;
        if (b <= 0) continue;
        budget += b;
        spent += spentMap.get(g.parent.id!) ?? 0;
        continue;
      }
      const ownBudget = budgetMap.get(g.parent.id!) ?? 0;
      if (ownBudget > 0) {
        budget += ownBudget;
        spent +=
          (spentMap.get(g.parent.id!) ?? 0) +
          g.children.reduce((s, c) => s + (spentMap.get(c.id!) ?? 0), 0);
      } else {
        for (const c of g.children) {
          const b = budgetMap.get(c.id!) ?? 0;
          if (b <= 0) continue;
          budget += b;
          spent += spentMap.get(c.id!) ?? 0;
        }
      }
    }
    return { budget, spent, remaining: budget - spent };
  }, [expenseGroups, budgetMap, spentMap]);

  const overallPct =
    totals.budget > 0 ? Math.min((totals.spent / totals.budget) * 100, 100) : 0;
  const isOver = totals.spent > totals.budget && totals.budget > 0;

  function budgetRow(
    c: { id?: number; name: string; color: string },
    opts: {
      indent?: boolean;
      // 하위 카테고리가 있는 카테고리에만 전달됨: 상위에 직접 예산을 안
      // 걸었을 때 대신 보여줄 하위 합계, 그리고 이 가지 전체(상위+하위)의
      // 실제 지출 합.
      parentInfo?: { childBudgetSum: number; branchSpent: number };
    } = {}
  ) {
    const { indent, parentInfo } = opts;
    const ownBudget = budgetMap.get(c.id!) ?? 0;
    const isAutoSum = !!parentInfo && ownBudget <= 0;
    const budget = isAutoSum ? parentInfo!.childBudgetSum : ownBudget;
    const spent = parentInfo ? parentInfo.branchSpent : spentMap.get(c.id!) ?? 0;
    const pct = budget > 0 ? (spent / budget) * 100 : 0;
    const over = budget > 0 && spent > budget;
    const remaining = budget - spent;
    return (
      <tr key={c.id} className={indent ? "budget-child-row" : ""}>
        <td>
          <span className="dot" style={{ background: c.color }} />
          {c.name}
          {isAutoSum && <span className="budget-computed-tag">하위 합계</span>}
        </td>
        <td>
          <input
            className="bal-input budget-input"
            type="text"
            inputMode="numeric"
            placeholder={
              parentInfo && parentInfo.childBudgetSum > 0
                ? `합계 ${parentInfo.childBudgetSum.toLocaleString()}`
                : "미설정"
            }
            defaultValue={ownBudget > 0 ? ownBudget.toLocaleString() : ""}
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
            {expenseGroups.map((g) => {
              if (g.children.length === 0) {
                return <Fragment key={g.parent.id}>{budgetRow(g.parent)}</Fragment>;
              }
              const childBudgetSum = g.children.reduce(
                (sum, c) => sum + (budgetMap.get(c.id!) ?? 0),
                0
              );
              const branchSpent =
                (spentMap.get(g.parent.id!) ?? 0) +
                g.children.reduce((sum, c) => sum + (spentMap.get(c.id!) ?? 0), 0);
              return (
                <Fragment key={g.parent.id}>
                  {budgetRow(g.parent, { parentInfo: { childBudgetSum, branchSpent } })}
                  {g.children.map((c) => budgetRow(c, { indent: true }))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 12 }}>
          금액을 입력하고 칸 밖을 클릭하면 저장됩니다. 예산은 매월 동일하게
          적용되고, 0으로 지우면 예산이 해제됩니다. 하위 카테고리가 있는
          카테고리는 기본적으로 하위 예산의 합("하위 합계")으로 표시되지만,
          거기에 직접 금액을 입력하면 그 값이 우선 적용되고 하위별 예산은
          무시됩니다 — 「식비」처럼 대략적으로만 관리하고 싶을 때 쓰세요.
        </p>
      </div>
    </div>
  );
}
