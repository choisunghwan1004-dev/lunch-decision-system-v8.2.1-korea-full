# Lunch Decision System V8 - Locations Upgrade

## 핵심 변경

V8은 기존 `countries → regions → cities → areas` 구조를 깨지 않고, 새로운 통합 지역 테이블 `locations`를 추가합니다.

```text
국가
 ↓
시/도
 ↓
시/군/구
 ↓
읍/면/동
 ↓
상권
 ↓
음식점
```

기존 추천 API가 사용하는 `country_id / region_id / city_id / area_id`는 그대로 유지합니다. 음식점과 여행장소에는 V8 `location_id`를 추가하여 새 Select와 연결합니다.

## 1. SQL 실행

프로젝트 폴더에서:

```bat
mysql -u root -p < sql\\v8-locations.sql
```

또는 MySQL Workbench에서 `sql/v8-locations.sql`을 실행합니다.

### 확인

```sql
USE lunch_decision;
SHOW TABLES LIKE 'locations';
SELECT id,parent_id,name,level FROM locations ORDER BY level,sort_order,name;
SELECT id,name,location_id FROM restaurants ORDER BY id DESC LIMIT 20;
```

## 2. 서버 재시작

```bat
npm install
npm start
```

관리자:

```text
http://localhost:3000/admin
```

## 3. V8 관리자 선택 순서

```text
국가
 ↓
시/도
 ↓
시/군/구
 ↓
읍/면/동
 ↓
상권
 ↓
음식점
```

각 단계는 이전 단계의 선택값을 이용해 `/api/admin/locations?parent_id=...`에서 자동으로 가져옵니다.

## 4. 음식점 등록

`admin.html`은 더 이상 `country_id`, `region_id`, `city_id`, `area_id`를 직접 입력하지 않습니다.

선택된 마지막 지역의 `location_id`만 서버에 전송합니다.

서버가 `location_id`를 따라 올라가서 기존 시스템용:

```text
country_id
region_id
city_id
area_id
```

를 자동으로 결정합니다.

## 5. 사용자 화면

`index.html`도 V8 Select를 사용합니다.

```text
국가 → 시/도 → 시/군/구 → 읍/면/동 → 상권
```

공개 조회 API:

```text
GET /api/context/locations
GET /api/context/locations?parent_id=...
```

사용자 추천 요청에는 기존 `city_id / area_id`를 유지하므로 기존 추천 알고리즘과의 호환성을 확보했습니다.

## 6. 중요: Google Places 동기화

V8에서는 `routes/admin.js`의 Google Places 동기화에서 `ALTER TABLE`을 실행하지 않습니다.

DB 구조 변경은 반드시 `sql/v8-locations.sql`에서 한 번만 실행합니다.

따라서 다음과 같은 Lock 문제를 예방합니다.

```text
Lock wait timeout exceeded
```

## 7. 현재 V8의 설계 원칙

- 기존 데이터 삭제 없음
- 기존 추천 API 호환
- 기존 사용자 설정 호환
- 새 지역 선택은 `locations` 사용
- 음식점/여행장소에 `location_id` 추가
- DB DDL은 API 요청에서 실행하지 않음
- 한국/일본의 서로 다른 행정구역 체계를 같은 구조로 저장

## 8. 다음 확장

현재 SQL에는 기존 DB를 자동 변환하는 코드와 서울의 25개 구 및 일부 동, 일본 주요 도도부현 예시가 포함되어 있습니다.

전국 완전한 행정구역 데이터는 별도 공식 행정구역 데이터셋을 `locations`에 대량 INSERT/CSV import하는 방식으로 넣는 것을 권장합니다.
