import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
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
import { datetimeLabel, relativeTime, won, wonShort } from "../format";
import { getNetWorthGoal, getTossStockConfig } from "../prefs";
import {
  investmentCumulativeTrend,
  latestNetWorth,
  netWorthTrend,
} from "../sheetCompute";
import { fetchTossPortfolio, type TossPortfolio } from "../tossStock";
import { useSheetData } from "../useSheetData";

// Ledger.tsx의 파스텔 카테고리 팔레트와 같은 톤으로 맞춘 자산 종류별 색상.
const TYPE_COLORS: Record<string, string> = {
  예금: "#6cadff",
  투자: "#a09eff",
  부동산: "#f48a63",
  연금: "#41c690",
  보증금: "#de9c31",
  대출: "#f7857d",
  기타: "#b8b4c7",
};

function colorForType(name: string): string {
  return TYPE_COLORS[name] ?? "#b8b4c7";
}

export default function Assets() {
  const { settings, data, loading, error, signedIn, refresh, connectAndSync } =
    useSheetData();

  const netWorthPoints = useMemo(
    () => (data ? netWorthTrend(data.assetSnapshots) : []),
    [data]
  );
  const latestNW = useMemo(
    () => (data ? latestNetWorth(data.assetSnapshots) : null),
    [data]
  );
  const investTrend = useMemo(
    () => (data ? investmentCumulativeTrend(data.transactions) : []),
    [data]
  );

  const goal = getNetWorthGoal();

  const yearGrowth = useMemo(() => {
    if (netWorthPoints.length === 0) return null;
    const thisYear = new Date().getFullYear();
    const priorPoints = netWorthPoints.filter(
      (p) => new Date(p.date).getFullYear() < thisYear
    );
    if (priorPoints.length === 0) return null;
    const baseline = priorPoints[priorPoints.length - 1];
    const latest = netWorthPoints[netWorthPoints.length - 1];
    return latest.total - baseline.total;
  }, [netWorthPoints]);

  const typeBreakdown = useMemo(() => {
    if (!latestNW) return [];
    return Object.entries(latestNW.byType)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [latestNW]);

  // 대출은 자산현황에 이미 음수로 입력돼있으니(예: -94,800,000), 총부채는
  // 그 절댓값이고 총자산은 대출을 뺀 나머지 종류의 합이다.
  const totalDebt = Math.abs(latestNW?.byType["대출"] ?? 0);
  const totalAssets = (latestNW?.total ?? 0) + totalDebt;

  // 스냅샷을 기록할 때마다(반드시 매달은 아님) 직전 스냅샷 대비 증감을 붙여
  // "이력"으로 보여준다. 최신이 위로 오게 뒤집는다.
  const memberNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of netWorthPoints) for (const m of Object.keys(p.byMember)) set.add(m);
    return [...set];
  }, [netWorthPoints]);

  const netWorthHistory = useMemo(() => {
    return netWorthPoints
      .map((p, i) => {
        const prev = i > 0 ? netWorthPoints[i - 1] : null;
        const delta = prev ? p.total - prev.total : null;
        const deltaPct = prev && prev.total !== 0 ? ((p.total - prev.total) / Math.abs(prev.total)) * 100 : null;
        return { ...p, delta, deltaPct };
      })
      .reverse();
  }, [netWorthPoints]);

  const tossConfig = useMemo(() => getTossStockConfig(), []);
  const [tossData, setTossData] = useState<TossPortfolio | null>(null);
  const [tossLoading, setTossLoading] = useState(false);
  const [tossError, setTossError] = useState<string | null>(null);

  const refreshToss = useCallback(async () => {
    if (!tossConfig) return;
    setTossLoading(true);
    setTossError(null);
    try {
      setTossData(await fetchTossPortfolio(tossConfig.baseUrl, tossConfig.apiKey));
    } catch (err) {
      setTossError(err instanceof Error ? err.message : "TossStock 조회에 실패했습니다.");
    } finally {
      setTossLoading(false);
    }
  }, [tossConfig]);

  useEffect(() => {
    refreshToss();
  }, [refreshToss]);

  if (!settings) {
    return (
      <div>
        <header className="page-head">
          <h1>자산</h1>
        </header>
        <ConnectSheetPrompt loading={loading} error={error} onConnect={connectAndSync} />
      </div>
    );
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>자산</h1>
          <p className="muted">{settings.spreadsheetTitle} · 순자산 현황</p>
        </div>
        <div className="dash-controls">
          {signedIn ? (
            <button
              className="btn-secondary sm"
              disabled={loading}
              onClick={() => {
                refresh();
                refreshToss();
              }}
            >
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
              <div className="kpi-label">총자산 {latestNW?.date ? `(${latestNW.date})` : ""}</div>
              <div className="kpi-value income">{won(totalAssets)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">총부채</div>
              <div className="kpi-value expense">{won(totalDebt)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">순자산 (총자산 − 총부채)</div>
              <div className="kpi-value">{won(latestNW?.total ?? 0)}</div>
            </div>
          </section>

          <section className="kpi-row">
            <div className="kpi">
              <div className="kpi-label">올해 순자산 증가</div>
              <div className={"kpi-value " + (yearGrowth != null && yearGrowth >= 0 ? "income" : "expense")}>
                {yearGrowth != null ? won(yearGrowth) : "—"}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">목표까지 남은 금액</div>
              <div className="kpi-value">
                {goal != null && latestNW ? won(Math.max(goal - latestNW.total, 0)) : "—"}
              </div>
            </div>
          </section>

          <div className="card">
            <div className="budget-bar-head">
              <span>순자산 목표</span>
              {goal != null && latestNW ? (
                <span className="muted">
                  {won(latestNW.total)} / {won(goal)}
                </span>
              ) : (
                <span className="muted">목표 미설정</span>
              )}
            </div>
            {goal != null && latestNW ? (
              <div className="progress lg">
                <div
                  className="progress-fill achieved"
                  style={{ width: Math.min((latestNW.total / goal) * 100, 100) + "%" }}
                />
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                <Link to="/settings">설정</Link>에서 목표 순자산을 입력하면 진행률이 여기 표시됩니다.
              </p>
            )}
          </div>

          {tossConfig && (
            <div className="card">
              <div className="budget-bar-head">
                <span>TossStock 포트폴리오{tossData ? ` · ${tossData.accountAlias}` : ""}</span>
                {tossData && (
                  <span className={tossData.profitAmount >= 0 ? "income" : "expense"}>
                    {won(tossData.totalAssets)} ({tossData.profitAmount >= 0 ? "+" : ""}
                    {tossData.profitRate.toFixed(1)}%)
                  </span>
                )}
              </div>
              {tossLoading && !tossData ? (
                <p className="muted" style={{ margin: 0 }}>
                  불러오는 중…
                </p>
              ) : tossError ? (
                <p className="error-text" style={{ margin: 0 }}>
                  {tossError}
                </p>
              ) : tossData ? (
                <>
                  <p className="muted" style={{ marginTop: 8 }}>
                    예수금 {won(tossData.cash)} · 평가액 {won(tossData.holdingsEval)} · 투자원금{" "}
                    {won(tossData.holdingsCost)} · 손익 {won(tossData.profitAmount)}
                  </p>
                  <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
                    이 카드는 시트 기반 총자산·순자산 합계에는 포함되지 않아요. 자산현황 탭에
                    같은 계좌를 수기로도 적어두고 있었다면 중복이니 하나만 남겨두세요.
                  </p>
                  {tossData.holdings.length > 0 && (
                    <table className="tx-table">
                      <thead>
                        <tr>
                          <th>종목</th>
                          <th className="right">수량</th>
                          <th className="right">평가금액</th>
                          <th className="right">수익률</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tossData.holdings
                          .slice()
                          .sort((a, b) => b.valueKRW - a.valueKRW)
                          .map((h) => (
                            <tr key={h.symbol}>
                              <td>{h.name}</td>
                              <td className="right muted">{h.quantity}</td>
                              <td className="right">{won(h.valueKRW)}</td>
                              <td className={"right " + (h.profitRate >= 0 ? "income" : "expense")}>
                                {h.profitRate >= 0 ? "+" : ""}
                                {h.profitRate.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : null}
            </div>
          )}

          <section className="grid-2">
            <div className="card">
              <h3>순자산 추이</h3>
              {netWorthPoints.length === 0 ? (
                <Empty text="자산현황 탭에 계좌 잔액 스냅샷을 입력하면 여기 표시됩니다." />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={netWorthPoints.map((p) => ({ ...p, label: p.date }))}>
                      <defs>
                        <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4f6fc7" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#4f6fc7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={wonShort} tickLine={false} axisLine={false} width={52} />
                      <Tooltip formatter={(v: number) => won(v)} />
                      <Area
                        type="monotone"
                        dataKey="total"
                        name="순자산"
                        stroke="#4f6fc7"
                        strokeWidth={2}
                        fill="url(#nw)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  {latestNW && latestNW.date && (
                    <>
                      <p className="muted" style={{ marginTop: 10, marginBottom: 6 }}>
                        {latestNW.date} 기준
                      </p>
                      <div className="stat-row">
                        <div className="stat-chip">
                          <div className="stat-chip-label">총자산</div>
                          <div className="stat-chip-value">{won(latestNW.total)}</div>
                        </div>
                        {Object.entries(latestNW.byMember).map(([m, v]) => (
                          <div className="stat-chip" key={m}>
                            <div className="stat-chip-label">{m}</div>
                            <div className="stat-chip-value">{won(v)}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="card">
              <h3>자산 구성 비율</h3>
              {typeBreakdown.length === 0 ? (
                <Empty text="자산현황 탭에 계좌 잔액 스냅샷을 입력하면 여기 표시됩니다." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={typeBreakdown}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {typeBreakdown.map((t) => (
                        <Cell key={t.name} fill={colorForType(t.name)} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => won(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <h3>투자·저축 누적 추이</h3>
              {investTrend.length === 0 ? (
                <Empty text="분류가 '투자' 또는 '저축'인 지출이 쌓이면 여기 표시됩니다." />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={investTrend}>
                    <defs>
                      <linearGradient id="inv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#41c690" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#41c690" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={wonShort} tickLine={false} axisLine={false} width={52} />
                    <Tooltip formatter={(v: number) => won(v)} />
                    <Area type="monotone" dataKey="누적" stroke="#41c690" strokeWidth={2} fill="url(#inv)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <div className="card">
            <h3>자산 변동 이력</h3>
            <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
              자산현황 탭에 스냅샷을 기록할 때마다(꼭 매달일 필요는 없어요) 한 줄씩 쌓여요.
            </p>
            {netWorthHistory.length === 0 ? (
              <Empty text="자산현황 탭에 계좌 잔액 스냅샷을 입력하면 여기 표시됩니다." />
            ) : (
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th className="right">총자산</th>
                    <th className="right">증감</th>
                    <th className="right">증감률</th>
                    {memberNames.map((m) => (
                      <th key={m} className="right">
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {netWorthHistory.map((p) => (
                    <tr key={p.date}>
                      <td className="muted">{p.date}</td>
                      <td className="right">{won(p.total)}</td>
                      <td className={"right " + (p.delta == null ? "muted" : p.delta >= 0 ? "income" : "expense")}>
                        {p.delta == null ? "—" : `${p.delta >= 0 ? "+" : ""}${won(p.delta)}`}
                      </td>
                      <td className={"right " + (p.deltaPct == null ? "muted" : p.deltaPct >= 0 ? "income" : "expense")}>
                        {p.deltaPct == null ? "—" : `${p.deltaPct >= 0 ? "+" : ""}${p.deltaPct.toFixed(1)}%`}
                      </td>
                      {memberNames.map((m) => (
                        <td key={m} className="right muted">
                          {p.byMember[m] != null ? won(p.byMember[m]) : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
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
