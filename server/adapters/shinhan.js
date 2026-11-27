// 신한투자증권 어댑터
// 2026.11 기준 개인 고객용 공식 REST Open API 출시는 확인되지 않았습니다.
// 현실적인 선택지:
//   1) 수동/CSV: SOL증권·HTS에서 잔고를 내보내 data/shinhan.json 으로 저장 (이 파일이 기본 구현)
//   2) 신한i Indi API (Windows 전용 COM/OCX): Windows PC에서 작은 브릿지 프로그램이
//      잔고를 조회해 이 서버로 POST /api/ingest/shinhan 하도록 구성
//   3) 공식 REST API가 나오면 kiwoom.js 처럼 이 파일만 교체
// 수동 계좌라도 현재가는 다른 시세 소스(키움/토스 시세 API)로 갱신할 수 있습니다.

import { readFile } from 'node:fs/promises';

const FILE = new URL('../../data/shinhan.json', import.meta.url);

export async function fetchAccount() {
  const j = JSON.parse(await readFile(FILE, 'utf8'));
  return {
    broker: 'shinhan',
    accountName: j.accountName ?? '신한 계좌',
    mode: 'manual',
    cash: j.cash ?? { KRW: 0, USD: 0 },
    holdings: j.holdings ?? [],
    fetchedAt: j.updatedAt ?? new Date().toISOString(),
  };
}
