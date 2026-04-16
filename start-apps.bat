@echo off
chcp 65001 > nul
echo.
echo ========================================
echo   アプリ起動スクリプト
echo ========================================
echo.
echo 起動するアプリを選んでください：
echo   1. 現場管理アプリ  (localhost:8081)
echo   2. 発電機管理アプリ (localhost:8085)
echo   3. 社員カレンダーアプリ
echo   4. 全部起動
echo.
set /p choice="番号を入力 (1/2/3/4): "

if "%choice%"=="1" goto APP1
if "%choice%"=="2" goto APP2
if "%choice%"=="3" goto APP3
if "%choice%"=="4" goto APP4
echo 1〜4 を入力してください。
pause
goto END

:APP1
echo 現場管理アプリを起動します...
echo Web: http://localhost:8081
start "現場管理アプリ" cmd /k "cd /d C:\Users\user\.verdent\verdent-projects\new-project\construction-app && npx expo start --port 8081"
goto END

:APP2
echo 発電機管理アプリを起動します...
echo Web: http://localhost:8085
start "発電機管理アプリ" cmd /k "cd /d C:\Users\user\.verdent\verdent-projects\new-project\construction-app3 && npx expo start --port 8085"
goto END

:APP3
echo 社員カレンダーアプリを起動します...
start "社員カレンダー backend" cmd /k "cd /d C:\Users\user\.verdent\verdent-projects\new-project\employee-calendar\backend && npm run dev"
timeout /t 3 > nul
start "社員カレンダー mobile" cmd /k "cd /d C:\Users\user\.verdent\verdent-projects\new-project\employee-calendar\mobile && npx expo start --port 8082"
goto END

:APP4
echo 全アプリを起動します...
start "現場管理アプリ" cmd /k "cd /d C:\Users\user\.verdent\verdent-projects\new-project\construction-app && npx expo start --port 8081"
timeout /t 3 > nul
start "発電機管理アプリ" cmd /k "cd /d C:\Users\user\.verdent\verdent-projects\new-project\construction-app3 && npx expo start --port 8085"
timeout /t 3 > nul
start "社員カレンダー backend" cmd /k "cd /d C:\Users\user\.verdent\verdent-projects\new-project\employee-calendar\backend && npm run dev"
timeout /t 3 > nul
start "社員カレンダー mobile" cmd /k "cd /d C:\Users\user\.verdent\verdent-projects\new-project\employee-calendar\mobile && npx expo start --port 8082"
goto END

:END
echo.
echo 起動完了！
timeout /t 2 > nul
