// sheets.ts 가 읽어온 원본 탭 데이터(거래내역/예산설정/자산현황)로부터
// 대시보드에 필요한 값들을 계산한다. 구글 시트의 "월별대시보드"/"자산요약"
// 탭이 수식으로 하던 계산을 그대로 재현하되, 특정 연/월에 고정되지 않고
// 아무 달이나 골라 볼 수 있게 한다.

import { monthLabel, monthOf } from "./format";
import type {
  SheetAssetSnapshotRow,
  SheetBudgetItem,
  SheetData,
  SheetIncomeTarget,
  SheetTransaction,
} from "./sheets";

export function discoverMembers(data: SheetData): string[] {
  const set = new Set<string>();
  for (const r of data.assetSnapshots) {
    if (r.member && r.member !== "공동") set.add(r.member);
  }
  for (const r of data.incomeTargets) {
    if (r.member && r.member !== "공동") set.add(r.member);
  }
  return [...set];
}

// 거래의 소유자(명의)를 정한다. 공동 지출/수입이면 null.
// 1) 거래내역의 "명의" 열에 이름이 적혀있으면 그 사람 (주로 수입 구분용)
// 2) "용돈_혜신"처럼 분류/소분류 끝에 "_이름"이 붙어있으면 그 사람 (지출 중엔
//    용돈만 이렇게 나눈다)
// 3) 그 외(월세, 식재료비 등)는 공동
function ownerOf(t: SheetTransaction, members: string[]): string | null {
  if (t.member && members.includes(t.member)) return t.member;
  for (const m of members) {
    if (t.subCategory.endsWith(`_${m}`) || t.category.endsWith(`_${m}`)) {
      return m;
    }
  }
  return null;
}

function matchesMemberFilter(
  t: SheetTransaction,
  memberFilter: string | "all",
  members: string[]
): boolean {
  if (memberFilter === "all") return true;
  return ownerOf(t, members) === memberFilter;
}

export interface MonthSummary {
  income: number;
  expense: number;
  saving: number;
  savingRate: number | null;
}

// 선택한 달의 원본 거래 목록(최신순) — 가계부 페이지 하단 거래내역 표에 쓴다.
export function monthTransactions(
  txs: SheetTransaction[],
  ym: string,
  memberFilter: string | "all",
  members: string[]
): SheetTransaction[] {
  return txs
    .filter((t) => monthOf(t.date) === ym && matchesMemberFilter(t, memberFilter, members))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function summarizeMonth(
  txs: SheetTransaction[],
  ym: string,
  memberFilter: string | "all",
  members: string[]
): MonthSummary {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (monthOf(t.date) !== ym) continue;
    if (!matchesMemberFilter(t, memberFilter, members)) continue;
    if (t.kind === "수입") income += t.amountKRW;
    else expense += t.amountKRW;
  }
  const saving = income - expense;
  return { income, expense, saving, savingRate: income > 0 ? saving / income : null };
}

export interface MonthPoint {
  month: string;
  수입: number;
  지출: number;
}

export function monthlyTrend(
  txs: SheetTransaction[],
  months: string[],
  memberFilter: string | "all",
  members: string[]
): MonthPoint[] {
  const base = new Map<string, MonthPoint>(
    months.map((m) => [m, { month: monthLabel(m), 수입: 0, 지출: 0 }])
  );
  for (const t of txs) {
    const b = base.get(monthOf(t.date));
    if (!b) continue;
    if (!matchesMemberFilter(t, memberFilter, members)) continue;
    if (t.kind === "수입") b.수입 += t.amountKRW;
    else b.지출 += t.amountKRW;
  }
  return months.map((m) => base.get(m)!);
}

export interface CategoryBudgetRow {
  subCategory: string;
  budget: number;
  actual: number;
}

export interface CategoryBudgetGroup {
  category: string;
  budget: number;
  actual: number;
  rows: CategoryBudgetRow[];
}

export function budgetVsActual(
  txs: SheetTransaction[],
  budgetItems: SheetBudgetItem[],
  ym: string
): CategoryBudgetGroup[] {
  const actualMap = new Map<string, number>();
  for (const t of txs) {
    if (t.kind !== "지출" || monthOf(t.date) !== ym) continue;
    const key = `${t.category}|${t.subCategory}`;
    actualMap.set(key, (actualMap.get(key) ?? 0) + t.amountKRW);
  }

  const groups = new Map<string, CategoryBudgetGroup>();
  for (const b of budgetItems) {
    const key = `${b.category}|${b.subCategory}`;
    const actual = actualMap.get(key) ?? 0;
    actualMap.delete(key);
    if (!groups.has(b.category)) {
      groups.set(b.category, { category: b.category, budget: 0, actual: 0, rows: [] });
    }
    const g = groups.get(b.category)!;
    g.budget += b.monthlyBudget;
    g.actual += actual;
    g.rows.push({ subCategory: b.subCategory, budget: b.monthlyBudget, actual });
  }

  // 예산설정에 없는(미분류) 지출도 놓치지 않고 "미분류"로 모아 보여준다.
  let otherActual = 0;
  for (const v of actualMap.values()) otherActual += v;
  if (otherActual > 0) {
    groups.set("미분류", {
      category: "미분류",
      budget: 0,
      actual: otherActual,
      rows: [{ subCategory: "예산 미설정 항목", budget: 0, actual: otherActual }],
    });
  }

  return [...groups.values()];
}

export interface BudgetAllocation {
  category: string;
  total: number;
  percent: number;
}

// 예산설정 탭에 지금 잡혀있는 대분류별 월 예산 구성(전체 대비 비중). 월별
// 실적과 무관하게 "예산을 이렇게 짜뒀다"는 것 자체를 보여준다.
export function budgetAllocation(budgetItems: SheetBudgetItem[]): BudgetAllocation[] {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const b of budgetItems) {
    totals.set(b.category, (totals.get(b.category) ?? 0) + b.monthlyBudget);
    grand += b.monthlyBudget;
  }
  return [...totals.entries()]
    .map(([category, total]) => ({
      category,
      total,
      percent: grand > 0 ? (total / grand) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface CategorySlice {
  name: string;
  value: number;
}

export function expenseByCategory(
  txs: SheetTransaction[],
  ym: string,
  memberFilter: string | "all",
  members: string[]
): CategorySlice[] {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (t.kind !== "지출" || monthOf(t.date) !== ym) continue;
    if (!matchesMemberFilter(t, memberFilter, members)) continue;
    map.set(t.category, (map.get(t.category) ?? 0) + t.amountKRW);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export interface MemberCompareRow {
  name: string;
  수입: number;
  지출: number;
}

export function memberComparison(
  txs: SheetTransaction[],
  ym: string,
  members: string[]
): MemberCompareRow[] {
  return members.map((mem) => {
    let income = 0;
    let expense = 0;
    for (const t of txs) {
      if (monthOf(t.date) !== ym) continue;
      if (ownerOf(t, members) !== mem) continue;
      if (t.kind === "수입") income += t.amountKRW;
      else expense += t.amountKRW;
    }
    return { name: mem, 수입: income, 지출: expense };
  });
}

const INVESTMENT_CATEGORIES = new Set(["투자", "저축"]);

export interface InvestmentPoint {
  month: string;
  누적: number;
}

export function investmentCumulativeTrend(
  txs: SheetTransaction[]
): InvestmentPoint[] {
  const byMonth = new Map<string, number>();
  for (const t of txs) {
    if (t.kind !== "지출" || !INVESTMENT_CATEGORIES.has(t.category)) continue;
    const m = monthOf(t.date);
    byMonth.set(m, (byMonth.get(m) ?? 0) + t.amountKRW);
  }
  const months = [...byMonth.keys()].sort();
  let acc = 0;
  return months.map((m) => {
    acc += byMonth.get(m)!;
    return { month: monthLabel(m), 누적: acc };
  });
}

export function investmentCumulativeTotal(txs: SheetTransaction[]): number {
  let total = 0;
  for (const t of txs) {
    if (t.kind === "지출" && INVESTMENT_CATEGORIES.has(t.category)) {
      total += t.amountKRW;
    }
  }
  return total;
}

export interface NetWorthPoint {
  date: string;
  total: number;
  byMember: Record<string, number>;
}

// 자산현황 로그를 스냅샷일자별로 묶어 총자산/명의별 추이를 만든다.
// 대출 잔액은 시트 입력 관례상 이미 음수로 들어있으므로 그대로 더한다.
export function netWorthTrend(rows: SheetAssetSnapshotRow[]): NetWorthPoint[] {
  const byDate = new Map<string, { total: number; byMember: Record<string, number> }>();
  for (const r of rows) {
    const entry = byDate.get(r.date) ?? { total: 0, byMember: {} };
    entry.total += r.balance;
    entry.byMember[r.member] = (entry.byMember[r.member] ?? 0) + r.balance;
    byDate.set(r.date, entry);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, total: v.total, byMember: v.byMember }));
}

export interface LatestNetWorth {
  date: string | null;
  total: number;
  byMember: Record<string, number>;
  byType: Record<string, number>;
}

export function latestNetWorth(rows: SheetAssetSnapshotRow[]): LatestNetWorth {
  if (rows.length === 0) return { date: null, total: 0, byMember: {}, byType: {} };
  const latestDate = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date);
  const latestRows = rows.filter((r) => r.date === latestDate);
  const byMember: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let total = 0;
  for (const r of latestRows) {
    total += r.balance;
    byMember[r.member] = (byMember[r.member] ?? 0) + r.balance;
    byType[r.type] = (byType[r.type] ?? 0) + r.balance;
  }
  return { date: latestDate, total, byMember, byType };
}

export interface IncomeTargetRow {
  member: string; // "" = 명의 미지정
  target: number;
  actual: number;
}

export interface IncomeTargetGroup {
  item: string;
  rows: IncomeTargetRow[]; // 명의별 내역. 명의를 쓰지 않으면 비어있다.
  targetTotal: number;
  actualTotal: number;
}

// 예산설정 탭 하단의 "수입 목표" 표(항목별 월 목표) 대비 이번 달 실제 수입.
// 거래의 소분류가 표의 항목과 같으면(예: 월급) 그 항목의 실적으로 센다.
// 명의별 내역은 거래내역의 "명의" 열(없으면 예전 방식인 "월급_동헌" 소분류
// 접미사)로 나눈다. 표에 "명의" 열이 있으면 명의별 목표도 그대로 보여준다.
export function incomeVsActual(
  txs: SheetTransaction[],
  incomeTargets: SheetIncomeTarget[],
  ym: string
): IncomeTargetGroup[] {
  const groups = new Map<string, Map<string, IncomeTargetRow>>();
  const rowOf = (item: string, member: string): IncomeTargetRow => {
    if (!groups.has(item)) groups.set(item, new Map());
    const byMember = groups.get(item)!;
    if (!byMember.has(member)) byMember.set(member, { member, target: 0, actual: 0 });
    return byMember.get(member)!;
  };

  const items: string[] = [];
  for (const it of incomeTargets) {
    if (!items.includes(it.item)) items.push(it.item);
    rowOf(it.item, it.member).target += it.target;
  }

  for (const t of txs) {
    if (t.kind !== "수입" || monthOf(t.date) !== ym) continue;
    const item = items.find(
      (i) => t.subCategory === i || t.subCategory.startsWith(`${i}_`)
    );
    if (item) {
      const legacyOwner = t.subCategory.startsWith(`${item}_`)
        ? t.subCategory.slice(item.length + 1)
        : "";
      rowOf(item, t.member || legacyOwner).actual += t.amountKRW;
    } else {
      // 목표 표에 없는 수입(기타수입 등)도 놓치지 않고 "기타"로 모은다.
      rowOf("기타", t.member).actual += t.amountKRW;
    }
  }

  return [...groups.entries()].map(([item, byMember]) => {
    const all = [...byMember.values()];
    const named = all.filter((r) => r.member);
    // 명의별로 나눠 쓴 적이 없으면 세부 행 없이 항목 한 줄로만 보여준다. 명의별
    // 행이 있을 땐, 명의 없는 거래가 있을 때만 "미지정" 행을 함께 남긴다.
    const unnamed = all.filter((r) => !r.member && (named.length === 0 ? false : r.actual > 0));
    return {
      item,
      rows: [...named, ...unnamed],
      targetTotal: all.reduce((a, r) => a + r.target, 0),
      actualTotal: all.reduce((a, r) => a + r.actual, 0),
    };
  });
}

export interface SavingsRatePoint {
  month: string;
  저축률: number | null;
}

export function savingsRateTrend(
  txs: SheetTransaction[],
  months: string[],
  memberFilter: string | "all",
  members: string[]
): SavingsRatePoint[] {
  const trend = monthlyTrend(txs, months, memberFilter, members);
  return trend.map((t) => ({
    month: t.month,
    저축률: t.수입 > 0 ? Math.round(((t.수입 - t.지출) / t.수입) * 1000) / 10 : null,
  }));
}

export interface YearSummary {
  year: string;
  income: number;
  expense: number;
  saving: number;
}

export function yearSummary(txs: SheetTransaction[], year: string): YearSummary {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (!t.date.startsWith(year)) continue;
    if (t.kind === "수입") income += t.amountKRW;
    else expense += t.amountKRW;
  }
  return { year, income, expense, saving: income - expense };
}
