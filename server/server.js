// 포트폴리오 집계 서버 (의존성 없음, Node 22+)
//   GET /api/portfolio  → 3개 증권사 계좌를 정규화해 합친 스냅샷
//   GET /api/stream     → SSE. 가격 변경 / 계좌 갱신 이벤트를 브라우저로 푸시
//   그 외                → public/ 정적 파일
//
// 증권사 API 키는 브라우저에 절대 두지 않습니다. 이 서버(고정 IP)만 증권사와 통신합니다.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import * as mock from './adapters/mock.js';
import * as kiwoom from './adapters/kiwoom.js';
import * as toss from './adapters/toss.js';
import * as shinhan from './adapters/shinhan.js';

try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env 없으면 목업 */ }

const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC = new URL('../public/', import.meta.url).pathname;

const live = {
  kiwoom: Boolean(process.env.KIWOOM_APP_KEY),
  toss: Boolean(process.env.TOSS_CLIENT_ID),
  shinhan: process.env.SHINHAN_SOURCE === 'file',
};
const adapters = {
  kiwoom: live.kiwoom ? kiwoom : mock,
  toss: live.toss ? toss : mock,
  shinhan: live.shinhan ? shinhan : mock,
};
const POLL_MS = { kiwoom: 5 * 60_000, toss: 30_000, shinhan: 5 * 60_000 };

const accounts = {};
const errors = {};
let fx = { USDKRW: Number(process.env.FX_USDKRW ?? 1390), source: 'env', at: new Date().toISOString() };
const clients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

async function refresh(broker) {
  try {
    accounts[broker] = { ...(await adapters[broker].fetchAccount(broker)), simulated: !live[broker] };
    delete errors[broker];
    broadcast('account', accounts[broker]);
  } catch (e) {
    errors[broker] = e.message;
    console.error(`[${broker}]`, e.message);
  }
}

function applyPrice(broker, symbol, price) {
  const h = accounts[broker]?.holdings.find((x) => x.symbol === symbol);
  if (!h || h.price === price) return;
  h.price = price;
  broadcast('price', { broker, symbol, price, at: Date.now() });
}

await Promise.all(Object.keys(adapters).map(refresh));
for (const b of Object.keys(adapters)) setInterval(() => refresh(b), POLL_MS[b]);

// 실시간: 키움은 WebSocket, 목업은 랜덤워크
if (live.kiwoom) {
  const symbols = accounts.kiwoom?.holdings.map((h) => h.symbol) ?? [];
  kiwoom.subscribe(symbols, ({ symbol, price }) => applyPrice('kiwoom', symbol, price)).catch((e) => console.error('[kiwoom ws]', e.message));
}
if (!live.kiwoom || !live.toss) {
  setInterval(() => {
    for (const c of mock.tick()) if (!live[c.broker]) applyPrice(c.broker, c.symbol, c.price);
  }, 1500);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/portfolio') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ fx, accounts: Object.values(accounts), errors, live }));
  }
  if (url.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    clients.add(res);
    const ka = setInterval(() => res.write(': ka\n\n'), 20_000);
    req.on('close', () => { clients.delete(res); clearInterval(ka); });
    return;
  }
  const path = normalize(join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!path.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, () => {
  console.log(`▶ http://localhost:${PORT}  (live: ${JSON.stringify(live)})`);
});
