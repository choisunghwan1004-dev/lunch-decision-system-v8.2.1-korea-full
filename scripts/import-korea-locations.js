/**
 * V8.1 대한민국 법정동 CSV -> MySQL locations importer
 *
 * 지원 CSV:
 * - 행정표준코드관리시스템/공공데이터포털에서 내려받은 CSV
 * - UTF-8 / EUC-KR(CP949) 자동 감지 시도
 * - 컬럼명은 여러 변형을 허용
 *
 * 기본 동작:
 *  1) CSV 읽기
 *  2) 시도/시군구/읍면동/리 계층 계산
 *  3) locations에 UPSERT
 *  4) parent_id를 실제 locations.id로 연결
 *
 * 주의:
 * CSV의 실제 컬럼명이 다르면 normalizeRow()의 aliases를 추가하세요.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const iconv = require("iconv-lite");
const { parse } = require("csv-parse/sync");

const CSV_PATH = process.argv[2] || path.join(__dirname, '..', 'data', 'korea_legal_dong.txt');

const BATCH_SIZE = Number(process.env.LOCATION_IMPORT_BATCH || 500);

function pick(row, aliases) {
  for (const key of aliases) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return String(row[key]).trim();
    }
  }
  return "";
}

function normalizeCode(value) {
  return String(value || "").replace(/[^0-9]/g, "").trim();
}

function normalizeRow(row) {
  const code = normalizeCode(pick(row, [
    "법정동코드",
    "법정동 코드",
    "법정동코드(10자리)",
    "법정동코드10자리",
    "code",
    "CODE"
  ]));

  let fullAddress = pick(row, ['법정동명','법정동 명','법정동명칭','지역주소명']);

  const sido = pick(row, [
    '시도명', '시도', '시ㆍ도명', '시도'
  ]) || (fullAddress ? fullAddress.split(' ')[0] : '');

  const sigungu = pick(row, [
    '시군구명', '시군구', '시ㆍ군ㆍ구명', '시군구'
  ]) || (fullAddress ? fullAddress.split(' ').slice(1,2).join(' ') : '');

  const eupmyeondong = pick(row, [
    '읍면동명', '읍면동', '읍ㆍ면ㆍ동명', '읍면동'
  ]) || (fullAddress ? fullAddress.split(' ').slice(2,3).join(' ') : '');

  const ri = pick(row, [
    '리명', '리', '리명칭'
  ]) || (fullAddress ? fullAddress.split(' ').slice(3,4).join(' ') : '');

  const abolished = pick(row, [
    "폐지여부", "폐지 여부", "폐지"
  ]);

  return {
    code,
    sido,
    sigungu,
    eupmyeondong,
    ri,
    abolished
  };
}

function levelOf(row) {
  // 10자리 법정동 코드 기준.
  // 실제 CSV에서 명칭이 비어 있는 단계는 부모 단계로 처리한다.
  if (!row.sido) return null;
  if (!row.sigungu) return "province";
  if (!row.eupmyeondong) return "district";
  if (!row.ri) return "town";
  return "ri";
}

function parentCode(code, level) {
  if (!code) return null;

  // 법정동 코드 10자리:
  // SIDO       xx00000000
  // SIGUNGU    xxxx000000
  // EUPMYEONDONG xxxxxxxx00
  // RI         xxxxxxxxxx
  if (level === "province") return "KR";
  if (level === "district") return code.slice(0, 2) + "00000000";
  if (level === "town") return code.slice(0, 5) + "00000";
  if (level === "ri") return code.slice(0, 8) + "00";

  return null;
}

function makeFullName(row) {
  return [row.sido, row.sigungu, row.eupmyeondong, row.ri]
    .filter(Boolean)
    .join(" ");
}

function readCsv(file) {
  const buffer = fs.readFileSync(file);

  // UTF-8 BOM/UTF-8 우선.
  let text = buffer.toString("utf8");

  // 한글이 깨진 경우 CP949 재시도.
  if ((text.match(/\uFFFD/g) || []).length > 5) {
    text = iconv.decode(buffer, "cp949");
  }

  return text;
}

async function ensureSchema(conn) {
  // V8.2는 관리자 화면과 동일한 location level을 사용합니다.
  // 이미 V8 locations가 있으면 스키마를 다시 만들지 않습니다.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS locations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      country_id INT UNSIGNED NOT NULL,
      parent_id BIGINT UNSIGNED NULL,
      name VARCHAR(100) NOT NULL,
      level ENUM('country','province','district','town','ri','area') NOT NULL,
      code VARCHAR(50) NOT NULL,
      full_name VARCHAR(255) NULL,
      legacy_region_id INT NULL,
      legacy_city_id INT NULL,
      legacy_area_id INT NULL,
      latitude DECIMAL(10,7) NULL,
      longitude DECIMAL(10,7) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_locations_code (code),
      KEY idx_locations_parent (parent_id),
      KEY idx_locations_country_level (country_id, level),
      CONSTRAINT fk_locations_parent FOREIGN KEY (parent_id) REFERENCES locations(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [countries] = await conn.query(
    "SELECT id FROM countries WHERE code = 'KR' LIMIT 1"
  );
  if (!countries.length) {
    throw new Error("countries 테이블에 code='KR' 대한민국이 없습니다. 먼저 대한민국 국가 데이터를 등록하세요.");
  }

  // 기존 V8 테이블이 있다면 RI 단계와 importer용 full_name 컬럼을 보완합니다.
  try {
    await conn.query("ALTER TABLE locations MODIFY level ENUM('country','province','district','town','ri','area') NOT NULL");
  } catch (e) {}

  const [cols] = await conn.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='locations'"
  );
  const names = new Set(cols.map(x => x.COLUMN_NAME));
  if (!names.has('full_name')) {
    await conn.query("ALTER TABLE locations ADD COLUMN full_name VARCHAR(255) NULL AFTER level");
  }
  if (!names.has('sort_order')) {
    await conn.query("ALTER TABLE locations ADD COLUMN sort_order INT NOT NULL DEFAULT 0");
  }
  return countries[0].id;
}

async function upsertLocation(conn, item, countryId) {
  let parentId = null;

  if (item.level !== "province") {
    const [parents] = await conn.query(
      "SELECT id FROM locations WHERE code = ? LIMIT 1",
      [item.parentCode]
    );

    if (!parents.length) {
      throw new Error(
        `부모 지역을 찾을 수 없습니다: code=${item.parentCode}, child=${item.code}, name=${item.name}`
      );
    }

    parentId = parents[0].id;
  } else {
    const [rows] = await conn.query(
      "SELECT id FROM locations WHERE code='KR' LIMIT 1"
    );

    if (!rows.length) {
      throw new Error("locations에 code='KR' 국가 노드가 없습니다.");
    }

    parentId = rows[0].id;
  }

  await conn.query(
    `
    INSERT INTO locations
      (country_id, parent_id, code, name, level, full_name, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE
      country_id = VALUES(country_id),
      parent_id = VALUES(parent_id),
      name = VALUES(name),
      level = VALUES(level),
      full_name = VALUES(full_name),
      active = 1
    `,
    [
      countryId,
      parentId,
      item.code,
      item.name,
      item.level,
      item.fullName
    ]
  );
}

async function main() {
  console.log("==========================================");
  console.log(" V8.1 대한민국 법정동 -> locations import");
  console.log("==========================================");
  console.log(`CSV: ${CSV_PATH}`);

  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV 파일이 없습니다: ${CSV_PATH}`);
  }

  const text = readCsv(CSV_PATH);

  const delimiter = text.includes('\t') ? '\t' : ',';
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
    delimiter
  });

  console.log(`CSV rows: ${rows.length}`);

  const normalized = [];

  for (const raw of rows) {
    const row = normalizeRow(raw);

    if (!row.code || row.code.length !== 10) continue;
    if (!row.sido) continue;

    // 폐지 데이터는 기본적으로 제외
    if (/^Y$/i.test(row.abolished) || /폐지/.test(row.abolished)) continue;

    const level = levelOf(row);
    if (!level) continue;

    let name = "";
    if (level === "province") name = row.sido;
    else if (level === "district") name = row.sigungu;
    else if (level === "town") name = row.eupmyeondong;
    else name = row.ri;

    normalized.push({
      code: row.code,
      name,
      level,
      parentCode: parentCode(row.code, level),
      fullName: makeFullName(row)
    });
  }

  // 부모부터 처리
  const order = {
    province: 1,
    district: 2,
    town: 3,
    ri: 4
  };

  normalized.sort((a, b) => {
    return order[a.level] - order[b.level] ||
      a.code.localeCompare(b.code);
  });

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "lunch_decision",
    charset: "utf8mb4"
  });

  try {
    await conn.beginTransaction();

    const countryId = await ensureSchema(conn);

    // 대한민국 country node
    await conn.query(
      `
      INSERT INTO locations
        (country_id, parent_id, code, name, level, full_name, active)
      VALUES (?, NULL, 'KR', '대한민국', 'country', '대한민국', 1)
      ON DUPLICATE KEY UPDATE
        country_id = VALUES(country_id),
        name = VALUES(name),
        level = 'country',
        full_name = '대한민국',
        active = 1
      `,
      [countryId]
    );

    let count = 0;

    for (const item of normalized) {
      await upsertLocation(conn, item, countryId);
      count++;

      if (count % BATCH_SIZE === 0) {
        console.log(`imported: ${count}/${normalized.length}`);
      }
    }

    await conn.commit();

    const [summary] = await conn.query(`
      SELECT level, COUNT(*) AS count
      FROM locations
      WHERE country_id = ?
      GROUP BY level
      ORDER BY FIELD(level, 'country','province','district','town','ri','area')
    `, [countryId]);

    console.log("\n========== IMPORT COMPLETE ==========");
    console.table(summary);
    console.log(`Imported/updated: ${count}`);
    console.log("=====================================");
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("\n[IMPORT ERROR]");
  console.error(err.message);
  process.exit(1);
});
