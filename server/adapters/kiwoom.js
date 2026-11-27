// 키움증권 REST API 어댑터 (https://openapi.kiwoom.com)
// - 인증: POST /oauth2/token (appkey/secretkey → Bearer 토큰, 약 24시간 유효)
// - 잔고: POST /api/dostk/acnt, 헤더 api-id: kt00018 (계좌평가잔고내역요청, 국내주식)
// - 실시간: wss://api.kiwoom.com:10000/api/dostk/websocket (REG 메시지로 체결 '0B' 구독)
// - 사전 준비: 키움 Open API 사용 신청 + 서버 고정 IP 등록 (미등록 IP는 거부됨)
// ⚠ 필드명은 공식 명세 기준으로 반드시 재확인하세요. 아래는 초안입니다.

const HOST = process.env.KIWOOM_MOCK === 'true' ? 'https://mockapi.kiwoom.com' : 'https://api.kiwoom.com';
const WS_HOST = process.env.KIWOOM_MOCK === 'true' ? 'wss://mockapi.kiwoom.com:10000' : 'wss://api.kiwoom.com:10000';

let token = null;
let tokenExp = 0;

async function getToken() {
  if (token && Date.now() < tokenExp - 60_000) return token;
  const res = await fetch(`${HOST}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: process.env.KIWOOM_APP_KEY,
      secretkey: process.env.KIWOOM_SECRET_KEY,
    }),
  });
  const j = await res.json();
  if (!j.token) throw new Error(`키움 토큰 발급 실패: ${j.return_msg ?? res.status}`);
  token = j.token;
  tokenExp = Date.now() + 23 * 3600_000;
  return token;
}

const num = (s) => Number(String(s ?? '0').replace(/[+,]/g, '')) || 0;

/** kt00018 호출. 연속조회(cont-yn / next-key)를 모두 따라가서 합칩니다. */
export async function fetchAccount() {
  const t = await getToken();
  const rows = [];
  let summary = null;
  let nextKey = '';
  do {
    const res = await fetch(`${HOST}/api/dostk/acnt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        authorization: `Bearer ${t}`,
        'api-id': 'kt00018',
        ...(nextKey ? { 'cont-yn': 'Y', 'next-key': nextKey } : {}),
      },
      body: JSON.stringify({ qry_tp: '1', dmst_stex_tp: 'KRX' }),
    });
    const j = await res.json();
    summary ??= j;
    rows.push(...(j.acnt_evlt_remn_indv_tot ?? []));
    nextKey = res.headers.get('cont-yn') === 'Y' ? res.headers.get('next-key') : '';
  } while (nextKey);

  return {
    broker: 'kiwoom',
    accountName: `키움 ${process.env.KIWOOM_ACCOUNT_LABEL ?? '위탁'}`,
    mode: 'realtime',
    // 예수금은 kt00001(예수금상세현황)로 별도 조회하는 것이 정확합니다.
    cash: { KRW: num(summary?.prsm_dpst_aset_amt) - num(summary?.tot_evlt_amt), USD: 0 },
    holdings: rows.map((r) => ({
      symbol: String(r.stk_cd).replace(/^A/, ''), // 'A005930' → '005930'
      name: r.stk_nm,
      market: 'KR',
      currency: 'KRW',
      assetClass: '국내주식',
      qty: num(r.rmnd_qty),
      avgPrice: num(r.pur_pric),
      price: Math.abs(num(r.cur_prc)),
    })),
    fetchedAt: new Date().toISOString(),
  };
}

/** 보유 종목 실시간 체결가 구독. onPrice({symbol, price}) 콜백 호출. */
export async function subscribe(symbols, onPrice) {
  const t = await getToken();
  const ws = new WebSocket(`${WS_HOST}/api/dostk/websocket`);
  ws.onopen = () => ws.send(JSON.stringify({ trnm: 'LOGIN', token: t }));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.trnm === 'PING') return ws.send(ev.data); // 하트비트 에코
    if (msg.trnm === 'LOGIN' && msg.return_code === 0) {
      ws.send(JSON.stringify({
        trnm: 'REG', grp_no: '1', refresh: '1',
        data: [{ item: symbols, type: ['0B'] }], // 0B = 주식체결
      }));
    }
    if (msg.trnm === 'REAL') {
      for (const d of msg.data ?? []) {
        const price = Math.abs(num(d.values?.['10'])); // FID 10 = 현재가
        if (price) onPrice({ symbol: d.item, price });
      }
    }
  };
  ws.onclose = () => setTimeout(() => subscribe(symbols, onPrice), 5000); // 자동 재연결
  return ws;
}
