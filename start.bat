@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Lunch Decision System V7
 echo   실제 날씨 + 실제 장소 + 이동시간 여행 AI
 echo ============================================
if not exist node_modules (
  echo [1/3] Node 모듈을 설치합니다...
  call npm install
  if errorlevel 1 (echo npm install 실패 & pause & exit /b 1)
)
if not exist .env (
  copy .env.example .env >nul
  echo [2/3] .env 파일을 만들었습니다.
  echo OpenWeather / Google Places API 키를 입력해야 합니다.
  notepad .env
)
echo [3/3] 서버를 시작합니다...
call npm start
if errorlevel 1 echo 서버 실행에 실패했습니다.
pause
