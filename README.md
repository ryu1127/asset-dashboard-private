# 우리집 자산 대시보드 (Asset Dashboard)

부부가 함께 쓰는 **로컬 우선** 자산관리 · 가계부 웹앱입니다.
매달 번 돈과 쓴 돈을 구성원(남편/아내)별로 기록하고, 순자산이 어떻게
쌓이는지 그래프로 확인합니다.

## 특징

- 🖥️ **로컬 우선** — 서버·회원가입 없이 내 PC 브라우저에서 실행. 데이터는
  브라우저(IndexedDB)에 영구 저장됩니다.
- 👫 **구성원 구분** — 모든 수입/지출을 남편·아내로 구분해 입력하고,
  각각 또는 합산으로 조회.
- 📊 **대시보드 그래프** — 이번 달 수입/지출/저축률, 최근 6개월 추이,
  카테고리별 지출, 구성원별 비교, 누적 저축 추이.
- 🎯 **예산 관리** — 카테고리별 월 예산을 정하고, 실제 지출 대비 소진율을
  진행 바로 확인. 초과 시 빨간색 경고.
- 🔁 **반복 거래** — 월급·구독료처럼 매월 반복되는 항목을 등록하면 앱을 열 때
  밀린 달까지 자동으로 기록(중복 없음).
- 💰 **자산 현황** — 월별 계좌 잔액을 입력해 순자산(투자·예금 포함) 추이 기록.
- 💾 **백업** — JSON 내보내기/가져오기로 백업하거나 다른 PC로 이전.

## 실행 방법

Node.js 18+ 가 필요합니다.

```bash
npm install      # 최초 1회
npm run dev      # 개발 서버 실행 → 자동으로 브라우저 열림 (http://localhost:5173)
```

배포 없이 그냥 이대로 쓰면 됩니다. 다른 사람과 공유되지 않고 이 PC에만
저장됩니다.

### 프로덕션 빌드 (선택)

```bash
npm run build    # dist/ 폴더 생성
npm run preview  # 빌드 결과 미리보기
```

## 설계 개요

### 핵심 개념: 현금 흐름 ↔ 자산 잔액 분리

- **현금 흐름 (거래 입력)** — 언제/누가/얼마를 벌고 썼는지의 개별 내역.
- **자산 잔액 (자산 현황)** — 매월 말 계좌별 잔고 스냅샷. 투자 평가액은
  거래 없이도 오르내리므로, 순자산 추이는 이 스냅샷으로 그립니다.

### 데이터 모델

| 테이블 | 필드 |
|--------|------|
| `members` | name, color |
| `categories` | name, kind(수입/지출), color |
| `accounts` | name, type(현금/예금/적금/투자/부동산/부채), owner |
| `transactions` | date, kind, amount, memberId, categoryId, accountId, memo |
| `snapshots` | month, accountId, balance |
| `budgets` | categoryId, amount(월 예산 한도) |
| `recurring` | memo, kind, amount, memberId, categoryId, dayOfMonth, startMonth, active, lastPostedMonth |

### 기술 스택

- **Vite + React + TypeScript** — 가벼운 SPA
- **Dexie (IndexedDB)** — 브라우저 로컬 DB, 네이티브 모듈 불필요
- **Recharts** — 차트
- **react-router-dom** — 페이지 라우팅

## 향후 확장 아이디어

- CSV / 은행 내역 가져오기
- 클라우드 동기화(Supabase 등)로 여러 기기 실시간 공유
  — 현재 백업 JSON 구조가 그대로 마이그레이션 가능하도록 설계됨
