const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const router = express.Router();

function requireUser(req,res,next){ if(!req.session.userId)return res.status(401).json({message:'로그인이 필요합니다.'}); next(); }
function clean(v){return String(v??'').trim();}
async function ensureUserTables(){
  await pool.query(`CREATE TABLE IF NOT EXISTS users(id INT AUTO_INCREMENT PRIMARY KEY,username VARCHAR(100) UNIQUE NOT NULL,password_hash VARCHAR(255) NOT NULL,name VARCHAR(100) NOT NULL,active TINYINT(1) DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_preferences(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT UNIQUE NOT NULL,work_city_id INT NULL,work_area_id INT NULL,budget_max INT DEFAULT 15000,people INT DEFAULT 2,lunch_start TIME DEFAULT '11:30:00',lunch_end TIME DEFAULT '13:30:00',liked_categories TEXT,disliked_categories TEXT,latitude DECIMAL(10,7) NULL,longitude DECIMAL(10,7) NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`);
}

router.post('/register',async(req,res)=>{
  try{
    await ensureUserTables();
    const username=clean(req.body.username), password=String(req.body.password||''), name=clean(req.body.name);
    if(!username||!password||!name)return res.status(400).json({message:'이름, 아이디, 비밀번호를 모두 입력하세요.'});
    if(!/^[A-Za-z0-9가-힣_.-]{3,30}$/.test(username))return res.status(400).json({message:'아이디는 3~30자의 한글/영문/숫자/._-만 사용할 수 있습니다.'});
    if(password.length<6)return res.status(400).json({message:'비밀번호는 6자 이상으로 입력하세요.'});
    const [exists]=await pool.query('SELECT id FROM users WHERE username=? LIMIT 1',[username]);
    if(exists.length)return res.status(409).json({message:'이미 사용 중인 아이디입니다.'});
    const hash=await bcrypt.hash(password,10);
    const [r]=await pool.query('INSERT INTO users(username,password_hash,name,active) VALUES(?,?,?,1)',[username,hash,name]);
    await pool.query(`INSERT INTO user_preferences(user_id,budget_max,people,lunch_start,lunch_end,liked_categories,disliked_categories) VALUES(?,?,?,?,?,?,?)`,[r.insertId,15000,2,'11:30:00','13:30:00','','']);
    req.session.regenerate(err=>{
      if(err)return res.status(500).json({message:'회원가입은 되었지만 로그인 세션 생성에 실패했습니다. 다시 로그인하세요.',detail:err.message});
      req.session.userId=r.insertId; req.session.userName=name;
      req.session.save(saveErr=>{ if(saveErr)return res.status(500).json({message:'계정은 생성되었지만 로그인 세션 저장에 실패했습니다.',detail:saveErr.message}); res.json({ok:true,user:{id:r.insertId,username,name}}); });
    });
  }catch(e){console.error('[REGISTER]',e);res.status(500).json({message:'회원가입 처리 중 오류가 발생했습니다.',detail:e.message,code:e.code||null});}
});

router.post('/login',async(req,res)=>{try{await ensureUserTables();const username=clean(req.body.username),password=String(req.body.password||'');if(!username||!password)return res.status(400).json({message:'아이디와 비밀번호를 입력하세요.'});const [rows]=await pool.query('SELECT * FROM users WHERE username=? AND active=1 LIMIT 1',[username]);if(!rows.length||!(await bcrypt.compare(password,rows[0].password_hash)))return res.status(401).json({message:'아이디 또는 비밀번호가 올바르지 않습니다.'});req.session.userId=rows[0].id;req.session.userName=rows[0].name;req.session.save(err=>err?res.status(500).json({message:'로그인 세션 저장에 실패했습니다.',detail:err.message}):res.json({ok:true,user:{id:rows[0].id,username:rows[0].username,name:rows[0].name}}));}catch(e){res.status(500).json({message:'로그인 처리 중 오류가 발생했습니다.',detail:e.message});}});
router.post('/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
router.get('/me',async(req,res)=>{try{if(!req.session.userId)return res.json({loggedIn:false});const [rows]=await pool.query(`SELECT u.id,u.username,u.name,p.work_city_id,p.work_area_id,p.budget_max,p.people,p.lunch_start,p.lunch_end,p.liked_categories,p.disliked_categories,p.latitude,p.longitude FROM users u LEFT JOIN user_preferences p ON p.user_id=u.id WHERE u.id=? LIMIT 1`,[req.session.userId]);if(!rows.length)return res.json({loggedIn:false});res.json({loggedIn:true,user:rows[0]});}catch(e){res.status(500).json({message:e.message});}});
router.put('/preferences',requireUser,async(req,res)=>{try{const d=req.body;await pool.query(`INSERT INTO user_preferences(user_id,work_city_id,work_area_id,budget_max,people,lunch_start,lunch_end,liked_categories,disliked_categories,latitude,longitude) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE work_city_id=VALUES(work_city_id),work_area_id=VALUES(work_area_id),budget_max=VALUES(budget_max),people=VALUES(people),lunch_start=VALUES(lunch_start),lunch_end=VALUES(lunch_end),liked_categories=VALUES(liked_categories),disliked_categories=VALUES(disliked_categories),latitude=VALUES(latitude),longitude=VALUES(longitude)`,[req.session.userId,d.work_city_id||null,d.work_area_id||null,Number(d.budget_max||15000),Number(d.people||2),d.lunch_start||'11:30:00',d.lunch_end||'13:30:00',d.liked_categories||'',d.disliked_categories||'',d.latitude||null,d.longitude||null]);res.json({ok:true});}catch(e){res.status(500).json({message:e.message});}});
router.get('/history',requireUser,async(req,res)=>{try{const [rows]=await pool.query(`SELECT h.id,h.visit_date,h.action,h.reject_reason,h.memo,h.decision_score,h.distance_km,h.weather_kind,r.name,r.category,r.main_menu,r.image_path,r.price_min,r.price_max FROM lunch_history h JOIN restaurants r ON r.id=h.restaurant_id WHERE h.user_id=? ORDER BY h.created_at DESC LIMIT 100`,[req.session.userId]);res.json({rows});}catch(e){res.status(500).json({message:e.message});}});
router.get('/learning',requireUser,async(req,res)=>{try{const userId=req.session.userId;const [[totals]]=await pool.query(`SELECT SUM(action='visited') visited,SUM(action='rejected') rejected,SUM(action='recommended') recommended FROM lunch_history WHERE user_id=?`,[userId]);const [categories]=await pool.query(`SELECT r.category,SUM(h.action='visited') visited,SUM(h.action='rejected') rejected,COUNT(*) total FROM lunch_history h JOIN restaurants r ON r.id=h.restaurant_id WHERE h.user_id=? AND h.action IN ('visited','rejected') GROUP BY r.category ORDER BY visited DESC,total DESC LIMIT 10`,[userId]);const [reasons]=await pool.query(`SELECT reject_reason,COUNT(*) count FROM lunch_history WHERE user_id=? AND action='rejected' AND reject_reason IS NOT NULL GROUP BY reject_reason ORDER BY count DESC LIMIT 10`,[userId]);res.json({totals,categories,reasons});}catch(e){res.status(500).json({message:e.message});}});
module.exports=router;
