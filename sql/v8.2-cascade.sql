-- V8.2 관리자 연쇄선택 + 법정동 RI 지원
USE lunch_decision;

ALTER TABLE locations
  MODIFY COLUMN level ENUM('country','province','district','town','ri','area') NOT NULL;

-- 기존 idx_locations_parent가 있어 별도 인덱스 추가는 생략합니다.

-- V8.1에서 잘못 만들어진 대문자 level을 사용하는 경우에는
-- 기존 데이터가 있다면 먼저 별도 변환 후 이 SQL을 실행하세요.
