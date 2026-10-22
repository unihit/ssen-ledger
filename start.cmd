@echo off
chcp 65001 >nul
setlocal
title 쎈 가계부

rem Node 22 on Windows can crash when the project path contains Korean characters.
rem Prefer an ASCII path under the user profile; otherwise use the current folder.
set "APP_DIR=%USERPROFILE%\ssen-ledger-app"
if not exist "%APP_DIR%\package.json" set "APP_DIR=%~dp0"

cd /d "%APP_DIR%"

if not exist "node_modules\vite\package.json" goto :install
if not exist "node_modules\@supabase\supabase-js\package.json" goto :install
goto :ready

:install
echo.
echo   처음 실행이라 필요한 패키지를 설치합니다. 잠시만 기다려 주세요.
echo.
call npm install --ignore-scripts
if errorlevel 1 goto :install_error

:ready
echo.
echo   쎈 가계부를 시작합니다.
echo   브라우저가 자동으로 열리지 않으면 http://localhost:5173/ 을 열어주세요.
echo   이 창을 닫으면 서버가 종료됩니다.
echo.

call npm run dev -- --open
goto :end

:install_error
echo.
echo   패키지 설치에 실패했어요. Node.js와 npm이 설치되어 있는지 확인해 주세요.
pause

:end
endlocal
