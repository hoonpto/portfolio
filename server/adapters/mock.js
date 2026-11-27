// 목업 어댑터: API 키 없이 대시보드를 띄워볼 때 사용합니다.
// 실제 어댑터와 동일한 정규화 포맷을 반환합니다.

const SEED = {
  kiwoom: {
    accountName: '키움 위탁 ****-12',
    mode: 'realtime', // WebSocket 실시간
    cash: { KRW: 3_250_000, USD: 0 },
    holdings: [
      { symbol: '005930', name: '삼성전자', market: 'KR', currency: 'KRW', assetClass: '국내주식', qty: 120, avgPrice: 71200, price: 78500 },
      { symbol: '000660', name: 'SK하이닉스', market: 'KR', currency: 'KRW', assetClass: '국내주식', qty: 15, avgPrice: 182000, price: 214500 },
      { symbol: '069500', name: 'KODEX 200', market: 'KR', currency: 'KRW', assetClass: 'ETF', qty: 80, avgPrice: 34100, price: 36800 },
      { symbol: '035420', name: 'NAVER', market: 'KR', currency: 'KRW', assetClass: '국내주식', qty: 10, avgPrice: 205000, price: 188300 },
    ],
  },
  toss: {
    accountName: '토스 종합 ****-07',
    mode: 'polling', // REST 폴링
    cash: { KRW: 1_120_000, USD: 2_400 },
    holdings: [
      { symbol: 'AAPL', name: 'Apple', market: 'US', currency: 'USD', assetClass: '해외주식', qty: 18, avgPrice: 182.4, price: 231.6 },
      { symbol: 'NVDA', name: 'NVIDIA', market: 'US', currency: 'USD', assetClass: '해외주식', qty: 25, avgPrice: 96.2, price: 142.8 },
      { symbol: 'TSLA', name: 'Tesla', market: 'US', currency: 'USD', assetClass: '해외주식', qty: 6, avgPrice: 268.0, price: 241.3 },
      { symbol: 'VOO', name: 'Vanguard S&P 500', market: 'US', currency: 'USD', assetClass: 'ETF', qty: 9, avgPrice: 452.0, price: 531.2 },
    ],
  },
  shinhan: {
    accountName: '신한 ISA ****-33',
    mode: 'manual', // 공식 REST 미제공 → 수동/CSV 또는 Indi 브릿지
    cash: { KRW: 2_400_000, USD: 0 },
    holdings: [
      { symbol: '360750', name: 'TIGER 미국S&P500', market: 'KR', currency: 'KRW', assetClass: 'ETF', qty: 300, avgPrice: 17150, price: 20890 },
      { symbol: '133690', name: 'TIGER 미국나스닥100', market: 'KR', currency: 'KRW', assetClass: 'ETF', qty: 40, avgPrice: 112400, price: 131200 },
      { symbol: '148070', name: 'KOSEF 국고채10년', market: 'KR', currency: 'KRW', assetClass: '채권', qty: 60, avgPrice: 112000, price: 114350 },
    ],
  },
};

const state = structuredClone(SEED);

/** 가격을 랜덤워크로 흔들어 실시간 체결을 흉내냅니다. 변경된 종목 목록을 반환. */
export function tick() {
  const changes = [];
  for (const [broker, acct] of Object.entries(state)) {
    if (acct.mode === 'manual') continue; // 수동 계좌는 시세만 별도 갱신한다고 가정
    for (const h of acct.holdings) {
      if (Math.random() < 0.55) continue;
      const step = h.price * (Math.random() - 0.5) * 0.004;
      const next = h.currency === 'KRW' ? Math.max(1, Math.round((h.price + step) / 50) * 50 || h.price) : +(h.price + step).toFixed(2);
      if (next !== h.price) {
        h.price = next;
        changes.push({ broker, symbol: h.symbol, price: next });
      }
    }
  }
  return changes;
}

export async function fetchAccount(broker) {
  return { broker, ...structuredClone(state[broker]), fetchedAt: new Date().toISOString() };
}
