const express = require('express');
const pool = require('../db');
const router = express.Router();

const CITY_COORDS = {
  1: { lat: 37.5665, lon: 126.9780, name: '서울', country: 'KR', timezone: 'Asia/Seoul' },
  2: { lat: 35.1796, lon: 129.0756, name: '부산', country: 'KR', timezone: 'Asia/Seoul' },
  3: { lat: 36.0063, lon: 127.6608, name: '무주', country: 'KR', timezone: 'Asia/Seoul' },
  4: { lat: 35.6762, lon: 139.6503, name: '도쿄', country: 'JP', timezone: 'Asia/Tokyo' },
  5: { lat: 34.6937, lon: 135.5023, name: '오사카', country: 'JP', timezone: 'Asia/Tokyo' },
  6: { lat: 33.5904, lon: 130.4017, name: '후쿠오카', country: 'JP', timezone: 'Asia/Tokyo' }
};

function label(id) {
  if (id >= 200 && id < 300) return '비';
  if (id >= 600 && id < 700) return '눈';
  if (id >= 700 && id < 800) return '안개';
  if (id === 800) return '맑음';
  if (id > 800) return '구름';
  if (id >= 500 && id < 600) return '비';
  return '날씨 확인';
}
function kind(weatherId, temp, rain) {
  if (weatherId >= 600 && weatherId < 700) return 'snow';
  if (weatherId >= 200 && weatherId < 600 || Number(rain || 0) > 0) return 'rain';
  if (temp >= 28) return 'hot';
  if (temp <= 8) return 'cold';
  return 'clear';
}

async function fetchWeather(lat, lon, path = 'weather') {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) throw new Error('OPENWEATHER_API_KEY가 .env에 없습니다.');
  const url = `https://api.openweathermap.org/data/2.5/${path}?lat=${lat}&lon=${lon}&appid=${encodeURIComponent(key)}&units=metric&lang=kr`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`OpenWeather HTTP ${response.status}`);
  return response.json();
}


// V8 공개 지역 선택 API: 로그인 없이 국가 → 시/도 → 시/군/구 → 읍/면/동 → 상권을 조회합니다.
router.get('/locations', async (req,res)=>{
  try{
    const parentId=req.query.parent_id===undefined||req.query.parent_id===''?null:Number(req.query.parent_id);
    const level=req.query.level||null;
    let sql='SELECT id,country_id,parent_id,name,level,code,legacy_region_id,legacy_city_id,legacy_area_id,latitude,longitude FROM locations WHERE active=1';
    const params=[];
    if(parentId===null) sql+=' AND parent_id IS NULL'; else {sql+=' AND parent_id=?';params.push(parentId);}
    if(level){sql+=' AND level=?';params.push(level);}
    sql+=' ORDER BY sort_order,name';
    const [rows]=await pool.query(sql,params);
    res.json(rows);
  }catch(e){res.status(500).json({message:e.message});}
});
router.get('/today', async (req, res) => {
  const city = CITY_COORDS[Number(req.query.city_id)] || CITY_COORDS[1];
  const lat = Number(req.query.lat) || city.lat;
  const lon = Number(req.query.lon) || city.lon;
  try {
    const data = await fetchWeather(lat, lon);
    const w = data.weather?.[0] || {};
    const temp = Number(data.main?.temp);
    const rain = Number(data.rain?.['1h'] || data.rain?.['3h'] || 0);
    res.json({ ok:true, source:'OpenWeather', city:data.name || city.name, country:city.country, timezone:city.timezone, latitude:lat, longitude:lon, temperature:temp, apparentTemperature:Number(data.main?.feels_like), humidity:Number(data.main?.humidity), windSpeed:Number(data.wind?.speed), precipitation:rain, weatherId:Number(w.id), weather:w.description || label(Number(w.id)), kind:kind(Number(w.id),temp,rain), icon:w.icon || null, observedAt:new Date((Number(data.dt)||Date.now()/1000)*1000).toISOString() });
  } catch (e) {
    res.json({ ok:false, source:'OpenWeather', city:city.name, country:city.country, latitude:lat, longitude:lon, weather:'날씨 정보 없음', kind:'clear', message:e.message });
  }
});

router.get('/forecast', async (req,res)=>{
  const city = CITY_COORDS[Number(req.query.city_id)] || CITY_COORDS[1];
  const lat = Number(req.query.lat) || city.lat;
  const lon = Number(req.query.lon) || city.lon;
  try {
    const data = await fetchWeather(lat,lon,'forecast');
    const list=(data.list||[]).filter((_,i)=>i%3===0).slice(0,8).map(x=>({time:x.dt_txt,temperature:x.main?.temp,weather:x.weather?.[0]?.description||'',weatherId:x.weather?.[0]?.id,kind:kind(Number(x.weather?.[0]?.id),Number(x.main?.temp),Number(x.rain?.['3h']||0)),rain:Number(x.rain?.['3h']||0)}));
    res.json({ok:true,source:'OpenWeather',city:data.city?.name||city.name,timezone:city.timezone,forecast:list});
  }catch(e){res.json({ok:false,source:'OpenWeather',forecast:[],message:e.message});}
});
module.exports=router;
