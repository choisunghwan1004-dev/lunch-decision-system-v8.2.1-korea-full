-- V8 Locations migration
-- 기존 countries/regions/cities/areas를 유지하면서 locations 계층을 추가합니다.
-- 실행: mysql -u root -p < sql/v8-locations.sql

CREATE DATABASE IF NOT EXISTS lunch_decision CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lunch_decision;

CREATE TABLE IF NOT EXISTS locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  country_id INT NULL,
  parent_id INT NULL,
  name VARCHAR(150) NOT NULL,
  level ENUM('country','province','district','town','area') NOT NULL,
  code VARCHAR(50) NULL,
  legacy_region_id INT NULL,
  legacy_city_id INT NULL,
  legacy_area_id INT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  sort_order INT DEFAULT 0,
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_location_parent_name (parent_id, name),
  KEY idx_locations_parent (parent_id),
  KEY idx_locations_country_level (country_id, level),
  CONSTRAINT fk_locations_country FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE,
  CONSTRAINT fk_locations_parent FOREIGN KEY (parent_id) REFERENCES locations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 기존 국가 -> locations(country)
INSERT INTO locations(country_id,parent_id,name,level,code,sort_order)
SELECT c.id,NULL,c.name,'country',c.code,c.id
FROM countries c
LEFT JOIN locations l ON l.parent_id IS NULL AND l.level='country' AND l.country_id=c.id
WHERE l.id IS NULL;

-- 기존 지역 -> locations(province)
INSERT INTO locations(country_id,parent_id,name,level,code,legacy_region_id,sort_order)
SELECT r.country_id,cl.id,r.name,'province',r.type,r.id,r.id
FROM regions r
JOIN locations cl ON cl.country_id=r.country_id AND cl.level='country' AND cl.parent_id IS NULL
LEFT JOIN locations l ON l.legacy_region_id=r.id AND l.level='province'
WHERE l.id IS NULL;

-- 기존 도시 -> locations(town)
INSERT INTO locations(country_id,parent_id,name,level,legacy_region_id,legacy_city_id,sort_order)
SELECT r.country_id,rl.id,c.name,'town',r.id,c.id,c.id
FROM cities c
JOIN regions r ON r.id=c.region_id
JOIN locations rl ON rl.legacy_region_id=r.id AND rl.level='province'
LEFT JOIN locations l ON l.legacy_city_id=c.id AND l.level='town'
WHERE l.id IS NULL;

-- 기존 상권 -> locations(area)
INSERT INTO locations(country_id,parent_id,name,level,legacy_city_id,legacy_area_id,sort_order)
SELECT r.country_id,cl.id,a.name,'area',c.id,a.id,a.id
FROM areas a
JOIN cities c ON c.id=a.city_id
JOIN regions r ON r.id=c.region_id
JOIN locations cl ON cl.legacy_city_id=c.id AND cl.level='town'
LEFT JOIN locations l ON l.legacy_area_id=a.id AND l.level='area'
WHERE l.id IS NULL;

-- 음식점/여행장소에서 locations를 바로 사용할 수 있도록 nullable FK 추가
SET @sql = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE restaurants ADD COLUMN location_id INT NULL, ADD KEY idx_restaurants_location(location_id)',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='restaurants' AND COLUMN_NAME='location_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE travel_places ADD COLUMN location_id INT NULL, ADD KEY idx_travel_places_location(location_id)',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='travel_places' AND COLUMN_NAME='location_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE restaurants r
JOIN locations l ON l.legacy_area_id=r.area_id AND l.level='area'
SET r.location_id=l.id
WHERE r.location_id IS NULL AND r.area_id IS NOT NULL;

UPDATE restaurants r
JOIN locations l ON l.legacy_city_id=r.city_id AND l.level='town'
SET r.location_id=l.id
WHERE r.location_id IS NULL;

UPDATE travel_places p
JOIN locations l ON l.legacy_area_id=p.area_id AND l.level='area'
SET p.location_id=l.id
WHERE p.location_id IS NULL AND p.area_id IS NOT NULL;

UPDATE travel_places p
JOIN locations l ON l.legacy_city_id=p.city_id AND l.level='town'
SET p.location_id=l.id
WHERE p.location_id IS NULL;

-- 선택 사항: 기존 FK와 별개로 location_id를 FK로 연결합니다.
SET @sql = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE restaurants ADD CONSTRAINT fk_restaurants_location FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE SET NULL',
  'SELECT 1') FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='restaurants' AND CONSTRAINT_NAME='fk_restaurants_location');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE travel_places ADD CONSTRAINT fk_travel_places_location FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE SET NULL',
  'SELECT 1') FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='travel_places' AND CONSTRAINT_NAME='fk_travel_places_location');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- V8 기본 한국/일본 지역. 이미 존재하면 중복 생성하지 않습니다.
INSERT INTO locations(country_id,parent_id,name,level,code,sort_order)
SELECT c.id,NULL,'대한민국','country','KR',1 FROM countries c WHERE c.code='KR'
  AND NOT EXISTS(SELECT 1 FROM locations l WHERE l.country_id=c.id AND l.level='country');

-- 서울의 행정구역 예시. 전체 25개 구를 넣고, 종로구/중구의 대표 동을 추가합니다.
INSERT INTO locations(country_id,parent_id,name,level,code,sort_order)
SELECT c.id,kr.id,x.name,'province',x.code,x.sort_order
FROM countries c JOIN locations kr ON kr.country_id=c.id AND kr.level='country' AND kr.name='대한민국'
JOIN (SELECT '서울특별시' name,'11' code,1 sort_order) x
WHERE c.code='KR'
AND NOT EXISTS(SELECT 1 FROM locations l WHERE l.parent_id=kr.id AND l.name=x.name);

INSERT INTO locations(country_id,parent_id,name,level,code,sort_order)
SELECT c.id,sp.id,x.name,'district',x.code,x.sort_order
FROM countries c JOIN locations sp ON sp.country_id=c.id AND sp.level='province' AND sp.name='서울특별시'
JOIN (SELECT '종로구' name,'11110' code,1 sort_order UNION ALL SELECT '중구','11140',2 UNION ALL SELECT '용산구','11170',3 UNION ALL SELECT '성동구','11200',4 UNION ALL SELECT '광진구','11215',5 UNION ALL SELECT '동대문구','11230',6 UNION ALL SELECT '중랑구','11260',7 UNION ALL SELECT '성북구','11290',8 UNION ALL SELECT '강북구','11305',9 UNION ALL SELECT '도봉구','11320',10 UNION ALL SELECT '노원구','11350',11 UNION ALL SELECT '은평구','11380',12 UNION ALL SELECT '서대문구','11410',13 UNION ALL SELECT '마포구','11440',14 UNION ALL SELECT '양천구','11470',15 UNION ALL SELECT '강서구','11500',16 UNION ALL SELECT '구로구','11530',17 UNION ALL SELECT '금천구','11545',18 UNION ALL SELECT '영등포구','11560',19 UNION ALL SELECT '동작구','11590',20 UNION ALL SELECT '관악구','11620',21 UNION ALL SELECT '서초구','11650',22 UNION ALL SELECT '강남구','11680',23 UNION ALL SELECT '송파구','11710',24 UNION ALL SELECT '강동구','11740',25) x
WHERE c.code='KR'
AND NOT EXISTS(SELECT 1 FROM locations l WHERE l.parent_id=sp.id AND l.name=x.name);

INSERT INTO locations(country_id,parent_id,name,level,code,sort_order)
SELECT c.id,d.id,x.name,'town',x.code,x.sort_order
FROM countries c
JOIN locations sp ON sp.country_id=c.id AND sp.level='province' AND sp.name='서울특별시'
JOIN (SELECT '종로구' district,'종로1·2·3·4가동' name,'11110515' code,1 sort_order
      UNION ALL SELECT '종로구','청운효자동','11110515',2
      UNION ALL SELECT '종로구','사직동','11110530',3
      UNION ALL SELECT '중구','명동','11140520',1
      UNION ALL SELECT '중구','소공동','11140510',2
      UNION ALL SELECT '중구','회현동','11140540',3) x
JOIN locations d ON d.parent_id=sp.id AND d.level='district' AND d.name=x.district
WHERE c.code='KR'
AND NOT EXISTS(SELECT 1 FROM locations l WHERE l.parent_id=d.id AND l.name=x.name);

-- 일본 도도부현 예시. 이후 동일 구조로 행정 데이터 확장 가능.
INSERT INTO locations(country_id,parent_id,name,level,code,sort_order)
SELECT c.id,jp.id,x.name,'province',x.code,x.sort_order
FROM countries c JOIN locations jp ON jp.country_id=c.id AND jp.level='country' AND jp.name='일본'
JOIN (SELECT '도쿄도' name,'JP-13' code,1 sort_order UNION ALL SELECT '오사카부','JP-27',2 UNION ALL SELECT '교토부','JP-26',3 UNION ALL SELECT '홋카이도','JP-01',4 UNION ALL SELECT '후쿠오카현','JP-40',5 UNION ALL SELECT '아이치현','JP-23',6 UNION ALL SELECT '가나가와현','JP-14',7) x
WHERE c.code='JP'
AND NOT EXISTS(SELECT 1 FROM locations l WHERE l.parent_id=jp.id AND l.name=x.name);
