export function won(n: number): string {
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

export function wonShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 100000000) return `${sign}${(abs / 100000000).toFixed(1)}억`;
  if (abs >= 10000) return `${sign}${Math.round(abs / 10000).toLocaleString()}만`;
  return `${sign}${abs.toLocaleString()}`;
}

export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function monthOf(dateISO: string): string {
  return dateISO.slice(0, 7); // YYYY-MM
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

// 최근 n개월의 YYYY-MM 배열 (오래된 → 최신)
export function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(
      `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return out;
}

export function monthLabel(ym: string): string {
  const [, m] = ym.split("-");
  return `${parseInt(m, 10)}월`;
}
