@echo off
echo ========================================
echo   現場アプリ 起動スクリプト
echo ========================================
echo.

:: 現場アプリ（construction-app2）をポート8083で起動
echo [1] 現場アプリ（Web版）を起動中... ポート:8083
start "現場アプリ" cmd /k "cd /d C:\Users\user\.verdent\verdent-projects\new-project\construction-app2 && npx expo start --web --port 8083"

:: 少し待ってからブラウザを開く
timeout /t 8 /nobreak > nul
echo [2] ブラウザを開いています...
start chrome http://localhost:8083

echo.
echo ========================================
echo   起動完了！
echo   現場アプリ: http://localhost:8083
echo ========================================
pause
