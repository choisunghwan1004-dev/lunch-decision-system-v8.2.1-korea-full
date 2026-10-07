-- V7.4 기존 DB 복구용 SQL
-- 주의: 이 파일은 기존 데이터를 삭제하지 않습니다.
-- 먼저 Node 서버와 MySQL Workbench/CLI의 열린 트랜잭션을 종료하세요.

USE lunch_decision;

CREATE TABLE IF NOT EXISTS admins(
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO admins(username,password_hash,active)
VALUES('admin','5ce41ada64f1e8ffb0acfaafa622b141438f3a5777785e7f0b830fb73e40d3d6',1);

-- cities는 country_id를 갖지 않습니다.
-- cities.region_id -> regions.country_id -> countries.id 구조입니다.
SELECT c.id,c.name,c.region_id,r.country_id,co.code AS country_code
FROM cities c
JOIN regions r ON r.id=c.region_id
JOIN countries co ON co.id=r.country_id
ORDER BY c.id;
