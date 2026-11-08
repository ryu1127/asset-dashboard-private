import { useEffect, useMemo, useState } from "react";
import ConnectSheetPrompt from "../components/ConnectSheetPrompt";
import { datetimeLabel, relativeTime, won } from "../format";
import { budgetAllocation } from "../sheetCompute";
import { updateBudgetAmounts, type BudgetAmountChange } from "../sheets";
import { useSheetData } from "../useSheetData";

// Ledger와 같은 파스텔 팔레트(대분류는 예산설정 순서대로 하나씩 배정).
const PALETTE = ["#6cadff", "#f48a63", "#41c690", "#de9c31", "#f083ab", "#73c16d", "#a09eff", "#f7857d"];

// 예산설정 탭의 월 예산을 대분류·소분류까지 보고, 소분류별 금액을 수정해 구글 시트에 바로 반영하는 페이지.
// 소분류 추가·삭제·이름 변경은 편한가계부 앱 카테고리와 어긋나지 않게 여기서 하지 않는다.
export default function Budget() {
  const { settings, data, loading, error, signedIn, refresh, connectAndSync } = useSheetData();

  // key: `${category}|${subCategory}` -> 입력 중인 문자열(쉼표 제거 숫자)
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const b of data.budgetItems) {
      next[`${b.category}|${b.subCategory}`] = String(b.monthlyBudget);
    }
    setDrafts(next);
  }, [data]);

  const effectiveItems = useMemo(() => {
    if (!data) return [];
    return data.budgetItems.map((b) => {
      const raw = drafts[`${b.category}|${b.subCategory}`];
      const num = raw == null ? b.monthlyBudget : Number(String(raw).replace(/[^0-9]/g, "")) || 0;
      return { ...b, monthlyBudget: num };
    });
  }, [data, drafts]);

  const changes = useMemo<BudgetAmountChange[]>(() => {
    if (!data) return [];
    const out: BudgetAmountChange[] = [];
    for (const b of data.budgetItems) {
      const raw = drafts[`${b.category}|${b.subCategory}`];
      const nextBudget = raw == null ? b.monthlyBudget : Number(String(raw).replace(/[^0-9]/g, "")) || 0;
      if (nextBudget !== b.monthlyBudget) {
        out.push({
          category: b.category,
          subCategory: b.subCategory,
          prevBudget: b.monthlyBudget,
          nextBudget,
        });
      }
    }
    return out;
  }, [data, drafts]);

  const allocation = useMemo(() => budgetAllocation(effectiveItems), [effectiveItems]);
  const total = useMemo(() => allocation.reduce((s, a) => s + a.total, 0), [allocation]);
  const originalTotal = useMemo(
    () => (data ? data.budgetItems.reduce((s, b) => s + b.monthlyBudget, 0) : 0),
    [data]
  );

  const colorFor = (name: string) => {
    const i = allocation.findIndex((a) => a.category === name);
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
  };

  function handleInputChange(key: string, value: string) {
    const cleaned = value.replace(/[^0-9]/g, "");
    setDrafts((prev) => ({ ...prev, [key]: cleaned }));
    setSaveMsg(null);
  }

  function handleReset() {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const b of data.budgetItems) {
      next[`${b.category}|${b.subCategory}`] = String(b.monthlyBudget);
    }
    setDrafts(next);
    setSaveMsg(null);
  }

  async function handleSave(force = false) {
    if (!settings || changes.length === 0) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      if (!signedIn) {
        await connectAndSync();
      }
      const res = await updateBudgetAmounts(settings.spreadsheetId, changes, { force });
      if (res.missing.length > 0) {
        const names = res.missing.map((m) => `${m.category} › ${m.subCategory}`).join(", ");
        setSaveMsg({
          kind: "err",
          text: `시트에서 항목을 찾지 못해 저장하지 않았어요: ${names}. 새로고침 후 다시 확인해 주세요.`,
        });
        return;
      }
      if (res.conflicts.length > 0) {
        const detail = res.conflicts
          .map((c) => `${c.category} › ${c.subCategory} (시트 현재값 ${won(c.sheetValue)})`)
          .join(", ");
        const ok = window.confirm(
          `시트에서 다른 값으로 바뀐 항목이 있어요:\n${detail}\n\n지금 입력한 값으로 덮어쓸까요?`
        );
        if (ok) {
          await handleSave(true);
        }
        return;
      }
      await refresh();
      setSaveMsg({
        kind: "ok",
        text: `${res.updatedCount}개 항목의 월 예산을 구글 시트에 반영했어요.`,
      });
    } catch (err) {
      setSaveMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "예산 저장에 실패했습니다.",
      });
    } finally {
      setSaving(false);
    }
  }

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
        <div>
          <h1>예산</h1>
          <p className="muted">
            {settings.spreadsheetTitle} · 소분류별 월 예산을 수정하면 구글 시트(예산설정 탭)에 바로 반영됩니다
          </p>
        </div>
        <div className="dash-controls">
          {changes.length > 0 && (
            <>
              <button className="btn-secondary sm" disabled={saving || loading} onClick={handleReset}>
                변경 취소 ({changes.length})
              </button>
              <button
                className="btn-primary sm"
                disabled={saving || loading}
                onClick={() => handleSave(false)}
              >
                {saving ? "시트에 저장 중…" : `시트에 저장 (${changes.length}건)`}
              </button>
            </>
          )}
          {signedIn ? (
            <button className="btn-secondary sm" disabled={loading || saving} onClick={refresh}>
              {loading ? "동기화 중…" : "새로고침"}
            </button>
          ) : (
            <button className="btn-primary sm" disabled={loading || saving} onClick={connectAndSync}>
              구글 계정 연결 (편집 권한)
            </button>
          )}
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}
      {saveMsg && (
        <p className={saveMsg.kind === "err" ? "error-text" : "muted"} style={{ marginBottom: 12 }}>
          {saveMsg.kind === "ok" ? "✅ " : ""}
          {saveMsg.text}
        </p>
      )}
      {data?.fetchedAt && (
        <p className="muted sync-status" title={datetimeLabel(new Date(data.fetchedAt))}>
          마지막 동기화: {relativeTime(new Date(data.fetchedAt))}
          {changes.length > 0 && (
            <span>
              {" "}
              · 수정 중 ({changes.length}건, 합계 {won(originalTotal)} → {won(total)})
            </span>
          )}
        </p>
      )}

      {!data ? (
        <div className="empty">시트를 불러오는 중…</div>
      ) : (
        <>
          <div className="card">
            <h3>예산 구성</h3>
            <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
              예산설정 탭에 잡아둔 월 총 {won(total)} 중 대분류별 비중이에요. 아래 표에서 소분류별 금액을
              고친 뒤 상단(또는 하단)의 <b>시트에 저장</b>을 누르면 구글 시트에 반영됩니다.
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
            const rows = effectiveItems.filter((b) => b.category === a.category);
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
                        <th className="right">월 예산 (원)</th>
                        <th className="right">대분류 내 비중</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const key = `${r.category}|${r.subCategory}`;
                        const orig =
                          data.budgetItems.find(
                            (b) => b.category === r.category && b.subCategory === r.subCategory
                          )?.monthlyBudget ?? 0;
                        const dirty = r.monthlyBudget !== orig;
                        const rawVal = drafts[key] ?? String(r.monthlyBudget);
                        const formatted =
                          rawVal === "" ? "" : Number(rawVal).toLocaleString("ko-KR");
                        return (
                          <tr key={r.subCategory}>
                            <td>
                              {r.subCategory}
                              {dirty && (
                                <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
                                  (기존 {won(orig)})
                                </span>
                              )}
                            </td>
                            <td className="right">
                              <input
                                type="text"
                                inputMode="numeric"
                                className="bal-input budget-input"
                                value={formatted}
                                onChange={(e) => handleInputChange(key, e.target.value)}
                                aria-label={`${r.category} ${r.subCategory} 월 예산`}
                              />
                            </td>
                            <td className="right muted">
                              {a.total > 0 ? Math.round((r.monthlyBudget / a.total) * 100) + "%" : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {changes.length > 0 && (
            <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>
                수정된 항목 <b>{changes.length}건</b> · 월 예산 합계 {won(originalTotal)} →{" "}
                <b>{won(total)}</b>
              </span>
              <div className="row-btns" style={{ marginTop: 0 }}>
                <button className="btn-secondary sm" disabled={saving || loading} onClick={handleReset}>
                  변경 취소
                </button>
                <button
                  className="btn-primary sm"
                  disabled={saving || loading}
                  onClick={() => handleSave(false)}
                >
                  {saving ? "시트에 저장 중…" : `시트에 저장 (${changes.length}건)`}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
