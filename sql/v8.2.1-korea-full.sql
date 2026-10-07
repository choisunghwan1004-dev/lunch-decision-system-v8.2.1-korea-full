-- V8.2.1 전국 법정동 + 상권 + 음식점용 스키마 보강
USE lunch_decision;

ALTER TABLE locations
  MODIFY COLUMN level ENUM('country','province','district','town','ri','area') NOT NULL;

ALTER TABLE locations
  ADD INDEX IF NOT EXISTS idx_locations_parent_level (parent_id, level, active);

ALTER TABLE locations
  ADD INDEX IF NOT EXISTS idx_locations_code_level (code, level);

-- 상권은 법정동(ri) 아래의 사용자 관리 데이터로 등록합니다.
-- 실제 전국 상권 원자료는 법정동과 별개이므로, 법정동을 자동 생성하지 않고
-- 관리자가 선택한 법정동 아래에서 상권을 등록하도록 설계합니다.
