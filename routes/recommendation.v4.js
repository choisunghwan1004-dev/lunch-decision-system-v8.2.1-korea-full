const express = require('express');
const pool = require('../db');
const router = express.Router();

function parseList(value) {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}
function timeToMinutes(v) {
  if (!v) return null;
  const [h,m] = String(v).slice(0,5).split(':').map(Number);
  return h * 60 + m;
}
function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd,bEnd) - Math.max(aStart,bStart));
}
function haversineKm(lat1, lon1, lat2, lon2) {
  if ([lat1,lon1,lat2,lon2].some(v => v === null || v === undefined || Number.isNaN(Number(v)))) return null;
  const R=6371, p=Math.PI/180;
  const dLat=(Number(lat2)-Number(lat1))*p, dLon=(Number(lon2)-Number(lon1))*p;
  const a=Math.sin(dLat/2)**2+Math.cos(Number(lat1)*p)*Math.cos(Number(lat2)*p)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function weekdayNow() { const name = new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'Asia/Seoul'}).format(new Date()); return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(name)+1; }
function weatherBonus(category, kind) {
  const cat=category||'';
  if (kind==='rain' || kind==='cold') return /국밥|찌개|탕|칼국수|우동|라멘|전골|설렁탕|감자탕/.test(cat) ? 18 : 0;
  if (kind==='hot') return /냉면|초밥|샐러드|국수|메밀|소바/.test(cat) ? 16 : 0;
  if (kind==='snow') return /국밥|탕|전골|라멘|우동|찌개/.test(cat) ? 20 : 0;
  return 0;
}
function dayBonus(category, weekday) {
  const cat=category||'';
  if (weekday===1 && /국밥|한식|찌개|설렁탕/.test(cat)) return 4;
  if (weekday===5 && /고기|초밥|중식|치킨/.test(cat)) return 4;
  return 0;
}

router.post('/today', async (req,res) => {
  try {
    const userId = req.session.userId || null;
    let { city_id, area_id, budget_max=15000, people=2, weather='clear', weather_kind, latitude, longitude } = req.body;
    let pref = null;
    if (userId) {
      const [prefRows] = await pool.query('SELECT * FROM user_preferences WHERE user_id=? LIMIT 1', [userId]);
      if (prefRows.length) pref=prefRows[0];
      if (pref) {
        city_id = city_id || pref.work_city_id;
        area_id = area_id || pref.work_area_id;
        budget_max = Number(pref.budget_max || budget_max);
        people = Number(pref.people || people);
        latitude = latitude || pref.latitude;
        longitude = longitude || pref.longitude;
      }
    }
    if(!city_id) return res.status(400).json({message:'근무 도시를 선택하거나 프로필에 저장하세요.'});
    const budget=Number(budget_max), persons=Number(people);
    const lunchStart=timeToMinutes(pref?.lunch_start || '11:30:00');
    const lunchEnd=timeToMinutes(pref?.lunch_end || '13:30:00');
    const weekday=weekdayNow();

    let sql=`SELECT r.*, a.name area_name, c.code country_code, c.currency
      FROM restaurants r
      LEFT JOIN areas a ON a.id=r.area_id
      LEFT JOIN countries c ON c.id=r.country_id
      WHERE r.active=1 AND r.city_id=? AND r.price_max<=?`;
    const params=[city_id,budget];
    if(area_id) { sql += ' AND r.area_id=?'; params.push(area_id); }
    sql += persons>1 ? ' AND r.group_ok=1' : ' AND r.solo_ok=1';
    const [rows]=await pool.query(sql,params);
    if(!rows.length) return res.status(404).json({message:'조건에 맞는 음식점이 없습니다.'});

    let recent=[];
    if(userId){
      [recent]=await pool.query(`SELECT restaurant_id, COUNT(*) visits, MAX(visit_date) last_visit FROM lunch_history WHERE user_id=? AND action IN ('accepted','visited') AND visit_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) GROUP BY restaurant_id`,[userId]);
    }
    const recentMap=new Map(recent.map(x=>[x.restaurant_id,x]));
    const likedArr=parseList(pref?.liked_categories), dislikedArr=parseList(pref?.disliked_categories);
    const todayWeatherKind=weather_kind || (/비/.test(weather)?'rain':weather);
    const userLat=latitude!==undefined && latitude!==null && latitude!=='' ? Number(latitude) : null;
    const userLon=longitude!==undefined && longitude!==null && longitude!=='' ? Number(longitude) : null;

    const scored=rows.map(r=>{
      const rs=timeToMinutes(r.lunch_start), re=timeToMinutes(r.lunch_end);
      const bs=timeToMinutes(r.break_start), be=timeToMinutes(r.break_end);
      const overlap=overlapMinutes(lunchStart,lunchEnd,rs,re);
      const breakOverlap=(bs!==null&&be!==null)?overlapMinutes(lunchStart,lunchEnd,bs,be):0;
      const openEnough=overlap>=Math.min(45, Number(r.meal_minutes||60)) && breakOverlap===0;
      if(!openEnough) return null;
      const days=parseList(r.open_days || '1,2,3,4,5,6,7').map(Number);
      if(days.length && !days.includes(weekday)) return null;
      const distanceKm=haversineKm(userLat,userLon,r.latitude,r.longitude);
      const recentInfo=recentMap.get(r.id);
      const daysSince=recentInfo?.last_visit ? Math.max(0, Math.floor((Date.now()-new Date(recentInfo.last_visit).getTime())/86400000)) : 999;
      let score=0, reasons=[];
      score += 20; reasons.push('예산 범위 충족');
      score += openEnough ? 15 : 0; reasons.push('점심시간과 영업시간 일치');
      if(likedArr.some(x=>(r.category||'').includes(x))) { score+=25; reasons.push('내가 좋아하는 음식'); }
      if(dislikedArr.some(x=>(r.category||'').includes(x))) score-=100;
      if(recentInfo){ score -= Math.max(8,25-Math.min(daysSince,14)); }
      else { score+=15; reasons.push('최근 방문 기록 없음'); }
      if(daysSince>=7 && daysSince<999) score+=6;
      const wb=weatherBonus(r.category,todayWeatherKind); if(wb){score+=wb; reasons.push('오늘 날씨에 어울리는 메뉴');}
      const db=dayBonus(r.category,weekday); if(db) score+=db;
      if(distanceKm!==null){
        score += Math.max(-10, 12-distanceKm*4);
        if(distanceKm<=0.8) reasons.push(`가까운 거리 ${distanceKm.toFixed(1)}km`);
      } else { score-=2; }
      if(Number(r.price_max)<=budget) score+=Math.max(0,8-(budget-Number(r.price_max))/3000);
      score += Math.random()*2;
      return {...r,distance_km:distanceKm===null?null:Number(distanceKm.toFixed(2)),score:Number(score.toFixed(2)),_reasons:reasons};
    }).filter(Boolean).filter(r=>!dislikedArr.some(x=>(r.category||'').includes(x))).sort((a,b)=>b.score-a.score);

    if(!scored.length) return res.status(404).json({message:'오늘 점심시간에 실제 영업 가능한 음식점이 없습니다. 관리자에서 영업시간/휴무일을 확인하세요.'});
    const winner=scored[0];
    const reasons=[...winner._reasons];
    if(todayWeatherKind==='rain') reasons.push('비 오는 날 조건 반영');
    if(todayWeatherKind==='hot') reasons.push('더운 날 조건 반영');
    if(todayWeatherKind==='cold') reasons.push('추운 날 조건 반영');
    if(!reasons.length) reasons.push('현재 저장된 개인 조건과 이력을 종합 판단');
    if(userId){
      const context={weather,weather_kind:todayWeatherKind,weekday,budget,people,distance_km:winner.distance_km,lunch_start:pref?.lunch_start||'11:30:00',lunch_end:pref?.lunch_end||'13:30:00',score:winner.score};
      await pool.query(`INSERT INTO lunch_history(user_id,restaurant_id,visit_date,action,reject_reason,memo,context_json,decision_score,distance_km,weather_kind) VALUES(?,?,CURDATE(),'accepted',NULL,?,?,?, ?, ?)`,[userId,winner.id,JSON.stringify(context),'자동 결정 당시 후보 점수',winner.score,winner.distance_km,todayWeatherKind]);
    }
    res.json({winner,candidates:scored.slice(0,5),reasons,loggedIn:!!userId,context:{weather,weather_kind:todayWeatherKind,weekday,distance_available:userLat!==null&&userLon!==null}});
  } catch(e){ console.error(e); res.status(500).json({message:e.message}); }
});

router.post('/feedback', async(req,res)=>{
  try {
    if(!req.session.userId) return res.status(401).json({message:'내 이력을 저장하려면 먼저 로그인하세요.'});
    const {restaurant_id,action,reject_reason='',memo=''}=req.body;
    await pool.query(`INSERT INTO lunch_history(user_id,restaurant_id,visit_date,action,reject_reason,memo) VALUES(?,?,CURDATE(),?,?,?)`,[req.session.userId,restaurant_id,action,reject_reason||null,memo||null]);
    res.json({ok:true});
  } catch(e){ res.status(500).json({message:e.message}); }
});
module.exports=router;
