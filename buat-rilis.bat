@echo off
title Buat Rilis Absensi (kode diringkas)
cd /d "%~dp0"
echo.
echo ===== 1. Menyiapkan alat (pertama kali 1-2 menit) =====
cd alat
call npm install --no-audit --no-fund
if errorlevel 1 goto gagal
echo.
echo ===== 2. Meringkas kode =====
node rilis.js
if errorlevel 1 goto gagal
cd ..
echo.
echo ===== 3. Membuat zip =====
powershell -NoProfile -Command "Compress-Archive -Path 'rilis\*' -DestinationPath 'absensi-cloudflare-rilis.zip' -Force"
if errorlevel 1 goto gagal
echo.
echo ===== SELESAI =====
echo Upload file absensi-cloudflare-rilis.zip ke Cloudflare (Create deployment).
pause
exit /b
:gagal
echo.
echo ===== GAGAL - screenshot jendela ini lalu kirim =====
pause
