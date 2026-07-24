import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db } from "../db";
import { currentMonth, monthLabel, won, wonShort } from "../format";

export default function Assets() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const snapshots = useLiveQuery(() => db.snapshots.toArray(), []);

  const [month, setMonth] = useState(currentMonth());
  const [balances, setBalances] = useState<Record<number, string>>({});

  const accMap = useMemo(() => {
    const m = new Map<number, { name: string; type: string; owner: string }>();
    accounts?.forEach((a) => m.set(a.id!, a));
    return m;
  }, [accounts]);

  // 선택 월의 기존 스냅샷을 폼에 채우기 위한 초기값
  const monthSnaps = useMemo(
    () => (snapshots ?? []).filter((s) => s.month === month),
    [snapshots, month]
  );

  function balanceFor(accId: number): string {
    if (accId in balances) return balances[accId];
    const s = monthSnaps.find((x) => x.accountId === accId);
    return s ? String(s.balance) : "";
  }

  async function save() {
    if (!accounts) return;
    await db.transaction("rw", db.snapshots, async () => {
      for (const a of accounts) {
        const raw = balanceFor(a.id!).replace(/,/g, "");
        if (raw === "") continue;
        const val = Number(raw);
        const existing = monthSnaps.find((x) => x.accountId === a.id);
        if (existing) {
          await db.snapshots.update(existing.id!, { balance: val });
        } else {
          await db.snapshots.add({ month, accountId: a.id!, balance: val });
        }
      }
    });
    setBalances({});
    alert(`${month} 자산 잔액을 저장했습니다.`);
  }

  // 순자산 추이 (부채는 차감)
  const netWorth = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const s of snapshots ?? []) {
      const acc = accMap.get(s.accountId);
      const signed = acc?.type === "부채" ? -s.balance : s.balance;
      byMonth.set(s.month, (byMonth.get(s.month) ?? 0) + signed);
    }
    return [...byMonth.keys()]
      .sort()
      .map((m) => ({ month: monthLabel(m), 순자산: byMonth.get(m)! }));
  }, [snapshots, accMap]);

  const latestNet = netWorth.length ? netWorth[netWorth.length - 1].순자산 : 0;

  return (
    <div>
      <header className="page-head">
        <h1>자산 현황</h1>
        <p className="muted">
          투자·예금 등은 매월 말 잔액을 입력해 순자산 추이를 기록하세요.
        </p>
      </header>

      <section className="kpi-row">
        <div className="kpi wide">
          <div className="kpi-label">최근 순자산</div>
          <div className="kpi-value">{won(latestNet)}</div>
        </div>
      </section>

      <div className="card">
        <h3>순자산 추이</h3>
        {netWorth.length === 0 ? (
          <div className="empty">
            아직 입력된 자산 잔액이 없어요. 아래에서 이번 달 잔액을 입력해 보세요.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={netWorth}>
              <defs>
                <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={wonShort}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip formatter={(v: number) => won(v)} />
              <Area
                type="monotone"
                dataKey="순자산"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#nw)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <div className="asset-head">
          <h3>월별 잔액 입력</h3>
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setBalances({});
            }}
          />
        </div>
        <table className="tx-table">
          <thead>
            <tr>
              <th>계좌</th>
              <th>유형</th>
              <th>소유</th>
              <th className="right">잔액</th>
            </tr>
          </thead>
          <tbody>
            {accounts?.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td className="muted">{a.type}</td>
                <td className="muted">{a.owner}</td>
                <td className="right">
                  <input
                    className="bal-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={
                      balanceFor(a.id!) === ""
                        ? ""
                        : Number(
                            balanceFor(a.id!).replace(/,/g, "")
                          ).toLocaleString()
                    }
                    onChange={(e) =>
                      setBalances((prev) => ({
                        ...prev,
                        [a.id!]: e.target.value.replace(/[^\d]/g, ""),
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn-primary" onClick={save}>
          {month} 잔액 저장
        </button>
      </div>
    </div>
  );
}
