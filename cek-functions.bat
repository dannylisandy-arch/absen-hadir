@echo off
title Cek Analisis Functions
cd /d "%~dp0functions"
echo.
echo ===== Versi =====
node -v
call npm ls firebase-functions firebase-admin --depth=0
echo.
echo ===== Menjalankan analisis kode (15 detik) =====
set PORT=8099
set FUNCTIONS_CONTROL_API=true
set GCLOUD_PROJECT=absencsm
start "analisis" /b cmd /c "node node_modules\firebase-functions\lib\bin\firebase-functions.js . > ..\analisis-log.txt 2>&1"
timeout /t 15 /nobreak >nul
curl -s -m 10 http://127.0.0.1:8099/__/functions.yaml > ..\analisis-hasil.txt 2>&1
curl -s -m 5 http://localhost:8099/__/functions.yaml > ..\analisis-localhost.txt 2>&1
curl -s -m 5 http://127.0.0.1:8099/__/quitquitquit >nul 2>&1
cd ..
echo.
echo ===== LOG SERVER =====
type analisis-log.txt
echo.
echo ===== HASIL via 127.0.0.1 (potongan) =====
powershell -NoProfile -Command "Get-Content analisis-hasil.txt -TotalCount 12"
echo.
echo ===== HASIL via localhost (potongan) =====
powershell -NoProfile -Command "Get-Content analisis-localhost.txt -TotalCount 5"
echo.
echo ===== SELESAI - screenshot jendela ini lalu kirim =====
pause
