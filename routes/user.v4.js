const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const router = express.Router();

function requireUser(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: '로그인이 필요합니다.' });
  next();
}

router.post('/register', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    if (!username || !password || !name) return res.status(400).json({ message: '이름, 아이디, 비밀번호를 입력하세요.' });
    if (String(password).length < 6) return res.status(400).json({ message: '비밀번호는 6자 이상으로 입력하세요.' });
    const [exists] = await pool.query('SELECT id FROM users WHERE username=? LIMIT 1', [username]);
    if (exists.length) return res.status(409).json({ message: '이미 사용 중인 아이디입니다.' });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query('INSERT INTO users(username,password_hash,name) VALUES(?,?,?)', [username, hash, name]);
    await pool.query('INSERT INTO user_preferences(user_id,budget_max,people,lunch_start,lunch_end) VALUES(?,?,? ,?,?)', [result.insertId, 15000, 2, '11:30:00', '13:30:00']);
    req.session.userId = result.insertId;
    req.session.userName = name;
    res.json({ ok: true, user: { id: result.insertId, username, name } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE username=? AND active=1 LIMIT 1', [username]);
    if (!rows.length || !(await bcrypt.compare(password || '', rows[0].password_hash))) return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    req.session.userId = rows[0].id;
    req.session.userName = rows[0].name;
    res.json({ ok: true, user: { id: rows[0].id, username: rows[0].username, name: rows[0].name } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

router.get('/me', async (req, res) => {
  try {
    if (!req.session.userId) return res.json({ loggedIn: false });
    const [rows] = await pool.query(`SELECT u.id,u.username,u.name,p.work_city_id,p.work_area_id,p.budget_max,p.people,p.lunch_start,p.lunch_end,p.liked_categories,p.disliked_categories,p.latitude,p.longitude
      FROM users u LEFT JOIN user_preferences p ON p.user_id=u.id WHERE u.id=? LIMIT 1`, [req.session.userId]);
    if (!rows.length) return res.json({ loggedIn: false });
    res.json({ loggedIn: true, user: rows[0] });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/preferences', requireUser, async (req, res) => {
  try {
    const { work_city_id, work_area_id, budget_max, people, lunch_start, lunch_end, liked_categories, disliked_categories, latitude, longitude } = req.body;
    await pool.query(`INSERT INTO user_preferences(user_id,work_city_id,work_area_id,budget_max,people,lunch_start,lunch_end,liked_categories,disliked_categories,latitude,longitude)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE work_city_id=VALUES(work_city_id),work_area_id=VALUES(work_area_id),budget_max=VALUES(budget_max),people=VALUES(people),lunch_start=VALUES(lunch_start),lunch_end=VALUES(lunch_end),liked_categories=VALUES(liked_categories),disliked_categories=VALUES(disliked_categories),latitude=VALUES(latitude),longitude=VALUES(longitude)`,
      [req.session.userId, work_city_id || null, work_area_id || null, Number(budget_max || 15000), Number(people || 2), lunch_start || '11:30:00', lunch_end || '13:30:00', liked_categories || '', disliked_categories || '', latitude || null, longitude || null]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/history', requireUser, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT h.id,h.visit_date,h.action,h.reject_reason,h.memo,r.name,r.category,r.main_menu,r.image_path,r.price_min,r.price_max
      FROM lunch_history h JOIN restaurants r ON r.id=h.restaurant_id WHERE h.user_id=? ORDER BY h.created_at DESC LIMIT 100`, [req.session.userId]);
    res.json({ rows });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
