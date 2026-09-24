// TossStock(별도 저장소, 홈 네트워크의 읽기 전용 API)에서 실시간 포트폴리오를
// 가져온다. secret은 그 서버 안에만 있고, 여기서는 API 키로 결과만 받아온다.
// 집 밖이라 서버에 닿지 않는 상황이 흔하므로, 실패해도 나머지 대시보드는
// 영향받지 않게 호출부에서 독립적으로 try/catch 해야 한다.

export interface TossHolding {
  name: string;
  symbol: string;
  quantity: number;
  price: number;
  valueKRW: number;
  profitRate: number;
}

export interface TossPortfolio {
  accountAlias: string;
  accountHolder: string;
  totalAssets: number;
  cash: number;
  holdingsEval: number;
  holdingsCost: number;
  profitAmount: number;
  profitRate: number;
  holdings: TossHolding[];
  fetchedAt: string;
}

export async function fetchTossPortfolio(
  baseUrl: string,
  apiKey: string
): Promise<TossPortfolio> {
  const url = `${baseUrl.replace(/\/$/, "")}/portfolio`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "X-API-Key": apiKey } });
  } catch {
    throw new Error(
      "TossStock 서버에 연결할 수 없습니다. 집 밖이거나 서버가 꺼져있는 건 아닌지 확인하세요."
    );
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.detail ?? "";
    } catch {
      // 본문이 JSON이 아니면 무시
    }
    if (res.status === 401) throw new Error("TossStock API 키가 올바르지 않습니다.");
    throw new Error(detail ? `TossStock 조회 실패: ${detail}` : `TossStock 조회 실패 (${res.status})`);
  }
  return res.json();
}
