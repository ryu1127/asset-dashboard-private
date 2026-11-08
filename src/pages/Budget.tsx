import { useMemo } from "react";
import ConnectSheetPrompt from "../components/ConnectSheetPrompt";
import { won } from "../format";
import { budgetAllocation } from "../sheetCompute";
import { useSheetData } from "../useSheetData";

// Ledger와 같은 파스텔 팔레트(대분류는 예산설정 순서대로 하나씩 배정).
const PALETTE = ["#6cadff", "#f48a63", "#41c690", "#de9c31", "#f083ab", "#73c16d", "#a09eff", "#f7857d"];

// 예산설정 탭에 잡아둔 월 예산의 구성을 대분류·소분류까지 자세히 보여주는 페이지.
// 월별 실제 지출과는 무관한 "설정 자체"를 본다. 실제 소비와의 비교는 가계부 화면에서 한다.
export default function Budget() {
  const { settings, data, loading, error, connectAndSync } = useSheetData();

  const allocation = useMemo(() => (data ? budgetAllocation(data.budgetItems) : []), [data]);
  const total = useMemo(() => allocation.reduce((s, a) => s + a.total, 0), [allocation]);
  const colorFor = (name: string) => {
    const i = allocation.findIndex((a) => a.category === name);
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
  };

  if (!settings) {
    return (
      <div>
        <header className="page-head">
          <h1>예산</h1>
        </header>
        <ConnectSheetPrompt loading={loading} error={error} onConnect={connectAndSync} />
      </div>
    );
  }

  return (
    <div>
      <header className="page-head">
        <h1>예산</h1>
      </header>
      {!data ? (
        <div className="empty">시트를 불러오는 중…</div>
      ) : (
        <>
          <div className="card">
            <h3>예산 구성</h3>
            <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
              예산설정 탭에 잡아둔 월 총 {won(total)} 중 대분류별 비중이에요 (월별 실제 지출과는 무관한,
              설정 자체의 구성).
            </p>
            {allocation.length === 0 ? (
              <div className="empty">예산설정 탭에 예산을 입력하면 여기 표시됩니다.</div>
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

          {allocation.map((a) => {
            const rows = data.budgetItems.filter((b) => b.category === a.category);
            return (
              <div className="card" key={a.category}>
                <div className="budget-bar-head">
                  <span>
                    <span className="dot" style={{ background: colorFor(a.category) }} /> {a.category}
                  </span>
                  <span className="muted">
                    월 {won(a.total)} · {Math.round(a.percent)}%
                  </span>
                </div>
                <div className="table-scroll">
                  <table className="tx-table" style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>소분류</th>
                        <th className="right">월 예산</th>
                        <th className="right">대분류 내 비중</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.subCategory}>
                          <td>{r.subCategory}</td>
                          <td className="right">{r.monthlyBudget > 0 ? won(r.monthlyBudget) : "—"}</td>
                          <td className="right muted">
                            {a.total > 0 ? Math.round((r.monthlyBudget / a.total) * 100) + "%" : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
