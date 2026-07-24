import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
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
import { db } from "../db";
import {
  currentMonth,
  lastMonths,
  monthLabel,
  monthOf,
  won,
  wonShort,
} from "../format";

export default function Dashboard() {
  const [memberFilter, setMemberFilter] = useState<number | "all">("all");

  const members = useLiveQuery(() => db.members.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const txs = useLiveQuery(() => db.transactions.toArray(), []);

  const catMap = useMemo(() => {
    const m = new Map<number, { name: string; color: string; kind: string }>();
    categories?.forEach((c) => m.set(c.id!, c));
    return m;
  }, [categories]);

  const memberMap = useMemo(() => {
    const m = new Map<number, { name: string; color: string }>();
    members?.forEach((x) => m.set(x.id!, x));
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    if (!txs) return [];
    return memberFilter === "all"
      ? txs
      : txs.filter((t) => t.memberId === memberFilter);
  }, [txs, memberFilter]);

  const cm = currentMonth();

  // ---- 이번 달 요약 ----
  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of filtered) {
      if (monthOf(t.date) !== cm) continue;
      if (t.kind === "수입") income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, saving: income - expense };
  }, [filtered, cm]);

  // ---- 최근 6개월 수입 vs 지출 ----
  const monthly = useMemo(() => {
    const months = lastMonths(6);
    const base: Record<string, { month: string; 수입: number; 지출: number }> =
      {};
    months.forEach((m) => (base[m] = { month: monthLabel(m), 수입: 0, 지출: 0 }));
    for (const t of filtered) {
      const m = monthOf(t.date);
      if (!base[m]) continue;
      if (t.kind === "수입") base[m].수입 += t.amount;
      else base[m].지출 += t.amount;
    }
    return months.map((m) => base[m]);
  }, [filtered]);

  // ---- 누적 순자산(저축) 추이: 전체 기간 월별 순현금흐름 누적 ----
  const cumulative = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filtered) {
      const m = monthOf(t.date);
      map.set(m, (map.get(m) ?? 0) + (t.kind === "수입" ? t.amount : -t.amount));
    }
    const months = [...map.keys()].sort();
    let acc = 0;
    return months.map((m) => {
      acc += map.get(m)!;
      return { month: monthLabel(m), 누적저축: acc };
    });
  }, [filtered]);

  // ---- 이번 달 카테고리별 지출 ----
  const byCategory = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of filtered) {
      if (t.kind !== "지출" || monthOf(t.date) !== cm) continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
    }
    return [...map.entries()]
      .map(([id, value]) => ({
        name: catMap.get(id)?.name ?? "기타",
        color: catMap.get(id)?.color ?? "#94a3b8",
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filtered, cm, catMap]);

  // ---- 구성원별 이번 달 수입/지출 비교 ----
  const byMember = useMemo(() => {
    if (!members) return [];
    return members.map((mem) => {
      let income = 0;
      let expense = 0;
      for (const t of txs ?? []) {
        if (t.memberId !== mem.id || monthOf(t.date) !== cm) continue;
        if (t.kind === "수입") income += t.amount;
        else expense += t.amount;
      }
      return { name: mem.name, color: mem.color, 수입: income, 지출: expense };
    });
  }, [members, txs, cm]);

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>대시보드</h1>
          <p className="muted">{cm.replace("-", "년 ")}월 현황</p>
        </div>
        <div className="seg">
          <button
            className={memberFilter === "all" ? "active" : ""}
            onClick={() => setMemberFilter("all")}
          >
            부부 합산
          </button>
          {members?.map((m) => (
            <button
              key={m.id}
              className={memberFilter === m.id ? "active" : ""}
              onClick={() => setMemberFilter(m.id!)}
              style={
                memberFilter === m.id
                  ? { background: m.color, borderColor: m.color }
                  : undefined
              }
            >
              {m.name}
            </button>
          ))}
        </div>
      </header>

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
          <div
            className={"kpi-value " + (summary.saving >= 0 ? "income" : "expense")}
          >
            {won(summary.saving)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">저축률</div>
          <div className="kpi-value">
            {summary.income > 0
              ? Math.round((summary.saving / summary.income) * 100) + "%"
              : "—"}
          </div>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>최근 6개월 수입 vs 지출</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={wonShort}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip formatter={(v: number) => won(v)} />
              <Legend />
              <Bar dataKey="수입" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="지출" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>누적 저축 추이</h3>
          {cumulative.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={cumulative}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis
                  tickFormatter={wonShort}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip formatter={(v: number) => won(v)} />
                <Area
                  type="monotone"
                  dataKey="누적저축"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#grad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3>이번 달 지출 구성</h3>
          {byCategory.length === 0 ? (
            <Empty />
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
                >
                  {byCategory.map((c, i) => (
                    <Cell key={i} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => won(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3>구성원별 이번 달 비교</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byMember}>
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={wonShort}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip formatter={(v: number) => won(v)} />
              <Legend />
              <Bar dataKey="수입" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="지출" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function Empty() {
  return (
    <div className="empty">
      아직 데이터가 없어요.
      <br />
      「거래 입력」에서 내역을 추가해 보세요.
    </div>
  );
}
