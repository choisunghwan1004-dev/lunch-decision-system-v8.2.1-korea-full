const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const router = express.Router();

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const ENV_ADMIN_USER = String(process.env.ADMIN_USERNAME || 'admin').trim();
const ENV_ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'Admin1234!');

// V7.4: 관리자 로그인 때 CREATE TABLE / INSERT를 실행하지 않습니다.
// 이전 버전에서 이 작업이 MySQL metadata lock을 기다리면서 관리자 로그인이 막히는 문제가 있었습니다.
function envAdminMatches(username, password) {
  return String(username || '').trim() === ENV_ADMIN_USER && String(password || '') === ENV_ADMIN_PASSWORD;
}

router.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) return res.status(400).json({ message: '아이디와 비밀번호를 입력하세요.' });

  try {
    // 1순위: .env의 로컬 관리자 계정. DB admins 테이블이 잠겨 있어도 로그인할 수 있습니다.
    if (envAdminMatches(username, password)) {
      return req.session.regenerate((err) => {
        if (err) return res.status(500).json({ message: '관리자 로그인 세션 생성에 실패했습니다.', detail: err.message });
        req.session.adminId = 'env-admin';
        req.session.adminUsername = username;
        req.session.adminSource = 'env';
        req.session.save((saveErr) => {
          if (saveErr) return res.status(500).json({ message: '관리자 로그인 세션 저장에 실패했습니다.', detail: saveErr.message });
          res.json({ ok: true, username, source: 'env', message: '관리자 로그인 성공' });
        });
      });
    }

    // 2순위: DB admins 계정. 정상적인 경우 이 경로를 사용할 수 있습니다.
    const [rows] = await pool.query('SELECT id,username,password_hash,active FROM admins WHERE username=? AND active=1 LIMIT 1', [username]);
    if (!rows.length || sha256(password) !== rows[0].password_hash) {
      return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ message: '관리자 로그인 세션 생성에 실패했습니다.', detail: err.message });
      req.session.adminId = rows[0].id;
      req.session.adminUsername = rows[0].username;
      req.session.adminSource = 'db';
      req.session.save((saveErr) => {
        if (saveErr) return res.status(500).json({ message: '관리자 로그인 세션 저장에 실패했습니다.', detail: saveErr.message });
        res.json({ ok: true, username: rows[0].username, source: 'db', message: '관리자 로그인 성공' });
      });
    });
  } catch (e) {
    console.error('[ADMIN LOGIN]', e);
    res.status(500).json({
      message: '관리자 로그인 중 DB 오류가 발생했습니다. .env의 관리자 계정으로 다시 시도할 수 있습니다.',
      detail: e.message
    });
  }
});

router.get('/me', (req, res) => {
  res.json({
    loggedIn: !!req.session.adminId,
    username: req.session.adminUsername || null,
    source: req.session.adminSource || null
  });
});

router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

// 관리자 테이블을 자동으로 생성하지 않는 상태 진단.
router.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const [rows] = await pool.query("SHOW TABLES LIKE 'admins'");
    res.json({ ok: true, database: true, adminsTable: rows.length > 0 });
  } catch (e) {
    res.status(503).json({ ok: false, database: false, message: e.message });
  }
});

module.exports = router;
