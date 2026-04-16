$root = "C:\Users\user\.verdent\verdent-projects\new-project"

Write-Host "========================================"
Write-Host "  アプリ起動スクリプト"
Write-Host "========================================"
Write-Host ""
Write-Host "起動するアプリを選んでください："
Write-Host "  1. 現場管理アプリ"
Write-Host "  2. 発電機管理アプリ"
Write-Host "  3. 両方起動"
Write-Host ""
$choice = Read-Host "番号を入力 (1/2/3)"

if ($choice -eq "1") {
    Write-Host "現場管理アプリを起動します..."
    Write-Host "Web: http://localhost:8081"
    Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\construction-app'; npx expo start --port 8081`""
}
elseif ($choice -eq "2") {
    Write-Host "発電機管理アプリを起動します..."
    Write-Host "Web: http://localhost:8085"
    Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\construction-app3'; npx expo start --port 8085`""
}
elseif ($choice -eq "3") {
    Write-Host "両方のアプリを起動します..."
    Write-Host "現場管理: http://localhost:8081"
    Write-Host "発電機管理: http://localhost:8085"
    Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\construction-app'; npx expo start --port 8081`""
    Start-Sleep -Seconds 3
    Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\construction-app3'; npx expo start --port 8085`""
}
else {
    Write-Host "1/2/3 を入力してください。"
}

Write-Host ""
Write-Host "起動完了！別ウィンドウでサーバーが立ち上がります。"
Start-Sleep -Seconds 2
