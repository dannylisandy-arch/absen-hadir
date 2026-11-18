@echo off
title Log Functions Absensi
cd /d "%~dp0"
echo ===== Log 30 baris terakhir: buatDataDemo =====
call firebase functions:log --only buatDataDemo -n 30
echo.
echo ===== SELESAI - screenshot jendela ini lalu kirim =====
pause
