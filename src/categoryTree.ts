import type { Category } from "./db";

export interface CategoryGroup {
  parent: Category;
  children: Category[];
}

// 최상위 카테고리마다 그 하위 카테고리를 묶어서 반환 (하위 카테고리가 없으면 children: [])
export function groupCategories(categories: Category[]): CategoryGroup[] {
  const parents = categories.filter((c) => !c.parentId);
  const childrenOf = new Map<number, Category[]>();
  for (const c of categories) {
    if (c.parentId) {
      const arr = childrenOf.get(c.parentId) ?? [];
      arr.push(c);
      childrenOf.set(c.parentId, arr);
    }
  }
  return parents.map((p) => ({
    parent: p,
    children: childrenOf.get(p.id!) ?? [],
  }));
}
