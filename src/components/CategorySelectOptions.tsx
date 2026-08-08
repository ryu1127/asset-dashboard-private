import type { Category } from "../db";
import { groupCategories } from "../categoryTree";

// <select> 안에서 쓰는 카테고리 옵션 목록. 하위 카테고리가 있는 카테고리는
// optgroup으로 묶고, 그 자체도 선택 가능하게 "(전체)" 옵션을 넣는다.
export default function CategorySelectOptions({
  categories,
}: {
  categories: Category[];
}) {
  return (
    <>
      {groupCategories(categories).map((g) =>
        g.children.length === 0 ? (
          <option key={g.parent.id} value={g.parent.id}>
            {g.parent.name}
          </option>
        ) : (
          <optgroup key={g.parent.id} label={g.parent.name}>
            <option value={g.parent.id}>{g.parent.name} (전체)</option>
            {g.children.map((c) => (
              <option key={c.id} value={c.id}>
                {"  "}
                {c.name}
              </option>
            ))}
          </optgroup>
        )
      )}
    </>
  );
}
