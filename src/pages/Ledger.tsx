import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ConnectSheetPrompt from "../components/ConnectSheetPrompt";
import {
  currentMonth,
  datetimeLabel,
  lastMonths,
  relativeTime,
  won,
  wonShort,
} from "../format";
import {
  budgetAllocation,
  budgetVsActual,
  discoverMembers,
  expenseByCategory,
  incomeVsActual,
  memberComparison,
  monthlyTrend,
  monthTransactions,
  savingsRateTrend,
  summarizeMonth,
  yearSummary,
} from "../sheetCompute";
import { useSheetData } from "../useSheetData";

// 파스텔 톤이면서도 색약 구분·명암비 최소 기준을 통과하도록 dataviz 스킬의
// validate_palette.js로 검증한 카테고리 팔레트 (기준 팔레트를 밝기↑·채도↓로 조정).
const PALETTE = [
  "#6cadff",
  "#f48a63",
  "#41c690",
  "#de9c31",
  "#f083ab",
  "#73c16d",
  "#a09eff",
  "#f7857d",
];

// "미분류"는 카테고리가 아니라 예산 밖 지출을 모은 통이라 팔레트와 구분되는 회색으로.
const UNCATEGORIZED_COLOR = "#b8b4c7";

// 5% 미만인 조각은 라벨을 생략해 겹침을 피한다 (범례로 확인 가능).
function donutPercentLabel({ percent }: { percent: number }): string {
  return percent >= 0.05 ? `${Math.round(percent * 100)}%` : "";
}

function deltaText(curr: number, prev: number): string {
  const diff = curr - prev;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  return `${sign}${won(Math.abs(diff))}`;
}

function skippedRowsLabel(rows: number[]): string {
  const shown = rows.slice(0, 8).join(", ");
  return rows.length > 8 ? `${shown} 외` : shown;
}

type TxSortKey = "date" | "category" | "subCategory" | "amount";

function sortArrow(active: boolean, dir: "asc" | "desc"): string {
  if (!active) return "";
  return dir === "asc" ? " ▲" : " ▼";
}

export default function Ledger() {
  const { settings, data, loading, error, signedIn, refresh, connectAndSync } =
    useSheetData();
  const [ym, setYm] = useState(currentMonth());
  const [memberFilter, setMemberFilter] = useState<string | "all">("all");

  const members = useMemo(() => (data ? discoverMembers(data) : []), [data]);

  // 대분류 색상은 예산설정 순서대로 팔레트를 하나씩 배정한다(해시로 정하면 서로
  // 다른 카테고리가 같은 색으로 겹쳤다). 대분류가 팔레트보다 많아지면 그때부터 순환.
  const colorFor = useMemo(() => {
    const order: string[] = [];
    for (const b of data?.budgetItems ?? []) {
      if (!order.includes(b.category)) order.push(b.category);
    }
    for (const t of data?.transactions ?? []) {
      if (t.kind === "지출" && !order.includes(t.category)) order.push(t.category);
    }
    return (name: string): string => {
      if (name === "미분류") return UNCATEGORIZED_COLOR;
      const i = order.indexOf(name);
      return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
    };
  }, [data]);

  const summary = useMemo(
    () =>
      data
        ? summarizeMonth(data.transactions, ym, memberFilter, members)
        : { income: 0, expense: 0, saving: 0, savingRate: null },
    [data, ym, memberFilter, members]
  );

  const months6 = useMemo(() => lastMonths(6), []);
  const trend = useMemo(
    () => (data ? monthlyTrend(data.transactions, months6, memberFilter, members) : []),
    [data, months6, memberFilter, members]
  );
  const savingsTrend = useMemo(
    () =>
      data ? savingsRateTrend(data.transactions, months6, memberFilter, members) : [],
    [data, months6, memberFilter, members]
  );

  const months12 = useMemo(() => lastMonths(12), []);
  const monthlySummary = useMemo(
    () =>
      data
        ? monthlyTrend(data.transactions, months12, memberFilter, members)
            .map((m) => {
              const saving = m.수입 - m.지출;
              return {
                ...m,
                saving,
                rate: m.수입 > 0 ? Math.round((saving / m.수입) * 100) : null,
              };
            })
            .reverse()
        : [],
    [data, months12, memberFilter, members]
  );

  const budgetGroups = useMemo(
    () => (data ? budgetVsActual(data.transactions, data.budgetItems, ym) : []),
    [data, ym]
  );
  const budgetTotals = useMemo(() => {
    let budget = 0;
    let actual = 0;
    for (const g of budgetGroups) {
      budget += g.budget;
      actual += g.actual;
    }
    return { budget, actual };
  }, [budgetGroups]);

  const [expandedBudgetCats, setExpandedBudgetCats] = useState<Set<string>>(new Set());
  const allBudgetCatsExpanded =
    budgetGroups.length > 0 && budgetGroups.every((g) => expandedBudgetCats.has(g.category));

  function toggleBudgetCat(cat: string) {
    setExpandedBudgetCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function toggleAllBudgetCats() {
    setExpandedBudgetCats(
      allBudgetCatsExpanded ? new Set() : new Set(budgetGroups.map((g) => g.category))
    );
  }

  const allocation = useMemo(
    () => (data ? budgetAllocation(data.budgetItems) : []),
    [data]
  );
  const allocationTotal = useMemo(
    () => allocation.reduce((sum, a) => sum + a.total, 0),
    [allocation]
  );

  const monthTx = useMemo(
    () =>
      data ? monthTransactions(data.transactions, ym, memberFilter, members) : [],
    [data, ym, memberFilter, members]
  );

  const [txCategoryFilter, setTxCategoryFilter] = useState("all");
  const [txSubCategoryFilter, setTxSubCategoryFilter] = useState("all");
  const [txSort, setTxSort] = useState<{ key: TxSortKey; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });

  // 달/구성원이 바뀌면 목록 자체가 달라지니, 이전 필터가 더 이상 말이 안
  // 될 수 있어 초기화한다.
  useEffect(() => {
    setTxCategoryFilter("all");
    setTxSubCategoryFilter("all");
  }, [ym, memberFilter]);

  const txCategories = useMemo(
    () => [...new Set(monthTx.map((t) => t.category))].sort(),
    [monthTx]
  );
  const txSubCategories = useMemo(() => {
    const pool =
      txCategoryFilter === "all"
        ? monthTx
        : monthTx.filter((t) => t.category === txCategoryFilter);
    return [...new Set(pool.map((t) => t.subCategory))].sort();
  }, [monthTx, txCategoryFilter]);

  function toggleTxSort(key: TxSortKey) {
    setTxSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "date" || key === "amount" ? "desc" : "asc" }
    );
  }

  const filteredTx = useMemo(() => {
    let rows = monthTx;
    if (txCategoryFilter !== "all") rows = rows.filter((t) => t.category === txCategoryFilter);
    if (txSubCategoryFilter !== "all") {
      rows = rows.filter((t) => t.subCategory === txSubCategoryFilter);
    }
    const dir = txSort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (txSort.key) {
        case "date":
          return a.date.localeCompare(b.date) * dir;
        case "category":
          return a.category.localeCompare(b.category) * dir;
        case "subCategory":
          return a.subCategory.localeCompare(b.subCategory) * dir;
        case "amount":
          return (a.amountKRW - b.amountKRW) * dir;
      }
    });
  }, [monthTx, txCategoryFilter, txSubCategoryFilter, txSort]);

  const [incomeSectionOpen, setIncomeSectionOpen] = useState(false);

  const incomeGroups = useMemo(
    () => (data ? incomeVsActual(data.transactions, data.incomeTargets, ym) : []),
    [data, ym]
  );
  const incomeTotals = useMemo(() => {
    let target = 0;
    let actual = 0;
    for (const g of incomeGroups) {
      target += g.targetTotal;
      actual += g.actualTotal;
    }
    return { target, actual };
  }, [incomeGroups]);

  const byCategory = useMemo(
    () => (data ? expenseByCategory(data.transactions, ym, memberFilter, members) : []),
    [data, ym, memberFilter, members]
  );

  const byMember = useMemo(
    () => (data ? memberComparison(data.transactions, ym, members) : []),
    [data, ym, members]
  );

  const yearCompare = useMemo(() => {
    if (!data) return null;
    const thisYear = ym.slice(0, 4);
    const lastYear = String(Number(thisYear) - 1);
    return {
      thisYear: yearSummary(data.transactions, thisYear),
      lastYear: yearSummary(data.transactions, lastYear),
    };
  }, [data, ym]);

  if (!settings) {
    return (
      <div>
        <header className="page-head">
          <h1>가계부</h1>
        </header>
        <ConnectSheetPrompt loading={loading} error={error} onConnect={connectAndSync} />
      </div>
    );
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>가계부</h1>
          <p className="muted">
            {settings.spreadsheetTitle} · {ym.replace("-", "년 ")}월 현황
          </p>
        </div>
        <div className="dash-controls">
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            style={{ width: "auto" }}
          />
          <div className="seg">
            <button
              className={memberFilter === "all" ? "active" : ""}
              onClick={() => setMemberFilter("all")}
            >
              부부 합산
            </button>
            {members.map((m) => (
              <button
                key={m}
                className={memberFilter === m ? "active" : ""}
                onClick={() => setMemberFilter(m)}
              >
                {m}
              </button>
            ))}
          </div>
          {signedIn ? (
            <button className="btn-secondary sm" disabled={loading} onClick={refresh}>
              {loading ? "동기화 중…" : "새로고침"}
            </button>
          ) : (
            <button className="btn-primary sm" disabled={loading} onClick={connectAndSync}>
              구글 계정 연결
            </button>
          )}
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}
      {data?.skippedTransactionRows && data.skippedTransactionRows.length > 0 && (
        <p className="error-text">
          날짜를 읽지 못해 합계에서 빠진 거래 {data.skippedTransactionRows.length}건이 있어요.
          거래내역 탭 {skippedRowsLabel(data.skippedTransactionRows)}행의 날짜를 확인해 주세요.
        </p>
      )}
      {data?.fetchedAt && (
        <p className="muted sync-status" title={datetimeLabel(new Date(data.fetchedAt))}>
          마지막 동기화: {relativeTime(new Date(data.fetchedAt))}
        </p>
      )}

      {!data ? (
        <div className="empty">시트를 불러오는 중…</div>
      ) : (
        <>
          <section className="kpi-row">
            <div className="kpi">
              <div className="kpi-label">이번 달 수입</div>
              <div className="kpi-value income">{won(summary.income)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">이번 달 지출</div>
              <div className="kpi-value expense">{won(summary.expense)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">이번 달 저축</div>
              <div className={"kpi-value " + (summary.saving >= 0 ? "income" : "expense")}>
                {won(summary.saving)}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">저축률</div>
              <div className="kpi-value">
                {summary.savingRate != null ? Math.round(summary.savingRate * 100) + "%" : "—"}
              </div>
            </div>
          </section>

          <div className="card">
            <h3>예산 구성</h3>
            <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
              예산설정 탭에 잡아둔 월 총 {won(allocationTotal)} 중 대분류별 비중이에요
              (월별 실제 지출과는 무관한, 설정 자체의 구성).
            </p>
            {allocation.length === 0 ? (
              <Empty text="예산설정 탭에 예산을 입력하면 여기 표시됩니다." />
            ) : (
              <div className="alloc-list">
                {allocation.map((a) => (
                  <div key={a.category} className="alloc-row">
                    <span className="dot" style={{ background: colorFor(a.category) }} />
                    <span className="alloc-name">{a.category}</span>
                    <div className="progress">
                      <div
                        className="progress-fill"
                        style={{ width: a.percent + "%", background: colorFor(a.category) }}
                      />
                    </div>
                    <span className="alloc-pct muted">{Math.round(a.percent)}%</span>
                    <span className="alloc-amt muted">{won(a.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="budget-bar-head">
              <span>이번 달 예산 대비 지출</span>
              <span className={budgetTotals.actual > budgetTotals.budget ? "expense" : "muted"}>
                {won(budgetTotals.actual)} / {won(budgetTotals.budget)}
              </span>
            </div>
            {budgetTotals.budget > 0 && (
              <div className="progress lg">
                <div
                  className={
                    "progress-fill " + (budgetTotals.actual > budgetTotals.budget ? "over" : "")
                  }
                  style={{
                    width: Math.min((budgetTotals.actual / budgetTotals.budget) * 100, 100) + "%",
                  }}
                />
              </div>
            )}
            {budgetGroups.length === 0 ? (
              <Empty text="예산설정 탭에 예산을 입력하면 여기 표시됩니다." />
            ) : (
              <div className="table-scroll"><table className="tx-table budget-table" style={{ marginTop: 16 }}>
                <thead>
                  <tr>
                    <th>
                      분류{" "}
                      <button className="link-btn" onClick={toggleAllBudgetCats}>
                        {allBudgetCatsExpanded ? "전체 접기" : "전체 펼치기"}
                      </button>
                    </th>
                    <th className="right">지출</th>
                    <th style={{ width: "34%" }}>진행률</th>
                    <th className="right">예산</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetGroups.map((g) => {
                    const pct = g.budget > 0 ? (g.actual / g.budget) * 100 : 0;
                    const over = g.budget > 0 && g.actual > g.budget;
                    const isOpen = expandedBudgetCats.has(g.category);
                    return (
                      <Fragment key={g.category}>
                        <tr className="budget-group-row" onClick={() => toggleBudgetCat(g.category)}>
                          <td>
                            <span className={"chevron" + (isOpen ? " open" : "")}>▸</span>
                            <span className="dot" style={{ background: colorFor(g.category) }} />
                            <b className={over ? "over-budget-label" : ""}>{g.category}</b>
                          </td>
                          <td className={"right " + (over ? "expense" : "")}>{won(g.actual)}</td>
                          <td>
                            {g.budget > 0 ? (
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
                          <td className="right muted">{g.budget > 0 ? won(g.budget) : "—"}</td>
                        </tr>
                        {isOpen &&
                          g.rows.map((r) => {
                            const rowOver = r.budget > 0 && r.actual > r.budget;
                            return (
                              <tr key={g.category + "|" + r.subCategory} className="budget-child-row">
                                <td className={rowOver ? "over-budget-label" : ""}>{r.subCategory}</td>
                                <td className={"right " + (rowOver ? "over-budget-label" : "muted")}>
                                  {r.actual > 0 ? won(r.actual) : "—"}
                                </td>
                                <td />
                                <td className="right muted">{r.budget > 0 ? won(r.budget) : "—"}</td>
                              </tr>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </div>

          <div className="card">
            <div className="budget-bar-head clickable" onClick={() => setIncomeSectionOpen((o) => !o)}>
              <span>
                <span className={"chevron" + (incomeSectionOpen ? " open" : "")}>▸</span>
                이번 달 수입 목표 대비 실제
              </span>
              <span className="muted">
                {won(incomeTotals.actual)} / {incomeTotals.target > 0 ? won(incomeTotals.target) : "목표 미설정"}
              </span>
            </div>
            {incomeSectionOpen && (incomeGroups.length === 0 ? (
              <Empty text="예산설정 탭 '수입 목표' 표를 채우면 여기 표시됩니다." />
            ) : (
              <div className="table-scroll"><table className="tx-table budget-table" style={{ marginTop: 16 }}>
                <thead>
                  <tr>
                    <th>항목</th>
                    <th className="right">실제</th>
                    <th style={{ width: "34%" }}>달성률</th>
                    <th className="right">목표</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeGroups.map((g) => {
                    const pct = g.targetTotal > 0 ? (g.actualTotal / g.targetTotal) * 100 : 0;
                    const achieved = g.targetTotal > 0 && g.actualTotal >= g.targetTotal;
                    return (
                      <Fragment key={g.item}>
                        <tr>
                          <td>
                            <b className={achieved ? "achieved-label" : ""}>{g.item}</b>
                          </td>
                          <td className={"right " + (achieved ? "achieved-label" : "")}>
                            {won(g.actualTotal)}
                          </td>
                          <td>
                            {g.targetTotal > 0 ? (
                              <div className="progress">
                                <div
                                  className={"progress-fill " + (achieved ? "achieved" : "")}
                                  style={{ width: Math.min(pct, 100) + "%" }}
                                />
                              </div>
                            ) : (
                              <span className="muted">목표 미설정</span>
                            )}
                          </td>
                          <td className="right muted">
                            {g.targetTotal > 0 ? won(g.targetTotal) : "—"}
                          </td>
                        </tr>
                        {g.rows.map((r) => (
                          <tr key={g.item + "|" + r.member} className="budget-child-row">
                            <td>{r.member || "명의 미지정"}</td>
                            <td className="right muted">{r.actual > 0 ? won(r.actual) : "—"}</td>
                            <td />
                            <td className="right muted">{r.target > 0 ? won(r.target) : "—"}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table></div>
            ))}
          </div>

          {yearCompare && (
            <div className="card">
              <h3>
                연간 요약 ({yearCompare.lastYear.year} → {yearCompare.thisYear.year})
              </h3>
              <div className="table-scroll"><table className="tx-table">
                <thead>
                  <tr>
                    <th></th>
                    <th className="right">{yearCompare.lastYear.year}</th>
                    <th className="right">{yearCompare.thisYear.year}</th>
                    <th className="right">증감</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>수입</td>
                    <td className="right muted">{won(yearCompare.lastYear.income)}</td>
                    <td className="right income">{won(yearCompare.thisYear.income)}</td>
                    <td className="right muted">
                      {deltaText(yearCompare.thisYear.income, yearCompare.lastYear.income)}
                    </td>
                  </tr>
                  <tr>
                    <td>지출</td>
                    <td className="right muted">{won(yearCompare.lastYear.expense)}</td>
                    <td className="right expense">{won(yearCompare.thisYear.expense)}</td>
                    <td className="right muted">
                      {deltaText(yearCompare.thisYear.expense, yearCompare.lastYear.expense)}
                    </td>
                  </tr>
                  <tr>
                    <td>순저축</td>
                    <td className="right muted">{won(yearCompare.lastYear.saving)}</td>
                    <td className="right">{won(yearCompare.thisYear.saving)}</td>
                    <td className="right muted">
                      {deltaText(yearCompare.thisYear.saving, yearCompare.lastYear.saving)}
                    </td>
                  </tr>
                </tbody>
              </table></div>
            </div>
          )}

          <div className="card">
            <h3>월별 요약 (최근 12개월)</h3>
            <div className="table-scroll"><table className="tx-table">
              <thead>
                <tr>
                  <th>월</th>
                  <th className="right">수입</th>
                  <th className="right">지출</th>
                  <th className="right">저축</th>
                  <th className="right">저축률</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td className="right muted">{m.수입 > 0 ? won(m.수입) : "—"}</td>
                    <td className="right muted">{m.지출 > 0 ? won(m.지출) : "—"}</td>
                    <td className={"right " + (m.saving >= 0 ? "income" : "expense")}>
                      {m.수입 === 0 && m.지출 === 0 ? "—" : won(m.saving)}
                    </td>
                    <td className="right muted">{m.rate != null ? `${m.rate}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          <section className="grid-2">
            <div className="card">
              <h3>최근 6개월 수입 vs 지출</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trend}>
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickFormatter={wonShort} tickLine={false} axisLine={false} width={48} />
                  <Tooltip formatter={(v: number) => won(v)} />
                  <Legend />
                  <Bar dataKey="수입" fill="#4f6fc7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="지출" fill="#bd4563" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3>저축률 추이</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={savingsTrend}>
                  <defs>
                    <linearGradient id="sr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#41c690" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#41c690" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    padding={{ left: 16, right: 16 }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${v}%`}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip formatter={(v: number | null) => (v == null ? "—" : `${v}%`)} />
                  <Area
                    type="monotone"
                    dataKey="저축률"
                    stroke="#41c690"
                    strokeWidth={2}
                    fill="url(#sr)"
                    connectNulls
                    dot={{ r: 4, strokeWidth: 0, fill: "#41c690" }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3>이번 달 지출 구성</h3>
              {byCategory.length === 0 ? (
                <Empty text="이번 달 지출 내역이 없어요." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      label={donutPercentLabel}
                      labelLine={false}
                    >
                      {byCategory.map((c) => (
                        <Cell key={c.name} fill={colorFor(c.name)} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => won(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {members.length > 0 && (
              <div className="card">
                <h3>구성원별 이번 달 수입</h3>
                <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
                  거래내역 탭의 "명의" 열에 이름을 적은 수입만 집계돼요. 명의를 비워둔
                  수입은 여기엔 안 잡히고 "부부 합산"에만 들어가요. 지출은 용돈처럼
                  소분류가 "용돈_이름"인 항목만 명의로 나뉘어요.
                </p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={byMember}>
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickFormatter={wonShort} tickLine={false} axisLine={false} width={48} />
                    <Tooltip formatter={(v: number) => won(v)} />
                    <Bar dataKey="수입" fill="#4f6fc7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div className="card">
            <h3>
              {ym.replace("-", "년 ")}월 거래내역{" "}
              {filteredTx.length === monthTx.length
                ? `(${monthTx.length}건)`
                : `(${filteredTx.length}/${monthTx.length}건)`}
            </h3>
            {monthTx.length === 0 ? (
              <Empty text="이 달 거래 내역이 없어요." />
            ) : (
              <>
                <div className="tx-filter-row">
                  <select
                    value={txCategoryFilter}
                    onChange={(e) => {
                      setTxCategoryFilter(e.target.value);
                      setTxSubCategoryFilter("all");
                    }}
                  >
                    <option value="all">전체 분류</option>
                    {txCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={txSubCategoryFilter}
                    onChange={(e) => setTxSubCategoryFilter(e.target.value)}
                  >
                    <option value="all">전체 소분류</option>
                    {txSubCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {(txCategoryFilter !== "all" || txSubCategoryFilter !== "all") && (
                    <button
                      className="btn-secondary sm"
                      onClick={() => {
                        setTxCategoryFilter("all");
                        setTxSubCategoryFilter("all");
                      }}
                    >
                      필터 초기화
                    </button>
                  )}
                </div>
                <div className="table-scroll"><table className="tx-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => toggleTxSort("date")}>
                        날짜{sortArrow(txSort.key === "date", txSort.dir)}
                      </th>
                      <th className="sortable" onClick={() => toggleTxSort("category")}>
                        분류{sortArrow(txSort.key === "category", txSort.dir)}
                      </th>
                      <th className="sortable" onClick={() => toggleTxSort("subCategory")}>
                        소분류{sortArrow(txSort.key === "subCategory", txSort.dir)}
                      </th>
                      <th>내용</th>
                      <th>자산</th>
                      <th className="right sortable" onClick={() => toggleTxSort("amount")}>
                        금액{sortArrow(txSort.key === "amount", txSort.dir)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTx.map((t, i) => (
                      <tr key={`${t.date}-${i}`}>
                        <td className="muted">{t.date}</td>
                        <td>{t.category}</td>
                        <td>{t.subCategory}</td>
                        <td className="muted tx-memo" title={t.memo}>
                          {t.memo || "—"}
                        </td>
                        <td className="muted">{t.account || "—"}</td>
                        <td className={"right " + (t.kind === "수입" ? "income" : "expense")}>
                          {t.kind === "수입" ? "+" : "−"}
                          {won(t.amountKRW)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
