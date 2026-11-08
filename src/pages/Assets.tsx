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
import {
  saveAssetSnapshotToSheet,
  type SheetAssetSnapshotRow,
} from "../sheets";
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

const ASSET_TYPES = ["예금", "투자", "연금", "보증금", "부동산", "대출", "기타"];

function colorForType(name: string): string {
  return TYPE_COLORS[name] ?? "#b8b4c7";
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface DraftAccountRow {
  id: string;
  member: string;
  name: string;
  type: string;
  balanceText: string; // 대출이어도 사용자가 입력하기 편하게 부호 포함/미포함 모두 허용하되, 기본은 절댓값 또는 음수 표시
  memo: string;
}

function parseBalanceText(raw: string, type: string): number {
  const cleaned = String(raw).replace(/[^0-9-]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  // 종류가 '대출'이면 양수로 입력해도 음수(부채)로 취급한다.
  if (type === "대출") return -Math.abs(Math.round(n));
  return Math.round(n);
}

function parseKoreanAmount(str: string): number | null {
  const s = str.replace(/,/g, "").trim();
  if (!s) return null;
  // 억/만 단위 조합 지원 (예: "1억 2300만", "580만", "-9480만", "63451061")
  if (/[억만천]/.test(s)) {
    const neg = s.startsWith("-") ? -1 : 1;
    let total = 0;
    let matched = false;
    const eok = s.match(/(\d+(?:\.\d+)?)\s*억/);
    if (eok) {
      total += parseFloat(eok[1]) * 100_000_000;
      matched = true;
    }
    const man = s.match(/(\d+(?:\.\d+)?)\s*만/);
    if (man) {
      total += parseFloat(man[1]) * 10_000;
      matched = true;
    }
    const rest = s.replace(/.*?[억만]/g, "").match(/(\d+)/);
    if (rest && !eok && !man) {
      total += parseInt(rest[1], 10);
      matched = true;
    }
    return matched ? Math.round(total) * neg : null;
  }
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? Math.round(n) : null;
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

  // 스냅샷에 등장한 모든 날짜(최신순)
  const snapshotDates = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const r of data.assetSnapshots) if (r.date) set.add(r.date);
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [data]);

  const [selectedDate, setSelectedDate] = useState<string>("");
  useEffect(() => {
    if (snapshotDates.length > 0 && (!selectedDate || !snapshotDates.includes(selectedDate))) {
      setSelectedDate(snapshotDates[0]);
    }
  }, [snapshotDates, selectedDate]);

  const [memberTab, setMemberTab] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // 선택한 스냅샷 날짜의 계좌 행들과 직전 스냅샷 비교 맵
  const selectedRows = useMemo(() => {
    if (!data || !selectedDate) return [];
    return data.assetSnapshots.filter((r) => r.date === selectedDate);
  }, [data, selectedDate]);

  const prevDateOfSelected = useMemo(() => {
    const idx = snapshotDates.indexOf(selectedDate);
    if (idx < 0 || idx + 1 >= snapshotDates.length) return null;
    return snapshotDates[idx + 1];
  }, [snapshotDates, selectedDate]);

  const prevBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!data || !prevDateOfSelected) return map;
    for (const r of data.assetSnapshots) {
      if (r.date !== prevDateOfSelected) continue;
      const key = `${r.member}|${r.name}`;
      map.set(key, (map.get(key) ?? 0) + r.balance);
    }
    return map;
  }, [data, prevDateOfSelected]);

  const filteredSelectedRows = useMemo(() => {
    return selectedRows.filter((r) => {
      if (memberTab !== "all" && (r.member || "공동") !== memberTab) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      return true;
    });
  }, [selectedRows, memberTab, typeFilter]);

  const filteredSummary = useMemo(() => {
    let assets = 0;
    let debt = 0;
    for (const r of filteredSelectedRows) {
      if (r.type === "대출" || r.balance < 0) debt += Math.abs(r.balance);
      else assets += r.balance;
    }
    return { assets, debt, net: assets - debt };
  }, [filteredSelectedRows]);

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
    // 대출은 자산현황에 음수로 들어있다. 도넛에 음수 조각이 섞이면 각도 계산이 깨져
    // 다른 종류가 사라지므로, "자산 구성"에는 잔액이 양수인 종류만 넣는다(부채는 KPI로 따로).
    return Object.entries(latestNW.byType)
      .filter(([, value]) => value > 0)
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
    for (const p of netWorthPoints) for (const m of Object.keys(p.byMember)) if (m) set.add(m);
    if (set.size === 0) {
      set.add("동헌");
      set.add("혜신");
    }
    return [...set];
  }, [netWorthPoints]);

  const netWorthHistory = useMemo(() => {
    return netWorthPoints
      .map((p, i) => {
        const prev = i > 0 ? netWorthPoints[i - 1] : null;
        const delta = prev ? p.total - prev.total : null;
        const deltaPct =
          prev && prev.total !== 0
            ? ((p.total - prev.total) / Math.abs(prev.total)) * 100
            : null;
        return { ...p, delta, deltaPct };
      })
      .reverse();
  }, [netWorthPoints]);

  const tossConfig = useMemo(() => getTossStockConfig(), []);
  const [tossData, setTossData] = useState<TossPortfolio | null>(null);
  const [tossLoading, setTossLoading] = useState(false);
  const [tossError, setTossError] = useState<null | string>(null);

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

  // ---- 스냅샷 편집기 상태 ----
  const [editorOpen, setEditorOpen] = useState(false);
  const [snapDate, setSnapDate] = useState(todayISO());
  const [draftRows, setDraftRows] = useState<DraftAccountRow[]>([]);
  const [editorMemberFilter, setEditorMemberFilter] = useState<string>("all");
  const [aiBoxOpen, setAiBoxOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [savingSnap, setSavingSnap] = useState(false);
  const [snapMsg, setSnapMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadSnapshotIntoEditor = useCallback(
    (sourceDate: string | null, targetDate?: string) => {
      const baseRows: SheetAssetSnapshotRow[] =
        data && sourceDate
          ? data.assetSnapshots.filter((r) => r.date === sourceDate)
          : [];
      const mapped: DraftAccountRow[] =
        baseRows.length > 0
          ? baseRows.map((r, i) => ({
              id: `row-${i}-${Date.now()}`,
              member: r.member || "공동",
              name: r.name,
              type: r.type || "예금",
              balanceText: String(r.type === "대출" ? Math.abs(r.balance) : r.balance),
              memo: r.memo || "",
            }))
          : [
              {
                id: `row-0-${Date.now()}`,
                member: memberNames[0] ?? "동헌",
                name: "",
                type: "예금",
                balanceText: "0",
                memo: "",
              },
            ];
      setDraftRows(mapped);
      if (targetDate) setSnapDate(targetDate);
      setSnapMsg(null);
      setAiStatus(null);
    },
    [data, memberNames]
  );

  function openNewSnapshot() {
    const latestDate = snapshotDates[0] ?? null;
    loadSnapshotIntoEditor(latestDate, todayISO());
    setEditorOpen(true);
  }

  function openEditSelectedSnapshot() {
    if (!selectedDate) return;
    loadSnapshotIntoEditor(selectedDate, selectedDate);
    setEditorOpen(true);
  }

  function updateDraftRow(id: string, patch: Partial<DraftAccountRow>) {
    setDraftRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeDraftRow(id: string) {
    setDraftRows((prev) => prev.filter((r) => r.id !== id));
  }

  function addDraftRow(defaultMember?: string) {
    const mem =
      defaultMember && defaultMember !== "all"
        ? defaultMember
        : editorMemberFilter !== "all"
        ? editorMemberFilter
        : memberNames[0] ?? "동헌";
    setDraftRows((prev) => [
      ...prev,
      {
        id: `row-${prev.length}-${Date.now()}`,
        member: mem,
        name: "",
        type: "예금",
        balanceText: "0",
        memo: "",
      },
    ]);
  }

  // AI 프롬프트 복사: 현재 계좌 목록을 넣어 AI에게 시키기 좋은 프롬프트를 클립보드에 복사
  async function handleCopyAiPrompt() {
    const lines = draftRows
      .filter((r) => r.name.trim())
      .map((r) => `- ${r.member} | ${r.name} | ${r.type} | (현재: ${Number(r.balanceText || 0).toLocaleString("ko-KR")}원) | ${r.memo}`);
    const prompt = [
      "아래는 우리집 자산 계좌 목록이야. 내가 이어서 불러주는 최신 잔액 정보를 반영해서,",
      "반드시 아래 형식(탭 또는 | 구분: 명의 | 계좌명 | 종류 | 잔액(숫자만) | 메모)으로 전체 계좌 목록을 출력해줘.",
      "언급하지 않은 계좌는 기존 잔액을 그대로 유지하고, 새로 말한 계좌가 있으면 추가해줘.",
      "",
      "[현재 계좌 목록]",
      ...(lines.length > 0 ? lines : ["- 동헌 | 토스뱅크 통장 | 예금 | 0 | "]),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(prompt);
      setAiStatus("AI용 프롬프트를 클립보드에 복사했어요. Claude나 챗GPT에 붙여넣고 잔액을 말씀해 보세요!");
    } catch {
      setAiStatus("클립보드 복사에 실패했어요. 아래 입력창을 직접 이용해 주세요.");
    }
  }

  // AI가 정리해준 표/줄글이나 사용자가 적은 줄글("토스뱅크 580만")을 해석해 draftRows에 반영
  function handleApplyAiText() {
    const rawLines = aiText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("[") && !l.includes("계좌명"));
    if (rawLines.length === 0) {
      setAiStatus("붙여넣은 내용이 없어요.");
      return;
    }

    const next = [...draftRows];
    let updated = 0;
    let added = 0;

    for (const line of rawLines) {
      const cleanedLine = line.replace(/^[-*•]\s*/, "");
      // 1) 파이프(|) 또는 탭(\t) 구분 형식: 명의 | 계좌명 | 종류 | 잔액 | 메모 (또는 계좌명 | 잔액)
      if (cleanedLine.includes("|") || cleanedLine.includes("\t")) {
        const parts = cleanedLine
          .split(/\||\t/)
          .map((p) => p.trim())
          .filter((_, idx, arr) => !(idx === 0 && arr[0] === "") && !(idx === arr.length - 1 && arr[arr.length - 1] === ""));
        if (parts.length >= 4) {
          const [mem, name, typeRaw, balStr, memo = ""] = parts;
          const amt = parseKoreanAmount(balStr);
          if (!name || amt == null) continue;
          const matchedType = ASSET_TYPES.find((t) => typeRaw.includes(t)) ?? "예금";
          const idx = next.findIndex(
            (r) =>
              (r.name === name && r.member === mem) ||
              (r.name === name && !mem)
          );
          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              member: mem || next[idx].member,
              type: matchedType || next[idx].type,
              balanceText: String(Math.abs(amt)),
              memo: memo || next[idx].memo,
            };
            updated++;
          } else {
            next.push({
              id: `ai-${Date.now()}-${added}`,
              member: mem || "공동",
              name,
              type: matchedType,
              balanceText: String(Math.abs(amt)),
              memo,
            });
            added++;
          }
          continue;
        } else if (parts.length >= 2) {
          const [name, balStr, memo = ""] = parts;
          const amt = parseKoreanAmount(balStr);
          if (!name || amt == null) continue;
          const idx = next.findIndex(
            (r) => r.name.toLowerCase() === name.toLowerCase() || r.name.includes(name) || name.includes(r.name)
          );
          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              balanceText: String(Math.abs(amt)),
              memo: memo || next[idx].memo,
            };
            updated++;
          } else {
            next.push({
              id: `ai-${Date.now()}-${added}`,
              member: editorMemberFilter !== "all" ? editorMemberFilter : memberNames[0] ?? "동헌",
              name,
              type: amt < 0 ? "대출" : "예금",
              balanceText: String(Math.abs(amt)),
              memo,
            });
            added++;
          }
          continue;
        }
      }

      // 2) 자유 줄글 형식: "동헌 토스뱅크 580만" 또는 "미래에셋 주식: 65,000,000"
      const colonized = cleanedLine.split(/[:：]/);
      let left = colonized[0].trim();
      let right = colonized.slice(1).join(" ").trim();
      if (!right) {
        const m = cleanedLine.match(/^(.*?)\s+(-?[\d,.]+\s*(?:억\s*[\d,.]*\s*만?|만|원)?)\s*$/);
        if (m) {
          left = m[1].trim();
          right = m[2].trim();
        }
      }
      const amt = parseKoreanAmount(right);
      if (!left || amt == null) continue;

      let memHint = "";
      for (const m of [...memberNames, "공동"]) {
        if (left.startsWith(m + " ")) {
          memHint = m;
          left = left.slice(m.length).trim();
          break;
        }
      }

      const idx = next.findIndex((r) => {
        if (memHint && r.member !== memHint) return false;
        return (
          r.name.toLowerCase() === left.toLowerCase() ||
          (r.name && left.includes(r.name)) ||
          (left && r.name.includes(left))
        );
      });

      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          balanceText: String(Math.abs(amt)),
        };
        updated++;
      } else {
        next.push({
          id: `ai-${Date.now()}-${added}`,
          member: memHint || (editorMemberFilter !== "all" ? editorMemberFilter : memberNames[0] ?? "동헌"),
          name: left,
          type: amt < 0 || left.includes("대출") ? "대출" : "예금",
          balanceText: String(Math.abs(amt)),
          memo: "",
        });
        added++;
      }
    }

    setDraftRows(next);
    setAiStatus(`반영 완료: 기존 계좌 ${updated}건 금액 갱신, 새 계좌 ${added}건 추가됐어요. 아래 표에서 확인 후 저장하세요.`);
  }

  const draftTotals = useMemo(() => {
    let assets = 0;
    let debt = 0;
    const byMember: Record<string, number> = {};
    for (const r of draftRows) {
      if (!r.name.trim()) continue;
      const bal = parseBalanceText(r.balanceText, r.type);
      if (bal < 0) debt += Math.abs(bal);
      else assets += bal;
      const m = r.member.trim() || "공동";
      byMember[m] = (byMember[m] ?? 0) + bal;
    }
    return { assets, debt, net: assets - debt, byMember };
  }, [draftRows]);

  async function handleSaveSnapshot(overwriteSameDate = false) {
    if (!settings) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapDate)) {
      setSnapMsg({ kind: "err", text: "스냅샷 날짜를 YYYY-MM-DD 형식으로 선택해 주세요." });
      return;
    }
    const items = draftRows
      .filter((r) => r.name.trim() !== "")
      .map((r) => ({
        member: r.member.trim() || "공동",
        name: r.name.trim(),
        type: r.type.trim() || "예금",
        balance: parseBalanceText(r.balanceText, r.type),
        memo: r.memo.trim(),
      }));

    if (items.length === 0) {
      setSnapMsg({ kind: "err", text: "계좌명을 한 개 이상 입력해 주세요." });
      return;
    }

    setSavingSnap(true);
    setSnapMsg(null);
    try {
      if (!signedIn) {
        await connectAndSync();
      }
      const res = await saveAssetSnapshotToSheet(settings.spreadsheetId, snapDate, items, {
        overwriteSameDate,
      });
      if (res.mode === "conflict") {
        const ok = window.confirm(
          `시트에 이미 ${snapDate} 날짜의 스냅샷(${res.existingRowCount}개 계좌)이 있습니다.\n해당 날짜의 스냅샷을 지금 입력한 ${items.length}개 계좌로 덮어쓸까요?`
        );
        if (ok) {
          await handleSaveSnapshot(true);
        }
        return;
      }
      await refresh();
      setSelectedDate(snapDate);
      setEditorOpen(false);
      setSnapMsg({
        kind: "ok",
        text:
          res.mode === "replaced"
            ? `${snapDate} 스냅샷(${res.writtenRowCount}개 계좌)을 구글 시트에 덮어썼어요.`
            : `${snapDate} 새 스냅샷(${res.writtenRowCount}개 계좌)을 구글 시트에 추가했어요.`,
      });
    } catch (err) {
      setSnapMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "스냅샷 저장에 실패했습니다.",
      });
    } finally {
      setSavingSnap(false);
    }
  }

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

  const visibleDraftRows =
    editorMemberFilter === "all"
      ? draftRows
      : draftRows.filter((r) => (r.member || "공동") === editorMemberFilter);

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>자산</h1>
          <p className="muted">
            {settings.spreadsheetTitle} · 계좌별 잔액 스냅샷 관리 및 순자산 현황
          </p>
        </div>
        <div className="dash-controls">
          <button
            className="btn-primary sm"
            disabled={loading || savingSnap}
            onClick={() => {
              if (editorOpen) setEditorOpen(false);
              else openNewSnapshot();
            }}
          >
            {editorOpen ? "스냅샷 편집 닫기" : "+ 새 스냅샷 기록"}
          </button>
          {signedIn ? (
            <button
              className="btn-secondary sm"
              disabled={loading || savingSnap}
              onClick={() => {
                refresh();
                refreshToss();
              }}
            >
              {loading ? "동기화 중…" : "새로고침"}
            </button>
          ) : (
            <button className="btn-primary sm" disabled={loading || savingSnap} onClick={connectAndSync}>
              구글 계정 연결
            </button>
          )}
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}
      {snapMsg && (
        <p className={snapMsg.kind === "err" ? "error-text" : "muted"} style={{ marginBottom: 12 }}>
          {snapMsg.kind === "ok" ? "✅ " : ""}
          {snapMsg.text}
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
          <section className="kpi-row cols-3">
            <div className="kpi">
              <div className="kpi-label">총자산 {latestNW?.date ? `(${latestNW.date})` : ""}</div>
              <div className="kpi-value income">{won(totalAssets)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">총부채</div>
              <div className="kpi-value expense">{totalDebt > 0 ? won(totalDebt) : "₩0"}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">순자산 (자산 − 부채)</div>
              <div className="kpi-value">{won(latestNW?.total ?? 0)}</div>
              {yearGrowth != null && (
                <div className={"kpi-sub " + (yearGrowth >= 0 ? "income" : "expense")}>
                  올해 {yearGrowth >= 0 ? "+" : ""}
                  {won(yearGrowth)}
                </div>
              )}
            </div>
          </section>

          {/* ---- 스냅샷 작성 / 수정 패널 ---- */}
          {editorOpen && (
            <div className="card" style={{ border: "2px solid var(--primary)" }}>
              <div className="budget-bar-head">
                <h3 style={{ margin: 0 }}>📸 계좌별 자산 스냅샷 기록 · 수정</h3>
                <div className="row-btns" style={{ marginTop: 0 }}>
                  <button
                    className="btn-secondary sm"
                    type="button"
                    onClick={() => setAiBoxOpen((v) => !v)}
                  >
                    {aiBoxOpen ? "AI·텍스트 빠른 입력 접기" : "🤖 AI·텍스트로 한 번에 채우기"}
                  </button>
                  <button
                    className="btn-secondary sm"
                    type="button"
                    disabled={savingSnap}
                    onClick={() => setEditorOpen(false)}
                  >
                    취소
                  </button>
                  <button
                    className="btn-primary sm"
                    type="button"
                    disabled={savingSnap}
                    onClick={() => handleSaveSnapshot(false)}
                  >
                    {savingSnap ? "시트에 저장 중…" : `${snapDate} 스냅샷 시트에 저장`}
                  </button>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 6, marginBottom: 12 }}>
                기준 날짜의 모든 계좌 잔액을 확인·수정한 뒤 <b>시트에 저장</b>을 누르면 구글 시트(자산현황 탭)에
                스냅샷으로 쌓입니다. 대출은 양수로 입력해도 자동으로 마이너스(부채)로 저장돼요.
              </p>

              <div className="list-filters" style={{ alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <b>스냅샷 기준일</b>
                  <input
                    type="date"
                    value={snapDate}
                    onChange={(e) => setSnapDate(e.target.value)}
                    style={{ width: "auto" }}
                  />
                </label>
                {snapshotDates.length > 0 && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    <span className="muted">기존 스냅샷 불러오기:</span>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) loadSnapshotIntoEditor(e.target.value);
                      }}
                    >
                      <option value="" disabled>
                        날짜 선택…
                      </option>
                      {snapshotDates.map((d) => (
                        <option key={d} value={d}>
                          {d} ({data.assetSnapshots.filter((r) => r.date === d).length}개 계좌)
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="seg-group" style={{ marginLeft: "auto" }}>
                  {["all", ...memberNames, ...(memberNames.includes("공동") ? [] : ["공동"])].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={"seg " + (editorMemberFilter === m ? "active" : "")}
                      onClick={() => setEditorMemberFilter(m)}
                    >
                      {m === "all" ? `전체 (${draftRows.length})` : m}
                    </button>
                  ))}
                </div>
              </div>

              {aiBoxOpen && (
                <div
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 13 }}>🤖 AI 또는 줄글로 잔액 한 번에 반영하기</b>
                    <div className="row-btns" style={{ marginTop: 0 }}>
                      <button className="btn-secondary sm" type="button" onClick={handleCopyAiPrompt}>
                        📋 AI에게 줄 프롬프트 복사
                      </button>
                      <button className="btn-primary sm" type="button" onClick={handleApplyAiText}>
                        아래 내용 표에 반영
                      </button>
                    </div>
                  </div>
                  <p className="muted" style={{ fontSize: 12, margin: "6px 0 8px" }}>
                    한 줄에 하나씩 <code>계좌명 금액</code>(예: <code>토스뱅크 통장 620만</code>,{" "}
                    <code>국민은행 보통예금 68,100,000</code>) 또는 AI가 출력한{" "}
                    <code>명의 | 계좌명 | 종류 | 잔액 | 메모</code> 표를 붙여넣고 <b>표에 반영</b>을 누르세요.
                  </p>
                  <textarea
                    rows={5}
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    placeholder={
                      "예시:\n토스뱅크 통장 620만\n미래에셋 주식 65,400,000\n동헌 | 신한은행 적금 | 예금 | 3000000 | 신규 개설"
                    }
                    style={{
                      width: "100%",
                      fontFamily: "inherit",
                      fontSize: 13,
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--text)",
                    }}
                  />
                  {aiStatus && (
                    <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                      {aiStatus}
                    </p>
                  )}
                </div>
              )}

              <div className="stat-row" style={{ marginBottom: 12 }}>
                <div className="stat-chip">
                  <div className="stat-chip-label">편집 중 총자산</div>
                  <div className="stat-chip-value income">{won(draftTotals.assets)}</div>
                </div>
                <div className="stat-chip">
                  <div className="stat-chip-label">편집 중 총부채</div>
                  <div className="stat-chip-value expense">{won(draftTotals.debt)}</div>
                </div>
                <div className="stat-chip">
                  <div className="stat-chip-label">편집 중 순자산</div>
                  <div className="stat-chip-value">{won(draftTotals.net)}</div>
                </div>
                {Object.entries(draftTotals.byMember).map(([m, v]) => (
                  <div className="stat-chip" key={m}>
                    <div className="stat-chip-label">{m} 순자산</div>
                    <div className="stat-chip-value">{won(v)}</div>
                  </div>
                ))}
              </div>

              <div className="table-scroll">
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th style={{ width: 95 }}>명의</th>
                      <th>계좌 / 자산명</th>
                      <th style={{ width: 110 }}>종류</th>
                      <th className="right" style={{ width: 160 }}>
                        잔액 (원)
                      </th>
                      <th>메모</th>
                      <th style={{ width: 60 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDraftRows.map((r) => {
                      const isDebt = r.type === "대출";
                      const numVal = Number(String(r.balanceText).replace(/[^0-9]/g, "")) || 0;
                      const formatted =
                        r.balanceText === "" ? "" : numVal.toLocaleString("ko-KR");
                      return (
                        <tr key={r.id} className={isDebt ? "debt-row" : undefined}>
                          <td>
                            <input
                              type="text"
                              list="asset-member-list"
                              value={r.member}
                              onChange={(e) => updateDraftRow(r.id, { member: e.target.value })}
                              placeholder="동헌/혜신/공동"
                              style={{ width: 85 }}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={r.name}
                              onChange={(e) => updateDraftRow(r.id, { name: e.target.value })}
                              placeholder="예: 토스뱅크 통장"
                              style={{ width: "100%", minWidth: 140 }}
                            />
                          </td>
                          <td>
                            <select
                              value={ASSET_TYPES.includes(r.type) ? r.type : "기타"}
                              onChange={(e) => updateDraftRow(r.id, { type: e.target.value })}
                              style={{ width: 100 }}
                            >
                              {ASSET_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="right">
                            <span style={{ display: "inline-flex", alignItems: "center" }}>
                              {isDebt && <span className="debt-sign">−</span>}
                              <input
                                type="text"
                                inputMode="numeric"
                                className={"bal-input" + (isDebt ? " debt" : "")}
                                value={formatted}
                                onChange={(e) =>
                                  updateDraftRow(r.id, {
                                    balanceText: e.target.value.replace(/[^0-9]/g, ""),
                                  })
                                }
                              />
                            </span>
                          </td>
                          <td>
                            <input
                              type="text"
                              value={r.memo}
                              onChange={(e) => updateDraftRow(r.id, { memo: e.target.value })}
                              placeholder="금리, 만기일, 용도 등"
                              style={{ width: "100%", minWidth: 140 }}
                            />
                          </td>
                          <td className="right">
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => removeDraftRow(r.id)}
                              title="이 계좌 행 삭제"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="asset-member-list">
                  {memberNames.map((m) => (
                    <option key={m} value={m} />
                  ))}
                  <option value="공동" />
                </datalist>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  className="btn-secondary sm"
                  onClick={() => addDraftRow()}
                >
                  + 계좌 / 자산 행 추가
                </button>
                <div className="row-btns" style={{ marginTop: 0 }}>
                  <button
                    className="btn-primary sm"
                    type="button"
                    disabled={savingSnap}
                    onClick={() => handleSaveSnapshot(false)}
                  >
                    {savingSnap ? "시트에 저장 중…" : `${snapDate} 스냅샷 시트에 저장 (${draftRows.filter((r) => r.name.trim()).length}개 계좌)`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ---- 계좌별 상세 현황 (명의별 · 종류별 조회) ---- */}
          <div className="card">
            <div className="budget-bar-head" style={{ flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ margin: 0 }}>🏦 계좌별 자산 · 부채 상세 현황</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {snapshotDates.length > 0 && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    <span className="muted">조회 스냅샷:</span>
                    <select
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    >
                      {snapshotDates.map((d, idx) => (
                        <option key={d} value={d}>
                          {d} {idx === 0 ? "(최신)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {selectedDate && (
                  <button
                    type="button"
                    className="btn-secondary sm"
                    onClick={openEditSelectedSnapshot}
                  >
                    이 날짜 스냅샷 수정
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary sm"
                  onClick={openNewSnapshot}
                >
                  + 오늘자로 새 스냅샷 찍기
                </button>
              </div>
            </div>

            {selectedRows.length === 0 ? (
              <Empty text="기록된 계좌 스냅샷이 없어요. '+ 오늘자로 새 스냅샷 찍기'를 눌러 첫 스냅샷을 등록해 보세요." />
            ) : (
              <>
                <div className="list-filters" style={{ marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div className="seg-group">
                    {["all", ...memberNames, ...(selectedRows.some((r) => (r.member || "공동") === "공동") && !memberNames.includes("공동") ? ["공동"] : [])].map(
                      (m) => (
                        <button
                          key={m}
                          type="button"
                          className={"seg " + (memberTab === m ? "active" : "")}
                          onClick={() => setMemberTab(m)}
                        >
                          {m === "all" ? "전체 명의" : m}
                        </button>
                      )
                    )}
                  </div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="all">모든 종류</option>
                    {ASSET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <span className="muted" style={{ fontSize: 13, marginLeft: "auto" }}>
                    선택 합계: 자산 <b>{won(filteredSummary.assets)}</b> · 부채{" "}
                    <b className="expense">{won(filteredSummary.debt)}</b> · 순자산{" "}
                    <b>{won(filteredSummary.net)}</b>
                  </span>
                </div>

                <div className="table-scroll">
                  <table className="tx-table">
                    <thead>
                      <tr>
                        <th>명의</th>
                        <th>종류</th>
                        <th>계좌 / 자산명</th>
                        <th className="right">잔액 ({selectedDate})</th>
                        {prevDateOfSelected && (
                          <th className="right">직전({prevDateOfSelected}) 대비</th>
                        )}
                        <th>메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSelectedRows.map((r, idx) => {
                        const prevBal = prevBalanceMap.get(`${r.member}|${r.name}`);
                        const delta = prevBal != null ? r.balance - prevBal : null;
                        const isDebt = r.type === "대출" || r.balance < 0;
                        return (
                          <tr key={`${r.member}-${r.name}-${idx}`} className={isDebt ? "debt-row" : undefined}>
                            <td>{r.member || "공동"}</td>
                            <td>
                              <span
                                className="dot"
                                style={{ background: colorForType(r.type), marginRight: 6 }}
                              />
                              {r.type}
                            </td>
                            <td>
                              <b>{r.name}</b>
                            </td>
                            <td className={"right " + (isDebt ? "expense" : "")}>
                              {won(r.balance)}
                            </td>
                            {prevDateOfSelected && (
                              <td
                                className={
                                  "right " +
                                  (delta == null || delta === 0
                                    ? "muted"
                                    : delta > 0
                                    ? "income"
                                    : "expense")
                                }
                              >
                                {delta == null
                                  ? "신규"
                                  : delta === 0
                                  ? "—"
                                  : `${delta > 0 ? "+" : ""}${won(delta)}`}
                              </td>
                            )}
                            <td className="muted">{r.memo || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <section className="kpi-row cols-2">
            <div className="kpi">
              <div className="kpi-label">올해 순자산 증가</div>
              <div
                className={
                  "kpi-value " +
                  (yearGrowth == null ? "" : yearGrowth >= 0 ? "income" : "expense")
                }
              >
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
                    <div className="table-scroll">
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
                    </div>
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
                  {netWorthPoints.length < 2 ? (
                    <p className="muted" style={{ margin: "8px 0 4px" }}>
                      스냅샷이 2개 이상 쌓이면 추이 그래프가 표시돼요.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={netWorthPoints.map((p) => ({ ...p, label: p.date }))}>
                        <defs>
                          <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4f6fc7" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#4f6fc7" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          padding={{ left: 16, right: 16 }}
                        />
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
                  )}
                  {latestNW && latestNW.date && (
                    <>
                      <p className="muted" style={{ marginTop: 10, marginBottom: 6 }}>
                        {latestNW.date} 기준
                      </p>
                      <div className="stat-row">
                        <div className="stat-chip">
                          <div className="stat-chip-label">순자산</div>
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
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      padding={{ left: 16, right: 16 }}
                    />
                    <YAxis tickFormatter={wonShort} tickLine={false} axisLine={false} width={52} />
                    <Tooltip formatter={(v: number) => won(v)} />
                    <Area
                      type="monotone"
                      dataKey="누적"
                      stroke="#41c690"
                      strokeWidth={2}
                      fill="url(#inv)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <div className="card">
            <h3>자산 변동 이력</h3>
            <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
              자산현황 탭에 스냅샷을 기록할 때마다(꼭 매달일 필요는 없어요) 한 줄씩 쌓여요. 행을 누르면 위
              계좌별 상세 표가 해당 날짜로 바뀝니다.
            </p>
            {netWorthHistory.length === 0 ? (
              <Empty text="자산현황 탭에 계좌 잔액 스냅샷을 입력하면 여기 표시됩니다." />
            ) : (
              <div className="table-scroll">
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th className="right">순자산</th>
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
                      <tr
                        key={p.date}
                        className="clickable"
                        style={p.date === selectedDate ? { fontWeight: 700 } : undefined}
                        onClick={() => setSelectedDate(p.date)}
                        title="눌러서 이 날짜의 계좌별 상세 보기"
                      >
                        <td className="muted">{p.date}</td>
                        <td className="right">{won(p.total)}</td>
                        <td
                          className={
                            "right " +
                            (p.delta == null ? "muted" : p.delta >= 0 ? "income" : "expense")
                          }
                        >
                          {p.delta == null ? "—" : `${p.delta >= 0 ? "+" : ""}${won(p.delta)}`}
                        </td>
                        <td
                          className={
                            "right " +
                            (p.deltaPct == null ? "muted" : p.deltaPct >= 0 ? "income" : "expense")
                          }
                        >
                          {p.deltaPct == null
                            ? "—"
                            : `${p.deltaPct >= 0 ? "+" : ""}${p.deltaPct.toFixed(1)}%`}
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
              </div>
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
