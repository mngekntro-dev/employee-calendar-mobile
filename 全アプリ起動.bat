@echo off
echo ========================================
echo   全アプリ 起動スクリプト
echo ========================================
echo.

:: 現場アプリ（construction-app2）をポート8083で起動
echo [1] 現場アプリ（Web版）を起動中... ポート:8083
start "現場アプリ" cmd /k "cd /d C:\Users\user\.verdent\verdent-projects\new-project\construction-app2 && npx expo start --web --port 8083"

timeout /t 3 /nobreak > nul

:: 社員カレンダーをポート8084で起動
echo [2] 社員カレンダーを起動中... ポート:8084
start "社員カレンダー" cmd /k "cd /d C:\Users\user\.verdent\verdent-projects\new-project\employee-calendar\mobile && npx expo start --web --port 8084"

:: ブラウザを開く
timeout /t 10 /nobreak > nul
echo [3] ブラウザを開いています...
start chrome http://localhost:8083
timeout /t 2 /nobreak > nul
start chrome http://localhost:8084

echo.
echo ========================================
echo   起動完了！
echo   現場アプリ:    http://localhost:8083
echo   社員カレンダー: http://localhost:8084
echo ========================================
pause
