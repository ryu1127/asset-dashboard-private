import { getCycleStartDay } from "./prefs";

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

// 가계부 월 키(YYYY-MM). 시작일이 25일이면 9/25~10/24 가 "2026-10".
export function monthOf(dateISO: string): string {
  const day = Number(dateISO.slice(8, 10));
  const startDay = getCycleStartDay();
  if (startDay > 1 && day >= startDay) return nextMonth(dateISO.slice(0, 7));
  return dateISO.slice(0, 7);
}

export function currentMonth(): string {
  return monthOf(todayISO());
}

// 가계부 월의 시작일~종료일 라벨. 예: "9월 25일 ~ 10월 24일"
export function monthRangeLabel(ym: string): string {
  const startDay = getCycleStartDay();
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return "";
  if (startDay <= 1) return `${m}월 1일 ~ ${m}월 ${daysInMonth(ym)}일`;
  const prev = new Date(y, m - 2, 1);
  return `${prev.getMonth() + 1}월 ${startDay}일 ~ ${m}월 ${startDay - 1}일`;
}

// 최근 n개월의 YYYY-MM 배열 (오래된 → 최신)
export function lastMonths(n: number): string[] {
  const out: string[] = [];
  const [cy, cm] = currentMonth().split("-").map(Number);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(cy, cm - 1 - i, 1);
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

// 다음 달의 YYYY-MM
export function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1); // m(1-based)을 넘기면 다음 달 1일
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 이전 달의 YYYY-MM
export function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 해당 월의 일수
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// "3일 전", "방금 전" 같은 상대 시간
export function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}일 전`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}개월 전`;
  return `${Math.floor(month / 12)}년 전`;
}

export function datetimeLabel(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}`;
}
