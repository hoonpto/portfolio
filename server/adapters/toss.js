// 토스증권 Open API 어댑터 (2026.08 정식 출시, https://developers.tossinvest.com)
// - 인증: OAuth 2.0 Client Credentials (client_id / client_secret, WTS 설정 > Open API에서 발급)
// - 계좌/보유주식 조회 REST 제공. 실시간 스트리밍은 현재 미제공 → 주기적 폴링.
// - 허용 IP 등록 필수 (미등록 시 403). 계좌 지정 헤더 누락 시 account-header-required 오류.
// ⚠ 엔드포인트 경로·응답 필드는 공식 명세(openapi.tossinvest.com/openapi-docs/latest/openapi.json)를
//   보고 아래 TODO 부분을 채우세요. 아래 경로는 자리표시자입니다.

const HOST = process.env.TOSS_API_HOST ?? 'https://openapi.tossinvest.com';

let token = null;
let tokenExp = 0;

async function getToken() {
  if (token && Date.now() < tokenExp - 60_000) return token;
  const res = await fetch(`${HOST}/oauth2/token`, { // TODO: 명세의 토큰 엔드포인트로 교체
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.TOSS_CLIENT_ID,
      client_secret: process.env.TOSS_CLIENT_SECRET,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`토스 토큰 발급 실패: ${res.status}`);
  token = j.access_token;
  tokenExp = Date.now() + (j.expires_in ?? 3600) * 1000;
  return token;
}

export async function fetchAccount() {
  const t = await getToken();
  const headers = {
    authorization: `Bearer ${t}`,
    'X-Account-Id': process.env.TOSS_ACCOUNT_ID, // TODO: 명세의 계좌 헤더명으로 교체
  };
  const res = await fetch(`${HOST}/v1/accounts/holdings`, { headers }); // TODO: 보유주식 엔드포인트
  const j = await res.json();

  // TODO: 응답 필드 매핑. 토스 응답 구조는 KIS/키움과 다르므로 그대로 옮기지 말 것.
  const items = j.holdings ?? j.data ?? [];
  return {
    broker: 'toss',
    accountName: `토스 ${process.env.TOSS_ACCOUNT_LABEL ?? '종합'}`,
    mode: 'polling',
    cash: { KRW: Number(j.cash?.krw ?? 0), USD: Number(j.cash?.usd ?? 0) },
    holdings: items.map((h) => ({
      symbol: h.symbol ?? h.ticker,
      name: h.name,
      market: h.market === 'KR' ? 'KR' : 'US',
      currency: h.currency ?? (h.market === 'KR' ? 'KRW' : 'USD'),
      assetClass: h.market === 'KR' ? '국내주식' : '해외주식',
      qty: Number(h.quantity),
      avgPrice: Number(h.averagePrice),
      price: Number(h.currentPrice),
    })),
    fetchedAt: new Date().toISOString(),
  };
}
