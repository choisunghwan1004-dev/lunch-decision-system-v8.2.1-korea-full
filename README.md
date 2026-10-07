# V7.2 — DB/API 안정화 버전

> 기존 V7/V7.1 DB를 유지하면서 추천 API의 `cities.country_id` 오류와 Google Places API Key 오류 안내를 수정한 버전입니다.

## 중요
- `cities` 테이블은 `country_id`를 갖지 않습니다. 국가 관계는 `cities.region_id -> regions.country_id -> countries.id`입니다.
- 따라서 기존 MySQL 데이터를 삭제하거나 `cities.country_id`를 새로 만들 필요가 없습니다.
- Google Places 동기화에서 `API_KEY_INVALID`가 나오면 `.env`의 `GOOGLE_MAPS_API_KEY`를 실제 Google Maps Platform 키로 교체해야 합니다.

## 실행
```bat
npm install
npm start
```

진단:
```text
http://localhost:3000/api/system/check
```

`schema.cities.region_id=true`, `schema.regions.country_id=true`이면 현재 DB 구조가 추천 API와 호환됩니다.

## 기존 DB 사용자
기존 `lunch_decision` DB를 그대로 사용하세요. `sql/database.sql`을 다시 실행해 기존 데이터를 삭제할 필요가 없습니다.

## Google Places
`.env`:
```env
GOOGLE_MAPS_API_KEY=실제_API_KEY
```

Google Cloud에서 Places API (New)를 활성화하고 해당 키의 API 제한/애플리케이션 제한을 확인한 후 서버를 재시작합니다.

## 오류별 의미
- `Unknown column 'country_id' in 'field list'`: V7.1 추천 코드의 JOIN 오류 → V7.2에서 수정
- `API_KEY_INVALID`: Google API Key 설정 문제 → 코드/DB 문제가 아님
- `ECONNREFUSED 3306`: MySQL 서버 미실행 또는 접속정보 오류
- `ER_NO_SUCH_TABLE`: SQL 초기화/마이그레이션 필요
# Lunch Decision System V7

초보자도 실행할 수 있도록 만든 **실제 날씨 + 실제 장소 + 실제 이동시간 기반 자동 여행 결정 시스템**입니다.

## V7에서 바뀐 것

- 회원가입/로그인 세션 안정화
- 메인 화면에서 `관리자 모드` 선택
- 색상 중심 관리자 대시보드
- OpenWeather 현재 날씨 자동 반영
- Google Places(New) 실제 장소 동기화
  - 음식점
  - 카페
  - 관광지
  - 호텔
- Google Place ID 저장
- OSRM/OpenStreetMap 실제 좌표 이동시간 계산
- 자동 여행코스:
  `관광지 → 점심 → 카페 → 관광 → 저녁 → 숙박`
- 1~7일 자동 코스
- 하루 전체 이동거리/이동시간 계산

## 1. 준비

필수:
- Node.js 18.18 이상
- MySQL 8.x 권장
- OpenWeather API Key

실제 장소 자동 동기화까지 사용할 경우:
- Google Maps Platform Places API(New) API Key

## 2. 설치

Windows에서는 `start.bat`을 더블클릭하면 됩니다.

또는 CMD에서:

```bat
npm install
copy .env.example .env
notepad .env
npm start
```

브라우저:

- 사용자: http://localhost:3000
- 관리자: http://localhost:3000/admin
- 상태: http://localhost:3000/health

## 3. .env

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=내_MySQL_비밀번호
DB_NAME=lunch_decision
SESSION_SECRET=긴_랜덤문자열
OPENWEATHER_API_KEY=내_OpenWeather_API_KEY
GOOGLE_MAPS_API_KEY=내_Google_Places_API_KEY
```

## 4. DB

처음 설치:

```bat
mysql -u root -p < sql/database.sql
```

이미 V6 DB가 있다면:

```bat
mysql -u root -p < sql/database.v7.sql
```

회원가입이 실패하던 경우에도 V7의 `/api/user/register`가 users/user_preferences 테이블 존재 여부를 확인하고 필요한 테이블을 생성합니다.

## 5. 실제 장소 데이터 넣기

1. http://localhost:3000 접속
2. 상단 `⚙ 관리자 모드`
3. `관리자 로그인`
4. 기본 테스트 계정: `admin / Admin1234!`
5. `.env`의 `GOOGLE_MAPS_API_KEY` 입력
6. `실제 데이터 동기화`
7. 도시 선택
8. `실제 데이터 동기화` 클릭

도시별로 음식점·카페·관광지·호텔 데이터를 가져옵니다.

## 6. 여행 자동 결정

사용자 화면에서 도시와 여행일수를 선택하고 `관광코스 자동 결정`을 누릅니다.

예:

```text
09:00 관광지
   ↓ 실제 이동시간
12:00 점심
   ↓ 실제 이동시간
14:00 카페
   ↓ 실제 이동시간
16:00 관광
   ↓ 실제 이동시간
18:30 저녁
   ↓ 실제 이동시간
20:00 숙박
```

실제 시간표의 최종 시각은 장소 영업시간과 체류시간을 추가하는 다음 단계에서 더 정밀하게 만들 수 있습니다.

## 7. API 구조

- `GET /api/context/today` — OpenWeather 현재 날씨
- `GET /api/context/forecast` — OpenWeather 예보
- `GET /api/map/route` — OSRM 이동시간
- `GET /api/travel/places` — 여행 장소
- `POST /api/travel/auto-plan` — 자동 여행코스
- `POST /api/admin/sync-google-places` — 실제 장소 동기화
- `POST /api/user/register` — 회원가입
- `POST /api/user/login` — 사용자 로그인
- `POST /api/auth/login` — 관리자 로그인

## 8. V7 데이터 원칙

테스트 데이터와 실제 데이터를 구분합니다.

- 테스트 장소: `테스트` 이름
- 실제 동기화 장소: Google Place ID 저장
- 이동시간: 장소 위도/경도 → OSRM 계산
- 날씨: OpenWeather 실시간 응답

## 9. 다음 V8

- Google Places 영업시간을 각 시간대에 직접 반영
- 날씨가 나쁘면 실내 관광지 우선
- 이동시간 최소화 + 평점 + 사용자 취향 + 예산을 하나의 점수로 통합
- 여행비 자동 계산
- 다일 여행에서 같은 장소 반복 방지
- 사용자의 여행 이력 학습
- 숙박비까지 포함한 총 여행비 최적화

## V7.1 안정화 패치

- 메인 `오늘 점심 다시 결정하기` 버튼 동작 오류 수정
- `오늘의 추천` 메뉴 클릭 시 추천 영역으로 이동하고 즉시 재결정
- 존재하지 않는 `v6Route` 요소 때문에 전체 JavaScript가 중단되던 오류 수정
- 회원가입 성공 시 `회원등록 OK` 메시지와 자동 로그인 안내 표시
- 로그인/회원가입 Enter 키 지원
- 버튼 중복 클릭 방지 및 결정 중 상태 표시
- `/api/system/check` 추가: MySQL 연결, 필수 테이블, 주요 데이터 건수, OpenWeather/Google API Key 설정 여부 확인
- 화면 상단에 서버/DB 연결 상태 표시
- 오류 발생 시 상세 오류를 화면에 표시

### V7.1 데이터 연결 확인

브라우저에서 다음 주소를 열면 현재 서버와 DB의 연결 상태를 확인할 수 있습니다.

`http://localhost:3000/api/system/check`

정상이라면 `database: true`, 주요 테이블이 모두 `true`, `ok: true`가 반환됩니다.


## V7.4 관리자 로그인 안정화

V7.4에서는 관리자 로그인 요청마다 `CREATE TABLE` 또는 `INSERT`를 실행하지 않습니다. 이전 버전에서 `admins` 테이블을 자동 생성하는 과정이 MySQL metadata lock을 기다리면서 `ER_LOCK_WAIT_TIMEOUT`이 발생할 수 있었습니다.

로컬 관리자 로그인은 `.env`의 `ADMIN_USERNAME` / `ADMIN_PASSWORD`를 먼저 사용합니다. 기본값은 `admin / Admin1234!`입니다.

기존 DB를 유지한 채 관리자 테이블을 복구하려면 `sql/repair-existing-v7.4.sql`을 사용합니다. 잠금 문제는 `sql/check-mysql-lock.sql`로 확인할 수 있습니다.

### 권장 실행 순서

```powershell
# V7.4 폴더에서
npm install
npm start
```

그 다음 `http://localhost:3000/admin`에서 `admin / Admin1234!`로 로그인합니다.

관리자 로그인 후 대시보드가 DB의 국가/지역/도시/음식점/여행장소를 조회합니다. DB 자체에 남아 있는 잠금이 있으면 관리자 로그인은 되지만 대시보드의 DB 조회가 실패할 수 있습니다. 이 경우 `sql/check-mysql-lock.sql`로 잠금 세션을 확인합니다.
