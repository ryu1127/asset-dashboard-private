import Dexie, { type Table } from "dexie";
import { currentMonth, daysInMonth, nextMonth } from "./format";

// ---- 타입 정의 ----
export type Kind = "수입" | "지출";
export type AccountType = "현금" | "예금" | "적금" | "투자" | "부동산" | "부채";
export type Owner = "공동" | string; // member name 또는 "공동"

export interface Member {
  id?: number;
  name: string;
  color: string;
}

export interface Category {
  id?: number;
  name: string;
  kind: Kind;
  color: string;
  parentId?: number; // 상위 카테고리 id (없으면 최상위)
}

export interface Account {
  id?: number;
  name: string;
  type: AccountType;
  owner: Owner;
}

export interface Transaction {
  id?: number;
  date: string; // YYYY-MM-DD
  kind: Kind;
  amount: number;
  memberId: number;
  categoryId: number;
  accountId?: number;
  memo?: string;
}

export interface Snapshot {
  id?: number;
  month: string; // YYYY-MM
  accountId: number;
  balance: number;
}

export interface Budget {
  id?: number;
  categoryId: number; // 지출 카테고리
  amount: number; // 매월 예산 한도
}

export interface CatRule {
  id?: number;
  keyword: string; // 적요에 이 키워드가 포함되면
  categoryId: number; // 이 카테고리로 자동 분류
}

export interface Recurring {
  id?: number;
  memo: string; // 규칙 이름 겸 메모 (예: 월급, 넷플릭스)
  kind: Kind;
  amount: number;
  memberId: number;
  categoryId: number;
  accountId?: number;
  dayOfMonth: number; // 매월 며칠에 반영할지 (1~31, 말일 초과 시 그 달 마지막 날)
  startMonth: string; // YYYY-MM, 시작 월
  active: boolean;
  lastPostedMonth?: string; // 마지막으로 생성된 월 (중복 방지)
}

// ---- Dexie DB ----
export class AssetDB extends Dexie {
  members!: Table<Member, number>;
  categories!: Table<Category, number>;
  accounts!: Table<Account, number>;
  transactions!: Table<Transaction, number>;
  snapshots!: Table<Snapshot, number>;
  budgets!: Table<Budget, number>;
  recurring!: Table<Recurring, number>;
  catRules!: Table<CatRule, number>;

  constructor() {
    super("assetDashboard");
    this.version(1).stores({
      members: "++id, name",
      categories: "++id, name, kind",
      accounts: "++id, name, type, owner",
      transactions: "++id, date, kind, memberId, categoryId, accountId",
      snapshots: "++id, month, accountId",
    });
    this.version(2).stores({
      budgets: "++id, categoryId",
    });
    this.version(3).stores({
      recurring: "++id, active",
    });
    this.version(4).stores({
      catRules: "++id, keyword, categoryId",
    });
    this.version(5).stores({
      categories: "++id, name, kind, parentId",
    });
  }
}

export const db = new AssetDB();

// ---- 최초 실행 시 기본 데이터 세팅 ----
export async function seedIfEmpty() {
  const memberCount = await db.members.count();
  if (memberCount > 0) return;

  await db.transaction(
    "rw",
    db.members,
    db.categories,
    db.accounts,
    db.catRules,
    async () => {
      await db.members.bulkAdd([
        { name: "남편", color: "#2563eb" },
        { name: "아내", color: "#db2777" },
      ]);

      const expenseCats: Omit<Category, "id">[] = [
        { name: "식비", kind: "지출", color: "#ef4444" },
        { name: "주거/공과금", kind: "지출", color: "#f97316" },
        { name: "교통", kind: "지출", color: "#eab308" },
        { name: "통신", kind: "지출", color: "#84cc16" },
        { name: "생활용품", kind: "지출", color: "#22c55e" },
        { name: "쇼핑", kind: "지출", color: "#14b8a6" },
        { name: "문화/여가", kind: "지출", color: "#06b6d4" },
        { name: "의료/건강", kind: "지출", color: "#8b5cf6" },
        { name: "교육", kind: "지출", color: "#a855f7" },
        { name: "경조사", kind: "지출", color: "#ec4899" },
        { name: "기타지출", kind: "지출", color: "#94a3b8" },
      ];
      const incomeCats: Omit<Category, "id">[] = [
        { name: "급여", kind: "수입", color: "#2563eb" },
        { name: "상여/보너스", kind: "수입", color: "#0ea5e9" },
        { name: "사업/부업", kind: "수입", color: "#10b981" },
        { name: "금융소득", kind: "수입", color: "#f59e0b" },
        { name: "기타수입", kind: "수입", color: "#64748b" },
      ];
      await db.categories.bulkAdd([...incomeCats, ...expenseCats]);

      await db.accounts.bulkAdd([
        { name: "생활비 통장", type: "현금", owner: "공동" },
        { name: "급여 통장", type: "예금", owner: "공동" },
        { name: "투자 계좌", type: "투자", owner: "공동" },
      ]);

      // 적요 키워드 → 카테고리 기본 규칙
      const cats = await db.categories.toArray();
      const nameToId = new Map(cats.map((c) => [c.name, c.id!]));
      await db.catRules.bulkAdd(presetRules(nameToId));
    }
  );
}

// ---- 적요 키워드 자동 분류 규칙 ----
const DEFAULT_RULE_PRESETS: Record<string, string[]> = {
  식비: [
    "스타벅스", "카페", "커피", "배달의민족", "배민", "요기요", "쿠팡이츠",
    "맥도날드", "김밥", "식당", "편의점", "GS25", "CU", "세븐일레븐", "이디야",
    "투썸",
  ],
  교통: [
    "지하철", "버스", "택시", "카카오T", "코레일", "SRT", "주유", "하이패스",
    "톨게이트", "GS칼텍스", "SK에너지",
  ],
  통신: ["SKT", "KT", "LGU", "유플러스", "알뜰폰"],
  "주거/공과금": ["한국전력", "전기요금", "도시가스", "수도요금", "관리비"],
  생활용품: ["이마트", "홈플러스", "롯데마트", "코스트코", "다이소"],
  쇼핑: ["쿠팡", "11번가", "G마켓", "지마켓", "무신사", "올리브영", "네이버페이"],
  "문화/여가": [
    "넷플릭스", "유튜브", "왓챠", "티빙", "웨이브", "스포티파이", "CGV",
    "메가박스", "롯데시네마", "멜론",
  ],
  "의료/건강": ["병원", "약국", "의원", "치과", "한의원"],
  급여: ["급여", "월급"],
};

function presetRules(nameToId: Map<string, number>): CatRule[] {
  const out: CatRule[] = [];
  for (const [cat, keywords] of Object.entries(DEFAULT_RULE_PRESETS)) {
    const id = nameToId.get(cat);
    if (id == null) continue;
    for (const k of keywords) out.push({ keyword: k, categoryId: id });
  }
  return out;
}

// 기존 사용자도 버튼으로 기본 규칙을 채울 수 있게 (중복 키워드는 건너뜀). 추가된 개수 반환
export async function seedDefaultRules(): Promise<number> {
  const cats = await db.categories.toArray();
  const nameToId = new Map(cats.map((c) => [c.name, c.id!]));
  const existing = new Set(
    (await db.catRules.toArray()).map((r) => r.keyword.toLowerCase())
  );
  const toAdd = presetRules(nameToId).filter(
    (r) => !existing.has(r.keyword.toLowerCase())
  );
  if (toAdd.length) await db.catRules.bulkAdd(toAdd);
  return toAdd.length;
}

// 적요에서 가장 구체적인(긴) 키워드 규칙을 찾는다
export function matchRule(
  memo: string,
  rules: CatRule[]
): CatRule | undefined {
  if (!memo) return undefined;
  const m = memo.toLowerCase();
  let best: CatRule | undefined;
  for (const r of rules) {
    if (m.includes(r.keyword.toLowerCase())) {
      if (!best || r.keyword.length > best.keyword.length) best = r;
    }
  }
  return best;
}

// ---- 백업(내보내기/가져오기) ----
export async function exportData(): Promise<string> {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    members: await db.members.toArray(),
    categories: await db.categories.toArray(),
    accounts: await db.accounts.toArray(),
    transactions: await db.transactions.toArray(),
    snapshots: await db.snapshots.toArray(),
    budgets: await db.budgets.toArray(),
    recurring: await db.recurring.toArray(),
    catRules: await db.catRules.toArray(),
  };
  return JSON.stringify(data, null, 2);
}

export async function importData(json: string) {
  const data = JSON.parse(json);
  await db.transaction(
    "rw",
    db.members,
    db.categories,
    db.accounts,
    db.transactions,
    db.snapshots,
    db.budgets,
    db.recurring,
    db.catRules,
    async () => {
      await Promise.all([
        db.members.clear(),
        db.categories.clear(),
        db.accounts.clear(),
        db.transactions.clear(),
        db.snapshots.clear(),
        db.budgets.clear(),
        db.recurring.clear(),
        db.catRules.clear(),
      ]);
      if (data.members) await db.members.bulkAdd(data.members);
      if (data.categories) await db.categories.bulkAdd(data.categories);
      if (data.accounts) await db.accounts.bulkAdd(data.accounts);
      if (data.transactions) await db.transactions.bulkAdd(data.transactions);
      if (data.snapshots) await db.snapshots.bulkAdd(data.snapshots);
      if (data.budgets) await db.budgets.bulkAdd(data.budgets);
      if (data.recurring) await db.recurring.bulkAdd(data.recurring);
      if (data.catRules) await db.catRules.bulkAdd(data.catRules);
    }
  );
}

// ---- 반복 거래: 밀린 달까지 자동 생성 (중복 방지) ----
// 각 활성 규칙에 대해 시작월(또는 마지막 생성월 다음)부터 이번 달까지
// 매월 한 건씩 거래를 만들고 lastPostedMonth 를 갱신한다. 반환값은 생성 건수.
export async function postDueRecurring(): Promise<number> {
  const cm = currentMonth();
  const rules = await db.recurring.toArray();
  let created = 0;

  await db.transaction("rw", db.recurring, db.transactions, async () => {
    for (const r of rules) {
      if (!r.active) continue;
      let m = r.lastPostedMonth ? nextMonth(r.lastPostedMonth) : r.startMonth;
      let last = r.lastPostedMonth;
      let guard = 0;
      while (m <= cm && guard < 600) {
        const day = Math.min(r.dayOfMonth, daysInMonth(m));
        const date = `${m}-${String(day).padStart(2, "0")}`;
        await db.transactions.add({
          date,
          kind: r.kind,
          amount: r.amount,
          memberId: r.memberId,
          categoryId: r.categoryId,
          accountId: r.accountId,
          memo: r.memo,
        });
        created++;
        last = m;
        m = nextMonth(m);
        guard++;
      }
      if (last !== r.lastPostedMonth) {
        await db.recurring.update(r.id!, { lastPostedMonth: last });
      }
    }
  });
  return created;
}
