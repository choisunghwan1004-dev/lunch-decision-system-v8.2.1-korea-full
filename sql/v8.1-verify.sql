USE lunch_decision;

-- V8.1 locations 기본 인덱스/구조 확인
ALTER TABLE locations
    ADD INDEX IF NOT EXISTS idx_locations_parent_level (parent_id, level),
    ADD INDEX IF NOT EXISTS idx_locations_country_level (country_id, level);

-- 계층별 데이터 확인
SELECT level, COUNT(*) AS cnt
FROM locations
WHERE country_id = (SELECT id FROM countries WHERE code='KR')
GROUP BY level
ORDER BY FIELD(level,'COUNTRY','SIDO','SIGUNGU','EUPMYEONDONG','RI','AREA');

-- 17개 시도 확인
SELECT id, code, name
FROM locations
WHERE code IN (
'11','26','27','28','29','30','31','36',
'41','42','43','44','45','46','47','48','50'
)
ORDER BY sort_order;


USE lunch_decision;




show tables;

