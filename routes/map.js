const express = require('express');
const router = express.Router();

router.get('/route', async (req, res) => {
  const fromLat=Number(req.query.fromLat), fromLon=Number(req.query.fromLon), toLat=Number(req.query.toLat), toLon=Number(req.query.toLon);
  if (![fromLat,fromLon,toLat,toLon].every(Number.isFinite)) return res.status(400).json({message:'출발지와 목적지 좌표가 필요합니다.'});
  try {
    const profile = req.query.profile === 'driving' ? 'driving' : 'foot';
    const url=`https://router.project-osrm.org/route/v1/${profile}/${fromLon},${fromLat};${toLon},${toLat}?overview=false&steps=false`;
    const r=await fetch(url,{signal:AbortSignal.timeout(8000)});
    if(!r.ok) throw new Error(`Routing API HTTP ${r.status}`);
    const d=await r.json();
    if(d.code!=='Ok' || !d.routes?.length) throw new Error('경로를 찾지 못했습니다.');
    const route=d.routes[0];
    res.json({ok:true,source:'OSRM/OpenStreetMap',profile,distanceKm:Number((route.distance/1000).toFixed(2)),durationMin:Math.max(1,Math.round(route.duration/60))});
  } catch(e){res.status(502).json({ok:false,message:'실제 이동시간 API에 연결하지 못했습니다.',detail:e.message});}
});
module.exports=router;
