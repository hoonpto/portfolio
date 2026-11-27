# 증권사 API 연동 가이드 (초안, 2026.11 기준)

> 엔드포인트·필드명은 각 증권사 공식 문서에서 최종 확인하세요. 특히 토스증권은 2026년 8월에 출시된 지 얼마 안 돼 명세가 바뀔 수 있습니다.

## 1. 전체 구조

```
[브라우저 대시보드]  ←SSE─  [집계 서버 (고정 IP)]  ─REST/WS→  키움 / 토스
   public/index.html          server/server.js       ─파일/브릿지→ 신한
```

- **API 키는 서버에만 둡니다.** 브라우저에서 증권사 API를 직접 부르면 키가 노출되고, CORS·IP 화이트리스트 때문에 동작하지도 않습니다.
- **고정 IP가 필요합니다.** 키움·토스 모두 허용 IP 등록이 필수입니다. 집 PC(공유기 고정 IP)나 고정 IP 클라우드 VM(AWS Lightsail, Oracle Cloud 등)에 서버를 둡니다.
- 증권사별 응답을 **공통 포맷**(`broker, accountName, mode, cash{KRW,USD}, holdings[]`)으로 정규화하면, 대시보드는 증권사를 몰라도 됩니다.

## 2. 증권사별 현황

| | 키움증권 | 토스증권 | 신한투자증권 |
|---|---|---|---|
| 개인용 공식 API | ✅ REST API (2025~) | ✅ Open API (2026.08 정식) | ❌ REST 미확인 · Indi(Windows COM)만 |
| 인증 | appkey/secretkey → 토큰 | OAuth2 Client Credentials | Indi 로그인(공동인증서) |
| 잔고 조회 | `kt00018` 계좌평가잔고내역 (국내) | 계좌·보유주식 REST (국내+미국) | 수동/CSV, 또는 Indi 브릿지 |
| 실시간 | ✅ WebSocket (`0B` 체결) | ❌ 현재 REST만 → 폴링 | ❌ |
| 이 프로젝트 방식 | WebSocket 실시간 + 5분 잔고 재조회 | 30초 폴링 | `data/shinhan.json` |
| 신청 | openapi.kiwoom.com, 서비스 신청 + IP 등록 | 토스증권 WTS > 설정 > Open API | — |

### 키움증권 (`server/adapters/kiwoom.js`)
1. 키움 계좌 개설 → openapi.kiwoom.com에서 **REST API 사용 신청** → App Key / Secret Key 발급
2. 서버 공인 IP 등록 (모의투자 서버 `mockapi.kiwoom.com`으로 먼저 테스트 권장)
3. `POST /oauth2/token` → 토큰
4. `POST /api/dostk/acnt` + 헤더 `api-id: kt00018` → 보유 종목. `cont-yn`/`next-key` 헤더로 연속조회
5. WebSocket 접속 → `LOGIN` → `REG`(type `0B`)로 보유 종목 체결가 구독
- 주의: 종목코드에 `A` 접두어(`A005930`), 숫자 필드에 `+`/`-` 부호 포함. 해외주식 잔고는 별도 확인 필요.

### 토스증권 (`server/adapters/toss.js`)
1. 토스증권 WTS(웹) 로그인 → 설정 > Open API에서 client_id / client_secret 발급, **허용 IP 등록**(미등록 시 403)
2. 토큰 발급 후, 요청마다 **계좌 지정 헤더** 필요 (누락 시 `account-header-required`)
3. 미국 주식이 많은 계좌에 적합. 실시간 스트림이 없어 30초 폴링 (호출 한도 확인)
- `toss.js`의 `TODO` 부분(엔드포인트 경로, 헤더명, 응답 필드)은 공식 OpenAPI 명세(openapi.json)를 보고 채워야 합니다.

### 신한투자증권 (`server/adapters/shinhan.js`)
- 2026.11 기준 개인용 REST Open API 출시는 확인되지 않았습니다. 선택지:
  1. **수동/파일** (기본): `data/shinhan.example.json`을 `data/shinhan.json`으로 복사해 잔고 입력, `.env`에 `SHINHAN_SOURCE=file`
  2. **Indi 브릿지**: Windows PC에서 신한i Indi API로 잔고를 조회해 서버로 전송하는 작은 프로그램 (32bit COM, 로그인 상태 유지 필요)
  3. 수동 계좌라도 **현재가는 키움 시세 WebSocket으로 갱신** 가능 (국내 종목이면 그대로 구독 추가)

## 3. 공통으로 필요한 것

- **환율**: 지금은 `.env`의 `FX_USDKRW` 고정값. 다음 단계로 토스 환율 API 또는 한국수출입은행 환율 API 연동
- **예수금**: 키움은 `kt00001`(예수금상세현황)로 정확히 조회하는 편이 좋습니다
- **비밀 관리**: `.env`는 커밋 금지(.gitignore 처리됨). 운영 시 OS 키체인/시크릿 매니저 권장
- **접근 제어**: 서버를 외부에 열면 반드시 로그인(최소 Basic Auth 또는 Cloudflare Access 등)을 앞에 두세요. 자산 정보가 그대로 노출됩니다
- **조회 전용**: 주문 권한이 필요 없으면 조회 권한만 신청하세요

## 4. 대안: 마이데이터 / 스크래핑 API
- 금융 마이데이터는 허가받은 사업자만 API를 쓸 수 있어 개인 프로젝트에는 부적합합니다.
- CODEF 같은 스크래핑 기반 조회 API는 증권사 로그인 정보를 제3자에게 맡기는 구조라 보안·약관 측면에서 신중하게 판단해야 합니다.
