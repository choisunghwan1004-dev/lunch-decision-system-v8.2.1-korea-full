CREATE DATABASE IF NOT EXISTS lunch_decision CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lunch_decision;

DROP TABLE IF EXISTS lunch_history;
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS restaurants;
DROP TABLE IF EXISTS areas;
DROP TABLE IF EXISTS cities;
DROP TABLE IF EXISTS regions;
DROP TABLE IF EXISTS countries;
DROP TABLE IF EXISTS admins;

CREATE TABLE admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE countries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  currency VARCHAR(10) DEFAULT 'KRW'
);
CREATE TABLE regions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  country_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) DEFAULT 'province',
  FOREIGN KEY(country_id) REFERENCES countries(id)
);
CREATE TABLE cities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  region_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  FOREIGN KEY(region_id) REFERENCES regions(id)
);
CREATE TABLE areas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  city_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  FOREIGN KEY(city_id) REFERENCES cities(id)
);
CREATE TABLE restaurants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  country_id INT NOT NULL,
  region_id INT NOT NULL,
  city_id INT NOT NULL,
  area_id INT NULL,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100) DEFAULT '기타',
  price_min INT DEFAULT 0,
  price_max INT DEFAULT 0,
  address VARCHAR(300),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  lunch_start TIME DEFAULT '11:00:00',
  lunch_end TIME DEFAULT '15:00:00',
  break_start TIME NULL,
  break_end TIME NULL,
  meal_minutes INT DEFAULT 60,
  solo_ok TINYINT(1) DEFAULT 1,
  group_ok TINYINT(1) DEFAULT 1,
  main_menu VARCHAR(200),
  description VARCHAR(500),
  phone VARCHAR(50),
  rating DECIMAL(2,1) DEFAULT 0.0,
  review_count INT DEFAULT 0,
  image_path VARCHAR(500),
  active TINYINT(1) DEFAULT 1,
  open_days VARCHAR(20) DEFAULT '1,2,3,4,5,6,7',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(country_id) REFERENCES countries(id),
  FOREIGN KEY(region_id) REFERENCES regions(id),
  FOREIGN KEY(city_id) REFERENCES cities(id),
  FOREIGN KEY(area_id) REFERENCES areas(id)
);

CREATE TABLE user_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNIQUE NOT NULL,
  work_city_id INT NULL,
  work_area_id INT NULL,
  budget_max INT DEFAULT 15000,
  people INT DEFAULT 2,
  lunch_start TIME DEFAULT '11:30:00',
  lunch_end TIME DEFAULT '13:30:00',
  liked_categories TEXT,
  disliked_categories TEXT,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(work_city_id) REFERENCES cities(id) ON DELETE SET NULL,
  FOREIGN KEY(work_area_id) REFERENCES areas(id) ON DELETE SET NULL
);

CREATE TABLE lunch_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  restaurant_id INT NOT NULL,
  visit_date DATE NOT NULL,
  action ENUM('recommended','accepted','rejected','visited') NOT NULL,
  reject_reason VARCHAR(100),
  memo VARCHAR(500),
  context_json JSON NULL,
  decision_score DECIMAL(8,2) NULL,
  distance_km DECIMAL(8,2) NULL,
  weather_kind VARCHAR(20) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id)
);

INSERT INTO admins(username,password_hash) VALUES('admin','5ce41ada64f1e8ffb0acfaafa622b141438f3a5777785e7f0b830fb73e40d3d6');
INSERT INTO countries(code,name,currency) VALUES ('KR','대한민국','KRW'),('JP','일본','JPY');
INSERT INTO regions(country_id,name,type) VALUES (1,'서울특별시','city'),(1,'부산광역시','city'),(1,'전북특별자치도','province'),(2,'도쿄도','prefecture'),(2,'오사카부','prefecture'),(2,'후쿠오카현','prefecture');
INSERT INTO cities(region_id,name) VALUES (1,'서울'),(2,'부산'),(3,'무주'),(4,'도쿄'),(5,'오사카'),(6,'후쿠오카');
INSERT INTO areas(city_id,name) VALUES (1,'종각'),(1,'시청'),(1,'광화문'),(4,'신주쿠'),(4,'시부야'),(5,'난바');
INSERT INTO restaurants(country_id,region_id,city_id,area_id,name,category,price_min,price_max,address,meal_minutes,solo_ok,group_ok,main_menu,description,phone,rating,review_count,image_path,latitude,longitude,open_days) VALUES
(1,1,1,1,'종각 테스트 국밥','국밥',9000,11000,'종각 테스트 주소',50,1,1,'설렁탕, 수육','따뜻한 국물과 든든한 고기 메뉴','02-0000-0000',4.6,1245,'/assets/dish-seolleongtang.png',37.5702,126.9830,'1,2,3,4,5,6,7'),
(1,1,1,2,'시청 테스트 비빔밥','한식',9000,13000,'시청 테스트 주소',50,1,1,'비빔밥, 제육','점심에 빠르게 먹기 좋은 한식','02-0000-0001',4.4,876,'/assets/dish-bibimbap.png',37.5636,126.9755,'1,2,3,4,5'),
(1,1,1,3,'광화문 테스트 칼국수','칼국수',10000,14000,'광화문 테스트 주소',50,1,1,'칼국수, 만두','따뜻한 면요리와 만두','02-0000-0002',4.3,982,'/assets/dish-noodles.png',37.5740,126.9760,'1,2,3,4,5,6'),
(2,4,4,4,'신주쿠 테스트 라멘','라멘',900,1200,'Tokyo Shinjuku test address',45,1,1,'돈코츠 라멘','일본식 라멘 테스트 데이터','03-0000-0000',4.5,650,'/assets/dish-noodles.png',35.6938,139.7034,'1,2,3,4,5,6,7'),
(2,5,5,6,'난바 테스트 우동','우동',700,1100,'Osaka Namba test address',40,1,1,'우동, 튀김','간단한 일본식 점심 테스트 데이터','06-0000-0000',4.4,520,'/assets/dish-noodles.png',34.6670,135.5010,'1,2,3,4,5,6,7');
