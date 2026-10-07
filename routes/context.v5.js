const express = require('express');
const router = express.Router();

const CITY_COORDS = {
  1: { lat: 37.5665, lon: 126.9780, name: '서울', country: 'KR' },
  2: { lat: 35.1796, lon: 129.0756, name: '부산', country: 'KR' },
  3: { lat: 36.0063, lon: 127.6608, name: '무주', country: 'KR' },
  4: { lat: 35.6762, lon: 139.6503, name: '도쿄', country: 'JP' },
  5: { lat: 34.6937, lon: 135.5023, name: '오사카', country: 'JP' },
  6: { lat: 33.5904, lon: 130.4017, name: '후쿠오카', country: 'JP' }
};

function weatherLabel(code) {
  if ([0].includes(code)) return '맑음';
  if ([1,2].includes(code)) return '구름 조금';
  if ([3].includes(code)) return '흐림';
  if ([45,48].includes(code)) return '안개';
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '비';
  if ([71,73,75,77,85,86].includes(code)) return '눈';
  if ([95,96,99].includes(code)) return '뇌우';
  return '알 수 없음';
}

router.get('/today', async (req, res) => {
  try {
    const cityId = Number(req.query.city_id || 1);
    const city = CITY_COORDS[cityId] || CITY_COORDS[1];
    const lat = Number(req.query.lat) || city.lat;
    const lon = Number(req.query.lon) || city.lon;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,precipitation,rain&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('날씨 API 응답 오류');
    const data = await response.json();
    const current = data.current || {};
    const code = Number(current.weather_code);
    const label = weatherLabel(code);
    const kind = /비/.test(label) || Number(current.rain || 0) > 0 || Number(current.precipitation || 0) > 0 ? 'rain'
      : /눈/.test(label) ? 'snow' : Number(current.temperature_2m) >= 28 ? 'hot' : Number(current.temperature_2m) <= 8 ? 'cold' : 'clear';
    res.json({ ok: true, city: city.name, latitude: lat, longitude: lon, temperature: current.temperature_2m, weatherCode: code, weather: label, kind });
  } catch (e) {
    res.json({ ok: false, weather: '날씨 정보 없음', kind: 'clear', message: '날씨 API를 사용할 수 없어 기본 조건으로 결정합니다.' });
  }
});

module.exports = router;
