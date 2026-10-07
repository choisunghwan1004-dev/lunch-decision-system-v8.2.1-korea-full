const express=require('express');
const pool=require('../db');
const router=express.Router();

async function routeTable(points){
  if(points.length<2)return {durations:[],distances:[]};
  const coords=points.map(p=>`${Number(p.longitude)},${Number(p.latitude)}`).join(';');
  const url=`https://router.project-osrm.org/table/v1/foot/${coords}?annotations=duration,distance`;
  const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(`OSRM HTTP ${r.status}`);const d=await r.json();if(d.code!=='Ok')throw new Error('OSRM 이동시간 계산 실패');return {durations:d.durations||[],distances:d.distances||[]};
}
function validOpen(p){return p.active!==0;}
function scorePlace(p,type,weatherKind){let s=Number(p.rating||0)*20+Math.log10(Number(p.review_count||p.rating_count||1)+1)*2;if(type==='attraction'&&['rain','snow'].includes(weatherKind))s-=Number(p.description||'').includes('실내')?-2:8;if(type==='cafe')s+=3;return s;}
async function pickBest(current,candidates,weatherKind){
  if(!candidates.length)return {place:null,minutes:0,distanceKm:0};
  const top=candidates.filter(validOpen).sort((a,b)=>scorePlace(b,b.place_type,weatherKind)-scorePlace(a,a.place_type,weatherKind)).slice(0,6);
  if(!current)return {place:top[0],minutes:0,distanceKm:0};
  const matrix=await routeTable([current,...top]);let best=null;
  top.forEach((p,i)=>{const min=Math.max(1,Math.round((matrix.durations[0]?.[i+1]||0)/60)),km=Number(((matrix.distances[0]?.[i+1]||0)/1000).toFixed(2));const s=scorePlace(p,p.place_type,weatherKind)-min*0.8;if(!best||s>best.score)best={place:p,minutes:min,distanceKm:km,score:s};});
  return best;
}
router.get('/places',async(req,res)=>{try{const cityId=Number(req.query.city_id);const type=req.query.type||'all';let sql='SELECT * FROM travel_places WHERE active=1 AND city_id=?';const p=[cityId];if(type!=='all'){sql+=' AND place_type=?';p.push(type);}sql+=' ORDER BY rating DESC,id DESC LIMIT 100';const[rows]=await pool.query(sql,p);res.json({rows});}catch(e){res.status(500).json({message:e.message});}});

router.post('/auto-plan',async(req,res)=>{
 try{
  const cityId=Number(req.body.city_id),days=Math.min(7,Math.max(1,Number(req.body.days||1))),budget=Number(req.body.budget_max||200000),weatherKind=req.body.weather_kind||'clear';
  const[rows]=await pool.query('SELECT * FROM travel_places WHERE active=1 AND city_id=?',[cityId]);
  if(!rows.length)return res.status(404).json({message:'해당 도시의 실제 여행 데이터가 없습니다. 관리자에서 Google Places 동기화를 먼저 실행하세요.'});
  const groups={attraction:rows.filter(x=>x.place_type==='attraction'),cafe:rows.filter(x=>x.place_type==='cafe'),restaurant:rows.filter(x=>x.place_type==='restaurant'),hotel:rows.filter(x=>x.place_type==='hotel')};
  if(!groups.attraction.length||!groups.cafe.length||!groups.restaurant.length||!groups.hotel.length)return res.status(409).json({message:'관광지·카페·음식점·숙박 데이터가 모두 필요합니다. 관리자에서 실제 데이터를 동기화하세요.'});
  const plan=[];let totalMinutes=0,totalDistance=0;let previous=null;
  for(let day=1;day<=days;day++){
    const morning=await pickBest(previous,groups.attraction,weatherKind);previous=morning.place;totalMinutes+=morning.minutes;totalDistance+=morning.distanceKm;
    const lunchCandidates=groups.restaurant.filter(x=>x.id!==morning.place?.id);const lunch=await pickBest(previous,lunchCandidates,weatherKind);previous=lunch.place;totalMinutes+=lunch.minutes;totalDistance+=lunch.distanceKm;
    const cafe=await pickBest(previous,groups.cafe,weatherKind);previous=cafe.place;totalMinutes+=cafe.minutes;totalDistance+=cafe.distanceKm;
    const afternoon=await pickBest(previous,groups.attraction.filter(x=>x.id!==morning.place?.id),weatherKind);previous=afternoon.place;totalMinutes+=afternoon.minutes;totalDistance+=afternoon.distanceKm;
    const dinner=await pickBest(previous,groups.restaurant.filter(x=>x.id!==lunch.place?.id),weatherKind);previous=dinner.place;totalMinutes+=dinner.minutes;totalDistance+=dinner.distanceKm;
    const hotel=await pickBest(previous,groups.hotel,weatherKind);previous=hotel.place;totalMinutes+=hotel.minutes;totalDistance+=hotel.distanceKm;
    plan.push({day,morning:{...morning.place,travel_minutes:morning.minutes,travel_distance_km:morning.distanceKm},lunch:{...lunch.place,travel_minutes:lunch.minutes,travel_distance_km:lunch.distanceKm},cafe:{...cafe.place,travel_minutes:cafe.minutes,travel_distance_km:cafe.distanceKm},afternoon:{...afternoon.place,travel_minutes:afternoon.minutes,travel_distance_km:afternoon.distanceKm},dinner:{...dinner.place,travel_minutes:dinner.minutes,travel_distance_km:dinner.distanceKm},hotel:{...hotel.place,travel_minutes:hotel.minutes,travel_distance_km:hotel.distanceKm}});
  }
  res.json({ok:true,days,budget_max:budget,weather_kind:weatherKind,source:'DB + Google Places + OSRM',total_travel_minutes:totalMinutes,total_distance_km:Number(totalDistance.toFixed(2)),plan,note:'관광지 → 점심 → 카페 → 관광 → 저녁 → 숙박 순서로 실제 좌표의 이동시간을 계산해 자동 결정했습니다.'});
 }catch(e){console.error('[AUTO PLAN]',e);res.status(502).json({message:'자동 여행코스 계산 중 오류가 발생했습니다.',detail:e.message});}
});
module.exports=router;
