// 외부 라이브러리 없는 RFC4180 기반 CSV 파서 (따옴표·줄바꿈 포함 필드 처리)

export function parseCSV(text: string, delimiter = ","): string[][] {
  text = text.replace(/^﻿/, ""); // BOM 제거
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // \r\n 의 \r 은 무시
      } else {
        field += c;
      }
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // 완전히 빈 줄 제거
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") || "";
  const candidates: Record<string, number> = { ",": 0, "\t": 0, ";": 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in candidates) candidates[ch]++;
  }
  const best = Object.entries(candidates).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ",";
}

// 파일을 인코딩 고려해 텍스트로 읽기 (한국 은행 CSV는 EUC-KR 인 경우가 많음)
export async function readFileText(
  file: File,
  encoding: "auto" | "utf-8" | "euc-kr"
): Promise<string> {
  const buf = await file.arrayBuffer();
  if (encoding === "auto") {
    const utf8 = new TextDecoder("utf-8").decode(buf);
    if (utf8.includes("�")) {
      try {
        return new TextDecoder("euc-kr").decode(buf);
      } catch {
        return utf8;
      }
    }
    return utf8;
  }
  try {
    return new TextDecoder(encoding).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

// 다양한 날짜 형식을 YYYY-MM-DD 로 정규화
export function normalizeDate(s: string): string | null {
  const m = String(s)
    .trim()
    .match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// 통화기호·콤마·공백 제거 후 숫자로 (부호 유지)
export function parseAmount(s: string): number {
  const cleaned = String(s).replace(/[^\d.\-]/g, "");
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}
