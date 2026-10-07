const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const recommendationRouter = require('./routes/recommendation');
const userRouter = require('./routes/user');
const contextRouter = require('./routes/context');
const mapRouter = require('./routes/map');
const statusRouter = require('./routes/status');
const travelRouter = require('./routes/travel');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 4 }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/recommendation', recommendationRouter);
app.use('/api/user', userRouter);
app.use('/api/context', contextRouter);
app.use('/api/map', mapRouter);
app.use('/api/status', statusRouter);
app.use('/api/travel', travelRouter);

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/health', async (req, res) => {
  try {
    await require('./db').query('SELECT 1');
    res.json({ ok: true, server: true, database: true, version: 'V7.4' });
  } catch (e) {
    res.status(503).json({ ok: false, server: true, database: false, version: 'V7.4', message: '서버는 실행 중이지만 MySQL 연결이 되지 않습니다.', detail: e.message });
  }
});

app.get('/api/setup-status', async (req,res)=>{
  const result={node:process.version,port:PORT,db:false,dbName:process.env.DB_NAME||null};
  try { await require('./db').query('SELECT 1'); result.db=true; } catch(e){ result.dbError=e.message; }
  res.json(result);
});

// V7.1 데이터 송수신/외부연동 진단용. API 키 값 자체는 절대 반환하지 않습니다.
app.get('/api/system/check', async (req,res)=>{
  const pool=require('./db');
  const required=['users','user_preferences','restaurants','lunch_history','travel_places','cities','areas'];
  const result={ok:false,server:true,node:process.version,database:false,tables:{},counts:{},external:{openweatherConfigured:!!process.env.OPENWEATHER_API_KEY,googleConfigured:!!process.env.GOOGLE_MAPS_API_KEY},time:new Date().toISOString()};
  try{
    await pool.query('SELECT 1'); result.database=true;
    for(const table of required){
      const [rows]=await pool.query('SHOW TABLES LIKE ?',[table]);
      result.tables[table]=rows.length>0;
    }
    for(const table of ['users','restaurants','travel_places']){
      if(result.tables[table]){const [[row]]=await pool.query(`SELECT COUNT(*) count FROM ${table}`);result.counts[table]=Number(row.count);}
    }
    // 현재 V7 스키마는 cities.country_id가 아니라 regions.country_id를 사용합니다.
    // 코드가 이 구조와 일치하는지 실제 DB에서 확인합니다.
    result.schema={cities:{region_id:false,country_id:false},regions:{country_id:false},restaurants:{country_id:false,region_id:false,city_id:false},travel_places:{country_id:false,region_id:false,city_id:false,google_place_id:false}};
    for(const [table,cols] of Object.entries(result.schema)){
      if(!result.tables[table]) continue;
      const [cr]=await pool.query(`SHOW COLUMNS FROM ${table}`);
      const set=new Set(cr.map(x=>x.Field));
      for(const col of Object.keys(cols)) result.schema[table][col]=set.has(col);
    }
    const schemaOk=result.schema.cities.region_id&&result.schema.regions.country_id&&result.schema.restaurants.country_id&&result.schema.restaurants.region_id&&result.schema.restaurants.city_id&&result.schema.travel_places.country_id&&result.schema.travel_places.region_id&&result.schema.travel_places.city_id;
    result.ok=result.database && required.every(t=>result.tables[t]) && schemaOk;
  }catch(e){result.error=e.message;}
  res.status(result.ok?200:503).json(result);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lunch Decision System V7.4: http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
});

process.on('unhandledRejection', err => console.error('[UnhandledRejection]', err));
process.on('uncaughtException', err => console.error('[UncaughtException]', err));
