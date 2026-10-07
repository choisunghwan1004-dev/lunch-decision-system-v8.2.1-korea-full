-- V7 확장 도시 기본 목록
USE lunch_decision;

-- 대한민국 주요 도시/관광도시
INSERT IGNORE INTO regions(country_id,name,type) VALUES
(1,'인천광역시','city'),(1,'대구광역시','city'),(1,'광주광역시','city'),(1,'대전광역시','city'),(1,'울산광역시','city'),
(1,'경기도','province'),(1,'강원특별자치도','province'),(1,'충청북도','province'),(1,'충청남도','province'),(1,'전북특별자치도','province'),(1,'전라남도','province'),(1,'경상북도','province'),(1,'경상남도','province'),(1,'제주특별자치도','province');

INSERT IGNORE INTO cities(region_id,name)
SELECT r.id,x.name FROM regions r JOIN (SELECT '인천광역시' region,'인천' name UNION ALL SELECT '대구광역시','대구' UNION ALL SELECT '광주광역시','광주' UNION ALL SELECT '대전광역시','대전' UNION ALL SELECT '울산광역시','울산' UNION ALL SELECT '경기도','수원' UNION ALL SELECT '경기도','용인' UNION ALL SELECT '경기도','성남' UNION ALL SELECT '강원특별자치도','춘천' UNION ALL SELECT '강원특별자치도','강릉' UNION ALL SELECT '강원특별자치도','속초' UNION ALL SELECT '충청북도','청주' UNION ALL SELECT '충청남도','천안' UNION ALL SELECT '전북특별자치도','전주' UNION ALL SELECT '전북특별자치도','무주' UNION ALL SELECT '전라남도','여수' UNION ALL SELECT '전라남도','순천' UNION ALL SELECT '경상북도','경주' UNION ALL SELECT '경상북도','안동' UNION ALL SELECT '경상남도','통영' UNION ALL SELECT '경상남도','거제' UNION ALL SELECT '제주특별자치도','제주' UNION ALL SELECT '제주특별자치도','서귀포') x ON r.name=x.region;

-- 일본 주요 관광도시
INSERT IGNORE INTO regions(country_id,name,type) VALUES
(2,'홋카이도','prefecture'),(2,'아이치현','prefecture'),(2,'교토부','prefecture'),(2,'나라현','prefecture'),(2,'히로시마현','prefecture'),(2,'오키나와현','prefecture');
INSERT IGNORE INTO cities(region_id,name)
SELECT r.id,x.name FROM regions r JOIN (SELECT '홋카이도' region,'삿포로' name UNION ALL SELECT '아이치현','나고야' UNION ALL SELECT '교토부','교토' UNION ALL SELECT '나라현','나라' UNION ALL SELECT '히로시마현','히로시마' UNION ALL SELECT '오키나와현','나하') x ON r.name=x.region;
