-- V7 migration: 기존 V6 DB를 유지하면서 실제 장소 동기화용 컬럼을 추가합니다.
USE lunch_decision;
ALTER TABLE travel_places ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(200) NULL;
-- 이후 실제 전국/일본 데이터는 관리자 화면의 Google Places 동기화 기능으로 도시별 가져옵니다.
-- 이렇게 하면 존재하지 않는 테스트 장소를 실제 장소인 것처럼 꾸미지 않고 원본 API 데이터로 채울 수 있습니다.
