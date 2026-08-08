import type { Category } from "./db";

export interface CategoryGroup {
  parent: Category;
  children: Category[];
}

function byOrder(a: Category, b: Category): number {
  return (a.order ?? a.id!) - (b.order ?? b.id!);
}

// 최상위 카테고리마다 그 하위 카테고리를 묶어서 반환 (하위 카테고리가 없으면 children: [])
// 각 레벨(형제)은 order(없으면 id) 기준으로 정렬된다.
export function groupCategories(categories: Category[]): CategoryGroup[] {
  const parents = categories.filter((c) => !c.parentId).sort(byOrder);
  const childrenOf = new Map<number, Category[]>();
  for (const c of categories) {
    if (c.parentId) {
      const arr = childrenOf.get(c.parentId) ?? [];
      arr.push(c);
      childrenOf.set(c.parentId, arr);
    }
  }
  for (const arr of childrenOf.values()) arr.sort(byOrder);
  return parents.map((p) => ({
    parent: p,
    children: childrenOf.get(p.id!) ?? [],
  }));
}
