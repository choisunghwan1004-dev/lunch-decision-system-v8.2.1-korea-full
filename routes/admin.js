const express = require('express');
const pool = require('../db');
const router = express.Router();

function auth(req,res,next){
  if(!req.session.adminId) return res.status(401).json({message:'관리자 로그인이 필요합니다.'});
  next();
}
router.use(auth);

router.get('/dashboard',async(req,res)=>{
  try{
    const [[countries]]=await pool.query('SELECT COUNT(*) count FROM countries');
    const [[regions]]=await pool.query('SELECT COUNT(*) count FROM regions');
    const [[cities]]=await pool.query('SELECT COUNT(*) count FROM cities');
    const [[areas]]=await pool.query('SELECT COUNT(*) count FROM areas');
    const [[locations]]=await pool.query('SELECT COUNT(*) count FROM locations WHERE active=1');
    const [[restaurants]]=await pool.query('SELECT COUNT(*) count FROM restaurants WHERE active=1');
    const [[places]]=await pool.query('SELECT COUNT(*) count FROM travel_places WHERE active=1');
    const [[users]]=await pool.query('SELECT COUNT(*) count FROM users WHERE active=1');
    res.json({countries:countries.count,regions:regions.count,cities:cities.count,areas:areas.count,locations:locations.count,restaurants:restaurants.count,places:places.count,users:users.count});
  }catch(e){res.status(500).json({message:e.message});}
});

router.get('/countries',async(req,res)=>{try{const[r]=await pool.query('SELECT * FROM countries ORDER BY name');res.json(r);}catch(e){res.status(500).json({message:e.message});}});
router.post('/countries',async(req,res)=>{try{const{code,name,currency='KRW'}=req.body;if(!code||!name)return res.status(400).json({message:'code와 name은 필수입니다.'});const[r]=await pool.query('INSERT INTO countries(code,name,currency) VALUES(?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),currency=VALUES(currency),id=LAST_INSERT_ID(id)',[code,name,currency]);res.json({id:r.insertId,existing:r.affectedRows===2,message:r.affectedRows===2?'이미 등록된 국가 정보를 사용했습니다.':'국가 등록 완료'});}catch(e){res.status(500).json({message:e.message});}});

router.get('/regions',async(req,res)=>{try{const[r]=await pool.query('SELECT r.*,c.name country_name FROM regions r JOIN countries c ON c.id=r.country_id ORDER BY c.name,r.name');res.json(r);}catch(e){res.status(500).json({message:e.message});}});
router.post('/regions',async(req,res)=>{try{const{country_id,name,type='province'}=req.body;if(!country_id||!name)return res.status(400).json({message:'국가와 지역명은 필수입니다.'});const [exists]=await pool.query('SELECT id FROM regions WHERE country_id=? AND name=? LIMIT 1',[country_id,name]);if(exists.length)return res.json({id:exists[0].id,existing:true,message:'이미 등록된 지역입니다.'});const[r]=await pool.query('INSERT INTO regions(country_id,name,type) VALUES(?,?,?)',[country_id,name,type]);res.json({id:r.insertId,message:'지역 등록 완료'});}catch(e){res.status(500).json({message:e.message});}});

router.get('/cities',async(req,res)=>{try{const[r]=await pool.query('SELECT c.*,r.name region_name,r.country_id FROM cities c JOIN regions r ON r.id=c.region_id ORDER BY r.name,c.name');res.json(r);}catch(e){res.status(500).json({message:e.message});}});
router.post('/cities',async(req,res)=>{try{const{region_id,name}=req.body;if(!region_id||!name)return res.status(400).json({message:'지역과 도시명은 필수입니다.'});const [exists]=await pool.query('SELECT id FROM cities WHERE region_id=? AND name=? LIMIT 1',[region_id,name]);if(exists.length)return res.json({id:exists[0].id,existing:true,message:'이미 등록된 도시입니다.'});const[r]=await pool.query('INSERT INTO cities(region_id,name) VALUES(?,?)',[region_id,name]);res.json({id:r.insertId,message:'도시 등록 완료'});}catch(e){res.status(500).json({message:e.message});}});

router.get('/areas',async(req,res)=>{try{const[r]=await pool.query('SELECT a.*,c.name city_name FROM areas a JOIN cities c ON c.id=a.city_id ORDER BY c.name,a.name');res.json(r);}catch(e){res.status(500).json({message:e.message});}});
router.post('/areas',async(req,res)=>{try{const{city_id,name}=req.body;if(!city_id||!name)return res.status(400).json({message:'도시와 상권명은 필수입니다.'});const [exists]=await pool.query('SELECT id FROM areas WHERE city_id=? AND name=? LIMIT 1',[city_id,name]);if(exists.length)return res.json({id:exists[0].id,existing:true,message:'이미 등록된 상권입니다.'});const[r]=await pool.query('INSERT INTO areas(city_id,name) VALUES(?,?)',[city_id,name]);res.json({id:r.insertId,message:'상권 등록 완료'});}catch(e){res.status(500).json({message:e.message});}});

// V8: 국가 → 시/도 → 시/군/구 → 읍/면/동 → 상권
router.get('/locations',async(req,res)=>{
  try{
    const parentId=req.query.parent_id===undefined||req.query.parent_id===''?null:Number(req.query.parent_id);
    const level=req.query.level||null;
    let sql='SELECT id,country_id,parent_id,name,level,code,legacy_region_id,legacy_city_id,legacy_area_id,latitude,longitude FROM locations WHERE active=1';
    const params=[];
    if(parentId===null) sql+=' AND parent_id IS NULL'; else {sql+=' AND parent_id=?';params.push(parentId);}
    if(level){sql+=' AND level=?';params.push(level);}
    sql+=' ORDER BY sort_order,name';
    const [rows]=await pool.query(sql,params);res.json(rows);
  }catch(e){res.status(500).json({message:e.message});}
});

router.get('/locations/tree',async(req,res)=>{
  try{
    const [rows]=await pool.query(`SELECT id,country_id,parent_id,name,level,code,legacy_region_id,legacy_city_id,legacy_area_id,latitude,longitude FROM locations WHERE active=1 ORDER BY level,sort_order,name`);
    res.json(rows);
  }catch(e){res.status(500).json({message:e.message});}
});

router.post('/locations',async(req,res)=>{
  try{
    const {parent_id,name,level,code=null,latitude=null,longitude=null,sort_order=0}=req.body;
    if(!name||!level)return res.status(400).json({message:'name과 level은 필수입니다.'});
    if(!['country','province','district','town','ri','area'].includes(level)) return res.status(400).json({message:'잘못된 location level입니다. (country/province/district/town/ri/area)'});
    const parent=parent_id?Number(parent_id):null;
    let countryId=null;
    if(level==='country'){
      const [c]=await pool.query('SELECT id FROM countries WHERE code=? LIMIT 1',[code]);
      countryId=c[0]?.id||null;
    }else{
      if(!parent)return res.status(400).json({message:'하위 지역은 parent_id가 필요합니다.'});
      const [p]=await pool.query('SELECT id,country_id,level FROM locations WHERE id=? LIMIT 1',[parent]);
      if(!p.length)return res.status(404).json({message:'상위 지역을 찾을 수 없습니다.'});
      const expected={province:'country',district:'province',town:'district',ri:'town',area:'ri'}[level];
      if(p[0].level!==expected)return res.status(400).json({message:`${level}의 상위 단계는 ${expected}이어야 합니다.`});
      countryId=p[0].country_id;
    }
    const [exists]=await pool.query('SELECT id FROM locations WHERE parent_id <=> ? AND name=? LIMIT 1',[parent,name]);
    if(exists.length)return res.json({id:exists[0].id,existing:true,message:'이미 등록된 지역입니다.'});
    const [r]=await pool.query('INSERT INTO locations(country_id,parent_id,name,level,code,latitude,longitude,sort_order) VALUES(?,?,?,?,?,?,?,?)',[countryId,parent,name,level,code,latitude,longitude,sort_order]);
    res.json({id:r.insertId,message:'지역 등록 완료'});
  }catch(e){res.status(500).json({message:e.message});}
});

async function resolveLocation(locationId){
  if(!locationId)return null;
  const [rows]=await pool.query(`SELECT l.*,p.id parent_location_id,p.level parent_level,p.name parent_name FROM locations l LEFT JOIN locations p ON p.id=l.parent_id WHERE l.id=? LIMIT 1`,[locationId]);
  if(!rows.length)return null;
  const l=rows[0];
  let town=l.level==='town'?l:null, area=l.level==='area'?l:null;
  let cur=l;
  for(let i=0;i<5&&cur?.parent_id;i++){
    const [p]=await pool.query('SELECT * FROM locations WHERE id=? LIMIT 1',[cur.parent_id]);
    if(!p.length)break;
    cur=p[0];
    if(cur.level==='town')town=cur;
    if(cur.level==='area')area=cur;
  }
  const regionId=town?.legacy_region_id || (area?.legacy_city_id? (await pool.query('SELECT region_id FROM cities WHERE id=? LIMIT 1',[area.legacy_city_id]))[0][0]?.region_id:null) || null;
  const cityId=town?.legacy_city_id || area?.legacy_city_id || null;
  const areaId=area?.legacy_area_id || null;
  return {location:l,region_id:regionId,city_id:cityId,area_id:areaId,country_id:l.country_id};
}

router.get('/restaurants',async(req,res)=>{try{const[r]=await pool.query(`SELECT r.*,c.name country_name,rg.name region_name,ci.name city_name,a.name area_name,l.name location_name FROM restaurants r JOIN countries c ON c.id=r.country_id JOIN regions rg ON rg.id=r.region_id JOIN cities ci ON ci.id=r.city_id LEFT JOIN areas a ON a.id=r.area_id LEFT JOIN locations l ON l.id=r.location_id ORDER BY r.id DESC`);res.json(r);}catch(e){res.status(500).json({message:e.message});}});
router.post('/restaurants',async(req,res)=>{
  try{
    const d=req.body;
    const loc=await resolveLocation(Number(d.location_id));
    if(!loc)return res.status(400).json({message:'유효한 지역을 선택하세요.'});
    if(!loc.city_id||!loc.region_id)return res.status(400).json({message:'읍/면/동 또는 상권을 선택해야 음식점을 등록할 수 있습니다.'});
    if(d.country_id && Number(d.country_id)!==Number(loc.country_id))return res.status(400).json({message:'선택한 국가와 지역이 일치하지 않습니다.'});
    const sql=`INSERT INTO restaurants(country_id,region_id,city_id,area_id,location_id,name,category,price_min,price_max,address,latitude,longitude,lunch_start,lunch_end,break_start,break_end,meal_minutes,solo_ok,group_ok,main_menu,description,phone,rating,review_count,image_path,google_place_id,open_days,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`;
    const [r]=await pool.query(sql,[loc.country_id,loc.region_id,loc.city_id,loc.area_id,Number(d.location_id),d.name,d.category||'기타',d.price_min||0,d.price_max||0,d.address||'',d.latitude||null,d.longitude||null,d.lunch_start||'11:00',d.lunch_end||'15:00',d.break_start||null,d.break_end||null,d.meal_minutes||60,d.solo_ok?1:0,d.group_ok?1:0,d.main_menu||'',d.description||'',d.phone||'',d.rating||0,d.review_count||0,d.image_path||null,d.google_place_id||null,d.open_days||'1,2,3,4,5,6,7']);
    res.json({id:r.insertId,message:'음식점 등록 완료'});
  }catch(e){res.status(500).json({message:e.message});}
});

router.get('/places',async(req,res)=>{try{const[r]=await pool.query(`SELECT p.*,c.name city_name FROM travel_places p JOIN cities c ON c.id=p.city_id ORDER BY p.id DESC`);res.json(r);}catch(e){res.status(500).json({message:e.message});}});

// Google Places(New)에서 실제 장소를 가져옵니다. DB 스키마 변경은 여기서 하지 않습니다.
router.post('/sync-google-places',async(req,res)=>{
  const key=process.env.GOOGLE_MAPS_API_KEY;
  if(!key)return res.status(400).json({message:'GOOGLE_MAPS_API_KEY가 .env에 없습니다.'});
  try{
    const cityId=Number(req.body.city_id), cityName=String(req.body.city_name||'').trim(), country=String(req.body.country_code||'KR');
    if(!cityId||!cityName)return res.status(400).json({message:'city_id와 city_name이 필요합니다.'});
    const [cityRows]=await pool.query(`SELECT c.id city_id,c.region_id,r.country_id FROM cities c JOIN regions r ON r.id=c.region_id WHERE c.id=? LIMIT 1`,[cityId]);
    if(!cityRows.length)return res.status(404).json({message:'도시를 찾을 수 없습니다.'});
    const [townRows]=await pool.query('SELECT id FROM locations WHERE legacy_city_id=? AND level=\'town\' LIMIT 1',[cityId]);
    const locationId=townRows[0]?.id||null;
    const q=[['restaurant',`${cityName} 맛집`],['cafe',`${cityName} 카페`],['attraction',`${cityName} 관광지`],['hotel',`${cityName} 호텔`]];
    let restaurantCount=0,placeCount=0;
    for(const [type,textQuery] of q){
      const body={textQuery,languageCode:'ko',regionCode:country};
      const r=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.businessStatus,places.currentOpeningHours,places.priceLevel,places.googleMapsUri'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      if(!r.ok){const t=await r.text();let msg=`Google Places ${r.status}: ${t.slice(0,300)}`;if(r.status===400&&/API_KEY_INVALID|API key not valid/i.test(t)) msg='Google Maps Platform API Key가 유효하지 않습니다. .env의 GOOGLE_MAPS_API_KEY를 실제 Google Maps Platform 키로 교체하고 Places API (New)를 활성화한 뒤 서버를 재시작하세요.';throw new Error(msg);}
      const data=await r.json();
      for(const p of (data.places||[])){
        const name=p.displayName?.text||'이름 없음', lat=p.location?.latitude, lon=p.location?.longitude;
        if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
        const rating=Number(p.rating||0), reviews=Number(p.userRatingCount||0), address=p.formattedAddress||'', placeId=p.id||null;
        const hours=p.currentOpeningHours?.weekdayDescriptions?.join(' / ')||'';
        const openNow=p.currentOpeningHours?.openNow;
        const desc=`Google Places 실제 데이터${openNow===true?' · 현재 영업 중':''}${hours?' · '+hours:''}`;
        if(type==='restaurant'){
          const [exist]=await pool.query('SELECT id FROM restaurants WHERE google_place_id=? LIMIT 1',[placeId]);
          if(exist.length) await pool.query('UPDATE restaurants SET name=?,address=?,latitude=?,longitude=?,rating=?,review_count=?,description=?,location_id=? WHERE id=?',[name,address,lat,lon,rating,reviews,desc,locationId,exist[0].id]);
          else await pool.query(`INSERT INTO restaurants(country_id,region_id,city_id,location_id,name,category,price_min,price_max,address,latitude,longitude,lunch_start,lunch_end,meal_minutes,solo_ok,group_ok,main_menu,description,rating,review_count,google_place_id,open_days,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,[cityRows[0].country_id,cityRows[0].region_id,cityId,locationId,name,'음식점',0,0,address,lat,lon,'11:00','15:00',60,1,1,'',desc,rating,reviews,placeId,'1,2,3,4,5,6,7']);
          restaurantCount++;
        }else{
          const [exist]=await pool.query('SELECT id FROM travel_places WHERE google_place_id=? LIMIT 1',[placeId]);
          if(exist.length) await pool.query('UPDATE travel_places SET name=?,address=?,latitude=?,longitude=?,rating=?,description=?,active=1,location_id=? WHERE id=?',[name,address,lat,lon,rating,desc,locationId,exist[0].id]);
          else await pool.query(`INSERT INTO travel_places(country_id,region_id,city_id,location_id,place_type,name,address,latitude,longitude,rating,description,google_place_id,open_time,close_time,open_days,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,[cityRows[0].country_id,cityRows[0].region_id,cityId,locationId,type,name,address,lat,lon,rating,desc,placeId,type==='hotel'?'00:00':'08:00',type==='hotel'?'23:59':'21:00','1,2,3,4,5,6,7']);
          placeCount++;
        }
      }
    }
    res.json({ok:true,city:cityName,restaurants:restaurantCount,places:placeCount,message:'Google Places 실제 데이터를 동기화했습니다.'});
  }catch(e){console.error('[GOOGLE SYNC]',e);res.status(502).json({message:'실제 장소 데이터를 가져오지 못했습니다.',detail:e.message});}
});

module.exports=router;
