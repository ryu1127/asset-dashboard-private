import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import {
  detectDelimiter,
  normalizeDate,
  parseAmount,
  parseCSV,
  readFileText,
} from "../csv";
import { db, matchRule, type Kind } from "../db";
import { won } from "../format";

type AmountMode = "split" | "single";
type Encoding = "auto" | "utf-8" | "euc-kr";

interface ParsedRow {
  date: string | null;
  kind: Kind;
  amount: number;
  memo: string;
  categoryId: number | null;
  categoryName: string;
  matched: boolean; // 키워드 규칙으로 자동 분류됨
  ok: boolean;
}

const NONE = -1;

export default function Import() {
  const members = useLiveQuery(() => db.members.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const catRules = useLiveQuery(() => db.catRules.toArray(), []);

  const [encoding, setEncoding] = useState<Encoding>("auto");
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [hasHeader, setHasHeader] = useState(true);

  // 컬럼 매핑
  const [amountMode, setAmountMode] = useState<AmountMode>("split");
  const [dateCol, setDateCol] = useState(NONE);
  const [memoCol, setMemoCol] = useState(NONE);
  const [depositCol, setDepositCol] = useState(NONE); // 입금 → 수입
  const [withdrawCol, setWithdrawCol] = useState(NONE); // 출금 → 지출
  const [amountCol, setAmountCol] = useState(NONE); // 단일 금액 (음수=지출)

  // 기본값
  const [memberId, setMemberId] = useState<number | "">("");
  const [incomeCat, setIncomeCat] = useState<number | "">("");
  const [expenseCat, setExpenseCat] = useState<number | "">("");

  const incomeCats = useMemo(
    () => (categories ?? []).filter((c) => c.kind === "수입"),
    [categories]
  );
  const expenseCats = useMemo(
    () => (categories ?? []).filter((c) => c.kind === "지출"),
    [categories]
  );
  const catInfo = useMemo(() => {
    const m = new Map<number, { name: string; kind: Kind; color: string }>();
    categories?.forEach((c) => m.set(c.id!, c));
    return m;
  }, [categories]);

  const headers = useMemo(() => {
    if (!rows.length) return [];
    if (hasHeader) return rows[0].map((h, i) => h.trim() || `${i + 1}열`);
    return rows[0].map((_, i) => `${i + 1}열`);
  }, [rows, hasHeader]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await readFileText(file, encoding);
    const delim = detectDelimiter(text);
    const parsed = parseCSV(text, delim);
    setRows(parsed);
    autoGuess(parsed);
    e.target.value = "";
  }

  // 헤더 이름으로 컬럼 자동 추정
  function autoGuess(parsed: string[][]) {
    if (!parsed.length) return;
    const head = parsed[0].map((h) => h.trim());
    const find = (re: RegExp) => head.findIndex((h) => re.test(h));

    const d = find(/날짜|일자|거래일|date/i);
    const dep = find(/입금|맡기신|입금액/);
    const wd = find(/출금|찾으신|출금액/);
    const amt = find(/거래금액|금액|amount/i);
    const memo = find(/적요|내용|가맹점|메모|비고|상호|desc/i);

    setDateCol(d);
    setMemoCol(memo);
    if (dep >= 0 && wd >= 0) {
      setAmountMode("split");
      setDepositCol(dep);
      setWithdrawCol(wd);
    } else if (amt >= 0) {
      setAmountMode("single");
      setAmountCol(amt);
    }
  }

  const parsedRows: ParsedRow[] = useMemo(() => {
    if (!rows.length || dateCol === NONE) return [];
    const dataRows = hasHeader ? rows.slice(1) : rows;
    return dataRows.map((r) => {
      const date = normalizeDate(r[dateCol] ?? "");
      let kind: Kind = "지출";
      let amount = 0;
      if (amountMode === "split") {
        const dep = depositCol >= 0 ? parseAmount(r[depositCol] ?? "") : 0;
        const wd = withdrawCol >= 0 ? parseAmount(r[withdrawCol] ?? "") : 0;
        if (dep > 0) {
          kind = "수입";
          amount = dep;
        } else {
          kind = "지출";
          amount = Math.abs(wd);
        }
      } else {
        const v = amountCol >= 0 ? parseAmount(r[amountCol] ?? "") : 0;
        kind = v >= 0 ? "수입" : "지출";
        amount = Math.abs(v);
      }
      const memo = memoCol >= 0 ? (r[memoCol] ?? "").trim() : "";

      // 적요 키워드 규칙 매칭 (kind가 일치할 때만 적용), 실패 시 기본 분류
      const rule = matchRule(memo, catRules ?? []);
      let categoryId: number | null = null;
      let matched = false;
      if (rule && catInfo.get(rule.categoryId)?.kind === kind) {
        categoryId = rule.categoryId;
        matched = true;
      } else if (kind === "수입" && incomeCat !== "") {
        categoryId = Number(incomeCat);
      } else if (kind === "지출" && expenseCat !== "") {
        categoryId = Number(expenseCat);
      }
      const categoryName =
        categoryId != null ? catInfo.get(categoryId)?.name ?? "" : "미지정";

      return {
        date,
        kind,
        amount,
        memo,
        categoryId,
        categoryName,
        matched,
        ok: !!date && amount > 0 && categoryId != null,
      };
    });
  }, [
    rows,
    hasHeader,
    dateCol,
    memoCol,
    amountMode,
    depositCol,
    withdrawCol,
    amountCol,
    catRules,
    catInfo,
    incomeCat,
    expenseCat,
  ]);

  const stats = useMemo(() => {
    const valid = parsedRows.filter((p) => p.ok);
    let income = 0;
    let expense = 0;
    valid.forEach((p) =>
      p.kind === "수입" ? (income += p.amount) : (expense += p.amount)
    );
    const autoMatched = valid.filter((p) => p.matched).length;
    return {
      total: parsedRows.length,
      valid: valid.length,
      skipped: parsedRows.length - valid.length,
      autoMatched,
      income,
      expense,
    };
  }, [parsedRows]);

  const canImport =
    stats.valid > 0 &&
    memberId !== "" &&
    incomeCat !== "" &&
    expenseCat !== "";

  async function doImport() {
    if (!canImport) return;
    const valid = parsedRows.filter((p) => p.ok);
    await db.transactions.bulkAdd(
      valid.map((p) => ({
        date: p.date!,
        kind: p.kind,
        amount: p.amount,
        memberId: Number(memberId),
        categoryId: p.categoryId!,
        memo: p.memo || undefined,
      }))
    );
    alert(`${valid.length}건의 거래를 가져왔습니다.`);
    setRows([]);
    setFileName("");
  }

  const colOptions = (
    <>
      <option value={NONE}>선택 안 함</option>
      {headers.map((h, i) => (
        <option key={i} value={i}>
          {h}
        </option>
      ))}
    </>
  );

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>가져오기</h1>
          <p className="muted">
            은행·카드사에서 내려받은 CSV 파일을 불러와 거래로 등록합니다.
          </p>
        </div>
      </header>

      <div className="card">
        <h3>① 파일 선택</h3>
        <div className="import-file-row">
          <label className="inline-label">
            인코딩
            <select
              value={encoding}
              onChange={(e) => setEncoding(e.target.value as Encoding)}
            >
              <option value="auto">자동 감지</option>
              <option value="utf-8">UTF-8</option>
              <option value="euc-kr">EUC-KR (한글 깨질 때)</option>
            </select>
          </label>
          <label className="btn-secondary file-btn">
            CSV 파일 선택
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              style={{ display: "none" }}
              onChange={onFile}
            />
          </label>
          {fileName && <span className="muted">{fileName}</span>}
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          한글이 깨져 보이면 인코딩을 EUC-KR 로 바꾼 뒤 파일을 다시 선택하세요.
        </p>
      </div>

      {rows.length > 0 && (
        <>
          <div className="card">
            <h3>② 컬럼 연결</h3>
            <label className="check-row">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
              />
              첫 번째 줄은 제목(헤더) 행입니다
            </label>

            <div className="form-grid" style={{ marginTop: 12 }}>
              <label>
                날짜 컬럼
                <select
                  value={dateCol}
                  onChange={(e) => setDateCol(Number(e.target.value))}
                >
                  {colOptions}
                </select>
              </label>
              <label>
                메모/적요 컬럼
                <select
                  value={memoCol}
                  onChange={(e) => setMemoCol(Number(e.target.value))}
                >
                  {colOptions}
                </select>
              </label>
              <label>
                금액 방식
                <select
                  value={amountMode}
                  onChange={(e) => setAmountMode(e.target.value as AmountMode)}
                >
                  <option value="split">입금/출금 컬럼 분리</option>
                  <option value="single">단일 금액 (음수=지출)</option>
                </select>
              </label>

              {amountMode === "split" ? (
                <>
                  <label>
                    입금 컬럼 (→ 수입)
                    <select
                      value={depositCol}
                      onChange={(e) => setDepositCol(Number(e.target.value))}
                    >
                      {colOptions}
                    </select>
                  </label>
                  <label>
                    출금 컬럼 (→ 지출)
                    <select
                      value={withdrawCol}
                      onChange={(e) => setWithdrawCol(Number(e.target.value))}
                    >
                      {colOptions}
                    </select>
                  </label>
                </>
              ) : (
                <label>
                  금액 컬럼
                  <select
                    value={amountCol}
                    onChange={(e) => setAmountCol(Number(e.target.value))}
                  >
                    {colOptions}
                  </select>
                </label>
              )}
            </div>
          </div>

          <div className="card">
            <h3>③ 기본값 지정</h3>
            <p className="muted">
              은행 내역에는 구성원·분류 정보가 없으므로 기본값을 정해 일괄
              적용합니다. (가져온 뒤 개별 수정 가능)
            </p>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label>
                구성원
                <select
                  value={memberId}
                  onChange={(e) =>
                    setMemberId(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                >
                  <option value="">선택</option>
                  {members?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                수입 기본 분류
                <select
                  value={incomeCat}
                  onChange={(e) =>
                    setIncomeCat(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                >
                  <option value="">선택</option>
                  {incomeCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                지출 기본 분류
                <select
                  value={expenseCat}
                  onChange={(e) =>
                    setExpenseCat(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                >
                  <option value="">선택</option>
                  {expenseCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="card">
            <div className="budget-bar-head">
              <h3 style={{ margin: 0 }}>④ 미리보기</h3>
              <span className="muted">
                총 {stats.total}행 · 유효 {stats.valid}건
                {stats.autoMatched > 0 && ` · 자동분류 ${stats.autoMatched}건`}
                {stats.skipped > 0 && ` · 제외 ${stats.skipped}건`}
              </span>
            </div>
            <div className="filter-totals" style={{ marginBottom: 12 }}>
              <span className="income">수입 {won(stats.income)}</span>
              <span className="expense">지출 {won(stats.expense)}</span>
            </div>
            {parsedRows.length === 0 ? (
              <div className="empty">
                날짜 컬럼을 먼저 연결하면 미리보기가 표시됩니다.
              </div>
            ) : (
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>구분</th>
                    <th>메모</th>
                    <th>분류</th>
                    <th className="right">금액</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 12).map((p, i) => (
                    <tr key={i} className={p.ok ? "" : "row-off"}>
                      <td className="muted">{p.date ?? "날짜 인식 실패"}</td>
                      <td className={p.kind === "수입" ? "income" : "expense"}>
                        {p.kind}
                      </td>
                      <td className="muted">{p.memo}</td>
                      <td>
                        {p.categoryId != null && (
                          <span
                            className="dot"
                            style={{
                              background:
                                catInfo.get(p.categoryId)?.color ?? "#94a3b8",
                            }}
                          />
                        )}
                        {p.categoryName}
                        {p.matched && <span className="auto-badge">자동</span>}
                      </td>
                      <td
                        className={
                          "right " + (p.kind === "수입" ? "income" : "expense")
                        }
                      >
                        {won(p.amount)}
                      </td>
                      <td className="right muted">{p.ok ? "" : "제외"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {parsedRows.length > 12 && (
              <p className="muted" style={{ marginTop: 8 }}>
                … 외 {parsedRows.length - 12}행 (가져오기 시 모두 반영)
              </p>
            )}
            <button
              className="btn-primary"
              style={{ marginTop: 16 }}
              disabled={!canImport}
              onClick={doImport}
            >
              {stats.valid}건 가져오기
            </button>
            {!canImport && stats.valid > 0 && (
              <span className="muted" style={{ marginLeft: 12 }}>
                구성원과 기본 분류를 선택하세요.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
