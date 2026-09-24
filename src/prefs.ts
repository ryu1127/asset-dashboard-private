// Dexie까지 갈 필요 없는, 이 브라우저에만 남는 단순 개인 설정값.
// App.tsx의 sidebarOpen과 같은 결로 localStorage를 직접 쓴다.

const NET_WORTH_GOAL_KEY = "netWorthGoal";

export function getNetWorthGoal(): number | null {
  const raw = localStorage.getItem(NET_WORTH_GOAL_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function setNetWorthGoal(value: number | null): void {
  if (value == null || value <= 0) localStorage.removeItem(NET_WORTH_GOAL_KEY);
  else localStorage.setItem(NET_WORTH_GOAL_KEY, String(value));
}

export interface TossStockConfig {
  baseUrl: string;
  apiKey: string;
}

const TOSSSTOCK_CONFIG_KEY = "tossStockConfig";

export function getTossStockConfig(): TossStockConfig | null {
  const raw = localStorage.getItem(TOSSSTOCK_CONFIG_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as TossStockConfig;
    return v.baseUrl && v.apiKey ? v : null;
  } catch {
    return null;
  }
}

export function setTossStockConfig(config: TossStockConfig | null): void {
  if (!config || !config.baseUrl || !config.apiKey) {
    localStorage.removeItem(TOSSSTOCK_CONFIG_KEY);
  } else {
    localStorage.setItem(TOSSSTOCK_CONFIG_KEY, JSON.stringify(config));
  }
}
