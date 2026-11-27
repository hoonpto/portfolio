# portfolio

키움증권 · 토스증권 · 신한투자증권 계좌를 한 화면에서 실시간으로 보는 포트폴리오 대시보드 (초안).

## 실행

```bash
cp .env.example .env   # 키를 비워두면 목업 데이터로 동작
npm start              # http://localhost:8787
```

의존성 없음 (Node 22+). `public/index.html`만 브라우저로 열어도 데모 모드로 동작합니다.

## 구조

```
server/server.js          집계 서버: /api/portfolio, /api/stream(SSE), 정적 파일
server/adapters/kiwoom.js 키움 REST(kt00018) + WebSocket 실시간 체결
server/adapters/toss.js   토스증권 Open API (REST 폴링, TODO: 명세 확인 후 경로/필드 채우기)
server/adapters/shinhan.js 신한: data/shinhan.json 파일 (공식 REST 미제공)
server/adapters/mock.js   목업 데이터 + 가상 시세
public/index.html         대시보드
docs/API_INTEGRATION.md   증권사별 API 연동 가이드
index.html                (이전 버전) 수동 입력식 포트폴리오
```
