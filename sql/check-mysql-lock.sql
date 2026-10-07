-- MySQL 잠금 확인용
SHOW FULL PROCESSLIST;

SELECT trx_id,trx_state,trx_started,trx_mysql_thread_id,trx_query
FROM information_schema.innodb_trx
ORDER BY trx_started;

-- 잠금 원인이 확인된 뒤에만 실행하세요. 숫자는 SHOW PROCESSLIST의 Id입니다.
-- KILL 12345;
