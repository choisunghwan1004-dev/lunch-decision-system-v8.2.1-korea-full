/**
 * V8.2 전국 법정동 데이터 자동 다운로드
 * 공식 출처: 행정표준코드관리시스템(code.go.kr)
 * 공식 다운로드 엔드포인트: POST /etc/codeFullDown.do, codeseId=법정동코드
 *
 * 저장 파일: data/법정동코드 전체자료.zip
 * 압축 해제 후: data/korea_legal_dong.txt
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ZIP_PATH = path.join(DATA_DIR, '법정동코드 전체자료.zip');
const TXT_PATH = path.join(DATA_DIR, 'korea_legal_dong.txt');
const URL = process.env.KOREA_LEGAL_DONG_URL || 'https://www.code.go.kr/etc/codeFullDown.do';

async function main(){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  console.log('==============================================');
  console.log(' V8.2 대한민국 전국 법정동 공식 데이터 다운로드');
  console.log('==============================================');
  console.log(`공식 URL: ${URL}`);
  console.log('다운로드 중...');

  const response = await fetch(URL, {
    method:'POST',
    headers:{
      'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent':'lunch-decision-system-v8.2/1.0'
    },
    body:new URLSearchParams({codeseId:'법정동코드'}),
    signal:AbortSignal.timeout(60000)
  });

  if(!response.ok) throw new Error(`공식 서버 HTTP ${response.status}`);
  const buf=Buffer.from(await response.arrayBuffer());
  if(buf.length<1000) throw new Error('다운로드 파일 크기가 비정상적으로 작습니다. code.go.kr에서 직접 다운로드해야 할 수 있습니다.');
  fs.writeFileSync(ZIP_PATH,buf);
  console.log(`ZIP 저장: ${ZIP_PATH} (${buf.length.toLocaleString()} bytes)`);

  // Windows/Linux 모두 실행 가능한 unzip 시도. Node 18+에서 zip 라이브러리를 추가하지 않기 위해
  // Windows PowerShell Expand-Archive 또는 시스템 unzip을 사용한다.
  try {
    execFileSync('unzip',['-o',ZIP_PATH,'-d',DATA_DIR],{stdio:'inherit'});
  } catch(e) {
    try {
      execFileSync('powershell',['-NoProfile','-Command',`Expand-Archive -LiteralPath '${ZIP_PATH.replace(/'/g,"''")}' -DestinationPath '${DATA_DIR.replace(/'/g,"''")}' -Force`],{stdio:'inherit'});
    } catch(e2) {
      console.log('자동 압축해제에 실패했습니다. ZIP 파일을 data 폴더에서 직접 압축 해제해 주세요.');
    }
  }

  // 압축 안 파일명을 자동 탐색
  const candidates=[];
  function walk(dir){
    for(const name of fs.readdirSync(dir)){
      const p=path.join(dir,name), st=fs.statSync(p);
      if(st.isDirectory()) walk(p);
      else if(/법정동.*\.(txt|csv)$/i.test(name)) candidates.push(p);
    }
  }
  walk(DATA_DIR);
  const found=candidates[0];
  if(found && found!==TXT_PATH) fs.copyFileSync(found,TXT_PATH);
  if(fs.existsSync(TXT_PATH)) console.log(`법정동 원본 저장: ${TXT_PATH}`);
  else console.log('TXT 파일을 찾지 못했습니다. data 폴더의 ZIP을 확인하세요.');
}
main().catch(e=>{console.error('[DOWNLOAD ERROR]',e.message);process.exit(1);});
