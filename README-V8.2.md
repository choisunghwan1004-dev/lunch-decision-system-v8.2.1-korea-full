# Lunch Decision System V8.2

## 핵심 변경
- 관리자 지역 선택을 `국가 → 시·도 → 시·군·구 → 읍·면·동 → 리 → 상권`으로 완성
- 대한민국 법정동 CSV importer와 관리자 화면의 `locations.level`을 동일하게 통일
- `ri`(리) 단계 추가
- 국가/시도/시군구/읍면동/리/상권을 실제 `parent_id`로 연쇄 선택
- 음식점 등록도 동일한 연쇄 선택을 사용

## 1. SQL
기존 V8 DB에 먼저 실행:
```bat
mysql -u root -p lunch_decision < sql\v8.2-cascade.sql
```

## 2. 정부 CSV 가져오기
```bat
npm install
npm run import:locations
```
기본 CSV:
`data\korea_legal_dong.csv`

또는:
```bat
node scripts\import-korea-locations.js "C:\data\법정동코드.csv"
```

## 3. 서버 실행
```bat
npm start
```
관리자:
`http://localhost:3000/admin.html`

## 4. 선택 흐름
국가 선택 → 시도 자동 표시 → 시군구 자동 표시 → 읍면동 자동 표시 → 리 자동 표시 → 상권 자동 표시.

상권이 없는 경우에는 읍면동/리에서 음식점 등록도 가능합니다. 기존 V8의 `selectedLeaf()` 구조를 유지합니다.

## 주의
기존 V8 테이블이 이미 생성된 경우 importer가 테이블을 다시 만들지 않고 기존 테이블을 사용합니다. `locations.level`은 반드시 소문자 V8.2 규격을 사용합니다.
